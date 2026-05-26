import WebSocket from 'ws';
import type {
  AgentVisualSuggestion,
  AnnotationMark,
  BridgeMessage,
  UiFeedbackBatchCreatedMessage,
  UiFeedbackSuggestionDecisionMessage,
} from 'debug-bridge-types';
import { PROTOCOL_VERSION } from 'debug-bridge-types';

type FeedbackClientOptions = {
  wsUrl: string;
  sessionId: string;
  reconnect?: boolean;
};

type OutboundBridgePayload = Record<string, unknown> & { type: string };

type Waiter = {
  predicate: (message: BridgeMessage) => boolean;
  resolve: (message: BridgeMessage) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class BridgeFeedbackClient {
  private readonly options: FeedbackClientOptions;
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private manuallyClosed = false;
  private readonly waiters = new Set<Waiter>();
  readonly events: BridgeMessage[] = [];
  latestBatchEvent: UiFeedbackBatchCreatedMessage | null = null;
  latestDecision: UiFeedbackSuggestionDecisionMessage | null = null;

  constructor(options: FeedbackClientOptions) {
    this.options = options;
  }

  connect(): void {
    this.manuallyClosed = false;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    this.ws = new WebSocket(this.options.wsUrl);
    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
    });
    this.ws.on('message', (raw) => this.record(raw));
    this.ws.on('close', () => {
      this.ws = null;
      if (!this.manuallyClosed && this.options.reconnect !== false) this.scheduleReconnect();
    });
    this.ws.on('error', () => {
      // The close event handles reconnect. Tool calls report closed state explicitly.
    });
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  status(): { connected: boolean; wsUrl: string; events: number; latestBatchId?: string; latestDecisionId?: string } {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      wsUrl: this.options.wsUrl,
      events: this.events.length,
      latestBatchId: this.latestBatchEvent?.batchId,
      latestDecisionId: this.latestDecision?.suggestionId,
    };
  }

  async waitForBatch(timeoutMs = 30000): Promise<UiFeedbackBatchCreatedMessage> {
    return this.waitFor(
      (message): message is UiFeedbackBatchCreatedMessage => message.type === 'ui_feedback_batch_created',
      timeoutMs,
    );
  }

  async waitForDecision(timeoutMs = 30000): Promise<UiFeedbackSuggestionDecisionMessage> {
    return this.waitFor(
      (message): message is UiFeedbackSuggestionDecisionMessage => message.type === 'ui_feedback_suggestion_decision',
      timeoutMs,
    );
  }

  async sendOverlayToggle(enabled: boolean): Promise<void> {
    await this.send({ type: enabled ? 'ui_feedback_enable' : 'ui_feedback_disable' });
  }

  async sendSuggestion(args: {
    batchId: string;
    itemId: string;
    comment: string;
    patchHint?: string;
    marks?: AnnotationMark[];
  }): Promise<AgentVisualSuggestion> {
    const suggestion: AgentVisualSuggestion = {
      id: `sug_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      batchId: args.batchId,
      itemId: args.itemId,
      createdAt: new Date().toISOString(),
      status: 'proposed',
      comment: args.comment,
      patchHint: args.patchHint,
      marks: args.marks ?? [],
    };
    await this.send({
      type: 'ui_feedback_suggestion_added',
      batchId: args.batchId,
      itemId: args.itemId,
      suggestion,
    });
    return suggestion;
  }

  private async send(payload: OutboundBridgePayload): Promise<void> {
    await this.ensureOpen();
    const message = {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: this.options.sessionId,
      timestamp: Date.now(),
      requestId: `feedback-mcp-${Date.now()}`,
      ...payload,
    };
    this.ws?.send(JSON.stringify(message));
  }

  private async ensureOpen(timeoutMs = 5000): Promise<void> {
    this.connect();
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const ws = this.ws;
    if (!ws) throw new Error('Bridge WebSocket is not initialized');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out connecting to ${this.options.wsUrl}`)), timeoutMs);
      ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private waitFor<T extends BridgeMessage>(
    predicate: (message: BridgeMessage) => message is T,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        predicate,
        resolve: (message) => resolve(message as T),
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(`Timed out waiting for feedback event after ${timeoutMs}ms`));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  private record(raw: WebSocket.RawData): void {
    let message: BridgeMessage;
    try {
      message = JSON.parse(raw.toString()) as BridgeMessage;
    } catch {
      return;
    }
    this.events.push(message);
    if (this.events.length > 100) this.events.shift();
    if (message.type === 'ui_feedback_batch_created') this.latestBatchEvent = message as UiFeedbackBatchCreatedMessage;
    if (message.type === 'ui_feedback_suggestion_decision') {
      this.latestDecision = message as UiFeedbackSuggestionDecisionMessage;
    }
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(message)) continue;
      clearTimeout(waiter.timer);
      this.waiters.delete(waiter);
      waiter.resolve(message);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delayMs = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }
}
