import type { UiTreeItem } from '@debug-bridge/types';

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
    const elements = document.querySelectorAll(INTERACTIVE_SELECTORS);
    const items: UiTreeItem[] = [];

    for (const el of elements) {
      const item = this.buildItem(el, getStableId);
      if (item) items.push(item);
    }

    return items;
  }

  private static buildItem(
    el: Element,
    getStableId?: (el: Element) => string | null
  ): UiTreeItem | null {
    const htmlEl = el as HTMLElement;
    const style = window.getComputedStyle(el);
    const visible = style.display !== 'none' && style.visibility !== 'hidden';

    const stableId = getStableId?.(el) ?? this.generateStableId(el);
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

    while (current && current !== document.body) {
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
      }
      path.unshift(selector);
      current = parent;
    }

    return path.join(' > ');
  }
}
