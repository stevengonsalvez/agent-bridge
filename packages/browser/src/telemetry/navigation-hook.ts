type NavigationCallback = (event: {
  url: string;
  previousUrl?: string;
  trigger: 'pushstate' | 'popstate' | 'replacestate' | 'hashchange' | 'initial';
}) => void;

export class NavigationHook {
  private callback: NavigationCallback;
  private currentUrl: string;
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;
  private popstateHandler: ((event: PopStateEvent) => void) | null = null;
  private hashchangeHandler: ((event: HashChangeEvent) => void) | null = null;

  constructor(callback: NavigationCallback) {
    this.callback = callback;
    this.currentUrl = window.location.href;
  }

  start(): void {
    // Send initial navigation event
    this.callback({
      url: this.currentUrl,
      trigger: 'initial',
    });

    this.hookPushState();
    this.hookReplaceState();
    this.hookPopState();
    this.hookHashChange();
  }

  stop(): void {
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
      this.originalPushState = null;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }
    if (this.popstateHandler) {
      window.removeEventListener('popstate', this.popstateHandler);
      this.popstateHandler = null;
    }
    if (this.hashchangeHandler) {
      window.removeEventListener('hashchange', this.hashchangeHandler);
      this.hashchangeHandler = null;
    }
  }

  private hookPushState(): void {
    this.originalPushState = history.pushState;
    const self = this;

    history.pushState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null
    ): void {
      const previousUrl = self.currentUrl;
      self.originalPushState!.call(this, data, unused, url);

      const newUrl = window.location.href;
      if (newUrl !== previousUrl) {
        self.currentUrl = newUrl;
        self.callback({
          url: newUrl,
          previousUrl,
          trigger: 'pushstate',
        });
      }
    };
  }

  private hookReplaceState(): void {
    this.originalReplaceState = history.replaceState;
    const self = this;

    history.replaceState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null
    ): void {
      const previousUrl = self.currentUrl;
      self.originalReplaceState!.call(this, data, unused, url);

      const newUrl = window.location.href;
      if (newUrl !== previousUrl) {
        self.currentUrl = newUrl;
        self.callback({
          url: newUrl,
          previousUrl,
          trigger: 'replacestate',
        });
      }
    };
  }

  private hookPopState(): void {
    const self = this;

    this.popstateHandler = (_event: PopStateEvent) => {
      const previousUrl = self.currentUrl;
      const newUrl = window.location.href;

      if (newUrl !== previousUrl) {
        self.currentUrl = newUrl;
        self.callback({
          url: newUrl,
          previousUrl,
          trigger: 'popstate',
        });
      }
    };

    window.addEventListener('popstate', this.popstateHandler);
  }

  private hookHashChange(): void {
    const self = this;

    this.hashchangeHandler = (event: HashChangeEvent) => {
      const previousUrl = event.oldURL;
      const newUrl = event.newURL;

      if (newUrl !== previousUrl) {
        self.currentUrl = newUrl;
        self.callback({
          url: newUrl,
          previousUrl,
          trigger: 'hashchange',
        });
      }
    };

    window.addEventListener('hashchange', this.hashchangeHandler);
  }
}
