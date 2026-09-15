import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import type {
  BrowserCommandMessage,
  BrowserCookie,
  BrowserTargetRef,
  Capability,
  ProviderLifecycleState,
} from 'debug-bridge-types';
import { ProfileStore } from '../profiles/profile-store';
import { exportStorageState, importStorageState } from '../profiles/storage-state';

type SendMessage = (msg: Record<string, unknown> & { type: string }) => void;

export type PlaywrightProviderOptions = {
  sessionId: string;
  providerId: string;
  profile: string;
  mode: 'managed' | 'connect';
  cdpEndpoint?: string;
  storageState?: string;
  headless: boolean;
  send: SendMessage;
};

type TargetState = {
  id: string;
  page: Page;
  cdp: CDPSession;
  ref: BrowserTargetRef;
  elementRefs: Map<string, { selector: string; text?: string; tag: string }>;
};

type NetworkRequestState = {
  targetId: string;
  cdp: CDPSession;
  url?: string;
};

export class PlaywrightProvider {
  readonly capabilities: Capability[] = [
    'provider_lifecycle',
    'browser_targets',
    'browser_cookies',
    'browser_storage',
    'browser_network',
    'browser_screenshot',
    'browser_navigation',
    'cdp',
  ];

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private selectedTargetId: string | null = null;
  private targetCounter = 0;
  private readonly targets = new Map<string, TargetState>();
  private readonly networkRequests = new Map<string, NetworkRequestState>();

  constructor(private readonly options: PlaywrightProviderOptions) {}

  async start(): Promise<void> {
    this.sendLifecycle('connecting');

    if (this.options.mode === 'connect') {
      if (!this.options.cdpEndpoint) {
        throw new Error('CDP endpoint is required when browser mode is connect');
      }
      this.browser = await chromium.connectOverCDP(this.options.cdpEndpoint);
      this.context = this.browser.contexts()[0] ?? await this.browser.newContext();
    } else {
      const profileDir = new ProfileStore().resolve(this.options.profile);
      this.context = await chromium.launchPersistentContext(profileDir, {
        headless: this.options.headless,
      });
    }

    this.context.on('page', (page) => {
      void this.attachPage(page, true);
    });

    const script = this.getRuntimeScript();
    if (script) {
      await this.context.addInitScript(script);
    }

    const page = this.context.pages()[0] ?? await this.context.newPage();
    await importStorageState(this.context, page, this.options.storageState);
    await this.attachPage(page, true);
    this.sendLifecycle('connected');
  }

