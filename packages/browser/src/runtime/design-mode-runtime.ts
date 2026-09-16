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
  let currentPromptText = '';

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
        :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; }
        .box { position: absolute; box-sizing: border-box; pointer-events: none; transition: border-color 0.15s ease; }
        .hover-box { border: 2px dashed #0A84FF; background: rgba(10, 132, 255, 0.08); }
        .selected-box { border: 2.5px solid var(--box-color, #0A84FF); background: rgba(10, 132, 255, 0.04); }
        .badge {
          position: absolute; top: -26px; left: -2px; height: 22px; padding: 0 8px;
          border-radius: 5px; background: var(--box-color, #0A84FF); color: #fff;
          font-weight: 600; display: inline-flex; align-items: center; gap: 6px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25); white-space: nowrap; pointer-events: auto;
        }
        .badge button { background: none; border: none; color: #fff; cursor: pointer; padding: 0 2px; font-weight: bold; }
        .panel {
          position: fixed; right: 24px; bottom: 24px; width: 380px; max-height: 85vh;
          background: #18181b; color: #f4f4f5; border: 1px solid #27272a; border-radius: 14px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06);
          display: flex; flex-direction: column; pointer-events: auto; overflow: hidden; z-index: 100;
        }
        .panel-header {
          padding: 10px 14px; background: #27272a; border-bottom: 1px solid #3f3f46;
          display: flex; align-items: center; justify-content: space-between; font-weight: 600;
        }
        .panel-header-title { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #fafafa; }
        .panel-header-badge { font-size: 10px; background: #3f3f46; color: #d4d4d8; padding: 2px 6px; border-radius: 10px; }
        .chips-bar {
          padding: 8px 12px; background: #202023; border-bottom: 1px solid #27272a;
          display: flex; gap: 6px; overflow-x: auto; scrollbar-width: thin;
        }
        .chip {
          display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px;
          border-radius: 6px; font-size: 11px; font-weight: 500;
          background: #27272a; border: 1px solid #3f3f46; color: #e4e4e7;
          cursor: pointer; user-select: none; white-space: nowrap; transition: all 0.15s ease;
        }
        .chip.active {
          border-color: var(--chip-color, #3b82f6);
          background: #323238;
          box-shadow: 0 0 0 1px var(--chip-color, #3b82f6);
          color: #fff;
        }
        .chip-dot {
          width: 8px; height: 8px; border-radius: 50%; background: var(--chip-color, #3b82f6);
        }
        .chip-remove {
          background: none; border: none; color: #a1a1aa; cursor: pointer; padding: 0 2px;
          font-size: 13px; line-height: 1; display: flex; align-items: center;
        }
        .chip-remove:hover { color: #f87171; }
        .panel-body { padding: 12px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .target-info {
          background: #27272a; border-radius: 6px; padding: 6px 10px; font-size: 11px;
          display: flex; flex-direction: column; gap: 3px; font-family: ui-monospace, monospace;
        }
        .target-selector { color: #93c5fd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .target-xpath { color: #a1a1aa; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .row { display: grid; grid-template-columns: 100px 1fr; gap: 8px; align-items: center; }
        .row label { font-size: 11px; color: #a1a1aa; text-transform: uppercase; font-weight: 600; }
        .row input {
          padding: 5px 8px; background: #27272a; border: 1px solid #3f3f46; border-radius: 6px;
          font-size: 11.5px; color: #fafafa; font-family: ui-monospace, monospace; outline: none;
        }
        .row input:focus { border-color: #3b82f6; }
        .diff-preview {
          background: #09090b; color: #a1a1aa; padding: 8px 10px; border-radius: 6px;
          border: 1px solid #27272a; font-family: ui-monospace, monospace; font-size: 10.5px;
          white-space: pre-wrap; max-height: 110px; overflow-y: auto;
        }
        .prompt-input {
          width: 100%; box-sizing: border-box; padding: 8px; background: #27272a; border: 1px solid #3f3f46;
          border-radius: 6px; font-family: inherit; font-size: 12px; color: #fafafa;
          resize: vertical; min-height: 55px; outline: none;
        }
        .prompt-input:focus { border-color: #3b82f6; }
        .actions-row { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 6px; margin-top: 2px; }
        .btn-action {
          padding: 8px 10px; border-radius: 7px; font-size: 11px; font-weight: 600;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          gap: 5px; border: none; transition: background 0.15s ease;
        }
        .btn-quick-render { background: #2563eb; color: #fff; }
        .btn-quick-render:hover { background: #1d4ed8; }
        .btn-copy { background: #3f3f46; color: #fafafa; border: 1px solid #52525b; }
        .btn-copy:hover { background: #52525b; }
        .btn-send { background: #ea580c; color: #fff; }
        .btn-send:hover { background: #c2410c; }
        .btn-clear { background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 11px; }
        .btn-clear:hover { color: #f87171; }
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

    // Floating Tweaker Panel if selections exist
    if (selections.length > 0) {
      if (!activeElement || !selections.some((s) => s.element === activeElement)) {
        activeElement = selections[selections.length - 1].element;
      }
      const selIndex = selections.findIndex((s) => s.element === activeElement);
      const sel = selIndex >= 0 ? selections[selIndex] : selections[0];
      const currentIdx = selIndex >= 0 ? selIndex : 0;
      const diff = getComputedCssDiff();

      html += `
        <div class="panel">
          <div class="panel-header">
            <div class="panel-header-title">
              <span style="font-weight:700;">Design Mode</span>
              <span class="panel-header-badge">${selections.length} selected</span>
            </div>
            <button class="btn-clear" data-action="clear-all" title="Clear all selections">Clear All</button>
          </div>
          
          <div class="chips-bar">
            ${selections.map((s, idx) => `
              <div class="chip ${s.element === activeElement ? 'active' : ''}" style="--chip-color: ${s.color};" data-select-chip="${idx}">
                <span class="chip-dot"></span>
                <span>@e${idx + 1} &lt;${s.element.localName}&gt;</span>
                <button class="chip-remove" data-remove-selection="${idx}" title="Remove">&times;</button>
              </div>
            `).join('')}
          </div>

          <div class="panel-body">
            <div class="target-info">
              <div class="target-selector" title="${sel.selector}"><strong>@e${currentIdx + 1} Selector:</strong> ${sel.selector}</div>
              <div class="target-xpath" title="${sel.xpath}"><strong>XPath:</strong> ${sel.xpath}</div>
            </div>

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

            ${diff ? `
              <div>
                <label style="font-size:10px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">CSS Batch Diff</label>
                <div class="diff-preview">${diff}</div>
              </div>
            ` : ''}

            <div>
              <textarea class="prompt-input" data-agent-prompt placeholder="Tell the agent what to fix across these elements...">${currentPromptText}</textarea>
            </div>

            <div class="actions-row">
              <button class="btn-action btn-quick-render" data-action="quick-render" title="Instantly render preview into page style tag">⚡ Quick Render</button>
              <button class="btn-action btn-copy" data-action="copy-for-agent" title="Copy prompt with selectors and xpaths for agent">📋 Copy</button>
              <button class="btn-action btn-send" data-action="submit-to-agent" title="Send batch to agent bridge">🚀 Send to Agent</button>
            </div>
          </div>
        </div>
      `;
    }

    shadowRoot.innerHTML = html;
    bindOverlayEvents();
  };

  const bindOverlayEvents = () => {
    if (!shadowRoot) return;

    shadowRoot.querySelectorAll('[data-select-chip]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-remove-selection]')) return;
        const idx = Number((chip as HTMLElement).dataset.selectChip);
        if (selections[idx]) {
          activeElement = selections[idx].element;
          renderOverlay();
        }
      });
    });

    shadowRoot.querySelectorAll('[data-remove-selection]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number((btn as HTMLElement).dataset.removeSelection);
        removeSelection(idx);
      });
    });

    shadowRoot.querySelector('[data-action="clear-all"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      while (selections.length) {
        removeSelection(0);
      }
      clearLivePatch();
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

    const promptEl = shadowRoot.querySelector<HTMLTextAreaElement>('[data-agent-prompt]');
    if (promptEl) {
      promptEl.addEventListener('input', () => {
        currentPromptText = promptEl.value;
      });
    }

    const quickRenderBtn = shadowRoot.querySelector<HTMLButtonElement>('[data-action="quick-render"]');
    if (quickRenderBtn) {
      quickRenderBtn.addEventListener('click', () => {
        quickRender();
        const orig = quickRenderBtn.textContent;
        quickRenderBtn.textContent = '✓ Rendered!';
        quickRenderBtn.style.background = '#16a34a';
        setTimeout(() => {
          quickRenderBtn.textContent = orig;
          quickRenderBtn.style.background = '';
        }, 1800);
      });
    }

    const copyBtn = shadowRoot.querySelector<HTMLButtonElement>('[data-action="copy-for-agent"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const ok = await copyHandoffToClipboard(currentPromptText);
        const orig = copyBtn.textContent;
        copyBtn.textContent = ok ? '✓ Copied!' : 'Failed';
        copyBtn.style.background = ok ? '#16a34a' : '#dc2626';
        setTimeout(() => {
          copyBtn.textContent = orig;
          copyBtn.style.background = '';
        }, 1800);
      });
    }

    const submitBtn = shadowRoot.querySelector<HTMLButtonElement>('[data-action="submit-to-agent"]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const promptText = currentPromptText.trim() || 'Please apply the selected visual tweaks.';
        const payload = getHandoffPayload(promptText);
        window.dispatchEvent(new CustomEvent('agent-bridge:handoff', { detail: payload }));
        const host = (window as unknown as { __agentBridgeHost?: (msg: unknown) => void }).__agentBridgeHost;
        if (typeof host === 'function') {
          host({ type: 'design_mode_handoff', payload });
        }
        const orig = submitBtn.textContent;
        submitBtn.textContent = '✓ Sent!';
        submitBtn.style.background = '#16a34a';
        setTimeout(() => {
          submitBtn.textContent = orig;
          submitBtn.style.background = '';
        }, 1800);
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

  const getFormattedPrompt = (requestedChange?: string): string => {
    const userPrompt = (requestedChange || currentPromptText).trim() || 'Please apply the design mode fixes.';
    const lines: string[] = [
      userPrompt,
      '',
      `Page: ${window.location.href}`,
      '',
      `Selected Elements (${selections.length}):`,
    ];

    selections.forEach((sel, idx) => {
      lines.push(`- Target @e${idx + 1} <${sel.element.localName}>:`);
      lines.push(`  Selector: ${sel.selector}`);
      if (sel.xpath) {
        lines.push(`  XPath: ${sel.xpath}`);
      }
      const selEdits = Array.from(edits.values()).filter((e) => e.id.startsWith(`${idx}::`));
      if (selEdits.length > 0) {
        lines.push('  Edits:');
        for (const edit of selEdits) {
          if (edit.kind === 'style') {
            lines.push(`    - ${edit.property}: "${edit.original_value || 'initial'}" -> "${edit.value}"`);
          } else if (edit.kind === 'text') {
            lines.push(`    - text-content: "${edit.original_value}" -> "${edit.value}"`);
          }
        }
      }
    });

    const diff = getComputedCssDiff();
    if (diff) {
      lines.push('', 'Proposed CSS Diff:', '```css', diff, '```');
    }

    return lines.join('\n');
  };

  const getHandoffPayload = (requestedChange = 'Please apply the design mode fixes.') => {
    const snap = getSnapshot();
    const prompt = getFormattedPrompt(requestedChange);
    return {
      page_url: window.location.href,
      requested_change: (requestedChange || currentPromptText).trim() || 'Please apply the design mode fixes.',
      css_diff: snap.css_diff,
      revision: snap.revision,
      edits: snap.edits,
      selections: snap.selections,
      prompt,
    };
  };

  const copyHandoffToClipboard = async (requestedChange?: string): Promise<boolean> => {
    const text = getFormattedPrompt(requestedChange);
    let ok = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch {
        ok = false;
      }
    }
    return ok;
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

  const quickRender = (customCss?: string) => {
    if (typeof customCss === 'string') {
      applyLivePatch(customCss);
      return;
    }
    const grouped = new Map<string, StoredEdit[]>();
    for (const edit of edits.values()) {
      if (edit.kind !== 'style') continue;
      const [selIndex] = edit.id.split('::');
      const list = grouped.get(selIndex) || [];
      list.push(edit);
      grouped.set(selIndex, list);
    }
    const rules: string[] = [];
    for (const [idxStr, editList] of grouped.entries()) {
      const sel = selections[Number(idxStr)];
      if (!sel) continue;
      const declarations = editList.map((e) => `${e.property}: ${e.value} !important;`).join(' ');
      rules.push(`${sel.selector} {\n  ${declarations}\n}`);
    }
    applyLivePatch(rules.join('\n\n'));
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
    getFormattedPrompt,
    copyHandoffToClipboard,
    quickRender,
    clearSelections: () => {
      while (selections.length) {
        removeSelection(0);
      }
      clearLivePatch();
    },
    removeSelection,
    selectElement: (element: HTMLElement) => {
      const existingIndex = selections.findIndex((s) => s.element === element);
      if (existingIndex !== -1) {
        activeElement = element;
      } else {
        addSelection(element);
        activeElement = element;
      }
      renderOverlay();
    },
    applyLivePatch,
    clearLivePatch,
  };

  (globalThis as unknown as { __agentBridgeDesignMode: typeof runtimeApi }).__agentBridgeDesignMode = runtimeApi;
})();
