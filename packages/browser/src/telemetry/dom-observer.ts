import type { DomMutation } from '@debug-bridge/types';

export class DomObserver {
  private observer: MutationObserver | null = null;
  private callback: (mutations: DomMutation[]) => void;
  private batchMs: number;
  private pending: DomMutation[] = [];
  private timeout: number | null = null;

  constructor(callback: (mutations: DomMutation[]) => void, batchMs: number = 100) {
    this.callback = callback;
    this.batchMs = batchMs;
  }

  start(): void {
    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        this.pending.push(this.serialize(record));
      }
      this.scheduleBatch();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  private scheduleBatch(): void {
    if (this.timeout) return;
    this.timeout = window.setTimeout(() => {
      if (this.pending.length > 0) {
        this.callback(this.pending);
        this.pending = [];
      }
      this.timeout = null;
    }, this.batchMs);
  }

  private serialize(record: MutationRecord): DomMutation {
    const target = record.target as Element;
    return {
      mutationType: record.type,
      targetSelector:
        target.nodeType === Node.ELEMENT_NODE
          ? target.id
            ? `#${target.id}`
            : target.tagName.toLowerCase()
          : '',
      attributeName: record.attributeName ?? undefined,
      addedNodes: Array.from(record.addedNodes).map((n) => ({
        type: n.nodeType === Node.ELEMENT_NODE ? 'element' : 'text',
        tagName: (n as Element).tagName?.toLowerCase(),
        html: (n as Element).outerHTML?.substring(0, 500),
      })),
      removedNodes: Array.from(record.removedNodes).map((n) => ({
        type: n.nodeType === Node.ELEMENT_NODE ? 'element' : 'text',
        tagName: (n as Element).tagName?.toLowerCase(),
      })),
    };
  }
}
