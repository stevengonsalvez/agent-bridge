type NetworkRequestCallback = (request: {
  requestId: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  initiator: 'fetch' | 'xhr';
}) => void;

type NetworkResponseCallback = (response: {
  requestId: string;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  body?: string;
  duration: number;
  ok: boolean;
}) => void;

export class NetworkHook {
  private onRequest: NetworkRequestCallback;
  private onResponse: NetworkResponseCallback;
  private maxBodySize: number;
  private urlFilter?: (url: string) => boolean;
  private originalFetch: typeof fetch | null = null;
  private originalXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
  private originalXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
  private requestCounter = 0;

  constructor(
    onRequest: NetworkRequestCallback,
    onResponse: NetworkResponseCallback,
    maxBodySize = 10000,
    urlFilter?: (url: string) => boolean
  ) {
    this.onRequest = onRequest;
    this.onResponse = onResponse;
    this.maxBodySize = maxBodySize;
    this.urlFilter = urlFilter;
  }

  start(): void {
    this.hookFetch();
    this.hookXhr();
  }

  stop(): void {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    if (this.originalXhrOpen && this.originalXhrSend) {
      XMLHttpRequest.prototype.open = this.originalXhrOpen;
      XMLHttpRequest.prototype.send = this.originalXhrSend;
      this.originalXhrOpen = null;
      this.originalXhrSend = null;
    }
  }

  private shouldCapture(url: string): boolean {
    // Skip WebSocket URLs and the debug bridge itself
    if (url.startsWith('ws://') || url.startsWith('wss://')) return false;
    if (url.includes('/debug')) return false;

    if (this.urlFilter) {
      return this.urlFilter(url);
    }
    return true;
  }

  private generateRequestId(): string {
    return `net-${++this.requestCounter}-${Date.now()}`;
  }

  private truncateBody(body: string | undefined): string | undefined {
    if (!body) return undefined;
    if (body.length <= this.maxBodySize) return body;
    return body.substring(0, this.maxBodySize) + `... [truncated ${body.length - this.maxBodySize} chars]`;
  }

  private headersToRecord(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      // Skip sensitive headers
      if (!key.toLowerCase().includes('authorization') &&
          !key.toLowerCase().includes('cookie')) {
        result[key] = value;
      }
    });
    return result;
  }

  private hookFetch(): void {
    this.originalFetch = window.fetch;
    const self = this;

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (!self.shouldCapture(url)) {
        return self.originalFetch!.call(window, input, init);
      }

      const requestId = self.generateRequestId();
      const startTime = performance.now();
      const method = init?.method ?? 'GET';

      // Capture request
      let requestBody: string | undefined;
      if (init?.body) {
        if (typeof init.body === 'string') {
          requestBody = init.body;
        } else if (init.body instanceof FormData) {
          requestBody = '[FormData]';
        } else if (init.body instanceof Blob) {
          requestBody = `[Blob: ${init.body.size} bytes]`;
        } else {
          requestBody = '[Binary data]';
        }
      }

      self.onRequest({
        requestId,
        method,
        url,
        headers: init?.headers ? Object.fromEntries(new Headers(init.headers as HeadersInit)) : undefined,
        body: self.truncateBody(requestBody),
        initiator: 'fetch',
      });

      try {
        const response = await self.originalFetch!.call(window, input, init);
        const duration = Math.round(performance.now() - startTime);

        // Clone response to read body without consuming it
        const clonedResponse = response.clone();
        let responseBody: string | undefined;

        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json') || contentType.includes('text/')) {
            responseBody = await clonedResponse.text();
          } else {
            responseBody = `[${contentType || 'Binary'}: ${response.headers.get('content-length') || 'unknown'} bytes]`;
          }
        } catch {
          responseBody = '[Unable to read body]';
        }

        self.onResponse({
          requestId,
          status: response.status,
          statusText: response.statusText,
          headers: self.headersToRecord(response.headers),
          body: self.truncateBody(responseBody),
          duration,
          ok: response.ok,
        });

        return response;
      } catch (error) {
        const duration = Math.round(performance.now() - startTime);

        self.onResponse({
          requestId,
          status: 0,
          statusText: error instanceof Error ? error.message : 'Network Error',
          duration,
          ok: false,
        });

        throw error;
      }
    };
  }

  private hookXhr(): void {
    this.originalXhrOpen = XMLHttpRequest.prototype.open;
    this.originalXhrSend = XMLHttpRequest.prototype.send;
    const self = this;

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null
    ): void {
      (this as any)._debugBridge = {
        method,
        url: typeof url === 'string' ? url : url.href,
        requestId: self.generateRequestId(),
        startTime: 0,
      };
      return self.originalXhrOpen!.call(this, method, url, async, username, password);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null): void {
      const info = (this as any)._debugBridge;

      if (!info || !self.shouldCapture(info.url)) {
        return self.originalXhrSend!.call(this, body);
      }

      info.startTime = performance.now();

      // Capture request
      let requestBody: string | undefined;
      if (body) {
        if (typeof body === 'string') {
          requestBody = body;
        } else if (body instanceof FormData) {
          requestBody = '[FormData]';
        } else if (body instanceof Blob) {
          requestBody = `[Blob: ${body.size} bytes]`;
        } else {
          requestBody = '[Binary data]';
        }
      }

      self.onRequest({
        requestId: info.requestId,
        method: info.method,
        url: info.url,
        body: self.truncateBody(requestBody),
        initiator: 'xhr',
      });

      // Listen for completion
      this.addEventListener('loadend', function () {
        const duration = Math.round(performance.now() - info.startTime);

        let responseBody: string | undefined;
        try {
          if (this.responseType === '' || this.responseType === 'text') {
            responseBody = this.responseText;
          } else if (this.responseType === 'json') {
            responseBody = JSON.stringify(this.response);
          } else {
            responseBody = `[${this.responseType}]`;
          }
        } catch {
          responseBody = '[Unable to read body]';
        }

        self.onResponse({
          requestId: info.requestId,
          status: this.status,
          statusText: this.statusText,
          body: self.truncateBody(responseBody),
          duration,
          ok: this.status >= 200 && this.status < 300,
        });
      });

      return self.originalXhrSend!.call(this, body);
    };
  }
}
