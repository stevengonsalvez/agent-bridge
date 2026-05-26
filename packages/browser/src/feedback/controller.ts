import type {
  AgentVisualSuggestion,
  AnnotationMark,
  BridgeMessage,
  DebugBridgeConfig,
  ElementFeedbackTarget,
  FeedbackAsset,
  FeedbackConfig,
  FeedbackTelemetry,
  SourceHints,
  UiFeedbackBatch,
  UiFeedbackItem,
  UiFeedbackSuggestionAddedMessage,
} from 'debug-bridge-types';
import html2canvas from 'html2canvas-pro';
import { FeedbackOverlay } from './overlay';

type Send = (msg: Partial<BridgeMessage> & { type: string }) => void;

type FeedbackEvent = {
  type: string;
  [key: string]: unknown;
};

export type FeedbackApi = {
  enable: () => void;
  disable: () => void;
  createBatch: () => UiFeedbackBatch;
  addItem: (draft: Partial<UiFeedbackItem>) => UiFeedbackItem;
  updateItem: (itemId: string, patch: Partial<UiFeedbackItem>) => void;
  submitBatch: () => Promise<void>;
  acceptSuggestion: (suggestionId: string, comment?: string) => void;
  rejectSuggestion: (suggestionId: string, comment?: string) => void;
  commentOnSuggestion: (suggestionId: string, comment: string) => void;
  onSuggestionAdded: (handler: (suggestion: AgentVisualSuggestion) => void) => () => void;
};

export class FeedbackController implements FeedbackApi {
  private readonly config: DebugBridgeConfig & { feedbackConfig: Required<FeedbackConfig> };
  private readonly send: Send;
  private readonly overlay: FeedbackOverlay;
  private batch: UiFeedbackBatch | null = null;
  private currentItemId: string | null = null;
  private readonly suggestionHandlers = new Set<(suggestion: AgentVisualSuggestion) => void>();
  private readonly telemetry: FeedbackTelemetry = { console: [], errors: [], network: [], navigation: [] };

  constructor(config: DebugBridgeConfig & { feedbackConfig: Required<FeedbackConfig> }, send: Send) {
    this.config = config;
    this.send = send;
    this.overlay = new FeedbackOverlay(this);
  }

  enable(): void {
    this.createBatch();
    this.overlay.mount();
    this.overlay.render();
  }

  disable(): void {
    this.overlay.unmount();
  }

  createBatch(): UiFeedbackBatch {
    if (this.batch && this.batch.status === 'draft') return this.batch;
    const now = new Date().toISOString();
    this.batch = {
      id: `fb_${Date.now().toString(36)}`,
      createdAt: now,
      updatedAt: now,
      status: 'draft',
      appName: this.config.appName,
      sessionId: this.config.sessionId,
      itemIds: [],
      routes: [],
      items: [],
    };
    this.currentItemId = null;
    return this.batch;
  }

  addItem(draft: Partial<UiFeedbackItem> = {}): UiFeedbackItem {
    const batch = this.createBatch();
    const now = new Date().toISOString();
    const item: UiFeedbackItem = {
      id: draft.id ?? `item_${Math.random().toString(16).slice(2, 8)}`,
      batchId: batch.id,
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
      status: draft.status ?? 'open',
      route: draft.route ?? {
        url: window.location.href,
        pathname: window.location.pathname,
        title: document.title,
      },
      viewport: draft.viewport ?? {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
      },
      target: draft.target,
      region: draft.region,
      comment: draft.comment ?? '',
      marks: draft.marks ?? [],
      screenshot: draft.screenshot ?? this.emptyAsset('screenshot'),
      annotated: draft.annotated ?? this.emptyAsset('annotated'),
      appState: draft.appState,
      telemetry: draft.telemetry,
      sourceHints: draft.sourceHints,
      suggestions: draft.suggestions ?? [],
    };
    batch.items.push(item);
    batch.itemIds = batch.items.map((candidate) => candidate.id);
    batch.routes = [...new Set(batch.items.map((candidate) => candidate.route.url))];
    batch.updatedAt = now;
    this.currentItemId = item.id;
    this.overlay.render();
    return item;
  }

