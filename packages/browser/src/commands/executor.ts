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
        case 'request_state':
          if (this.config.getCustomState) {
            const state = this.config.getCustomState();
            if (cmd.scope && state[cmd.scope]) {
              this.send({ type: 'state_update', scope: cmd.scope, state: state[cmd.scope] });
            } else {
              for (const [scope, value] of Object.entries(state)) {
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
      el =
        document.querySelector(`[data-testid="${target.stableId}"]`) ??
        document.getElementById(target.stableId);
    }
    if (!el && target.selector) {
      el = document.querySelector(target.selector);
    }
    if (!el && target.text) {
      const all = document.querySelectorAll('button, a, [role="button"]');
      for (const candidate of all) {
        if (candidate.textContent?.includes(target.text)) {
          el = candidate;
          break;
        }
      }
    }

    if (!el) throw { code: 'TARGET_NOT_FOUND', message: `Not found: ${JSON.stringify(target)}` };
    return el;
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
}
