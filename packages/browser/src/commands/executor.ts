import type { CommandMessage, DebugBridgeConfig, BridgeMessage } from '@debug-bridge/types';
import { UiTreeBuilder } from '../telemetry/ui-tree';

type Send = (msg: Partial<BridgeMessage> & { type: string }) => void;

export class CommandExecutor {
  private config: DebugBridgeConfig;
  private send: Send;

  constructor(config: DebugBridgeConfig, send: Send) {
    this.config = config;
    this.send = send;
  }

  async execute(cmd: CommandMessage): Promise<void> {
    const start = performance.now();
    let success = true;
    let result: unknown;
    let error: { code: string; message: string } | undefined;

    try {
      switch (cmd.type) {
        case 'click':
          this.click(cmd.target);
          break;
        case 'type':
          this.type(cmd.target, cmd.text, cmd.options);
          break;
        case 'navigate':
          window.location.href = cmd.url;
          break;
        case 'evaluate':
          if (!this.config.enableEval) throw { code: 'EVAL_DISABLED', message: 'Eval disabled' };
          result = new Function(cmd.code)();
          break;
        case 'scroll':
          window.scrollTo({ left: cmd.x, top: cmd.y, behavior: 'smooth' });
          break;
        case 'hover':
          this.hover(cmd.target);
          break;
        case 'select':
          this.select(cmd.target, cmd);
          break;
        case 'focus':
          this.focus(cmd.target);
          break;
        case 'request_ui_tree':
          this.send({
            type: 'ui_tree',
            requestId: cmd.requestId,
            items: UiTreeBuilder.build(this.config.getStableId),
          });
          return;
        case 'request_dom_snapshot':
          this.send({
            type: 'dom_snapshot',
            requestId: cmd.requestId,
            html: document.documentElement.outerHTML,
          });
          return;
        case 'request_screenshot':
          this.captureScreenshot(cmd.requestId);
          return;
        case 'request_state':
          // Built-in browser state (always available)
          const browserState = this.getBrowserState();

          if (cmd.scope) {
            // Specific scope requested
            if (browserState[cmd.scope]) {
              this.send({ type: 'state_update', scope: cmd.scope, state: browserState[cmd.scope] });
            }
            // Also check custom state
            if (this.config.getCustomState) {
              const customState = this.config.getCustomState();
              if (customState[cmd.scope]) {
                this.send({ type: 'state_update', scope: cmd.scope, state: customState[cmd.scope] });
              }
            }
          } else {
            // Send all browser state
            for (const [scope, value] of Object.entries(browserState)) {
              this.send({ type: 'state_update', scope, state: value });
            }
            // Send all custom state
            if (this.config.getCustomState) {
              const customState = this.config.getCustomState();
              for (const [scope, value] of Object.entries(customState)) {
                this.send({ type: 'state_update', scope, state: value });
              }
            }
          }
          return;
        default:
          throw { code: 'INVALID_COMMAND', message: `Unknown: ${(cmd as { type: string }).type}` };
      }
    } catch (e: unknown) {
      success = false;
      const err = e as { code?: string; message?: string };
      error = { code: err.code ?? 'UNKNOWN_ERROR', message: err.message ?? String(e) };
    }

    this.send({
      type: 'command_result',
      requestId: cmd.requestId,
      requestType: cmd.type,
      success,
      error,
      result,
      duration: Math.round(performance.now() - start),
    });
  }

  private resolveTarget(target: {
    stableId?: string;
    selector?: string;
    text?: string;
  }): Element {
    let el: Element | null = null;

    if (target.stableId) {
      // Try debug-bridge-id first (set by UI tree builder)
      el = this.deepQuerySelector(`[data-debug-bridge-id="${target.stableId}"]`);
      // Fall back to data-testid and id attributes
      if (!el) {
        el =
          document.querySelector(`[data-testid="${target.stableId}"]`) ??
          document.getElementById(target.stableId);
      }
      // If not found, search in shadow roots for testid/id
      if (!el) {
        el = this.deepQuerySelector(`[data-testid="${target.stableId}"]`) ??
             this.deepQuerySelector(`#${target.stableId}`);
      }
    }
    if (!el && target.selector) {
      el = document.querySelector(target.selector);
      // If not found, search in shadow roots
      if (!el) {
        el = this.deepQuerySelector(target.selector);
      }
    }
    if (!el && target.text) {
      const all = this.deepQuerySelectorAll('button, a, [role="button"], input');
      for (const candidate of all) {
        const text = candidate.textContent || (candidate as HTMLInputElement).placeholder;
        if (text?.includes(target.text)) {
          el = candidate;
          break;
        }
      }
    }

    if (!el) throw { code: 'TARGET_NOT_FOUND', message: `Not found: ${JSON.stringify(target)}` };
    return el;
  }

