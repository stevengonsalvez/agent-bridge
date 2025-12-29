import { WebSocketServer, WebSocket } from 'ws';
import type {
  BridgeMessage,
  HelloMessage,
  CommandMessage,
  CommandResultMessage,
  CliConfig,
} from '@debug-bridge/types';

type ServerCallbacks = {
  onAppConnected: (hello: HelloMessage) => void;
  onAppDisconnected: () => void;
  onTelemetry: (msg: BridgeMessage) => void;
  onCommandResult: (msg: CommandResultMessage) => void;
};

export type DebugBridgeServer = {
  sendCommand: (cmd: CommandMessage) => void;
  close: () => void;
};

export function startServer(config: CliConfig, callbacks: ServerCallbacks): DebugBridgeServer {
  const wss = new WebSocketServer({
    port: config.port,
    host: config.host,
    path: '/debug',
  });

  let appConnection: WebSocket | null = null;

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${config.host}`);
    const sessionId = url.searchParams.get('sessionId');

    if (sessionId !== config.session) {
      ws.close(4000, 'Invalid session');
      return;
    }

    appConnection = ws;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeMessage;

        if (msg.type === 'hello') {
          callbacks.onAppConnected(msg as HelloMessage);
        } else if (msg.type === 'command_result') {
          callbacks.onCommandResult(msg as CommandResultMessage);
        } else {
          callbacks.onTelemetry(msg);
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on('close', () => {
      appConnection = null;
      callbacks.onAppDisconnected();
    });
  });

  return {
    sendCommand: (cmd: CommandMessage) => {
      if (appConnection?.readyState === WebSocket.OPEN) {
        appConnection.send(JSON.stringify(cmd));
      }
    },
    close: () => {
      wss.close();
    },
  };
}
