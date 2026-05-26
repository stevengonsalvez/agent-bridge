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

    const page = this.context.pages()[0] ?? await this.context.newPage();
    await importStorageState(this.context, page, this.options.storageState);
    await this.attachPage(page, true);
    this.sendLifecycle('connected');
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
        const data = await target.page.screenshot({ fullPage: command.fullPage ?? false });
        const viewport = target.page.viewportSize();
        return {
          data: `data:image/png;base64,${data.toString('base64')}`,
          width: viewport?.width ?? 0,
          height: viewport?.height ?? 0,
        };
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
