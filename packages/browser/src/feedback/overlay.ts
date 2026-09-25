import type { FeedbackController } from './controller';
import '../runtime/design-mode-runtime';

export type ThreadEvent = {
  type: string;
  [key: string]: unknown;
};

export class FeedbackOverlay {
  private readonly controller: FeedbackController;
  private busy = false;
  private readonly threadEvents: ThreadEvent[] = [];

  constructor(controller: FeedbackController) {
    this.controller = controller;
  }

  getController(): FeedbackController {
    return this.controller;
  }

  mount(): void {
    const dm = (globalThis as unknown as {
      __agentBridgeDesignMode?: {
        enable: () => void;
        status?: () => { enabled: boolean };
        openBatch?: () => void;
      };
    }).__agentBridgeDesignMode;

    if (dm && !dm.status?.()?.enabled) {
      dm.enable();
    }
    dm?.openBatch?.();
  }

  unmount(): void {
    const dm = (globalThis as unknown as {
      __agentBridgeDesignMode?: {
        disable: () => void;
      };
    }).__agentBridgeDesignMode;

    dm?.disable?.();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    const dm = (globalThis as unknown as {
      __agentBridgeDesignMode?: {
        setAgentStatus?: (s: unknown) => void;
      };
    }).__agentBridgeDesignMode;

    if (busy) {
      dm?.setAgentStatus?.({
        status: 'working',
        message: 'Submitting feedback...',
        timestamp: Date.now(),
      });
    } else {
      dm?.setAgentStatus?.({
        status: 'idle',
        timestamp: Date.now(),
      });
    }
  }

  isBusy(): boolean {
    return this.busy;
  }

  setCaptureHidden(hidden: boolean): void {
    const dm = (globalThis as unknown as {
      __agentBridgeDesignMode?: {
        setCaptureHidden?: (h: boolean) => void;
      };
    }).__agentBridgeDesignMode;

    dm?.setCaptureHidden?.(hidden);
  }

  addThreadEvent(event: ThreadEvent): void {
    this.threadEvents.push(event);
    if (typeof window !== 'undefined' && event.type === 'ui_feedback_suggestion_added') {
      const suggestion = (event as Record<string, unknown>).suggestion;
      if (suggestion) {
        window.dispatchEvent(new CustomEvent('agent-bridge:suggestion-added', { detail: suggestion }));
      }
    }
    this.showThread();
  }

  showThread(): void {
    const dm = (globalThis as unknown as {
      __agentBridgeDesignMode?: {
        openBatch?: () => void;
      };
    }).__agentBridgeDesignMode;

    dm?.openBatch?.();
  }

  render(): void {
    const dm = (globalThis as unknown as {
      __agentBridgeDesignMode?: {
        render?: () => void;
      };
    }).__agentBridgeDesignMode;

    dm?.render?.();
  }
}
