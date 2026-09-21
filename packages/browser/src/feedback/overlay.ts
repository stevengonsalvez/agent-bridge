import type { FeedbackController } from './controller';

export type ThreadEvent = {
  type: string;
  [key: string]: unknown;
};

/**
 * FeedbackOverlay stub for single-surface architecture.
 * Visual feedback and annotations are unified in the Design Mode runtime pill palette.
 */
export class FeedbackOverlay {
  protected readonly controller: FeedbackController;
  private host: HTMLDivElement | null = null;
  private busy = false;

  constructor(controller: FeedbackController) {
    this.controller = controller;
  }

  mount(): void {
    if (this.host) return;
    // Single surface rule: bottom Design Mode pill is the unified surface.
    // Defer to Design Mode runtime to prevent duplicate canvases and toolbars.
    if (
      (globalThis as unknown as { __agentBridgeDesignMode?: unknown }).__agentBridgeDesignMode ||
      document.querySelector('[data-agent-bridge-design-overlay]') ||
      document.querySelector('[data-agent-bridge-design-mode]')
    ) {
      return;
    }
    this.host = document.createElement('div');
    this.host.setAttribute('data-debug-bridge-feedback-overlay', 'true');
    this.host.style.position = 'fixed';
    this.host.style.inset = '0';
    this.host.style.zIndex = '2147483647';
    this.host.style.pointerEvents = 'none';
    document.documentElement.appendChild(this.host);
  }

  unmount(): void {
    this.host?.remove();
    this.host = null;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
  }

  isBusy(): boolean {
    return this.busy;
  }

  setCaptureHidden(hidden: boolean): void {
    if (this.host) this.host.style.visibility = hidden ? 'hidden' : 'visible';
  }

  addThreadEvent(_event: ThreadEvent): void {
    // Thread events handled by unified pill palette
  }

  showThread(): void {
    // Handled by unified pill palette
  }

  render(): void {
    // Unified palette rendered via Design Mode runtime
    if (
      (globalThis as unknown as { __agentBridgeDesignMode?: unknown }).__agentBridgeDesignMode ||
      document.querySelector('[data-agent-bridge-design-overlay]') ||
      document.querySelector('[data-agent-bridge-design-mode]')
    ) {
      if (this.host) this.unmount();
    }
  }
}