  private getRuntimeScript(): string {
    const possiblePaths = [
      path.resolve(__dirname, '../../browser/dist/design-mode-runtime.global.js'),
      path.resolve(process.cwd(), 'packages/browser/dist/design-mode-runtime.global.js'),
      path.resolve(__dirname, '../runtime/design-mode-runtime.global.js'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    }
    return '';
  }

  async stop(): Promise<void> {
    this.sendLifecycle('closed');
    if (this.context) {
      await exportStorageState(this.context, this.options.storageState);
      await this.context.close();
    }
    await this.browser?.close();
    this.context = null;
    this.browser = null;
    this.targets.clear();
  }

  async execute(command: BrowserCommandMessage): Promise<void> {
    const started = Date.now();
    try {
      const result = await this.executeCommand(command);
      this.options.send({
        type: 'browser_result',
        requestId: command.requestId,
        requestType: command.type,
        providerId: this.options.providerId,
        success: true,
        result,
        duration: Date.now() - started,
      });
    } catch (error) {
      this.options.send({
        type: 'browser_result',
        requestId: command.requestId,
        requestType: command.type,
        providerId: this.options.providerId,
        success: false,
        error: {
          code: error instanceof StaleTargetError ? 'STALE_TARGET' : 'BROWSER_COMMAND_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
        duration: Date.now() - started,
      });
    }
  }

  selectedTarget(): BrowserTargetRef | undefined {
    if (!this.selectedTargetId) return undefined;
    return this.targets.get(this.selectedTargetId)?.ref;
  }

  private async executeCommand(command: BrowserCommandMessage): Promise<unknown> {
    switch (command.type) {
      case 'browser_get_targets':
        return { targets: [...this.targets.values()].map((target) => target.ref) };
      case 'browser_select_target':
        return this.selectTarget(command.targetId);
      case 'browser_navigate': {
        const target = this.resolveTarget(command.targetId);
        await target.page.goto(command.url, { waitUntil: 'domcontentloaded' });
        await this.refreshTarget(target, 'selected');
        return { target: target.ref };
      }
      case 'browser_get_cookies': {
        const cookies = await this.requireContext().cookies(command.urls);
        return { cookies: cookies.map((cookie) => redactCookie(cookie, command.includeValues === true)) };
      }
      case 'browser_set_cookie':
        if (!command.cookie.value) throw new Error('Cookie value is required for browser_set_cookie');
        await this.requireContext().addCookies([{ ...command.cookie, value: command.cookie.value }]);
        return { cookie: redactCookie(command.cookie, false) };
      case 'browser_clear_cookies':
        await this.requireContext().clearCookies();
        return { cleared: true };
      case 'browser_get_storage': {
        const target = this.resolveTarget(command.targetId);
        return await target.page.evaluate(() => ({
          localStorage: Object.fromEntries(Object.entries(localStorage)),
          sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
        }));
      }
      case 'browser_screenshot': {
        const target = this.resolveTarget(command.targetId);
        let data: Buffer;
        if (command.selector) {
          const locator = target.page.locator(command.selector).first();
          data = await locator.screenshot();
        } else if (command.clip) {
          data = await target.page.screenshot({ clip: command.clip });
        } else {
          data = await target.page.screenshot({ fullPage: command.fullPage ?? false });
        }
        const viewport = target.page.viewportSize();
        return {
          data: `data:image/png;base64,${data.toString('base64')}`,
          width: viewport?.width ?? 0,
          height: viewport?.height ?? 0,
        };
      }
      case 'browser_interactive_snapshot': {
        const target = this.resolveTarget(command.targetId);
        const elements = await target.page.evaluate(() => {
          const query = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';
          const candidates = Array.from(document.querySelectorAll(query)) as HTMLElement[];
          const visible = candidates.filter((el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          });
          return visible.slice(0, 100).map((el, index) => {
            const rect = el.getBoundingClientRect();
            let selector = '';
            const dm = (window as unknown as { __agentBridgeDesignMode?: { selectorsFor?: (e: Element) => string[] } }).__agentBridgeDesignMode;
            if (dm?.selectorsFor) {
              const list = dm.selectorsFor(el);
              if (list && list.length > 0) selector = list[0];
            }
            if (!selector) {
              const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
              if (testId) {
                selector = `[data-testid="${testId}"]`;
              } else if (el.id) {
                selector = `#${el.id}`;
              } else if (el.getAttribute('name')) {
                selector = `${el.localName}[name="${el.getAttribute('name')}"]`;
              } else if (el.getAttribute('href')) {
                selector = `${el.localName}[href="${el.getAttribute('href')}"]`;
              } else {
                const parent = el.parentElement;
                let nth = 1;
                if (parent) {
                  let sib = el.previousElementSibling;
                  while (sib) {
                    if (sib.localName === el.localName) nth++;
                    sib = sib.previousElementSibling;
                  }
                }
                selector = `${el.localName}:nth-of-type(${nth})`;
              }
            }
            return {
              ref: `@e${index + 1}`,
              role: el.getAttribute('role') || el.localName,
              name: el.getAttribute('aria-label') || el.getAttribute('name') || undefined,
              tag: el.localName,
              text: (el.textContent || (el as HTMLInputElement).value || '').trim().slice(0, 80),
              bounds: {
                x: Math.round(rect.left + window.scrollX),
                y: Math.round(rect.top + window.scrollY),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
              selector,
              xpath: '',
              disabled: (el as HTMLButtonElement).disabled || false,
              value: (el as HTMLInputElement).value || undefined,
            };
          });
        });
        target.elementRefs.clear();
        for (const el of elements) {
          target.elementRefs.set(el.ref, { selector: el.selector, text: el.text, tag: el.tag });
        }
        return { elements };
      }
      case 'browser_click': {
        const target = this.resolveTarget(command.targetId);
        let selector = command.selector;
        if (command.ref) {
          const refData = target.elementRefs.get(command.ref);
          if (refData) selector = refData.selector;
          else selector = command.ref;
        }
        if (!selector) throw new Error('Missing selector or ref for browser_click');
        const locator = target.page.locator(selector);
        const count = await locator.count();
        if (count > 1 && command.ref) {
          const refIndex = parseInt(command.ref.replace(/^@e/, ''), 10) - 1;
          await target.page.evaluate((idx) => {
            const query = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';
            const candidates = Array.from(document.querySelectorAll(query)) as HTMLElement[];
            const visible = candidates.filter((el) => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            });
            visible[idx]?.click();
          }, refIndex);
        } else {
          await locator.first().click();
        }
        let snapshotAfter = undefined;
        if (command.snapshotAfter) {
          await target.page.waitForTimeout(250);
          snapshotAfter = await this.executeCommand({
            type: 'browser_interactive_snapshot',
            requestId: `${command.requestId}-snap`,
            providerId: command.providerId,
            targetId: command.targetId,
          } as BrowserCommandMessage);
        }
        return { clicked: true, selector, snapshot: snapshotAfter };
      }
      case 'browser_fill': {
        const target = this.resolveTarget(command.targetId);
        let selector = command.selector;
        if (command.ref) {
          const refData = target.elementRefs.get(command.ref);
          if (refData) selector = refData.selector;
          else selector = command.ref;
        }
        if (!selector) throw new Error('Missing selector or ref for browser_fill');
        const locator = target.page.locator(selector);
        const count = await locator.count();
        if (count > 1 && command.ref) {
          const refIndex = parseInt(command.ref.replace(/^@e/, ''), 10) - 1;
          await target.page.evaluate(({ idx, val }) => {
            const query = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';
            const candidates = Array.from(document.querySelectorAll(query)) as HTMLElement[];
            const visible = candidates.filter((el) => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            });
            const input = visible[idx] as HTMLInputElement;
            if (input) {
              input.focus();
              input.value = val;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, { idx: refIndex, val: command.text });
        } else {
          await locator.first().fill(command.text);
        }
        let snapshotAfter = undefined;
        if (command.snapshotAfter) {
          await target.page.waitForTimeout(250);
          snapshotAfter = await this.executeCommand({
            type: 'browser_interactive_snapshot',
            requestId: `${command.requestId}-snap`,
            providerId: command.providerId,
            targetId: command.targetId,
          } as BrowserCommandMessage);
        }
        return { filled: true, selector, text: command.text, snapshot: snapshotAfter };
      }
      case 'browser_preview_patch': {
        const target = this.resolveTarget(command.targetId);
        if (command.clear) {
          await target.page.evaluate(() => {
            const api = (window as unknown as { __agentBridgeDesignMode?: { clearLivePatch?: () => void } }).__agentBridgeDesignMode;
            if (api?.clearLivePatch) api.clearLivePatch();
            else document.getElementById('__agent_bridge_live_preview__')?.remove();
          });
          return { cleared: true };
        }
        if (command.cssPatch) {
          await target.page.evaluate((css) => {
            const api = (window as unknown as { __agentBridgeDesignMode?: { applyLivePatch?: (c: string) => void } }).__agentBridgeDesignMode;
            if (api?.applyLivePatch) {
              api.applyLivePatch(css);
            } else {
              let s = document.getElementById('__agent_bridge_live_preview__') as HTMLStyleElement | null;
              if (!s) {
                s = document.createElement('style');
                s.id = '__agent_bridge_live_preview__';
                document.head.appendChild(s);
              }
              s.textContent = css;
            }
          }, command.cssPatch);
          return { applied: true, cssPatch: command.cssPatch };
        }
        return { applied: false };
      }
      case 'browser_design_mode': {
        const target = this.resolveTarget(command.targetId);
        const script = this.getRuntimeScript();
        if (script) {
          await target.page.evaluate((src) => {
            if (!(window as unknown as { __agentBridgeDesignMode?: unknown }).__agentBridgeDesignMode) {
              const s = document.createElement('script');
              s.textContent = src;
              document.head.appendChild(s);
            }
          }, script);
        }
        if (command.action === 'enable') {
          const snap = await target.page.evaluate(() => {
            const api = (window as unknown as { __agentBridgeDesignMode?: { enable?: () => unknown } }).__agentBridgeDesignMode;
            return api?.enable?.();
          });
          return { enabled: true, snapshot: snap };
        } else if (command.action === 'disable') {
          const snap = await target.page.evaluate(() => {
            const api = (window as unknown as { __agentBridgeDesignMode?: { disable?: () => unknown } }).__agentBridgeDesignMode;
            return api?.disable?.();
          });
          return { enabled: false, snapshot: snap };
        } else if (command.action === 'status') {
          const snap = await target.page.evaluate(() => {
            const api = (window as unknown as { __agentBridgeDesignMode?: { status?: () => unknown } }).__agentBridgeDesignMode;
            return api?.status?.();
          });
          return { snapshot: snap };
        } else if (command.action === 'get_handoff') {
          const handoff = await target.page.evaluate((change) => {
            const api = (window as unknown as { __agentBridgeDesignMode?: { getHandoff?: (c?: string) => unknown } }).__agentBridgeDesignMode;
            return api?.getHandoff?.(change);
          }, command.requestedChange);
          return { handoff };
        }
        throw new Error(`Unknown design mode action: ${command.action}`);
      }

      case 'browser_network_get_response_body': {
        const request = this.networkRequests.get(command.networkRequestId);
        if (!request) throw new Error(`Unknown network request: ${command.networkRequestId}`);
        return await request.cdp.send('Network.getResponseBody', { requestId: command.networkRequestId });
      }
      case 'cdp_send': {
        const target = this.resolveTarget(command.targetId);
        const sendCdp = target.cdp.send as unknown as (
          method: string,
          params?: Record<string, unknown>
        ) => Promise<unknown>;
        return await sendCdp(command.method, command.params ?? {});
      }
    }
  }

  private async attachPage(page: Page, select: boolean): Promise<void> {
    const existing = [...this.targets.values()].find((target) => target.page === page);
    if (existing) {
      if (select) this.selectTarget(existing.id);
      return;
    }

    const id = `page-${++this.targetCounter}`;
    const cdp = await this.requireContext().newCDPSession(page);
    const target: TargetState = {
      id,
      page,
      cdp,
      ref: await this.buildTargetRef(id, page, select),
      elementRefs: new Map(),
    };

    this.targets.set(id, target);
    if (select || !this.selectedTargetId) this.selectedTargetId = id;

    page.on('close', () => {
      this.targets.delete(id);
      this.options.send({
        type: 'browser_target',
        providerId: this.options.providerId,
        event: 'closed',
        target: { ...target.ref, selected: false },
      });
      if (this.selectedTargetId === id) {
        this.selectedTargetId = this.targets.keys().next().value ?? null;
      }
    });

    page.on('framenavigated', () => {
      void this.refreshTarget(target, this.selectedTargetId === id ? 'selected' : 'updated');
    });

    await this.enableNetwork(target);
    await this.refreshTarget(target, select ? 'selected' : 'created');
  }

  private async enableNetwork(target: TargetState): Promise<void> {
    await target.cdp.send('Network.enable');
    target.cdp.on('Network.requestWillBeSent', (event) => {
      this.networkRequests.set(event.requestId, { targetId: target.id, cdp: target.cdp, url: event.request.url });
      this.options.send({
        type: 'browser_network_request',
        providerId: this.options.providerId,
        targetId: target.id,
        requestId: event.requestId,
        method: event.request.method,
        url: event.request.url,
        resourceType: event.type,
        headers: redactHeaders(event.request.headers),
      });
    });
    target.cdp.on('Network.responseReceived', (event) => {
      this.options.send({
        type: 'browser_network_response',
        providerId: this.options.providerId,
        targetId: target.id,
        requestId: event.requestId,
        url: event.response.url,
        status: event.response.status,
        statusText: event.response.statusText,
        headers: redactHeaders(event.response.headers),
        mimeType: event.response.mimeType,
        encodedDataLength: event.response.encodedDataLength,
      });
    });
    target.cdp.on('Network.loadingFailed', (event) => {
      const request = this.networkRequests.get(event.requestId);
      this.options.send({
        type: 'browser_network_failed',
        providerId: this.options.providerId,
        targetId: target.id,
        requestId: event.requestId,
        url: request?.url,
        errorText: event.errorText,
      });
    });
  }

  private selectTarget(targetId: string): { target: BrowserTargetRef } {
    const target = this.targets.get(targetId);
    if (!target) throw new StaleTargetError(`Target is not available: ${targetId}`);
    this.selectedTargetId = targetId;
    for (const item of this.targets.values()) item.ref.selected = item.id === targetId;
    this.options.send({
      type: 'browser_target',
      providerId: this.options.providerId,
      event: 'selected',
      target: target.ref,
    });
    this.sendLifecycle('restored', target.ref);
    return { target: target.ref };
  }

  private resolveTarget(targetId?: string): TargetState {
    const resolvedId = targetId ?? this.selectedTargetId;
    if (!resolvedId) throw new StaleTargetError('No selected browser target');
    const target = this.targets.get(resolvedId);
    if (!target) throw new StaleTargetError(`Target is not available: ${resolvedId}`);
    return target;
  }

  private async refreshTarget(target: TargetState, event: 'created' | 'updated' | 'selected'): Promise<void> {
    target.ref = await this.buildTargetRef(target.id, target.page, this.selectedTargetId === target.id);
    this.options.send({
      type: 'browser_target',
      providerId: this.options.providerId,
      event,
      target: target.ref,
    });
  }

  private async buildTargetRef(id: string, page: Page, selected: boolean): Promise<BrowserTargetRef> {
    return {
      targetId: id,
      url: page.url(),
      title: await page.title().catch(() => ''),
      type: 'page',
      selected,
      profile: this.options.profile,
    };
  }

  private sendLifecycle(state: ProviderLifecycleState, target = this.selectedTarget()): void {
    this.options.send({
      type: 'provider_lifecycle',
      providerId: this.options.providerId,
      providerType: 'cdp',
      state,
      target,
    });
  }

  private requireContext(): BrowserContext {
    if (!this.context) throw new Error('Browser context has not started');
    return this.context;
  }
}

class StaleTargetError extends Error {}

function redactCookie(cookie: BrowserCookie, includeValue: boolean): BrowserCookie {
  return includeValue ? cookie : { ...cookie, value: undefined };
}

function redactHeaders(headers: Record<string, string | number | boolean>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'cookie' || lower === 'set-cookie' || lower === 'authorization') continue;
    safe[key] = String(value);
  }
  return safe;
}
