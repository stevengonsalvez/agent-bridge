import WebSocket from 'ws';
import type { BridgeMessage } from 'debug-bridge-types';

export type SidecarClientOptions = {
  url: string;
  onMessage: (msg: BridgeMessage) => void | Promise<void>;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
};

export class SidecarClient {
  private ws: WebSocket | null = null;

  constructor(private readonly options: SidecarClientOptions) {}

  connect(): void {
    this.ws = new WebSocket(this.options.url);
    this.ws.on('open', () => this.options.onOpen?.());
    this.ws.on('message', async (data) => {
      try {
        await this.options.onMessage(JSON.parse(data.toString()) as BridgeMessage);
      } catch {
        // Ignore malformed agent messages.
      }
    });
    this.ws.on('close', () => this.options.onClose?.());
    this.ws.on('error', (error) => this.options.onError?.(error));
  }

  send(msg: BridgeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
