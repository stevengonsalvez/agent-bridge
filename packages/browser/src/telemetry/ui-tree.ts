import type { UiTreeItem } from 'debug-bridge-types';

const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[tabindex]',
  '[onclick]',
].join(', ');

export class UiTreeBuilder {
  static build(getStableId?: (el: Element) => string | null): UiTreeItem[] {
    const items: UiTreeItem[] = [];
    const seen = new Set<Element>();

    // Query from document and all shadow roots
    this.queryAllRoots(document, INTERACTIVE_SELECTORS, (el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const item = this.buildItem(el, getStableId);
      if (item) items.push(item);
    });

    return items;
  }

  /**
   * Recursively query elements from document and all shadow roots.
   * This handles Ionic, Stencil, and other Shadow DOM-based frameworks.
   */
  private static queryAllRoots(
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
        this.queryAllRoots(el.shadowRoot, selector, callback);
      }
    }
  }

  private static buildItem(
    el: Element,
    getStableId?: (el: Element) => string | null
  ): UiTreeItem | null {
    const htmlEl = el as HTMLElement;
    const style = window.getComputedStyle(el);
    const visible = style.display !== 'none' && style.visibility !== 'hidden';

    const stableId = getStableId?.(el) ?? this.generateStableId(el);

    // Store stableId on element for later lookup by commands
    el.setAttribute('data-debug-bridge-id', stableId);

    const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
    const text = this.getVisibleText(el);

    return {
      stableId,
      selector: this.cssPath(el),
      role,
      text: text || undefined,
      label: el.getAttribute('aria-label') ?? el.getAttribute('title') ?? undefined,
      disabled: htmlEl.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      visible,
      checked: (el as HTMLInputElement).checked,
      value: (el as HTMLInputElement).value || undefined,
      meta: {
        tagName: el.tagName.toLowerCase(),
        type: (el as HTMLInputElement).type || undefined,
        name: (el as HTMLInputElement).name || undefined,
        href: (el as HTMLAnchorElement).href || undefined,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
      },
    };
  }

  private static getVisibleText(el: Element): string {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value || el.placeholder || '';
    }
    return (el.textContent ?? '').trim().substring(0, 100);
  }

  private static generateStableId(el: Element): string {
    const testId = el.getAttribute('data-testid');
    if (testId) return testId;

    const id = el.id;
    if (id && !id.startsWith(':')) return id;

    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().substring(0, 20);
    if (text) {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }
      return `${role}-${Math.abs(hash).toString(36)}`;
    }

    return this.cssPath(el).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
  }

  private static cssPath(el: Element): string {
    if (el.id) return `#${el.id}`;

    const path: string[] = [];
    let current: Element | null = el;
    let inShadow = false;

    while (current) {
      // Check if we've reached document.body
      if (current === document.body) break;

      let selector = current.tagName.toLowerCase();
      if (current.id) {
        path.unshift(`#${current.id}`);
        break;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
        path.unshift(selector);
        current = parent;
      } else {
        // No parent element - might be at shadow root boundary
        const rootNode = current.getRootNode();
        if (rootNode instanceof ShadowRoot) {
          // Mark that we crossed a shadow boundary and continue from the host
          path.unshift(selector);
          path.unshift('::shadow');
          current = rootNode.host;
          inShadow = true;
        } else {
          // Reached document root
          path.unshift(selector);
          break;
        }
      }
    }

    return path.join(' > ');
  }
}
