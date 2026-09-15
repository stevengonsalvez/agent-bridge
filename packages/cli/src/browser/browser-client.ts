import { WebSocket } from 'ws';
import type { BrowserCommandMessage, BrowserResultMessage } from 'debug-bridge-types';

export type BrowserClientOptions = {
  host?: string;
  port?: number;
  session?: string;
  timeoutMs?: number;
};

export async function sendBrowserCommand<T = unknown>(
  command: Partial<BrowserCommandMessage> & { type: string },
  options: BrowserClientOptions = {}
): Promise<T> {
  const host = options.host || 'localhost';
  const port = options.port || 4000;
  const session = options.session || 'default';
  const timeoutMs = options.timeoutMs || 15000;
  const requestId = command.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const url = `ws://${host}:${port}/debug?role=agent&sessionId=${encodeURIComponent(session)}`;

  return new Promise<T>((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      return reject(
        new Error(`Failed to connect to agent-bridge on ${url}. Make sure agent-bridge is running: ${String(err)}`)
      );
    }

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Timeout waiting for browser response after ${timeoutMs}ms (command: ${command.type})`));
    }, timeoutMs);

    ws.on('open', () => {
      const payload = {
        sessionId: session,
        timestamp: Date.now(),
        origin: 'agent',
        requestId,
        ...command,
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; requestId?: string; [key: string]: unknown };
        if (msg.type === 'browser_result' && msg.requestId === requestId) {
          clearTimeout(timer);
          ws.close();
          const resultMsg = msg as unknown as BrowserResultMessage;
          if (resultMsg.success) {
            resolve(resultMsg.result as T);
          } else {
            reject(new Error(resultMsg.error?.message || 'Browser command failed'));
          }
        }
      } catch {
        // Ignore unparseable non-result telemetry
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket connection error to ${url}: ${err.message}`));
    });
  });
}