  /**
   * Query selector that traverses into shadow roots
   */
  private deepQuerySelector(selector: string): Element | null {
    // Try regular DOM first
    const el = document.querySelector(selector);
    if (el) return el;

    // Search in shadow roots
    const results = this.deepQuerySelectorAll(selector);
    return results[0] || null;
  }

  /**
   * Query all matching elements including those in shadow roots
   */
  private deepQuerySelectorAll(selector: string): Element[] {
    const results: Element[] = [];
    this.queryAllShadowRoots(document, selector, (el) => results.push(el));
    return results;
  }

  /**
   * Recursively query from a root and all shadow roots within
   */
  private queryAllShadowRoots(
    root: Document | ShadowRoot,
    selector: string,
    callback: (el: Element) => void
  ): void {
    // Query this root
    const elements = root.querySelectorAll(selector);
    for (const el of elements) {
      callback(el);
    }

    // Find all elements with shadow roots and recurse
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        this.queryAllShadowRoots(el.shadowRoot, selector, callback);
      }
    }
  }

  private click(target: { stableId?: string; selector?: string; text?: string }): void {
    const el = this.resolveTarget(target);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  private type(
    target: { stableId?: string; selector?: string },
    text: string,
    options?: { clear?: boolean; pressEnter?: boolean }
  ): void {
    const el = this.resolveTarget(target) as HTMLInputElement;
    el.focus();
    if (options?.clear) el.value = '';
    el.value += text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (options?.pressEnter) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  }

  private hover(target: { stableId?: string; selector?: string }): void {
    const el = this.resolveTarget(target);
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  }

  private select(
    target: { stableId?: string; selector?: string },
    options: { value?: string; label?: string; index?: number }
  ): void {
    const el = this.resolveTarget(target) as HTMLSelectElement;
    if (options.value) el.value = options.value;
    else if (options.index !== undefined) el.selectedIndex = options.index;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private focus(target: { stableId?: string; selector?: string }): void {
    const el = this.resolveTarget(target) as HTMLElement;
    el.focus();
  }

  /**
   * Get built-in browser state (cookies, storage, navigator, etc.)
   */
  private getBrowserState(): Record<string, unknown> {
    return {
      cookies: this.parseCookies(),
      localStorage: this.getStorageContents(localStorage),
      sessionStorage: this.getStorageContents(sessionStorage),
      location: {
        href: window.location.href,
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        host: window.location.host,
      },
      navigator: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: [...navigator.languages],
        online: navigator.onLine,
        cookieEnabled: navigator.cookieEnabled,
        platform: navigator.platform,
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        colorDepth: window.screen.colorDepth,
        pixelRatio: window.devicePixelRatio,
      },
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
      },
    };
  }

  private parseCookies(): Record<string, string> {
    const cookies: Record<string, string> = {};
    document.cookie.split(';').forEach((cookie) => {
      const [key, ...valueParts] = cookie.trim().split('=');
      if (key) {
        cookies[key] = valueParts.join('=');
      }
    });
    return cookies;
  }

  private getStorageContents(storage: Storage): Record<string, string | null> {
    const contents: Record<string, string | null> = {};
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) {
        contents[key] = storage.getItem(key);
      }
    }
    return contents;
  }

  /**
   * Capture a screenshot of the current viewport using html2canvas
   * Falls back to a simple placeholder if html2canvas is not available
   */
  private async captureScreenshot(requestId: string): Promise<void> {
    try {
      // Try to use html2canvas if available
      const html2canvas = (window as unknown as { html2canvas?: (el: Element, opts?: object) => Promise<HTMLCanvasElement> }).html2canvas;

      if (html2canvas) {
        const canvas = await html2canvas(document.body, {
          logging: false,
          useCORS: true,
          allowTaint: true,
        });
        const data = canvas.toDataURL('image/png');
        this.send({
          type: 'screenshot',
          requestId,
          data,
          width: canvas.width,
          height: canvas.height,
          timestamp: Date.now(),
        });
      } else {
        // Fallback: Return viewport info without actual image
        // The CLI can instruct users to include html2canvas for full support
        this.send({
          type: 'screenshot',
          requestId,
          data: '', // Empty - indicates screenshot not available
          width: window.innerWidth,
          height: window.innerHeight,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      const err = e as Error;
      this.send({
        type: 'command_result',
        requestId,
        requestType: 'request_screenshot',
        success: false,
        error: { code: 'SCREENSHOT_FAILED', message: err.message },
        duration: 0,
      });
    }
  }
}