  updateItem(itemId: string, patch: Partial<UiFeedbackItem>): void {
    const item = this.batch?.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    if (patch.target?.sourceHints || patch.sourceHints) {
      item.sourceHints = patch.sourceHints ?? patch.target?.sourceHints;
    }
    this.batch!.updatedAt = item.updatedAt;
    this.overlay.render();
  }

  async submitBatch(): Promise<void> {
    const batch = this.createBatch();
    if (batch.items.length === 0) return;
    this.overlay.setBusy(true);
    try {
      for (const item of batch.items) {
        item.appState = this.captureAppState();
        item.telemetry = this.captureTelemetry();
        item.viewport = { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 };
        item.screenshot = await this.captureImage('screenshot', item.marks, false);
        item.annotated = await this.captureImage('annotated', item.marks, true);
        item.updatedAt = new Date().toISOString();
      }
      batch.status = 'submitted';
      batch.updatedAt = new Date().toISOString();
      batch.itemIds = batch.items.map((item) => item.id);
      batch.routes = [...new Set(batch.items.map((item) => item.route.url))];
      this.send({ type: 'ui_feedback_batch_submit', batch });
      this.overlay.render();
    } finally {
      this.overlay.setBusy(false);
    }
  }

  handleBridgeMessage(msg: BridgeMessage): boolean {
    if (msg.type === 'ui_feedback_enable') {
      this.enable();
      return true;
    }
    if (msg.type === 'ui_feedback_disable') {
      this.disable();
      return true;
    }
    if (msg.type === 'ui_feedback_suggestion_added') {
      this.addSuggestion(msg as UiFeedbackSuggestionAddedMessage);
      return true;
    }
    if (msg.type === 'ui_feedback_status_update' || msg.type === 'ui_feedback_comment_added') {
      this.overlay.addThreadEvent(msg as FeedbackEvent);
      return true;
    }
    return false;
  }

  onSuggestionAdded(handler: (suggestion: AgentVisualSuggestion) => void): () => void {
    this.suggestionHandlers.add(handler);
    return () => this.suggestionHandlers.delete(handler);
  }

  acceptSuggestion(suggestionId: string, comment?: string): void {
    this.decideSuggestion(suggestionId, 'ui_feedback_suggestion_accepted', comment);
  }

  rejectSuggestion(suggestionId: string, comment?: string): void {
    this.decideSuggestion(suggestionId, 'ui_feedback_suggestion_rejected', comment);
  }

  commentOnSuggestion(suggestionId: string, comment: string): void {
    this.decideSuggestion(suggestionId, 'ui_feedback_suggestion_commented', comment);
  }

  recordConsole(level: string, args: string[]): void {
    this.pushTelemetry(this.telemetry.console, { level, args, timestamp: Date.now() });
  }

  recordError(message: string, stack?: string): void {
    this.pushTelemetry(this.telemetry.errors, { message, stack, timestamp: Date.now() });
  }

  recordNetwork(event: Omit<FeedbackTelemetry['network'][number], 'timestamp'>): void {
    this.pushTelemetry(this.telemetry.network, { ...event, timestamp: Date.now() });
  }

  recordNavigation(event: Omit<FeedbackTelemetry['navigation'][number], 'timestamp'>): void {
    this.pushTelemetry(this.telemetry.navigation, { ...event, timestamp: Date.now() });
  }

  getBatch(): UiFeedbackBatch | null {
    return this.batch;
  }

  getCurrentItem(): UiFeedbackItem {
    const batch = this.batch ?? this.createBatch();
    const existing = batch.items.find((item) => item.id === this.currentItemId);
    if (existing && batch.status !== 'draft') return existing;
    if (existing && existing.route.url === window.location.href) return existing;
    if (batch.status !== 'draft' && batch.items[0]) return batch.items[0];
    return this.addItem();
  }

