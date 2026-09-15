/**
 * Agent Bridge Injected Design Mode Runtime
 * Ported and adapted from cmux BrowserDesignModeRuntime
 * Provides multi-selection, 14-color palette, anchored XPath,
 * floating live CSS/text property tweaker, and real-time css_diff.
 */

(() => {
  'use strict';

  if ((globalThis as unknown as { __agentBridgeDesignMode?: unknown }).__agentBridgeDesignMode) {
    return;
  }

  const selectionPalette = [
    '#0A84FF', '#AF52DE', '#FF9F0A', '#30D158',
    '#FF375F', '#64D2FF', '#FFD60A', '#5E5CE6',
    '#66D4CF', '#FF7F50', '#DA8FFF', '#B0D63F',
    '#FF5AC8', '#A2845E',
  ];

  const capturedStyleProperties = [
    'display', 'position', 'box-sizing', 'width', 'height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'font-family', 'font-size', 'font-weight', 'line-height',
    'color', 'background-color', 'border-color', 'border-width', 'border-radius',
  ];

  const preferredAttributes = ['data-testid', 'data-test', 'data-qa', 'aria-label', 'name'];
  const sensitiveNamePattern = /(?:^|[-_:])(api[-_]?key|auth|authorization|credential|csrf|password|passwd|secret|session|token)(?:$|[-_:])/i;
  const sensitiveAutocompletePattern = /(?:current-password|new-password|one-time-code|cc-number|cc-csc)/i;
  const redactedValue = '<redacted>';

  let enabled = false;
  let revision = 0;
  let colorSequence = 0;
  let overlayHost: HTMLDivElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let hoveredElement: HTMLElement | null = null;
  let activeElement: HTMLElement | null = null;

  type StoredEdit = {
    id: string;
    kind: 'style' | 'text';
    property: string;
    original_value: string;
    value: string;
  };

  type StoredSelection = {
    element: HTMLElement;
    color: string;
    selector: string;
    selectors: string[];
    xpath: string;
    identity: string;
    originalText: string;
    originalStyles: Record<string, string>;
  };

  const selections: StoredSelection[] = [];
  const edits = new Map<string, StoredEdit>();

  const cssEscape = (val: string): string => {
    if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') {
      return globalThis.CSS.escape(val);
    }
    return val.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  };

  const isUniqueFor = (selector: string, element: Element): boolean => {
    if (!selector || selector.length > 2048) return false;
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch {
      return false;
    }
  };

  const classSelector = (el: Element): string => {
    const classes: string[] = [];
    for (const val of el.classList || []) {
      if (val.length > 0 && val.length <= 48 && !/^(active|selected|hover|focus|open|closed|disabled)$/i.test(val)) {
        classes.push(val);
        if (classes.length === 3) break;
      }
    }
    if (!classes.length) return '';
    return `${el.localName}${classes.map((c) => `.${cssEscape(c)}`).join('')}`;
  };

  const structuralSelector = (element: Element): string => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === 1 && parts.length < 7) {
      let part = current.localName || '*';
      if ((current as HTMLElement).id && (current as HTMLElement).id.length <= 160) {
        part = `#${cssEscape((current as HTMLElement).id)}`;
        parts.unshift(part);
        break;
      }
      const cls = classSelector(current);
      if (cls) part = cls;
      const parent: Element | null = current.parentElement;
      if (parent) {
        let matchingCount = 0;
        let matchingIndex = 0;
        for (const sibling of Array.from(parent.children)) {
          if (sibling.localName !== current.localName) continue;
          matchingCount += 1;
          if (sibling === current) matchingIndex = matchingCount;
        }
        if (matchingCount > 1) part += `:nth-of-type(${matchingIndex})`;
      }
      parts.unshift(part);
      const candidate = parts.join(' > ');
      if (isUniqueFor(candidate, element)) return candidate;
      current = parent;
    }
    return parts.join(' > ');
  };

  const xpathAnchorId = (node: Element): string | null => {
    const id = (node as HTMLElement).id;
    if (!id || id.length > 64) return null;
    if (!/^[A-Za-z0-9._:-]+$/.test(id)) return null;
    if (sensitiveNamePattern.test(id)) return null;
    try {
      if (document.querySelectorAll(`[id="${cssEscape(id)}"]`).length !== 1) return null;
    } catch {
      return null;
    }
    return id;
  };

  const xpathFor = (element: Element): string => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === 1) {
      const anchor = xpathAnchorId(current);
      if (anchor) {
        parts.unshift(`//*[@id="${anchor}"]`);
        return parts.join('/');
      }
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.localName === current.localName) index += 1;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(`${current.localName || '*'}[${index}]`);
      current = current.parentElement;
    }
    return `/${parts.join('/')}`;
  };

  const selectorsFor = (element: Element): string[] => {
    const candidates: string[] = [];
    const el = element as HTMLElement;
    if (el.id && el.id.length <= 160 && !sensitiveNamePattern.test(el.id)) {
      candidates.push(`#${cssEscape(el.id)}`);
    }
    for (const name of preferredAttributes) {
      const val = element.getAttribute(name);
      if (val && val.length <= 160) {
        candidates.push(`${element.localName}[${name}="${val.replace(/"/g, '\\"')}"]`);
        candidates.push(`[${name}="${val.replace(/"/g, '\\"')}"]`);
      }
    }
    const cls = classSelector(element);
    if (cls) candidates.push(cls);
    candidates.push(structuralSelector(element));

    const unique: string[] = [];
    for (const cand of candidates) {
      if (!cand || unique.includes(cand)) continue;
      if (isUniqueFor(cand, element)) unique.push(cand);
      if (unique.length === 6) break;
    }
    if (!unique.length) {
      unique.push(structuralSelector(element));
    }
    return unique;
  };

  const identityFor = (element: Element): string => {
    const parent = element.parentElement;
    return [
      element.localName || '',
      element.getAttribute('role') || '',
      element.getAttribute('type') || '',
      String(element.childElementCount || 0),
      parent?.localName || '',
      (parent as HTMLElement | null)?.id || '',
    ].join('|');
  };

  const isSensitive = (element: Element): boolean => {
    if (element instanceof HTMLInputElement && ['password', 'hidden'].includes(element.type)) return true;
    const name = element.getAttribute('name') || '';
    const id = (element as HTMLElement).id || '';
    const auto = element.getAttribute('autocomplete') || '';
    return sensitiveNamePattern.test(name) || sensitiveNamePattern.test(id) || sensitiveAutocompletePattern.test(auto);
  };

  const captureStyles = (element: HTMLElement): Record<string, string> => {
    const computed = window.getComputedStyle(element);
    const result: Record<string, string> = {};
    for (const prop of capturedStyleProperties) {
      result[prop] = computed.getPropertyValue(prop);
    }
    return result;
  };

  const getComputedCssDiff = (): string => {
    if (!selections.length || !edits.size) return '';
    const grouped = new Map<string, StoredEdit[]>();
    for (const edit of edits.values()) {
      const [selIndex] = edit.id.split('::');
      const list = grouped.get(selIndex) || [];
      list.push(edit);
      grouped.set(selIndex, list);
    }

    const blocks: string[] = [];
    for (const [idxStr, editList] of grouped.entries()) {
      const sel = selections[Number(idxStr)];
      if (!sel) continue;
      const styleEdits = editList.filter((e) => e.kind === 'style');
      if (!styleEdits.length) continue;
      const lines = [`${sel.selector} {`];
      for (const edit of styleEdits) {
        lines.push(`-  ${edit.property}: ${edit.original_value || 'inherit'};`);
        lines.push(`+  ${edit.property}: ${edit.value};`);
      }
      lines.push('}');
      blocks.push(lines.join('\n'));
    }
    return blocks.join('\n\n');
  };

  const createOverlay = () => {
    if (overlayHost) return;
    overlayHost = document.createElement('div');
    overlayHost.setAttribute('data-agent-bridge-design-overlay', 'true');
    overlayHost.style.position = 'fixed';
    overlayHost.style.inset = '0';
    overlayHost.style.zIndex = '2147483647';
    overlayHost.style.pointerEvents = 'none';

    shadowRoot = overlayHost.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(overlayHost);
    renderOverlay();
  };

  const removeOverlay = () => {
    overlayHost?.remove();
    overlayHost = null;
    shadowRoot = null;
  };

  const renderOverlay = () => {
    if (!shadowRoot) return;

    let html = `
      <style>
        :host { all: initial; font-family: system-ui, -apple-system, sans-serif; font-size: 12px; }
        .box { position: absolute; box-sizing: border-box; pointer-events: none; transition: border-color 0.15s ease; }
        .hover-box { border: 2px dashed #0A84FF; background: rgba(10, 132, 255, 0.08); }
        .selected-box { border: 2.5px solid var(--box-color, #0A84FF); background: rgba(10, 132, 255, 0.04); }
        .badge {
          position: absolute; top: -24px; left: -2px; height: 22px; padding: 0 8px;
          border-radius: 4px; background: var(--box-color, #0A84FF); color: #fff;
          font-weight: 600; display: inline-flex; align-items: center; gap: 6px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25); white-space: nowrap; pointer-events: auto;
        }
        .badge button { background: none; border: none; color: #fff; cursor: pointer; padding: 0 2px; font-weight: bold; }
        .panel {
          position: fixed; right: 24px; bottom: 24px; width: 340px; max-height: 80vh;
          background: #ffffff; color: #141413; border: 1.5px solid #D1CFC5; border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15); display: flex; flex-direction: column;
          pointer-events: auto; overflow: hidden; z-index: 100;
        }
        .panel-header {
          padding: 12px 16px; background: #FAF9F5; border-bottom: 1px solid #E3DACC;
          display: flex; align-items: center; justify-content: space-between; font-weight: 600;
        }
        .panel-body { padding: 14px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
        .row { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: center; }
        .row label { font-size: 11px; color: #87867F; text-transform: uppercase; font-weight: 600; }
        .row input {
          padding: 6px 8px; border: 1px solid #D1CFC5; border-radius: 6px; font-size: 12px;
          font-family: ui-monospace, monospace;
        }
        .diff-preview {
          background: #141413; color: #FAF9F5; padding: 10px; border-radius: 6px;
          font-family: ui-monospace, monospace; font-size: 11px; white-space: pre-wrap; max-height: 120px; overflow-y: auto;
        }
        .btn-submit {
          padding: 10px 16px; background: #D97757; color: white; border: none; border-radius: 8px;
          font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .btn-submit:hover { background: #B85C3E; }
        .prompt-input {
          width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #D1CFC5;
          border-radius: 6px; font-family: inherit; font-size: 12px; resize: vertical; min-height: 60px;
        }
      </style>
    `;

    // Hover box
    if (hoveredElement && !selections.some((s) => s.element === hoveredElement)) {
      const rect = hoveredElement.getBoundingClientRect();
      html += `
        <div class="box hover-box" style="
          left: ${rect.left + window.scrollX}px;
          top: ${rect.top + window.scrollY}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
        "></div>
      `;
    }

    // Selected boxes
    selections.forEach((sel, index) => {
      const rect = sel.element.getBoundingClientRect();
      html += `
        <div class="box selected-box" style="
          --box-color: ${sel.color};
          left: ${rect.left + window.scrollX}px;
          top: ${rect.top + window.scrollY}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
        ">
          <div class="badge">
            <span>@e${index + 1} &lt;${sel.element.localName}&gt;</span>
            <button data-remove-selection="${index}" title="Deselect">&times;</button>
          </div>
        </div>
      `;
    });

    // Floating Tweaker Panel if active selection
    if (activeElement && selections.some((s) => s.element === activeElement)) {
      const selIndex = selections.findIndex((s) => s.element === activeElement);
      const sel = selections[selIndex];
      const diff = getComputedCssDiff();

      html += `
        <div class="panel">
          <div class="panel-header">
            <span>Design Mode: @e${selIndex + 1} (${sel.element.localName})</span>
            <span style="font-size: 11px; color: ${sel.color}; font-family: monospace;">${sel.selector}</span>
          </div>
          <div class="panel-body">
            <div class="row">
              <label>Padding</label>
              <input type="text" data-edit-prop="padding" value="${sel.element.style.padding || sel.originalStyles.padding || ''}" placeholder="e.g. 12px 16px" />
            </div>
            <div class="row">
              <label>Margin</label>
              <input type="text" data-edit-prop="margin" value="${sel.element.style.margin || sel.originalStyles.margin || ''}" placeholder="e.g. 8px" />
            </div>
            <div class="row">
              <label>Font Size</label>
              <input type="text" data-edit-prop="font-size" value="${sel.element.style.fontSize || sel.originalStyles['font-size'] || ''}" placeholder="e.g. 16px" />
            </div>
            <div class="row">
              <label>Color</label>
              <input type="text" data-edit-prop="color" value="${sel.element.style.color || sel.originalStyles.color || ''}" placeholder="e.g. #2563eb" />
            </div>
            <div class="row">
              <label>Background</label>
              <input type="text" data-edit-prop="background-color" value="${sel.element.style.backgroundColor || sel.originalStyles['background-color'] || ''}" placeholder="e.g. #f3f4f6" />
            </div>
            <div class="row">
              <label>Border Radius</label>
              <input type="text" data-edit-prop="border-radius" value="${sel.element.style.borderRadius || sel.originalStyles['border-radius'] || ''}" placeholder="e.g. 8px" />
            </div>
            <div class="row">
              <label>Text Content</label>
              <input type="text" data-edit-text="true" value="${isSensitive(sel.element) ? redactedValue : (sel.element.textContent || '').trim().slice(0, 80)}" />
            </div>

            ${diff ? `<label style="font-size:11px;font-weight:600;color:#87867F;">CSS DIFF</label><div class="diff-preview">${diff}</div>` : ''}

            <textarea class="prompt-input" data-agent-prompt placeholder="Tell the agent what to fix... (e.g. Make this button blue with 16px padding)"></textarea>

            <button class="btn-submit" data-action="submit-to-agent">Ask Agent to Fix</button>
          </div>
        </div>
      `;
    }

    shadowRoot.innerHTML = html;
    bindOverlayEvents();
  };

  const bindOverlayEvents = () => {
    if (!shadowRoot) return;

    shadowRoot.querySelectorAll('[data-remove-selection]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number((btn as HTMLElement).dataset.removeSelection);
        removeSelection(idx);
      });
    });

    shadowRoot.querySelectorAll<HTMLInputElement>('[data-edit-prop]').forEach((input) => {
      input.addEventListener('input', () => {
        if (!activeElement) return;
        const selIndex = selections.findIndex((s) => s.element === activeElement);
        if (selIndex === -1) return;
        const prop = input.dataset.editProp!;
        const val = input.value;
        const originalVal = selections[selIndex].originalStyles[prop] || '';

        activeElement.style.setProperty(prop, val);
        const editId = `${selIndex}::${prop}`;
        edits.set(editId, {
          id: editId,
          kind: 'style',
          property: prop,
          original_value: originalVal,
          value: val,
        });
        revision += 1;
        renderOverlay();
      });
    });

    const textInput = shadowRoot.querySelector<HTMLInputElement>('[data-edit-text]');
    if (textInput) {
      textInput.addEventListener('input', () => {
        if (!activeElement || isSensitive(activeElement)) return;
        const selIndex = selections.findIndex((s) => s.element === activeElement);
        if (selIndex === -1) return;
        const val = textInput.value;
        const orig = selections[selIndex].originalText;
        activeElement.textContent = val;
        const editId = `${selIndex}::text-content`;
        edits.set(editId, {
          id: editId,
          kind: 'text',
          property: 'text-content',
          original_value: orig,
          value: val,
        });
        revision += 1;
        renderOverlay();
      });
    }

    const submitBtn = shadowRoot.querySelector('[data-action="submit-to-agent"]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const promptEl = shadowRoot?.querySelector<HTMLTextAreaElement>('[data-agent-prompt]');
        const promptText = promptEl?.value.trim() || 'Please apply the selected visual tweaks.';
        const payload = getHandoffPayload(promptText);
        window.dispatchEvent(new CustomEvent('agent-bridge:handoff', { detail: payload }));
        const host = (window as unknown as { __agentBridgeHost?: (msg: unknown) => void }).__agentBridgeHost;
        if (typeof host === 'function') {
          host({ type: 'design_mode_handoff', payload });
        }
      });
    }
  };

  const handlePointerMove = (e: MouseEvent) => {
    if (!enabled) return;
    const target = e.target as HTMLElement | null;
    if (!target || overlayHost?.contains(target)) return;
    if (hoveredElement !== target) {
      hoveredElement = target;
      renderOverlay();
    }
  };

  const handleClick = (e: MouseEvent) => {
    if (!enabled) return;
    const target = e.target as HTMLElement | null;
    if (!target || overlayHost?.contains(target)) return;

    e.preventDefault();
    e.stopPropagation();

    const existingIndex = selections.findIndex((s) => s.element === target);
    if (existingIndex !== -1) {
      activeElement = target;
    } else {
      addSelection(target);
      activeElement = target;
    }
    renderOverlay();
  };

  const addSelection = (element: HTMLElement) => {
    const color = selectionPalette[colorSequence % selectionPalette.length];
    colorSequence += 1;
    const allSelectors = selectorsFor(element);
    const sel: StoredSelection = {
      element,
      color,
      selector: allSelectors[0],
      selectors: allSelectors,
      xpath: xpathFor(element),
      identity: identityFor(element),
      originalText: isSensitive(element) ? redactedValue : (element.textContent || '').trim(),
      originalStyles: captureStyles(element),
    };
    selections.push(sel);
    revision += 1;
  };

  const removeSelection = (index: number) => {
    const sel = selections[index];
    if (!sel) return;
    // Revert edits made on this element
    for (const [key, edit] of Array.from(edits.entries())) {
      if (key.startsWith(`${index}::`)) {
        if (edit.kind === 'style') {
          sel.element.style.removeProperty(edit.property);
        } else if (edit.kind === 'text') {
          sel.element.textContent = sel.originalText;
        }
        edits.delete(key);
      }
    }
    selections.splice(index, 1);
    if (activeElement === sel.element) {
      activeElement = selections.length ? selections[selections.length - 1].element : null;
    }
    revision += 1;
    renderOverlay();
  };

  const getSnapshot = () => {
    return {
      revision,
      enabled,
      selection: selections.length ? buildSelectionSnapshot(selections[selections.length - 1]) : null,
      selections: selections.map((s) => buildSelectionSnapshot(s)),
      edits: Array.from(edits.values()),
      css_diff: getComputedCssDiff(),
    };
  };

  const buildSelectionSnapshot = (s: StoredSelection) => {
    const rect = s.element.getBoundingClientRect();
    return {
      selector: s.selector,
      selectors: s.selectors,
      xpath: s.xpath,
      tag_name: s.element.localName,
      dom_snippet: s.element.outerHTML.slice(0, 1000),
      text_content: isSensitive(s.element) ? redactedValue : (s.element.textContent || '').trim().slice(0, 500),
      text_editable: !isSensitive(s.element),
      bounds: {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scroll_x: window.scrollX,
        scroll_y: window.scrollY,
      },
      computed_styles: captureStyles(s.element),
      color: s.color,
    };
  };

  const getHandoffPayload = (requestedChange = 'Please apply the design mode fixes.') => {
    const snap = getSnapshot();
    const promptLines = [
      `Requested change: ${requestedChange}`,
      '',
      `Page: ${window.location.href}`,
      '',
      'Selected Elements:',
      ...snap.selections.map((sel, idx) => `- @e${idx + 1}: ${sel.selector} (xpath: ${sel.xpath})`),
    ];
    if (snap.css_diff) {
      promptLines.push('', 'Proposed CSS Diff:', '```css', snap.css_diff, '```');
    }

    return {
      page_url: window.location.href,
      requested_change: requestedChange,
      css_diff: snap.css_diff,
      revision: snap.revision,
      edits: snap.edits,
      selections: snap.selections,
      prompt: promptLines.join('\n'),
    };
  };

  // Live CSS Preview Injection API (<style id="__agent_bridge_live_preview__">)
  const applyLivePatch = (css: string) => {
    let styleEl = document.getElementById('__agent_bridge_live_preview__') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = '__agent_bridge_live_preview__';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  };

  const clearLivePatch = () => {
    document.getElementById('__agent_bridge_live_preview__')?.remove();
  };

  const runtimeApi = {
    enable: () => {
      enabled = true;
      createOverlay();
      document.addEventListener('mousemove', handlePointerMove, true);
      document.addEventListener('click', handleClick, true);
      return getSnapshot();
    },
    disable: () => {
      enabled = false;
      document.removeEventListener('mousemove', handlePointerMove, true);
      document.removeEventListener('click', handleClick, true);
      removeOverlay();
      return getSnapshot();
    },
    status: () => getSnapshot(),
    getSnapshot,
    getHandoff: getHandoffPayload,
    clearSelections: () => {
      while (selections.length) {
        removeSelection(0);
      }
    },
    applyLivePatch,
    clearLivePatch,
  };

  (globalThis as unknown as { __agentBridgeDesignMode: typeof runtimeApi }).__agentBridgeDesignMode = runtimeApi;
})();
