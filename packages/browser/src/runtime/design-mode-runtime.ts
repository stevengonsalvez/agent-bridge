/**
 * Agent Bridge Injected Design Mode Runtime
 * Unified floating pill palette and visual annotation engine.
 * Provides multi-selection, 14-color palette, anchored XPath, freehand pen,
 * rect, region, and arrow annotations, inline change prompt, quick render,
 * and structured artifact clipboard handoff.
 */

import { resolvePromptToCss } from './quick-render-jev';
import html2canvas from 'html2canvas-pro';

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

  type Tool = 'interact' | 'select' | 'pen' | 'rect' | 'arrow' | 'region';

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
    screenshot_path?: string;
  };

  type StoredPoint = {
    x: number;
    y: number;
  };

  type StoredMark = {
    id: string;
    type: 'rect' | 'region' | 'arrow' | 'pen';
    color: string;
    points?: StoredPoint[];
    bounds?: { x: number; y: number; width: number; height: number };
    createdAt: string;
    screenshot_path?: string;
  };

  type ArtifactPaths = {
    screenshot_path?: string;
    page_screenshot_path?: string;
    element_screenshot_paths?: string[];
    live_context_path?: string;
    context_json_path?: string;
  };

  let enabled = false;
  let revision = 0;
  let colorSequence = 0;
  let activeTool: Tool = 'select';
  let showTweaker = false;
  let showBatch = false;
  let activeInfo: 'ai' | 'manual' | null = null;
  let currentPromptText = '';
  let layoutOrientation: 'auto' | 'horizontal' | 'vertical' = 'auto';
  let verticalDockSide: 'right' | 'left' = 'right';
  let isPromptBarCollapsed = false;
  let lastRenderedVertical: boolean | null = null;
  let currentAgentStatus: {
    status: 'idle' | 'working' | 'done' | 'error';
    message?: string;
    timestamp?: number;
  } = { status: 'idle' };

  const isVerticalMode = (): boolean => {
    if (layoutOrientation === 'vertical') return true;
    if (layoutOrientation === 'horizontal') return false;
    return typeof window !== 'undefined' && window.innerWidth <= 640;
  };

  let overlayHost: HTMLDivElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let hoveredElement: HTMLElement | null = null;
  let activeElement: HTMLElement | null = null;

  // Drawing state
  let isDrawing = false;
  let dragStart: StoredPoint | null = null;
  let currentPoints: StoredPoint[] = [];

  const selections: StoredSelection[] = [];
  const marks: StoredMark[] = [];
  const edits = new Map<string, StoredEdit>();
  let currentArtifacts: ArtifactPaths = {};

  const escapeHtml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

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

  const selectorsFor = (element: HTMLElement): string[] => {
    const results: string[] = [];
    if (element.id && element.id.length <= 160) {
      const idSel = `#${cssEscape(element.id)}`;
      if (isUniqueFor(idSel, element)) results.push(idSel);
    }
    for (const attr of preferredAttributes) {
      const val = element.getAttribute(attr);
      if (val && val.length <= 160) {
        const sel = `[${attr}="${cssEscape(val)}"]`;
        if (isUniqueFor(sel, element) && !results.includes(sel)) {
          results.push(sel);
        }
      }
    }
    const struct = structuralSelector(element);
    if (struct && !results.includes(struct)) results.push(struct);
    if (!results.length) results.push(element.localName);
    return results;
  };

  const isSensitive = (element: HTMLElement): boolean => {
    if (element instanceof HTMLInputElement) {
      if (element.type === 'password') return true;
      if (sensitiveAutocompletePattern.test(element.autocomplete || '')) return true;
      if (sensitiveNamePattern.test(element.name || '') || sensitiveNamePattern.test(element.id || '')) return true;
    }
    return false;
  };

  const anchorPointFor = (element: Element): { element: Element; xpath: string } => {
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      if ((current as HTMLElement).id) {
        return {
          element: current,
          xpath: `//*[@id="${(current as HTMLElement).id}"]`,
        };
      }
      for (const attr of preferredAttributes) {
        const val = current.getAttribute(attr);
        if (val) {
          return {
            element: current,
            xpath: `//*[@${attr}="${val}"]`,
          };
        }
      }
      current = current.parentElement;
    }
    return { element: document.documentElement, xpath: '/html' };
  };

  const xpathFor = (element: HTMLElement): string => {
    const anchor = anchorPointFor(element);
    if (anchor.element === element) return anchor.xpath;

    const segments: string[] = [];
    let current: Element | null = element;
    while (current && current !== anchor.element && current.nodeType === 1) {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.localName === current.localName) index += 1;
        sibling = sibling.previousElementSibling;
      }
      const tag = current.localName.toLowerCase();
      segments.unshift(index > 1 ? `${tag}[${index}]` : tag);
      current = current.parentElement;
    }
    return `${anchor.xpath}/${segments.join('/')}`;
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
    // Remove any legacy feedback overlay elements from DOM
    document.querySelectorAll('[data-debug-bridge-feedback-overlay]').forEach((el) => el.remove());
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
    canvas = null;
  };

  const setCaptureHidden = (mode: 'none' | 'palette' | 'all') => {
    if (!overlayHost || !shadowRoot) return;
    if (mode === 'all') {
      overlayHost.style.visibility = 'hidden';
    } else {
      overlayHost.style.visibility = 'visible';
      const palette = shadowRoot.querySelector<HTMLElement>('.floating-palette');
      const promptBar = shadowRoot.querySelector<HTMLElement>('.mobile-prompt-bar');
      const tweaker = shadowRoot.querySelector<HTMLElement>('.tweaker-popover');
      const batch = shadowRoot.querySelector<HTMLElement>('.batch-popover');
      if (palette) palette.style.display = mode === 'palette' ? 'none' : 'flex';
      if (promptBar) promptBar.style.display = mode === 'palette' ? 'none' : 'flex';
      if (tweaker) tweaker.style.display = mode === 'palette' ? 'none' : (showTweaker ? 'flex' : 'none');
      if (batch) batch.style.display = mode === 'palette' ? 'none' : (showBatch ? 'flex' : 'none');
    }
  };

  const renderBoxLayerHtml = () => {
    return `
      ${hoveredElement && activeTool === 'select' && !selections.some((s) => s.element === hoveredElement) ? `
        <div class="box hover-box" style="
          left: ${hoveredElement.getBoundingClientRect().left + window.scrollX}px;
          top: ${hoveredElement.getBoundingClientRect().top + window.scrollY}px;
          width: ${hoveredElement.getBoundingClientRect().width}px;
          height: ${hoveredElement.getBoundingClientRect().height}px;
        "></div>
      ` : ''}

      ${selections.map((sel, idx) => {
        const rect = sel.element.getBoundingClientRect();
        return `
          <div class="box selected-box" style="
            --box-color: ${sel.color};
            left: ${rect.left + window.scrollX}px;
            top: ${rect.top + window.scrollY}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
          ">
            <div class="badge">
              <span>@e${idx + 1} &lt;${sel.element.localName}&gt;</span>
              <button data-remove-selection="${idx}" title="Deselect">&times;</button>
            </div>
          </div>
        `;
      }).join('')}
    `;
  };

  const renderOverlay = () => {
    if (!shadowRoot) return;

    const diff = getComputedCssDiff();
    const selIndex = activeElement ? selections.findIndex((s) => s.element === activeElement) : (selections.length ? selections.length - 1 : -1);
    const activeSel = selIndex >= 0 ? selections[selIndex] : null;

    let html = `
      <style>
        :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; }
        
        /* Canvas for drawings */
        .design-canvas {
          position: fixed; inset: 0; width: 100vw; height: 100vh;
          pointer-events: ${activeTool === 'select' || activeTool === 'interact' ? 'none' : 'auto'};
          cursor: ${activeTool === 'interact' ? 'default' : activeTool === 'select' ? 'default' : 'crosshair'};
          z-index: 10;
        }

        /* Selection and hover boxes */
        .box-layer { position: absolute; inset: 0; pointer-events: none; z-index: 20; }
        .box { position: absolute; box-sizing: border-box; pointer-events: none; }
        .hover-box { border: 2px dashed #0A84FF; background: rgba(10, 132, 255, 0.08); }
        .selected-box { border: 2.5px solid var(--box-color, #0A84FF); background: rgba(10, 132, 255, 0.05); }
        .badge {
          position: absolute; top: -24px; left: -2px; height: 20px; padding: 0 6px;
          border-radius: 4px; background: var(--box-color, #0A84FF); color: #fff;
          font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap; pointer-events: auto;
        }
        .badge button { background: none; border: none; color: #fff; cursor: pointer; padding: 0 2px; font-size: 12px; font-weight: bold; }

        /* Floating pill palette at bottom center */
        .floating-palette {
          position: fixed; bottom: max(16px, env(safe-area-inset-bottom, 16px)); left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 6px; padding: 5px 8px;
          background: rgba(22, 22, 26, 0.94); backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 9999px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06);
          color: #f4f4f5; pointer-events: auto; z-index: 100;
          max-width: calc(100vw - 16px); width: auto; box-sizing: border-box;
          overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .floating-palette::-webkit-scrollbar { display: none; }

        /* Mode toggle segment */
        .mode-group {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 2px;
          padding: 2px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px;
        }
        .mode-divider {
          width: 1px; height: 16px; background: rgba(255, 255, 255, 0.18); margin: 0 3px;
        }
        .mode-btn {
          width: 28px; height: 28px; border-radius: 50%; border: none;
          background: transparent; color: rgba(255, 255, 255, 0.55);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s ease; padding: 0; outline: none; flex-shrink: 0;
        }
        .mode-btn:hover { color: #fff; }
        .mode-btn.active {
          background: #2563eb; color: #ffffff;
          box-shadow: 0 0 12px rgba(37, 99, 235, 0.6);
        }
        .mode-btn svg { width: 15px; height: 15px; fill: currentColor; }

        /* Chips row */
        .chips-container {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 5px;
          max-width: 240px; overflow-x: auto; scrollbar-width: none;
        }
        .chips-container::-webkit-scrollbar { display: none; }
        .chip {
          display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
          border-radius: 9999px; font-size: 11px; font-weight: 500;
          background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12);
          color: var(--chip-color, #93c5fd); cursor: pointer; user-select: none;
          white-space: nowrap; transition: all 0.15s ease; flex-shrink: 0;
        }
        .chip.active {
          background: rgba(255, 255, 255, 0.16);
          border-color: var(--chip-color, #3b82f6);
          box-shadow: 0 0 8px rgba(37, 99, 235, 0.3);
        }
        .chip-icon { font-size: 10px; opacity: 0.9; }
        .chip-remove {
          background: none; border: none; color: rgba(255, 255, 255, 0.4);
          cursor: pointer; padding: 0 1px; font-size: 12px; line-height: 1;
        }
        .chip-remove:hover { color: #f87171; }

        /* Inline change description input */
        .prompt-field {
          background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 9999px;
          outline: none; color: #fafafa; font-size: 12px;
          min-width: 140px; max-width: 420px; width: 220px; flex: 1 1 auto;
          padding: 5px 12px; font-family: inherit;
          transition: width 0.2s ease, max-width 0.2s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        }
        .prompt-field:focus {
          border-color: #3b82f6; background: rgba(255, 255, 255, 0.1);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
          max-width: 320px; width: 260px;
        }
        .prompt-field::placeholder { color: rgba(255, 255, 255, 0.38); }

        /* Action buttons */
        .btn-action {
          flex-shrink: 0;
          height: 28px; padding: 0 10px; border-radius: 9999px; font-size: 11px; font-weight: 600;
          cursor: pointer; display: flex; align-items: center; gap: 5px; border: none;
          outline: none; transition: all 0.15s ease; white-space: nowrap;
        }
        .btn-quick-render {
          background: #2563eb; color: #fff;
        }
        .btn-quick-render:hover { background: #1d4ed8; }

        /* Quick Render AI & Manual item wraps and buttons */
        .render-item-wrap {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 9999px;
          padding: 1px 3px 1px 1px;
        }
        .btn-quick-render-ai {
          background: linear-gradient(135deg, #7c3aed, #2563eb);
          color: #fff;
          height: 26px;
          padding: 0 9px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s ease;
        }
        .btn-quick-render-ai:hover {
          background: linear-gradient(135deg, #6d28d9, #1d4ed8);
          box-shadow: 0 0 10px rgba(124, 58, 237, 0.5);
        }
        .btn-quick-render-manual {
          background: rgba(255, 255, 255, 0.12);
          color: #f4f4f5;
          height: 26px;
          padding: 0 9px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s ease;
        }
        .btn-quick-render-manual:hover {
          background: rgba(255, 255, 255, 0.22);
          color: #fff;
        }
        .help-question-btn {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
          color: rgba(255, 255, 255, 0.85);
          font-size: 11px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          outline: none;
          transition: all 0.15s ease;
          padding: 0;
        }
        .help-question-btn:hover {
          background: #3b82f6;
          color: #ffffff;
          transform: scale(1.1);
        }
        .help-question-btn.active {
          background: #3b82f6;
          color: #ffffff;
        }

        /* Info popover for explanations */
        .info-popover {
          position: fixed;
          bottom: max(68px, calc(env(safe-area-inset-bottom, 12px) + 54px));
          left: 50%;
          transform: translateX(-50%);
          width: min(400px, calc(100vw - 20px));
          max-height: min(480px, calc(100vh - 90px));
          box-sizing: border-box;
          overflow-y: auto;
          background: #18181b;
          color: #f4f4f5;
          border: 1px solid #27272a;
          border-radius: 14px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px 16px;
          pointer-events: auto;
          z-index: 110;
        }
        .info-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #27272a;
          padding-bottom: 8px;
        }
        .info-title-wrap {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .info-icon { font-size: 14px; }
        .info-title { font-size: 13px; font-weight: 700; color: #fafafa; }
        .info-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 9999px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .info-badge-ai {
          background: rgba(124, 58, 237, 0.2);
          color: #c4b5fd;
          border: 1px solid rgba(124, 58, 237, 0.4);
        }
        .info-badge-manual {
          background: rgba(2, 132, 199, 0.2);
          color: #7dd3fc;
          border: 1px solid rgba(2, 132, 199, 0.4);
        }
        .info-desc {
          font-size: 11.5px;
          color: #d4d4d8;
          line-height: 1.45;
          margin: 0;
        }
        .info-steps {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .info-step {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: #27272a;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 11px;
        }
        .info-step-num {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #3f3f46;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .info-step-content {
          color: #d4d4d8;
          line-height: 1.35;
        }
        .info-step-content strong { color: #fafafa; }
        .info-step-content code {
          background: rgba(0, 0, 0, 0.35);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 10px;
          color: #93c5fd;
          font-family: ui-monospace, monospace;
        }
        .btn-tweak {
          background: ${showTweaker ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)'};
          color: ${showTweaker ? '#fff' : 'rgba(255, 255, 255, 0.8)'};
          padding: 0 8px;
          flex-shrink: 0;
        }
        .btn-tweak:hover { background: rgba(255, 255, 255, 0.16); color: #fff; }
        .btn-icon {
          width: 28px; height: 28px; padding: 0; border-radius: 50%;
          background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.8);
          border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
          outline: none; transition: all 0.15s ease; flex-shrink: 0;
        }
        .btn-icon:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }
        .btn-copy {
          background: rgba(255, 255, 255, 0.1); color: #fff; flex-shrink: 0;
        }
        .btn-copy:hover { background: rgba(255, 255, 255, 0.2); }
        .btn-copy svg { width: 14px; height: 14px; fill: currentColor; }

        /* Tweaker popover card anchored above palette */
        .tweaker-popover {
          position: fixed;
          bottom: max(68px, calc(env(safe-area-inset-bottom, 12px) + 54px));
          left: 50%;
          transform: translateX(-50%);
          width: min(380px, calc(100vw - 20px));
          max-height: min(480px, calc(100vh - 90px));
          box-sizing: border-box;
          overflow-y: auto;
          background: #18181b;
          color: #f4f4f5;
          border: 1px solid #27272a;
          border-radius: 14px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 14px;
          pointer-events: auto;
          z-index: 100;
        }
        .popover-header {
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid #27272a; padding-bottom: 6px;
        }
        .popover-title { font-size: 12px; font-weight: 700; color: #fafafa; }
        .target-meta {
          background: #27272a; border-radius: 6px; padding: 6px 8px; font-size: 10.5px;
          font-family: ui-monospace, monospace; display: flex; flex-direction: column; gap: 3px;
          overflow: hidden;
        }
        .target-selector { color: #93c5fd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .target-xpath { color: #a1a1aa; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .row { display: grid; grid-template-columns: 85px 1fr; gap: 8px; align-items: center; }
        .row label { font-size: 10px; color: #a1a1aa; text-transform: uppercase; font-weight: 600; }
        .row input {
          padding: 4px 7px; background: #27272a; border: 1px solid #3f3f46; border-radius: 5px;
          font-size: 11px; color: #fafafa; font-family: ui-monospace, monospace; outline: none;
          min-width: 0; box-sizing: border-box;
        }
        .row input:focus { border-color: #3b82f6; }
        .diff-preview {
          background: #09090b; color: #a1a1aa; padding: 6px 8px; border-radius: 5px;
          border: 1px solid #27272a; font-family: ui-monospace, monospace; font-size: 10px;
          white-space: pre-wrap; max-height: 85px; overflow-y: auto;
        }

        /* Batch button and popover */
        .btn-batch {
          background: ${showBatch ? '#2563eb' : 'rgba(255, 255, 255, 0.08)'};
          color: ${showBatch ? '#fff' : 'rgba(255, 255, 255, 0.9)'};
          padding: 0 10px;
          border: 1px solid ${showBatch ? '#3b82f6' : 'rgba(255, 255, 255, 0.12)'};
          display: flex; align-items: center; gap: 4px;
          flex-shrink: 0;
        }
        .btn-batch:hover { background: rgba(255, 255, 255, 0.16); color: #fff; }
        .btn-send-agent {
          background: #2563eb; color: #fff; font-weight: 600;
          padding: 0 12px; display: flex; align-items: center; gap: 4px;
          flex-shrink: 0;
        }
        .btn-send-agent:hover { background: #1d4ed8; }
        .btn-copy-prompt {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.12);
          width: 32px;
          height: 32px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          flex-shrink: 0;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-copy-prompt:hover {
          background: rgba(255, 255, 255, 0.16);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.25);
        }
        .btn-copy-prompt:active {
          transform: scale(0.95);
        }
        .mobile-copy-btn {
          width: 30px;
          height: 30px;
          border-radius: 6px;
        }
        .btn-copy-batch {
          background: rgba(255, 255, 255, 0.08);
          color: #f4f4f5;
          border: 1px solid rgba(255, 255, 255, 0.16);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .btn-copy-batch:hover {
          background: rgba(255, 255, 255, 0.16);
        }
        .batch-count-badge {
          background: ${showBatch ? '#1d4ed8' : '#2563eb'}; color: #fff; border-radius: 9999px;
          padding: 1px 6px; font-size: 10px; font-weight: 700;
        }

        .batch-popover {
          position: fixed;
          bottom: max(68px, calc(env(safe-area-inset-bottom, 12px) + 54px));
          left: 50%;
          transform: translateX(-50%);
          width: min(420px, calc(100vw - 20px));
          max-height: min(480px, calc(100vh - 90px));
          box-sizing: border-box;
          overflow-y: auto;
          background: #18181b;
          color: #f4f4f5;
          border: 1px solid #27272a;
          border-radius: 14px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px 16px;
          pointer-events: auto;
          z-index: 100;
        }
        .batch-section { display: flex; flex-direction: column; gap: 4px; }
        .batch-label { font-size: 10px; color: #a1a1aa; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
        .batch-text { background: #27272a; border-radius: 6px; padding: 7px 10px; font-size: 11.5px; color: #f4f4f5; }
        .batch-item {
          display: flex; align-items: center; justify-content: space-between;
          background: #27272a; border-radius: 6px; padding: 6px 10px; font-size: 11px;
        }
        .batch-item-left { display: flex; align-items: center; gap: 6px; }
        .batch-item-tag { font-weight: 600; color: #93c5fd; }
        .batch-item-detail { font-size: 10px; color: #a1a1aa; font-family: ui-monospace, monospace; }
        .batch-empty { color: #71717a; font-style: italic; font-size: 11px; padding: 4px 0; }
        .batch-footer {
          display: flex; align-items: center; justify-content: flex-end; gap: 8px;
          border-top: 1px solid #27272a; padding-top: 10px; margin-top: 2px;
        }
        .btn-submit-batch {
          background: #2563eb; color: #fff; height: 30px; padding: 0 14px;
          border-radius: 9999px; font-weight: 600; font-size: 11.5px; border: none; cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-submit-batch:hover { background: #1d4ed8; }

        @media (max-width: 640px) {
          .floating-palette {
            bottom: max(8px, env(safe-area-inset-bottom, 8px));
            padding: 4px 6px;
            gap: 4px;
            border-radius: 9999px;
            max-width: calc(100vw - 12px);
          }
          .mode-group {
            padding: 1px;
            gap: 1px;
          }
          .mode-btn {
            width: 26px;
            height: 26px;
          }
          .mode-btn svg {
            width: 13px;
            height: 13px;
          }
          .prompt-field {
            min-width: 100px;
            width: 130px;
            font-size: 11px;
            padding: 4px 8px;
          }
          .prompt-field:focus {
            width: 160px;
            max-width: 200px;
          }
          .btn-action {
            height: 26px;
            padding: 0 8px;
            font-size: 10.5px;
          }
          .btn-quick-render-ai, .btn-quick-render-manual {
            height: 24px;
            padding: 0 7px;
            font-size: 10px;
          }
          .btn-icon {
            width: 26px;
            height: 26px;
          }
          .btn-icon svg {
            width: 13px;
            height: 13px;
          }
          .chips-container {
            max-width: 110px;
          }
          .chip {
            padding: 1px 5px;
            font-size: 10px;
          }
          .tweaker-popover, .batch-popover, .info-popover {
            bottom: max(56px, calc(env(safe-area-inset-bottom, 8px) + 48px));
            padding: 10px 12px;
          }
        }

        /* Vertical layout & rail dock styles */
        .floating-palette.layout-vertical {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          bottom: auto;
          left: auto;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          padding: 7px 5px;
          width: 44px;
          border-radius: 26px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
          overflow-x: auto;
          overflow-y: visible;
          scrollbar-width: none;
          z-index: 100;
        }
        .floating-palette.layout-vertical.dock-right {
          right: 10px;
          left: auto;
        }
        .floating-palette.layout-vertical.dock-left {
          left: 10px;
          right: auto;
        }
        .rail-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          width: 100%;
        }
        .rail-divider {
          width: 22px;
          height: 1px;
          background: rgba(255, 255, 255, 0.16);
          margin: 2px 0;
          flex-shrink: 0;
        }
        .rail-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.65);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          padding: 0;
          outline: none;
          position: relative;
          font-size: 13px;
          flex-shrink: 0;
        }
        .rail-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }
        .rail-btn.active {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 0 12px rgba(37, 99, 235, 0.6);
        }
        .rail-btn svg {
          width: 15px;
          height: 15px;
          fill: currentColor;
        }
        .rail-btn-action {
          color: #fafafa;
          font-weight: 600;
        }
        .rail-btn-send {
          background: #2563eb;
          color: #ffffff;
          font-weight: bold;
        }
        .rail-btn-send:hover {
          background: #1d4ed8;
          box-shadow: 0 0 12px rgba(37, 99, 235, 0.5);
        }
        .rail-btn-with-sub {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
        }
        .rail-help-btn {
          position: absolute;
          top: -2px;
          right: -2px;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.28);
          color: #ffffff;
          font-size: 8.5px;
          font-weight: 700;
          line-height: 11px;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          outline: none;
          transition: all 0.15s ease;
        }
        .rail-help-btn:hover, .rail-help-btn.active {
          background: #3b82f6;
          border-color: #60a5fa;
          box-shadow: 0 0 6px rgba(59, 130, 246, 0.6);
        }
        .rail-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          min-width: 13px;
          height: 13px;
          padding: 0 3px;
          border-radius: 9999px;
          background: #ef4444;
          color: #ffffff;
          font-size: 8.5px;
          font-weight: 700;
          line-height: 13px;
          text-align: center;
        }
        .rail-btn-util {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.5);
        }
        .rail-btn-util:hover {
          color: #ffffff;
        }

        /* Companion mobile prompt bar */
        .mobile-prompt-bar {
          position: fixed;
          bottom: max(12px, env(safe-area-inset-bottom, 12px));
          z-index: 100;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          background: rgba(22, 22, 26, 0.94);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 9999px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
          box-sizing: border-box;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: auto;
        }
        .mobile-prompt-bar.dock-right {
          left: 10px;
          right: 60px;
          max-width: calc(100vw - 70px);
        }
        .mobile-prompt-bar.dock-left {
          left: 60px;
          right: 10px;
          max-width: calc(100vw - 70px);
        }
        .mobile-prompt-bar.collapsed {
          width: auto;
          padding: 4px 10px;
        }
        .mobile-prompt-bar.collapsed .mobile-prompt-input,
        .mobile-prompt-bar.collapsed .mobile-chips,
        .mobile-prompt-bar.collapsed .mobile-send-btn,
        .mobile-prompt-bar.collapsed .mobile-prompt-collapse-btn {
          display: none !important;
        }
        .mobile-prompt-expand-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.85);
          font-size: 11.5px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 2px 4px;
        }
        .mobile-prompt-collapse-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.45);
          cursor: pointer;
          font-size: 12px;
          padding: 0 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .mobile-prompt-collapse-btn:hover {
          color: #ffffff;
        }
        .mobile-chips {
          max-width: 90px;
        }
        .mobile-prompt-input {
          flex: 1 1 auto;
          min-width: 70px;
          width: auto;
          font-size: 11.5px;
          padding: 4px 8px;
        }
        .mobile-send-btn {
          height: 26px;
          padding: 0 9px;
          font-size: 11px;
          flex-shrink: 0;
        }

        /* Popover positioning in vertical mode */
        .floating-palette.layout-vertical.dock-right ~ .tweaker-popover,
        .floating-palette.layout-vertical.dock-right ~ .batch-popover,
        .floating-palette.layout-vertical.dock-right ~ .info-popover {
          left: 10px;
          right: 60px;
          transform: none;
          width: auto;
          max-width: calc(100vw - 70px);
          bottom: max(56px, calc(env(safe-area-inset-bottom, 12px) + 48px));
        }
        .floating-palette.layout-vertical.dock-left ~ .tweaker-popover,
        .floating-palette.layout-vertical.dock-left ~ .batch-popover,
        .floating-palette.layout-vertical.dock-left ~ .info-popover {
          left: 60px;
          right: 10px;
          transform: none;
          width: auto;
          max-width: calc(100vw - 70px);
          bottom: max(56px, calc(env(safe-area-inset-bottom, 12px) + 48px));
        }

        /* Agent live status indicator styles */
        .agent-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 26px;
          padding: 0 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.01em;
          white-space: nowrap;
          pointer-events: auto;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          animation: statusPillFadeIn 0.2s ease-out;
        }
        @keyframes statusPillFadeIn {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        .agent-status-pill.status-working {
          background: rgba(37, 99, 235, 0.22);
          border: 1px solid rgba(59, 130, 246, 0.5);
          color: #93c5fd;
          box-shadow: 0 0 12px rgba(37, 99, 235, 0.35);
        }
        .agent-status-pill.status-done {
          background: rgba(22, 163, 74, 0.22);
          border: 1px solid rgba(34, 197, 94, 0.5);
          color: #86efac;
          box-shadow: 0 0 12px rgba(34, 197, 94, 0.35);
        }
        .agent-status-pill.status-error {
          background: rgba(220, 38, 38, 0.22);
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: #fca5a5;
        }
        .status-spinner {
          width: 10px;
          height: 10px;
          border: 2px solid rgba(147, 197, 253, 0.3);
          border-top-color: #93c5fd;
          border-radius: 50%;
          animation: statusSpin 0.75s linear infinite;
        }
        @keyframes statusSpin {
          to { transform: rotate(360deg); }
        }
        .rail-btn-send.status-working {
          background: #2563eb !important;
          animation: pulseSend 1.2s infinite ease-in-out;
        }
        .rail-btn-send.status-done {
          background: #16a34a !important;
        }
        @keyframes pulseSend {
          0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
          70% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
        @media (max-width: 640px) {
          .agent-status-pill {
            height: 22px;
            padding: 0 7px;
            font-size: 10px;
          }
          .agent-status-pill .status-text {
            max-width: 100px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
      </style>

      <canvas class="design-canvas" data-canvas></canvas>

      <div class="box-layer">
        ${renderBoxLayerHtml()}
      </div>

      ${showTweaker && activeSel ? `
        <div class="tweaker-popover">
          <div class="popover-header">
            <div class="popover-title">Element Styles (@e${selIndex + 1})</div>
            <button class="btn-icon" data-action="close-tweaker" style="width:20px;height:20px;">&times;</button>
          </div>
          <div class="target-meta">
            <div class="target-selector" title="${activeSel.selector}"><strong>Selector:</strong> ${activeSel.selector}</div>
            <div class="target-xpath" title="${activeSel.xpath}"><strong>XPath:</strong> ${activeSel.xpath}</div>
          </div>
          <div class="row">
            <label>Padding</label>
            <input type="text" data-edit-prop="padding" value="${activeSel.element.style.padding || activeSel.originalStyles.padding || ''}" placeholder="12px 16px" />
          </div>
          <div class="row">
            <label>Margin</label>
            <input type="text" data-edit-prop="margin" value="${activeSel.element.style.margin || activeSel.originalStyles.margin || ''}" placeholder="8px" />
          </div>
          <div class="row">
            <label>Font Size</label>
            <input type="text" data-edit-prop="font-size" value="${activeSel.element.style.fontSize || activeSel.originalStyles['font-size'] || ''}" placeholder="16px" />
          </div>
          <div class="row">
            <label>Color</label>
            <input type="text" data-edit-prop="color" value="${activeSel.element.style.color || activeSel.originalStyles.color || ''}" placeholder="#2563eb" />
          </div>
          <div class="row">
            <label>Background</label>
            <input type="text" data-edit-prop="background-color" value="${activeSel.element.style.backgroundColor || activeSel.originalStyles['background-color'] || ''}" placeholder="#f3f4f6" />
          </div>
          <div class="row">
            <label>Radius</label>
            <input type="text" data-edit-prop="border-radius" value="${activeSel.element.style.borderRadius || activeSel.originalStyles['border-radius'] || ''}" placeholder="8px" />
          </div>
          <div class="row">
            <label>Text</label>
            <input type="text" data-edit-text="true" value="${isSensitive(activeSel.element) ? redactedValue : (activeSel.element.textContent || '').trim().slice(0, 80)}" />
          </div>
          ${diff ? `
            <div>
              <div style="font-size:9.5px;color:#a1a1aa;text-transform:uppercase;font-weight:700;margin-bottom:3px;">CSS Batch Diff</div>
              <div class="diff-preview">${diff}</div>
            </div>
          ` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; border-top:1px solid #27272a; padding-top:8px;">
            <div class="render-item-wrap">
              <button class="btn-action btn-quick-render-manual" data-action="quick-render-manual" title="Quick Render Manual Tweaks">⚡ Manual Render</button>
              <button class="help-question-btn ${activeInfo === 'manual' ? 'active' : ''}" data-action="toggle-info-manual" title="How Quick Render (Manual) works">?</button>
            </div>
            ${diff ? `<span style="font-size:10px; color:#a1a1aa;">${edits.size} tweak${edits.size === 1 ? '' : 's'}</span>` : ''}
          </div>
        </div>
      ` : ''}

      ${showBatch ? `
        <div class="batch-popover">
          <div class="popover-header">
            <div class="popover-title">Batch Review (${selections.length + marks.length} item${selections.length + marks.length === 1 ? '' : 's'})</div>
            <button class="btn-icon" data-action="close-batch" style="width:20px;height:20px;">&times;</button>
          </div>

          <div class="batch-section">
            <div class="batch-label">Change Description</div>
            <div class="batch-text">
              ${currentPromptText ? escapeHtml(currentPromptText) : '<span class="batch-empty">No prompt description entered.</span>'}
            </div>
          </div>

          <div class="batch-section">
            <div class="batch-label">Selected Elements (${selections.length})</div>
            ${selections.length === 0 ? '<div class="batch-empty">No elements selected.</div>' : `
              <div style="display:flex;flex-direction:column;gap:5px;">
                ${selections.map((s, idx) => `
                  <div class="batch-item">
                    <div class="batch-item-left">
                      <span class="chip-icon" style="color:${s.color};">▢</span>
                      <span class="batch-item-tag">@e${idx + 1} &lt;${s.element.localName}&gt;</span>
                    </div>
                    <span class="batch-item-detail" title="${s.selector}">${s.selector}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div class="batch-section">
            <div class="batch-label">Visual Annotations (${marks.length})</div>
            ${marks.length === 0 ? '<div class="batch-empty">No visual annotations drawn.</div>' : `
              <div style="display:flex;flex-direction:column;gap:5px;">
                ${marks.map((m) => `
                  <div class="batch-item">
                    <div class="batch-item-left">
                      <span style="color:${m.color};">${m.type === 'region' ? '◰' : m.type === 'arrow' ? '↗' : '✏'}</span>
                      <span style="font-weight:600;text-transform:capitalize;">${m.type}</span>
                    </div>
                    <span class="batch-item-detail">${m.type === 'pen' ? `${m.points?.length ?? 0} points` : `${Math.round(m.bounds?.width ?? 0)}x${Math.round(m.bounds?.height ?? 0)}px`}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          ${diff ? `
            <div class="batch-section">
              <div class="batch-label">Proposed CSS Diff</div>
              <div class="diff-preview">${diff}</div>
            </div>
          ` : ''}

          <div class="batch-footer">
            <button class="btn-action" data-action="clear-all" style="background:rgba(255,255,255,0.08);color:#a1a1aa;padding:0 12px;height:28px;">
              Clear
            </button>
            <button class="btn-copy-batch" data-action="copy-prompt-btn" title="Copy formatted prompt to clipboard (Cmd+V)">
              📋 Copy Prompt
            </button>
            <button class="btn-submit-batch" data-action="submit-batch" title="Submit Batch to Agent">
              Submit Batch to Agent
            </button>
          </div>
        </div>
      ` : ''}

      ${activeInfo === 'ai' ? `
        <div class="info-popover">
          <div class="info-header">
            <div class="info-title-wrap">
              <span class="info-icon">⚡</span>
              <span class="info-title">Quick Render (AI)</span>
              <span class="info-badge info-badge-ai">TypeSafe AI &bull; Jev</span>
            </div>
            <button class="btn-icon" data-action="close-info" title="Close info" style="width:20px;height:20px;">&times;</button>
          </div>
          <div class="info-desc">
            Translates natural language UI instructions directly into live CSS overrides using TypeSafe AI and Jev fast synthesis.
          </div>
          <div class="info-steps">
            <div class="info-step">
              <span class="info-step-num">1</span>
              <div class="info-step-content">
                <strong>Select &amp; Prompt:</strong> Click any element and type what you want in the prompt field (e.g. <em>"coral background, 20px rounded corners"</em>).
              </div>
            </div>
            <div class="info-step">
              <span class="info-step-num">2</span>
              <div class="info-step-content">
                <strong>Jev Fast Synthesis:</strong> TypeSafe AI sends the element context and prompt to Jev via Vercel AI Gateway for instant structured CSS generation.
              </div>
            </div>
            <div class="info-step">
              <span class="info-step-num">3</span>
              <div class="info-step-content">
                <strong>0ms DOM Injection:</strong> Injects a <code>&lt;style id="__agent_bridge_live_preview__"&gt;</code> tag directly into <code>document.head</code> with <code>!important</code> rules. Instant preview, zero server rebuilds.
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      ${activeInfo === 'manual' ? `
        <div class="info-popover">
          <div class="info-header">
            <div class="info-title-wrap">
              <span class="info-icon">⚙</span>
              <span class="info-title">Quick Render (Manual)</span>
              <span class="info-badge info-badge-manual">Inspector</span>
            </div>
            <button class="btn-icon" data-action="close-info" title="Close info" style="width:20px;height:20px;">&times;</button>
          </div>
          <div class="info-desc">
            Inspects selected elements and applies direct manual CSS property tweaks instantly.
          </div>
          <div class="info-steps">
            <div class="info-step">
              <span class="info-step-num">1</span>
              <div class="info-step-content">
                <strong>Select Element:</strong> Click any element on the page, then click <strong>⚙ Tweak</strong> to open the style inspector.
              </div>
            </div>
            <div class="info-step">
              <span class="info-step-num">2</span>
              <div class="info-step-content">
                <strong>Adjust Properties:</strong> Manually change padding, margin, font size, text color, background color, or border radius in the inspector inputs.
              </div>
            </div>
            <div class="info-step">
              <span class="info-step-num">3</span>
              <div class="info-step-content">
                <strong>Instant Apply:</strong> Click <strong>⚡ Manual</strong> to serialize all your tweaks into CSS and inject them into <code>document.head</code> with <code>!important</code> overrides.
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      ${isVerticalMode() ? `
        <div class="floating-palette layout-vertical dock-${verticalDockSide}">
          <div class="rail-group rail-tools">
            <button class="rail-btn ${activeTool === 'select' ? 'active' : ''}" data-tool="select" title="Select Element (pointer)">
              <svg viewBox="0 0 24 24"><path d="M4 3l15 9-7 2-3 7L4 3z"/></svg>
            </button>
            <button class="rail-btn ${activeTool === 'interact' ? 'active' : ''}" data-tool="interact" title="Interact / Browse (Escape to toggle) - Click inputs, type, navigate">
              <svg viewBox="0 0 24 24"><path d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.02-.24-.02-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.43 1.06.43h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.01-.14.01-.21 0-.61-.38-1.16-.95-1.34z"/></svg>
            </button>
            <button class="rail-btn ${activeTool === 'pen' ? 'active' : ''}" data-tool="pen" title="Freehand Pen">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="rail-btn ${activeTool === 'region' ? 'active' : ''}" data-tool="region" title="Region Box">
              <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>
            </button>
            <button class="rail-btn ${activeTool === 'arrow' ? 'active' : ''}" data-tool="arrow" title="Draw Arrow">
              <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
            </button>
          </div>

          <div class="rail-divider"></div>

          <div class="rail-group rail-actions">
            <div class="rail-btn-with-sub">
              <button class="rail-btn rail-btn-action" data-action="quick-render" data-action-ai="quick-render-ai" title="⚡ Quick Render (AI) with Jev">
                ⚡
              </button>
              <button class="rail-help-btn ${activeInfo === 'ai' ? 'active' : ''}" data-action="toggle-info-ai" title="How Quick Render (AI) works with Jev">?</button>
            </div>

            <div class="rail-btn-with-sub">
              <button class="rail-btn rail-btn-action" data-action="quick-render-manual" title="Quick Render (Manual Tweaks)">
                🛠
              </button>
              <button class="rail-help-btn ${activeInfo === 'manual' ? 'active' : ''}" data-action="toggle-info-manual" title="How Quick Render (Manual) works">?</button>
            </div>

            ${selections.length > 0 ? `
              <button class="rail-btn rail-btn-action ${showTweaker ? 'active' : ''}" data-action="toggle-tweaker" title="Tweak Styles (Inspector)">
                ⚙
              </button>
            ` : ''}

            <button class="rail-btn rail-btn-action ${showBatch ? 'active' : ''}" data-action="toggle-batch" title="View Current Batch">
              📋
              ${(selections.length + marks.length) > 0 ? `<span class="rail-badge">${selections.length + marks.length}</span>` : ''}
            </button>

            <button class="rail-btn rail-btn-send ${currentAgentStatus.status === 'working' ? 'status-working' : currentAgentStatus.status === 'done' ? 'status-done' : ''}" data-action="submit-batch" title="${currentAgentStatus.status === 'working' ? escapeHtml(currentAgentStatus.message || 'Agent working...') : currentAgentStatus.status === 'done' ? 'Changes applied' : 'Send to Agent'}">
              ${currentAgentStatus.status === 'working' ? '⚙' : currentAgentStatus.status === 'done' ? '✓' : '➤'}
            </button>
          </div>

          <div class="rail-divider"></div>

          <div class="rail-group rail-utils">
            <button class="rail-btn rail-btn-util" data-action="toggle-dock-side" title="Flip Dock Side (${verticalDockSide === 'right' ? 'Move to Left' : 'Move to Right'})">
              ⇄
            </button>
            <button class="rail-btn rail-btn-util" data-action="toggle-layout" title="Switch to Horizontal Bar">
              ⬍
            </button>
            <button class="rail-btn rail-btn-util btn-copy" data-action="copy-prompt" title="Copy Prompt for Agent">
              <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            </button>
            <button class="rail-btn rail-btn-util" data-action="clear-all" title="Clear All Selections and Drawings">
              &times;
            </button>
          </div>
        </div>

        <div class="mobile-prompt-bar dock-${verticalDockSide} ${isPromptBarCollapsed ? 'collapsed' : ''}">
          ${isPromptBarCollapsed ? `
            <button class="mobile-prompt-expand-btn" data-action="toggle-prompt-bar" title="Expand Prompt Input">
              💬 <span class="mobile-prompt-expand-label">${currentPromptText ? escapeHtml(currentPromptText.slice(0, 18)) : (selections.length ? `&lt;${selections[0].element.localName}&gt;` : 'Describe change')}</span>
            </button>
          ` : ''}

          ${selections.length > 0 ? `
            <div class="chips-container mobile-chips">
              ${selections.map((s, idx) => `
                <div class="chip ${s.element === activeElement ? 'active' : ''}" style="--chip-color: ${s.color};" data-select-chip="${idx}">
                  <span class="chip-icon">▢</span>
                  <span>&lt;${s.element.localName}&gt;</span>
                  <button class="chip-remove" data-remove-selection="${idx}" title="Remove">&times;</button>
                </div>
              `).join('')}

              ${marks.map((m, idx) => `
                <div class="chip" style="--chip-color: ${m.color};" data-mark-chip="${idx}">
                  <span class="chip-icon">${m.type === 'region' ? '◰' : m.type === 'arrow' ? '↗' : '✏'}</span>
                  <span>${m.type}</span>
                  <button class="chip-remove" data-remove-mark="${idx}" title="Remove">&times;</button>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <input type="text" class="prompt-field mobile-prompt-input" data-agent-prompt placeholder="Describe the change" value="${escapeHtml(currentPromptText)}" />

          <button class="btn-copy-prompt mobile-copy-btn" data-action="copy-prompt-btn" title="Copy formatted prompt to clipboard (Cmd+V)">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>

          <button class="btn-action btn-send-agent mobile-send-btn" data-action="submit-batch" title="Send to Agent (Enter)">
            ➤
          </button>

          ${currentAgentStatus.status !== 'idle' ? `
            <div class="agent-status-pill mobile-status-pill status-${currentAgentStatus.status}" title="${escapeHtml(currentAgentStatus.message || '')}">
              ${currentAgentStatus.status === 'working' ? '<span class="status-spinner"></span>' : ''}
              ${currentAgentStatus.status === 'done' ? '<span>✓</span>' : ''}
              ${currentAgentStatus.status === 'error' ? '<span>⚠</span>' : ''}
              <span class="status-text">${escapeHtml(currentAgentStatus.message || (currentAgentStatus.status === 'working' ? 'Working...' : 'Done'))}</span>
            </div>
          ` : ''}

          <button class="mobile-prompt-collapse-btn" data-action="toggle-prompt-bar" title="Minimize Prompt Bar">
            ▾
          </button>
        </div>
      ` : `
        <div class="floating-palette">
          <div class="mode-group">
            <button class="mode-btn ${activeTool === 'interact' ? 'active' : ''}" data-tool="interact" title="Interact / Browse (Escape to toggle) - Click inputs, type, navigate">
              <svg viewBox="0 0 24 24"><path d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.02-.24-.02-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.43 1.06.43h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.01-.14.01-.21 0-.61-.38-1.16-.95-1.34z"/></svg>
            </button>
            <div class="mode-divider"></div>
            <button class="mode-btn ${activeTool === 'select' ? 'active' : ''}" data-tool="select" title="Select Element (pointer)">
              <svg viewBox="0 0 24 24"><path d="M4 3l15 9-7 2-3 7L4 3z"/></svg>
            </button>
            <button class="mode-btn ${activeTool === 'pen' ? 'active' : ''}" data-tool="pen" title="Freehand Pen">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="mode-btn ${activeTool === 'region' ? 'active' : ''}" data-tool="region" title="Region Box">
              <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>
            </button>
            <button class="mode-btn ${activeTool === 'arrow' ? 'active' : ''}" data-tool="arrow" title="Draw Arrow">
              <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
            </button>
          </div>

          <div class="chips-container">
            ${selections.map((s, idx) => `
              <div class="chip ${s.element === activeElement ? 'active' : ''}" style="--chip-color: ${s.color};" data-select-chip="${idx}">
                <span class="chip-icon">▢</span>
                <span>&lt;${s.element.localName}&gt;</span>
                <button class="chip-remove" data-remove-selection="${idx}" title="Remove">&times;</button>
              </div>
            `).join('')}

            ${marks.map((m, idx) => `
              <div class="chip" style="--chip-color: ${m.color};" data-mark-chip="${idx}">
                <span class="chip-icon">${m.type === 'region' ? '◰' : m.type === 'arrow' ? '↗' : '✏'}</span>
                <span>${m.type}</span>
                <button class="chip-remove" data-remove-mark="${idx}" title="Remove">&times;</button>
              </div>
            `).join('')}
          </div>

          <input type="text" class="prompt-field" data-agent-prompt placeholder="Describe the change" value="${escapeHtml(currentPromptText)}" />

          <button class="btn-copy-prompt" data-action="copy-prompt-btn" title="Copy formatted prompt to clipboard (Cmd+V)">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>

          <button class="btn-action btn-send-agent" data-action="submit-batch" title="Send to Agent (Enter)">
            ➤ Send
          </button>

          ${currentAgentStatus.status !== 'idle' ? `
            <div class="agent-status-pill status-${currentAgentStatus.status}" title="${escapeHtml(currentAgentStatus.message || '')}">
              ${currentAgentStatus.status === 'working' ? '<span class="status-spinner"></span>' : ''}
              ${currentAgentStatus.status === 'done' ? '<span>✓</span>' : ''}
              ${currentAgentStatus.status === 'error' ? '<span>⚠</span>' : ''}
              <span class="status-text">${escapeHtml(currentAgentStatus.message || (currentAgentStatus.status === 'working' ? 'Agent working...' : 'Changes applied'))}</span>
            </div>
          ` : ''}

          <div class="render-item-wrap">
            <button class="btn-action btn-quick-render btn-quick-render-ai" data-action="quick-render" data-action-ai="quick-render-ai" title="Quick Render (AI) with Jev">
              ⚡ AI Render
            </button>
            <button class="help-question-btn ${activeInfo === 'ai' ? 'active' : ''}" data-action="toggle-info-ai" title="How Quick Render (AI) works with Jev">?</button>
          </div>

          <div class="render-item-wrap">
            <button class="btn-action btn-quick-render-manual" data-action="quick-render-manual" title="Quick Render (Manual Tweaks)">
              ⚡ Manual
            </button>
            <button class="help-question-btn ${activeInfo === 'manual' ? 'active' : ''}" data-action="toggle-info-manual" title="How Quick Render (Manual) works">?</button>
          </div>

          ${selections.length > 0 ? `
            <button class="btn-action btn-tweak" data-action="toggle-tweaker" title="Tweak Styles">
              ⚙ Tweak
            </button>
          ` : ''}

          <button class="btn-action btn-batch" data-action="toggle-batch" title="View Current Batch">
            📋 Batch <span class="batch-count-badge">${selections.length + marks.length}</span>
          </button>

          <button class="btn-icon btn-copy" data-action="copy-prompt" title="Copy Prompt for Agent">
            <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>

          <button class="btn-icon" data-action="toggle-layout" title="Switch to Vertical Rail (Mobile / Clean View)">
            ⬍
          </button>

          <button class="btn-icon" data-action="clear-all" title="Clear All Selections and Drawings">
            &times;
          </button>
        </div>
      `}
    `;

    shadowRoot.innerHTML = html;
    canvas = shadowRoot.querySelector<HTMLCanvasElement>('[data-canvas]');
    resizeCanvas();
    paintCanvas();
    bindOverlayEvents();
  };

  const resizeCanvas = () => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
  };

  const paintCanvas = () => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Draw saved marks
    for (const mark of marks) {
      drawMark(ctx, mark);
    }

    // Draw live preview shape while dragging
    if (isDrawing && dragStart) {
      if (activeTool === 'pen' && currentPoints.length > 1) {
        drawPolyline(ctx, currentPoints, '#AF52DE', 3);
      } else if (activeTool === 'region' && currentPoints.length > 0) {
        const last = currentPoints[currentPoints.length - 1];
        const bounds = getBoundsFromPoints(dragStart, last);
        drawRegionBox(ctx, bounds, '#AF52DE');
      } else if (activeTool === 'rect' && currentPoints.length > 0) {
        const last = currentPoints[currentPoints.length - 1];
        const bounds = getBoundsFromPoints(dragStart, last);
        drawRectBox(ctx, bounds, '#0A84FF');
      } else if (activeTool === 'arrow' && currentPoints.length > 0) {
        const last = currentPoints[currentPoints.length - 1];
        drawArrow(ctx, dragStart, last, '#0A84FF', 3);
      }
    }

    ctx.restore();
  };

  const getBoundsFromPoints = (p1: StoredPoint, p2: StoredPoint) => ({
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  });

  const drawMark = (ctx: CanvasRenderingContext2D, mark: StoredMark) => {
    if (mark.type === 'pen' && mark.points && mark.points.length > 1) {
      drawPolyline(ctx, mark.points, mark.color, 3);
    } else if (mark.type === 'region' && mark.bounds) {
      drawRegionBox(ctx, mark.bounds, mark.color);
    } else if (mark.type === 'rect' && mark.bounds) {
      drawRectBox(ctx, mark.bounds, mark.color);
    } else if (mark.type === 'arrow' && mark.points && mark.points.length >= 2) {
      drawArrow(ctx, mark.points[0], mark.points[mark.points.length - 1], mark.color, 3);
    }
  };

  const drawPolyline = (ctx: CanvasRenderingContext2D, points: StoredPoint[], color: string, width: number) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  };

  const drawRegionBox = (ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }, color: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.fillStyle = 'rgba(175, 82, 222, 0.08)';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.restore();
  };

  const drawRectBox = (ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }, color: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.fillStyle = 'rgba(10, 132, 255, 0.06)';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.restore();
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, from: StoredPoint, to: StoredPoint, color: string, width: number) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';

    const headlen = 14;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const bindOverlayEvents = () => {
    if (!shadowRoot) return;

    // Tool switching
    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeTool = btn.dataset.tool as Tool;
        if (activeTool !== 'select') {
          hoveredElement = null;
        }
        revision += 1;
        renderOverlay();
      });
    });

    // Chips selection
    shadowRoot.querySelectorAll('[data-select-chip]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-remove-selection]')) return;
        const idx = Number((chip as HTMLElement).dataset.selectChip);
        if (selections[idx]) {
          activeElement = selections[idx].element;
          showTweaker = true;
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

    shadowRoot.querySelectorAll('[data-remove-mark]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number((btn as HTMLElement).dataset.removeMark);
        marks.splice(idx, 1);
        revision += 1;
        renderOverlay();
      });
    });

    // Stop keydown propagation from all inputs in shadow root
    shadowRoot.querySelectorAll('input, textarea').forEach((el) => {
      el.addEventListener('keydown', (e) => {
        e.stopPropagation();
      });
    });

    // Submit action handler (used by Enter key and Send/Submit buttons)
    const executeSubmit = async () => {
      const allSubmitBtns = shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-action="submit-batch"]') || [];
      allSubmitBtns.forEach((btn) => {
        btn.disabled = true;
        btn.textContent = 'Submitting...';
      });

      // Set agent status to working immediately
      currentAgentStatus = {
        status: 'working',
        message: 'Agent working on changes...',
        timestamp: Date.now(),
      };

      // 1. Submit through SDK if present (syncs to bridge WebSocket & feedback store)
      const sdk = (globalThis as unknown as {
        __debugBridge?: {
          feedback?: {
            addItem?: (draft: any) => any;
            submitBatch?: () => Promise<void>;
          };
        };
      }).__debugBridge?.feedback;

      if (sdk) {
        try {
          if (sdk.addItem) {
            sdk.addItem({
              comment: currentPromptText || 'UI Change Request',
              target: selections[0] ? {
                selector: selections[0].selector,
                xpath: selections[0].xpath,
                tagName: selections[0].element.localName,
                textContent: selections[0].element.textContent?.slice(0, 200),
              } : undefined,
            });
          }
          if (sdk.submitBatch) {
            await sdk.submitBatch();
          }
        } catch {}
      }

      // 2. Generate screenshot artifacts, inject terminal, and copy prompt
      const handoff = await copyHandoffToClipboard(currentPromptText);

      allSubmitBtns.forEach((btn) => {
        if (handoff.terminalInjected) {
          btn.textContent = '✓ Sent to Agent (Terminal)!';
          btn.style.background = '#16a34a';
          btn.title = `Injected prompt into ${handoff.terminalMethod} target: ${handoff.terminalTarget || 'active'}`;
        } else if (handoff.clipboardOk) {
          btn.textContent = '✓ Sent to Agent (Copied)!';
          btn.style.background = '#0284c7';
          btn.title = 'Prompt copied to clipboard. Paste with Cmd+V into terminal.';
        } else {
          btn.textContent = '✓ Sent to Agent!';
          btn.style.background = '#16a34a';
        }
      });

      setTimeout(() => {
        showBatch = false;
        renderOverlay();
      }, 1400);
    };

    // Prompt input (handles both horizontal palette and mobile companion bar)
    shadowRoot.querySelectorAll<HTMLInputElement>('[data-agent-prompt]').forEach((promptInput) => {
      promptInput.addEventListener('input', () => {
        currentPromptText = promptInput.value;
      });
      promptInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          executeSubmit();
        }
      });
    });

    // Copy prompt button handler
    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="copy-prompt-btn"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const originalHtml = btn.innerHTML;
        const originalTitle = btn.title;
        btn.disabled = true;

        const handoff = await copyHandoffToClipboard(currentPromptText);
        if (handoff.clipboardOk) {
          if (btn.classList.contains('btn-copy-batch')) {
            btn.textContent = '✓ Copied!';
            btn.style.borderColor = '#16a34a';
            btn.style.color = '#22c55e';
          } else {
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15"><path fill="#22c55e" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
            btn.style.borderColor = '#16a34a';
          }
          btn.title = '✓ Copied formatted prompt to clipboard (Cmd+V)!';
        } else {
          btn.title = 'Copy failed';
        }

        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.title = originalTitle;
          btn.style.borderColor = '';
          btn.style.color = '';
          btn.disabled = false;
        }, 1500);
      });
    });

    // Info popover toggles
    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="toggle-info-ai"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeInfo = activeInfo === 'ai' ? null : 'ai';
        if (activeInfo) {
          showTweaker = false;
          showBatch = false;
        }
        renderOverlay();
      });
    });

    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="toggle-info-manual"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeInfo = activeInfo === 'manual' ? null : 'manual';
        if (activeInfo) {
          showTweaker = false;
          showBatch = false;
        }
        renderOverlay();
      });
    });

    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="close-info"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeInfo = null;
        renderOverlay();
      });
    });

    // Quick render AI buttons
    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="quick-render"], [data-action="quick-render-ai"]').forEach((quickRenderBtn) => {
      quickRenderBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const promptInput = shadowRoot.querySelector<HTMLInputElement>('[data-agent-prompt]');
        if (promptInput && promptInput.value !== undefined) {
          currentPromptText = promptInput.value;
        }
        const hasPrompt = !!currentPromptText.trim();
        if (!hasPrompt) {
          const orig = quickRenderBtn.textContent;
          quickRenderBtn.textContent = 'Enter prompt first';
          quickRenderBtn.style.background = '#71717a';
          setTimeout(() => {
            quickRenderBtn.textContent = orig;
            quickRenderBtn.style.background = '';
          }, 1500);
          return;
        }

        if (selections.length === 0) {
          const orig = quickRenderBtn.textContent;
          quickRenderBtn.textContent = 'Select element first';
          quickRenderBtn.style.background = '#f59e0b';
          setTimeout(() => {
            quickRenderBtn.textContent = orig;
            quickRenderBtn.style.background = '';
          }, 1800);
          return;
        }

        const orig = quickRenderBtn.textContent;
        quickRenderBtn.textContent = '⚡ Jev Rendering...';
        const res = await quickRenderAi();
        if (res && res.success) {
          quickRenderBtn.textContent = '✓ Rendered (Jev)!';
          quickRenderBtn.style.background = '#16a34a';
        } else {
          const reasonMsg = res?.reason === 'No element selected' ? 'Select element first' : (res?.reason ? `⚠ ${res.reason}` : '⚠ Render failed');
          quickRenderBtn.textContent = reasonMsg.slice(0, 24);
          quickRenderBtn.style.background = '#dc2626';
        }
        setTimeout(() => {
          quickRenderBtn.textContent = orig;
          quickRenderBtn.style.background = '';
        }, 1800);
      });
    });

    // Quick render Manual buttons
    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="quick-render-manual"]').forEach((manualBtn) => {
      manualBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (edits.size === 0) {
          if (selections.length === 0) {
            const orig = manualBtn.textContent;
            manualBtn.textContent = 'Select element first';
            manualBtn.style.background = '#f59e0b';
            setTimeout(() => {
              manualBtn.textContent = orig;
              manualBtn.style.background = '';
            }, 1600);
            return;
          }

          // If element is selected but no tweaks entered, auto-open tweaker popover
          showTweaker = true;
          showBatch = false;
          activeInfo = null;
          renderOverlay();

          // Focus first property input in tweaker
          setTimeout(() => {
            const firstInput = shadowRoot.querySelector<HTMLInputElement>('.tweaker-popover input[data-edit-prop]');
            firstInput?.focus();
          }, 50);
          return;
        }

        const orig = manualBtn.textContent;
        const res = quickRenderManual();
        if (res && res.success) {
          manualBtn.textContent = '✓ Tweaks Applied!';
          manualBtn.style.background = '#16a34a';
        } else {
          manualBtn.textContent = '⚠ No tweaks';
          manualBtn.style.background = '#dc2626';
        }
        setTimeout(() => {
          manualBtn.textContent = orig;
          manualBtn.style.background = '';
        }, 1800);
      });
    });

    // Tweaker toggle
    const tweakerBtn = shadowRoot.querySelector<HTMLButtonElement>('[data-action="toggle-tweaker"]');
    if (tweakerBtn) {
      tweakerBtn.addEventListener('click', () => {
        showTweaker = !showTweaker;
        if (showTweaker) {
          showBatch = false;
          activeInfo = null;
        }
        renderOverlay();
      });
    }

    shadowRoot.querySelector('[data-action="close-tweaker"]')?.addEventListener('click', () => {
      showTweaker = false;
      renderOverlay();
    });

    // Batch toggle
    const batchBtn = shadowRoot.querySelector<HTMLButtonElement>('[data-action="toggle-batch"]');
    if (batchBtn) {
      batchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showBatch = !showBatch;
        if (showBatch) {
          showTweaker = false;
          activeInfo = null;
        }
        renderOverlay();
      });
    }

    shadowRoot.querySelector('[data-action="close-batch"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showBatch = false;
      renderOverlay();
    });

    // Submit batch buttons (both main pill and popover)
    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="submit-batch"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        executeSubmit();
      });
    });

    // Copy prompt button
    const copyBtn = shadowRoot.querySelector<HTMLButtonElement>('[data-action="copy-prompt"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const ok = await copyHandoffToClipboard(currentPromptText);
        copyBtn.innerHTML = ok ? '✓' : '!';
        copyBtn.style.color = ok ? '#4ade80' : '#f87171';
        setTimeout(() => {
          renderOverlay();
        }, 1800);
      });
    }

    // Clear all
    shadowRoot.querySelector('[data-action="clear-all"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      while (selections.length) removeSelection(0);
      marks.length = 0;
      clearLivePatch();
      showTweaker = false;
      showBatch = false;
      revision += 1;
      renderOverlay();
    });

    // Toggle layout orientation (horizontal / vertical dock)
    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="toggle-layout"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        layoutOrientation = isVerticalMode() ? 'horizontal' : 'vertical';
        revision += 1;
        renderOverlay();
      });
    });

    // Toggle vertical dock side (right / left rail)
    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="toggle-dock-side"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        verticalDockSide = verticalDockSide === 'right' ? 'left' : 'right';
        revision += 1;
        renderOverlay();
      });
    });

    // Toggle mobile prompt bar collapsed state
    shadowRoot.querySelectorAll<HTMLButtonElement>('[data-action="toggle-prompt-bar"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        isPromptBarCollapsed = !isPromptBarCollapsed;
        renderOverlay();
      });
    });

    // Style editors in tweaker popover
    shadowRoot.querySelectorAll<HTMLInputElement>('[data-edit-prop]').forEach((input) => {
      input.addEventListener('input', () => {
        if (!activeElement) return;
        const selIdx = selections.findIndex((s) => s.element === activeElement);
        if (selIdx === -1) return;
        const prop = input.dataset.editProp!;
        const val = input.value;
        const orig = selections[selIdx].originalStyles[prop] || '';

        activeElement.style.setProperty(prop, val);
        const editId = `${selIdx}::${prop}`;
        edits.set(editId, {
          id: editId,
          kind: 'style',
          property: prop,
          original_value: orig,
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
        const selIdx = selections.findIndex((s) => s.element === activeElement);
        if (selIdx === -1) return;
        const val = textInput.value;
        const orig = selections[selIdx].originalText;
        activeElement.textContent = val;
        const editId = `${selIdx}::text-content`;
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

    // Canvas drawing interactions
    if (canvas && activeTool !== 'select') {
      canvas.addEventListener('pointerdown', (e: PointerEvent) => {
        isDrawing = true;
        dragStart = { x: e.clientX, y: e.clientY };
        currentPoints = [dragStart];
        canvas?.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener('pointermove', (e: PointerEvent) => {
        if (!isDrawing || !dragStart) return;
        currentPoints.push({ x: e.clientX, y: e.clientY });
        paintCanvas();
      });

      canvas.addEventListener('pointerup', (e: PointerEvent) => {
        if (!isDrawing || !dragStart) return;
        isDrawing = false;
        const end = { x: e.clientX, y: e.clientY };
        currentPoints.push(end);

        const color = selectionPalette[colorSequence % selectionPalette.length];
        colorSequence += 1;

        if (activeTool === 'pen') {
          marks.push({
            id: `mark_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            type: 'pen',
            color,
            points: currentPoints,
            createdAt: new Date().toISOString(),
          });
        } else if (activeTool === 'region') {
          const regionMark: StoredMark = {
            id: `mark_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            type: 'region',
            color: '#AF52DE',
            bounds: getBoundsFromPoints(dragStart, end),
            createdAt: new Date().toISOString(),
          };
          marks.push(regionMark);
          captureRegionCrop(regionMark);
        } else if (activeTool === 'rect') {
          marks.push({
            id: `mark_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            type: 'rect',
            color,
            bounds: getBoundsFromPoints(dragStart, end),
            createdAt: new Date().toISOString(),
          });
        } else if (activeTool === 'arrow') {
          marks.push({
            id: `mark_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            type: 'arrow',
            color,
            points: [dragStart, end],
            createdAt: new Date().toISOString(),
          });
        }

        dragStart = null;
        currentPoints = [];
        revision += 1;
        renderOverlay();
      });
    }
  };

  const handlePointerMove = (e: MouseEvent) => {
    if (!enabled || activeTool !== 'select') return;
    const target = e.target as HTMLElement | null;
    if (!target || overlayHost?.contains(target)) return;
    if (hoveredElement !== target) {
      hoveredElement = target;
      renderOverlay();
    }
  };

  const handleClick = (e: MouseEvent) => {
    if (!enabled || activeTool !== 'select') return;
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!enabled) return;

    const shadowActive = shadowRoot?.activeElement as HTMLElement | null;
    const activeEl = document.activeElement as HTMLElement | null;
    const activeTagName = (activeEl?.tagName || '').toLowerCase();

    if (e.key === 'Escape') {
      if (showTweaker) {
        showTweaker = false;
        renderOverlay();
        return;
      }
      if (shadowActive && (shadowActive.tagName === 'INPUT' || shadowActive.tagName === 'TEXTAREA')) {
        shadowActive.blur();
      }
      if (activeEl && (activeTagName === 'input' || activeTagName === 'textarea')) {
        activeEl.blur();
      }
      activeTool = activeTool === 'interact' ? 'select' : 'interact';
      if (activeTool !== 'select') {
        hoveredElement = null;
      }
      revision += 1;
      renderOverlay();
      return;
    }

    // Do not trigger letter shortcuts while focused on input/textarea/editable
    if (shadowActive && (shadowActive.tagName === 'INPUT' || shadowActive.tagName === 'TEXTAREA' || shadowActive.isContentEditable)) {
      return;
    }
    const isEditing = activeTagName === 'input' || activeTagName === 'textarea' || !!activeEl?.isContentEditable;
    if (isEditing) return;

    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'i' || e.key === 'I') {
        activeTool = 'interact';
        hoveredElement = null;
        revision += 1;
        renderOverlay();
      } else if (e.key === 'v' || e.key === 'V' || e.key === 's' || e.key === 'S') {
        activeTool = 'select';
        revision += 1;
        renderOverlay();
      }
    }
  };

  const pendingCrops = new Map<string, (filePath: string) => void>();

  const onCropSaved = (msg: { cropId?: string; filePath?: string }) => {
    if (msg.cropId && msg.filePath && pendingCrops.has(msg.cropId)) {
      const cb = pendingCrops.get(msg.cropId);
      pendingCrops.delete(msg.cropId);
      cb?.(msg.filePath);
    }
  };

  const requestSaveCrop = (
    dataUrl: string,
    cropId: string,
    meta?: { kind: 'element' | 'region'; selector?: string; filename?: string }
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingCrops.delete(cropId);
        resolve(null);
      }, 5000);

      pendingCrops.set(cropId, (filePath: string) => {
        clearTimeout(timeout);
        resolve(filePath);
      });

      const msg = {
        type: 'design_mode_save_crop',
        cropId,
        data: dataUrl,
        kind: meta?.kind,
        selector: meta?.selector,
        filename: meta?.filename,
        timestamp: Date.now(),
      };

      const bridge = (window as unknown as { __debugBridge?: { send?: (m: unknown) => void } }).__debugBridge;
      if (bridge && typeof bridge.send === 'function') {
        bridge.send(msg);
      } else {
        window.dispatchEvent(new CustomEvent('agent-bridge:save-crop', { detail: msg }));
      }
    });
  };

  const captureElementCrop = async (sel: StoredSelection): Promise<string | null> => {
    if (sel.screenshot_path) return sel.screenshot_path;
    const rect = sel.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    try {
      const cropCanvas = await html2canvas(sel.element, {
        logging: false,
        useCORS: true,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        ignoreElements: (el: Element) => Boolean(el.hasAttribute && el.hasAttribute('data-agent-bridge-design-overlay')),
      });

      let finalCanvas = cropCanvas;
      if (cropCanvas.width > 800 || cropCanvas.height > 800) {
        const scale = Math.min(800 / cropCanvas.width, 800 / cropCanvas.height);
        const resized = document.createElement('canvas');
        resized.width = Math.round(cropCanvas.width * scale);
        resized.height = Math.round(cropCanvas.height * scale);
        const ctx = resized.getContext('2d');
        if (ctx) {
          ctx.drawImage(cropCanvas, 0, 0, resized.width, resized.height);
          finalCanvas = resized;
        }
      }

      const dataUrl = finalCanvas.toDataURL('image/png');
      const cropId = `crop_el_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const filePath = await requestSaveCrop(dataUrl, cropId, {
        kind: 'element',
        selector: sel.selector,
      });
      if (filePath) {
        sel.screenshot_path = filePath;
      }
      return filePath;
    } catch {
      return null;
    }
  };

  const captureRegionCrop = async (mark: StoredMark): Promise<string | null> => {
    if (mark.screenshot_path || mark.type !== 'region' || !mark.bounds) return mark.screenshot_path || null;
    const bounds = mark.bounds;
    if (bounds.width === 0 || bounds.height === 0) return null;

    try {
      const cropCanvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        x: bounds.x + window.scrollX,
        y: bounds.y + window.scrollY,
        width: bounds.width,
        height: bounds.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        ignoreElements: (el: Element) => Boolean(el.hasAttribute && el.hasAttribute('data-agent-bridge-design-overlay')),
      });

      let finalCanvas = cropCanvas;
      if (cropCanvas.width > 800 || cropCanvas.height > 800) {
        const scale = Math.min(800 / cropCanvas.width, 800 / cropCanvas.height);
        const resized = document.createElement('canvas');
        resized.width = Math.round(cropCanvas.width * scale);
        resized.height = Math.round(cropCanvas.height * scale);
        const ctx = resized.getContext('2d');
        if (ctx) {
          ctx.drawImage(cropCanvas, 0, 0, resized.width, resized.height);
          finalCanvas = resized;
        }
      }

      const dataUrl = finalCanvas.toDataURL('image/png');
      const cropId = `crop_reg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const filePath = await requestSaveCrop(dataUrl, cropId, {
        kind: 'region',
      });
      if (filePath) {
        mark.screenshot_path = filePath;
      }
      return filePath;
    } catch {
      return null;
    }
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
    captureElementCrop(sel);
  };

  const removeSelection = (index: number) => {
    const sel = selections[index];
    if (!sel) return;
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

  const extractReactFiberInfo = (element: HTMLElement): { components: string[]; propKeys: string[] } => {
    const components: string[] = [];
    const propKeys: string[] = [];

    try {
      const keys = Object.keys(element);
      const fiberKey = keys.find(
        (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
      );
      const propsKey = keys.find((key) => key.startsWith('__reactProps$'));

      if (propsKey && (element as unknown as Record<string, unknown>)[propsKey]) {
        const props = (element as unknown as Record<string, unknown>)[propsKey];
        if (typeof props === 'object' && props !== null) {
          for (const k of Object.keys(props)) {
            if (k !== 'children' && !propKeys.includes(k)) {
              propKeys.push(k);
            }
          }
        }
      }

      if (fiberKey) {
        let curr = (element as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null;
        while (curr) {
          if (curr.type) {
            let name: string | undefined;
            if (typeof curr.type === 'function') {
              name = (curr.type as { displayName?: string; name?: string }).displayName || (curr.type as { name?: string }).name;
            } else if (typeof curr.type === 'object' && curr.type !== null) {
              const obj = curr.type as { displayName?: string; name?: string; render?: { displayName?: string; name?: string } };
              name = obj.displayName || obj.name;
              if (!name && obj.render) {
                name = obj.render.displayName || obj.render.name;
              }
            }
            if (name && !components.includes(name) && name !== 'Anonymous') {
              components.push(name);
            }
          }

          if (propKeys.length === 0 && curr.memoizedProps && typeof curr.memoizedProps === 'object') {
            for (const k of Object.keys(curr.memoizedProps)) {
              if (k !== 'children' && !propKeys.includes(k)) {
                propKeys.push(k);
              }
            }
          }

          curr = (curr.return as Record<string, unknown> | null) || null;
        }
      }
    } catch {
      // Ignore inspection errors
    }

    return { components, propKeys };
  };

  const getPromptTokens = (requestedChange?: string): Array<{ selection?: number; text?: string }> => {
    const text = (requestedChange || currentPromptText).trim() || 'Design-mode context for the selected page elements.';
    const tokens: Array<{ selection?: number; text?: string }> = [];
    if (selections.length === 0) {
      tokens.push({ text });
    } else if (selections.length === 1) {
      tokens.push({ selection: 0 });
      tokens.push({ text });
    } else {
      tokens.push({ selection: 0 });
      tokens.push({ text });
      for (let i = 1; i < selections.length; i++) {
        tokens.push({ selection: i });
      }
    }
    return tokens;
  };

  const getSnapshot = () => {
    const pageScreenshot = currentArtifacts.page_screenshot_path || currentArtifacts.screenshot_path;
    const elementScreenshots = currentArtifacts.element_screenshot_paths || selections.map((s) => s.screenshot_path).filter(Boolean) as string[];
    return {
      revision,
      enabled,
      active_tool: activeTool,
      active_info: activeInfo,
      layout_orientation: layoutOrientation,
      dock_side: verticalDockSide,
      is_vertical: isVerticalMode(),
      is_prompt_bar_collapsed: isPromptBarCollapsed,
      selection: selections.length ? buildSelectionSnapshot(selections[selections.length - 1], selections.length - 1) : null,
      selections: selections.map((s, idx) => buildSelectionSnapshot(s, idx)),
      marks: marks.map((m) => ({ ...m })),
      edits: Array.from(edits.values()),
      css_diff: getComputedCssDiff(),
      prompt_text: currentPromptText,
      agent_status: currentAgentStatus,
      artifacts: {
        screenshot_path: currentArtifacts.screenshot_path,
        page_screenshot_path: pageScreenshot,
        element_screenshot_paths: elementScreenshots,
        live_context_path: currentArtifacts.live_context_path,
        context_json_path: currentArtifacts.context_json_path,
      },
    };
  };

  const buildSelectionSnapshot = (s: StoredSelection, index?: number) => {
    const rect = s.element.getBoundingClientRect();
    const fiberInfo = extractReactFiberInfo(s.element);
    const screenshotPath = s.screenshot_path || (index !== undefined && currentArtifacts.element_screenshot_paths ? currentArtifacts.element_screenshot_paths[index] : undefined);
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
      screenshot_path: screenshotPath,
      react_components: fiberInfo.components,
      react_prop_keys: fiberInfo.propKeys,
    };
  };

  const getFormattedPrompt = (requestedChange?: string): string => {
    const userPrompt = (requestedChange || currentPromptText).trim() || 'Design-mode context for the selected page elements.';

    // If context_json_path is present (agent handoff mode matching cmux):
    if (currentArtifacts.context_json_path) {
      const tokens = getPromptTokens(userPrompt);
      const line1Tokens = tokens.map((t) => {
        if (t.selection !== undefined) {
          const sel = selections[t.selection];
          const elPath = sel?.screenshot_path || (currentArtifacts.element_screenshot_paths && currentArtifacts.element_screenshot_paths[t.selection]);
          return elPath || `@e${t.selection + 1}`;
        }
        return t.text || '';
      }).filter(Boolean);

      const lines = [
        line1Tokens.join(' '),
        '',
        `Page: ${window.location.href}`,
        `Details: ${currentArtifacts.context_json_path}`,
      ];
      return lines.join('\n');
    }

    // Fallback if artifacts are not yet written:
    const tokens = getPromptTokens(userPrompt);
    const line1Tokens = tokens.map((t) => {
      if (t.selection !== undefined) {
        const sel = selections[t.selection];
        const elPath = sel?.screenshot_path || (currentArtifacts.element_screenshot_paths && currentArtifacts.element_screenshot_paths[t.selection]);
        return elPath || `@e${t.selection + 1}`;
      }
      return t.text || '';
    }).filter(Boolean);

    // If any region marks have screenshot paths, append them to line 1
    const regionPaths = marks.filter((m) => m.type === 'region' && m.screenshot_path).map((m) => m.screenshot_path as string);
    const line1 = [...line1Tokens, ...regionPaths].join(' ');

    const lines: string[] = [
      line1,
      '',
      `Page: ${window.location.href}`,
    ];

    if (selections.length > 0) {
      lines.push('', `Selected Elements (${selections.length}):`);
      selections.forEach((sel, idx) => {
        const pathSuffix = sel.screenshot_path ? ` (${sel.screenshot_path})` : '';
        lines.push(`- Target @e${idx + 1} <${sel.element.localName}>${pathSuffix}:`);
        lines.push(`  Selector: ${sel.selector}`);
        if (sel.xpath) lines.push(`  XPath: ${sel.xpath}`);
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
    }

    if (marks.length > 0) {
      lines.push('', `Annotations (${marks.length}):`);
      marks.forEach((m, idx) => {
        const pathSuffix = m.screenshot_path ? ` (${m.screenshot_path})` : '';
        if (m.type === 'region' && m.bounds) {
          lines.push(`- Mark #${idx + 1} [region]${pathSuffix}: x=${Math.round(m.bounds.x)}, y=${Math.round(m.bounds.y)}, ${Math.round(m.bounds.width)}x${Math.round(m.bounds.height)}`);
        } else if (m.type === 'arrow' && m.points) {
          lines.push(`- Mark #${idx + 1} [arrow]: (${m.points[0]?.x}, ${m.points[0]?.y}) -> (${m.points[1]?.x}, ${m.points[1]?.y})`);
        } else {
          lines.push(`- Mark #${idx + 1} [${m.type}]: ${m.points?.length ?? 0} points`);
        }
      });
    }

    const diff = getComputedCssDiff();
    if (diff) {
      lines.push('', 'Proposed CSS Diff:', '```css', diff, '```');
    }

    return lines.join('\n');
  };

  const getHandoffPayload = (requestedChange = 'Design-mode context for the selected page elements.') => {
    const snap = getSnapshot();
    const prompt = getFormattedPrompt(requestedChange);
    const tokens = getPromptTokens(requestedChange);
    return {
      page_url: window.location.href,
      requested_change: (requestedChange || currentPromptText).trim() || 'Design-mode context for the selected page elements.',
      css_diff: snap.css_diff,
      revision: snap.revision,
      edits: snap.edits,
      selections: snap.selections,
      marks: snap.marks,
      page_screenshot_path: currentArtifacts.page_screenshot_path || currentArtifacts.screenshot_path,
      live_context_path: currentArtifacts.live_context_path,
      context_json_path: currentArtifacts.context_json_path,
      prompt: tokens,
      formatted_prompt: prompt,
    };
  };

  type HandoffResult = {
    clipboardOk: boolean;
    terminalInjected: boolean;
    terminalMethod?: string;
    terminalTarget?: string;
    terminalError?: string;
  };

  const copyHandoffToClipboard = async (requestedChange?: string): Promise<HandoffResult> => {
    const promptText = (requestedChange || currentPromptText).trim() || 'Design-mode context for the selected page elements.';

    // Ensure crops are captured for selections and region marks
    try {
      await Promise.all([
        ...selections.filter((s) => !s.screenshot_path).map((s) => captureElementCrop(s)),
        ...marks.filter((m) => m.type === 'region' && !m.screenshot_path).map((m) => captureRegionCrop(m)),
      ]);
    } catch {}

    const payload = getHandoffPayload(promptText);

    // Notify host or agent bridge
    window.dispatchEvent(new CustomEvent('agent-bridge:handoff', { detail: payload }));
    let hostResult: {
      success?: boolean;
      terminalInjection?: { success: boolean; method: string; target?: string; error?: string };
    } | null = null;
    const host = (window as unknown as { __agentBridgeHost?: (msg: unknown) => Promise<unknown> | void }).__agentBridgeHost;
    if (typeof host === 'function') {
      try {
        const res = await host({ type: 'design_mode_handoff', payload });
        if (res && typeof res === 'object') {
          hostResult = res as typeof hostResult;
        }
      } catch {}
    }

    const text = getFormattedPrompt(promptText);
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
    return {
      clipboardOk: ok,
      terminalInjected: hostResult?.terminalInjection?.success === true,
      terminalMethod: hostResult?.terminalInjection?.method,
      terminalTarget: hostResult?.terminalInjection?.target,
      terminalError: hostResult?.terminalInjection?.error,
    };
  };

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

  const quickRenderAi = async (promptOverride?: string) => {
    const prompt = typeof promptOverride === 'string' ? promptOverride.trim() : currentPromptText.trim();
    if (!prompt) {
      return { success: false, reason: 'No prompt specified' };
    }
    if (selections.length === 0) {
      return { success: false, reason: 'No element selected' };
    }

    const allDeclarations: Record<string, string> = {};
    const rules: string[] = [];

    for (let idx = 0; idx < selections.length; idx++) {
      const sel = selections[idx];
      const result = await resolvePromptToCss(prompt, {
        selector: sel.selector,
        tagName: sel.element.localName,
        textContent: sel.element.textContent?.slice(0, 100),
        currentStyles: sel.originalStyles,
      });
      if (result.css) {
        rules.push(result.css);
        Object.entries(result.declarations).forEach(([prop, val]) => {
          allDeclarations[prop] = val;
          const editId = `${idx}::${prop}`;
          edits.set(editId, {
            id: editId,
            kind: 'style',
            property: prop,
            original_value: sel.originalStyles[prop] || '',
            value: val,
          });
        });
      }
    }

    if (rules.length > 0) {
      const combinedCss = rules.join('\n\n');
      applyLivePatch(combinedCss);
      revision += 1;
      renderOverlay();
      return { success: true, css: combinedCss, declarations: allDeclarations };
    }
    return { success: false, reason: 'CSS synthesis produced no output' };
  };

  const quickRenderManual = () => {
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
    if (rules.length > 0) {
      const css = rules.join('\n\n');
      applyLivePatch(css);
      return { success: true, css, editCount: edits.size };
    }
    return { success: false, reason: 'No manual edits found' };
  };

  const quickRender = async (customCssOrPrompt?: string) => {
    if (typeof customCssOrPrompt === 'string') {
      const trimmed = customCssOrPrompt.trim();
      if (trimmed.includes('{') && trimmed.includes('}')) {
        applyLivePatch(trimmed);
        return { success: true, css: trimmed };
      }
      return await quickRenderAi(trimmed);
    }

    if (currentPromptText.trim() && selections[0]) {
      return await quickRenderAi();
    }

    return quickRenderManual();
  };

  const handleViewportChange = () => {
    if (isVerticalMode() !== lastRenderedVertical) {
      renderOverlay();
      return;
    }
    resizeCanvas();
    paintCanvas();
    const boxLayer = shadowRoot?.querySelector('.box-layer');
    if (boxLayer) {
      boxLayer.innerHTML = renderBoxLayerHtml();
      boxLayer.querySelectorAll('[data-remove-selection]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt((btn as HTMLElement).dataset.removeSelection || '0', 10);
          removeSelection(idx);
          renderOverlay();
        });
      });
    }
  };

  const runtimeApi = {
    enable: () => {
      enabled = true;
      createOverlay();
      document.addEventListener('mousemove', handlePointerMove, true);
      document.addEventListener('click', handleClick, true);
      document.addEventListener('keydown', handleKeyDown, true);
      window.addEventListener('resize', handleViewportChange);
      window.addEventListener('scroll', handleViewportChange, { passive: true });
      window.visualViewport?.addEventListener('resize', handleViewportChange);
      window.visualViewport?.addEventListener('scroll', handleViewportChange);
      return getSnapshot();
    },
    disable: () => {
      enabled = false;
      document.removeEventListener('mousemove', handlePointerMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      removeOverlay();
      return getSnapshot();
    },
    status: () => getSnapshot(),
    getSnapshot,
    getHandoff: getHandoffPayload,
    getFormattedPrompt,
    copyHandoffToClipboard,
    quickRender,
    quickRenderAi,
    quickRenderManual,
    toggleInfo: (mode: 'ai' | 'manual' | null) => {
      activeInfo = mode;
      renderOverlay();
      return getSnapshot();
    },
    setLayoutOrientation: (orientation: 'auto' | 'horizontal' | 'vertical') => {
      layoutOrientation = orientation;
      renderOverlay();
      return getSnapshot();
    },
    setDockSide: (side: 'right' | 'left') => {
      verticalDockSide = side;
      renderOverlay();
      return getSnapshot();
    },
    toggleLayoutOrientation: () => {
      layoutOrientation = isVerticalMode() ? 'horizontal' : 'vertical';
      renderOverlay();
      return getSnapshot();
    },
    toggleDockSide: () => {
      verticalDockSide = verticalDockSide === 'right' ? 'left' : 'right';
      renderOverlay();
      return getSnapshot();
    },
    togglePromptBar: () => {
      isPromptBarCollapsed = !isPromptBarCollapsed;
      renderOverlay();
      return getSnapshot();
    },
    setTool: (tool: Tool) => {
      activeTool = tool;
      if (activeTool !== 'select') {
        hoveredElement = null;
      }
      renderOverlay();
      return getSnapshot();
    },
    setCaptureHidden,
    getPromptTokens,
    setArtifactPaths: (paths: ArtifactPaths) => {
      currentArtifacts = { ...currentArtifacts, ...paths };
      if (paths.element_screenshot_paths && Array.isArray(paths.element_screenshot_paths)) {
        paths.element_screenshot_paths.forEach((p, idx) => {
          if (selections[idx]) {
            selections[idx].screenshot_path = p;
          }
        });
      }
      return getSnapshot();
    },
    clearSelections: () => {
      while (selections.length) removeSelection(0);
      clearLivePatch();
      renderOverlay();
    },
    clearMarks: () => {
      marks.length = 0;
      paintCanvas();
      renderOverlay();
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
    setAgentStatus: (statusPayload: { status: 'idle' | 'working' | 'done' | 'error'; message?: string; timestamp?: number }) => {
      currentAgentStatus = {
        status: statusPayload.status || 'idle',
        message: statusPayload.message || '',
        timestamp: statusPayload.timestamp || Date.now(),
      };
      if (statusPayload.status === 'done') {
        setTimeout(() => {
          if (currentAgentStatus.status === 'done') {
            currentAgentStatus = { status: 'idle' };
            renderOverlay();
          }
        }, 12000);
      }
      renderOverlay();
      return getSnapshot();
    },
    getAgentStatus: () => currentAgentStatus,
    onCropSaved,
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('agent-bridge:agent-status', ((e: CustomEvent) => {
      if (e.detail && typeof e.detail === 'object') {
        const payload = e.detail as { status: 'idle' | 'working' | 'done' | 'error'; message?: string; timestamp?: number };
        runtimeApi.setAgentStatus(payload);
      }
    }) as EventListener);

    window.addEventListener('agent-bridge:crop-saved', ((e: CustomEvent) => {
      if (e.detail && typeof e.detail === 'object') {
        onCropSaved(e.detail);
      }
    }) as EventListener);
  }

  (globalThis as unknown as { __agentBridgeDesignMode: typeof runtimeApi }).__agentBridgeDesignMode = runtimeApi;
})();