  setCurrentItem(itemId: string): void {
    this.currentItemId = itemId;
    this.overlay.render();
  }

  addMark(mark: AnnotationMark, target?: ElementFeedbackTarget): void {
    const item = this.getCurrentItem();
    item.marks.push(mark);
    if (target) {
      item.target = target;
      item.sourceHints = target.sourceHints;
    }
    item.route = { url: window.location.href, pathname: window.location.pathname, title: document.title };
    item.updatedAt = new Date().toISOString();
    this.createBatch().updatedAt = item.updatedAt;
    this.overlay.render();
  }

  updateCurrentComment(comment: string): void {
    const item = this.getCurrentItem();
    item.comment = comment;
    item.updatedAt = new Date().toISOString();
    this.createBatch().updatedAt = item.updatedAt;
  }

  clearCurrentItem(): void {
    const item = this.getCurrentItem();
    item.marks = [];
    item.comment = '';
    item.target = undefined;
    item.region = undefined;
    item.sourceHints = undefined;
    item.updatedAt = new Date().toISOString();
    this.overlay.render();
  }

  captureElementTarget(el: Element): ElementFeedbackTarget {
    const rect = el.getBoundingClientRect();
    const htmlEl = el as HTMLElement;
    return {
      stableId: htmlEl.dataset.debugBridgeId ?? htmlEl.dataset.testid ?? htmlEl.id,
      selector: this.selectorFor(el),
      role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
      text: (el.textContent ?? '').trim().slice(0, 160) || undefined,
      label: el.getAttribute('aria-label') ?? undefined,
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      meta: { tagName: el.tagName.toLowerCase(), className: htmlEl.className },
      sourceHints: this.sourceHintsFor(el),
    };
  }

  private addSuggestion(message: UiFeedbackSuggestionAddedMessage): void {
    const batch = this.batch ?? this.createBatch();
    const item = batch.items.find((candidate) => candidate.id === message.itemId);
    if (!item) return;
    const suggestion = {
      ...message.suggestion,
      batchId: message.batchId,
      itemId: item.id,
      createdAt: message.suggestion.createdAt || new Date().toISOString(),
      status: message.suggestion.status || 'proposed',
    };
    const index = item.suggestions.findIndex((candidate) => candidate.id === suggestion.id);
    if (index >= 0) item.suggestions[index] = suggestion;
    else item.suggestions.push(suggestion);
    for (const handler of this.suggestionHandlers) handler(suggestion);
    this.overlay.showThread();
  }

  private decideSuggestion(
    suggestionId: string,
    type: 'ui_feedback_suggestion_accepted' | 'ui_feedback_suggestion_rejected' | 'ui_feedback_suggestion_commented',
    comment?: string
  ): void {
    const batch = this.batch ?? this.createBatch();
    const item = batch.items.find((candidate) =>
      candidate.suggestions.some((suggestion) => suggestion.id === suggestionId)
    );
    if (!item) return;
    const suggestion = item.suggestions.find((candidate) => candidate.id === suggestionId);
    if (suggestion) {
      suggestion.status =
        type === 'ui_feedback_suggestion_accepted'
          ? 'accepted'
          : type === 'ui_feedback_suggestion_rejected'
            ? 'rejected'
            : 'commented';
      if (comment) suggestion.comment = comment;
    }
    this.send({ type, batchId: batch.id, itemId: item.id, suggestionId, comment });
    this.overlay.render();
  }

  private async captureImage(kind: 'screenshot' | 'annotated', marks: AnnotationMark[], annotated: boolean): Promise<FeedbackAsset> {
    this.overlay.setCaptureHidden(true);
    try {
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      });
      if (annotated) this.drawMarks(canvas, marks);
      const resized = this.downscaleCanvas(canvas);
      const mimeType = resized.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/png';
      const data = resized.toDataURL(mimeType, 0.86);
      return {
        kind,
        mimeType,
        data,
        width: resized.width,
        height: resized.height,
        byteLength: Math.round((data.length * 3) / 4),
        captureDownscaled: resized.width !== canvas.width || resized.height !== canvas.height,
      };
    } finally {
      this.overlay.setCaptureHidden(false);
    }
  }

  private drawMarks(canvas: HTMLCanvasElement, marks: AnnotationMark[]): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    for (const mark of marks) {
      ctx.save();
      ctx.strokeStyle = mark.color;
      ctx.fillStyle = mark.color;
      ctx.lineWidth = mark.strokeWidth;
      ctx.globalAlpha = mark.opacity ?? 1;
      if ((mark.type === 'rect' || mark.type === 'highlight') && mark.bounds) {
        if (mark.type === 'highlight') ctx.fillRect(mark.bounds.x, mark.bounds.y, mark.bounds.width, mark.bounds.height);
        ctx.strokeRect(mark.bounds.x, mark.bounds.y, mark.bounds.width, mark.bounds.height);
      } else if (mark.type === 'arrow' && mark.points?.length) {
        this.drawPolyline(ctx, mark.points, true);
      } else if (mark.type === 'pen' && mark.points?.length) {
        this.drawPolyline(ctx, mark.points, false);
      } else if (mark.type === 'text' && mark.text && mark.points?.[0]) {
        ctx.font = '16px system-ui, sans-serif';
        ctx.fillText(mark.text, mark.points[0].x, mark.points[0].y);
      }
      ctx.restore();
    }
  }

  private drawPolyline(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, arrow: boolean): void {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    if (!arrow) return;
    const end = points[points.length - 1];
    const prev = points[points.length - 2];
    const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
    const size = 12;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  private downscaleCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const max = this.config.feedbackConfig.maxImageDimension;
    const largest = Math.max(canvas.width, canvas.height);
    if (largest <= max) return canvas;
    const scale = max / largest;
    const next = document.createElement('canvas');
    next.width = Math.round(canvas.width * scale);
    next.height = Math.round(canvas.height * scale);
    next.getContext('2d')?.drawImage(canvas, 0, 0, next.width, next.height);
    return next;
  }

  private captureAppState(): Record<string, unknown> | undefined {
    if (!this.config.feedbackConfig.captureAppState || !this.config.getCustomState) return undefined;
    return this.config.getCustomState();
  }

  private captureTelemetry(): FeedbackTelemetry | undefined {
    if (!this.config.feedbackConfig.captureTelemetry) return undefined;
    return {
      console: [...this.telemetry.console],
      errors: [...this.telemetry.errors],
      network: [...this.telemetry.network],
      navigation: [...this.telemetry.navigation],
    };
  }

  private sourceHintsFor(el: Element): SourceHints | undefined {
    if (!this.config.feedbackConfig.captureSourceHints) return undefined;
    const hintedElement = el.closest<HTMLElement>(
      '[data-testid], [data-component], [data-source-file], [data-source-line], [data-owner], [data-feature]',
    );
    if (!hintedElement) return undefined;

    const data = hintedElement.dataset;
    const hints: SourceHints = {
      testId: data.testid,
      component: data.component,
      sourceFile: data.sourceFile,
      sourceLine: data.sourceLine,
      owner: data.owner,
      feature: data.feature,
    };
    return Object.values(hints).some(Boolean) ? hints : undefined;
  }

  private selectorFor(el: Element): string {
    const htmlEl = el as HTMLElement;
    if (htmlEl.dataset.testid) return `[data-testid="${htmlEl.dataset.testid}"]`;
    if (htmlEl.id) return `#${CSS.escape(htmlEl.id)}`;
    return el.tagName.toLowerCase();
  }

  private pushTelemetry<T>(buffer: T[], value: T): void {
    buffer.push(value);
    if (buffer.length > 50) buffer.shift();
  }

  private emptyAsset(kind: 'screenshot' | 'annotated'): FeedbackAsset {
    return { kind, mimeType: 'image/png', width: 0, height: 0, byteLength: 0 };
  }
}
