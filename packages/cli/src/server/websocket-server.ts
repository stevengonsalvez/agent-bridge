import { WebSocketServer, WebSocket } from 'ws';
import type {
  BridgeMessage,
  HelloMessage,
  CommandMessage,
  CommandResultMessage,
  CliConfig,
} from 'debug-bridge-types';

type ServerCallbacks = {
  onAppConnected: (hello: HelloMessage) => void;
  onAppDisconnected: () => void;
  onTelemetry: (msg: BridgeMessage) => void;
  onCommandResult: (msg: CommandResultMessage) => void;
};

type Client = {
  ws: WebSocket;
  role: 'app' | 'agent';
  sessionId: string;
  appId?: string;
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

  const clients = new Map<WebSocket, Client>();

  // Helper to broadcast to clients of a specific role in a session
  function broadcastToRole(sessionId: string, role: 'app' | 'agent', msg: string, excludeWs?: WebSocket) {
    for (const [ws, client] of clients) {
      if (client.sessionId === sessionId && client.role === role && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  // Helper to get apps in a session
  function getApps(sessionId: string): Client[] {
    return [...clients.values()].filter(c => c.sessionId === sessionId && c.role === 'app');
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${config.host}`);
    const sessionId = url.searchParams.get('sessionId');
    const role = url.searchParams.get('role') as 'app' | 'agent' | null;
    const appId = url.searchParams.get('appId') || `app-${Date.now()}`;

    // Validate session
    if (sessionId !== config.session) {
      ws.close(4000, 'Invalid session');
      return;
    }

    // Default to 'app' for backward compatibility if role not specified
    const clientRole = role === 'agent' ? 'agent' : 'app';

    const client: Client = { ws, role: clientRole, sessionId, appId };
    clients.set(ws, client);

    // Notify about connection
    const connEvent = {
      protocolVersion: 1,
      sessionId,
      timestamp: Date.now(),
      origin: 'server',
      type: 'connection_event',
      event: clientRole === 'app' ? 'app_connected' : 'agent_connected',
      appId: clientRole === 'app' ? appId : undefined,
      connectedApps: getApps(sessionId).map(c => c.appId!),
      connectedAgents: [...clients.values()].filter(c => c.sessionId === sessionId && c.role === 'agent').length,
    };

    // Broadcast connection event to all in session except sender
    for (const [clientWs, c] of clients) {
      if (c.sessionId === sessionId && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(connEvent));
      }
    }

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeMessage;
        const sender = clients.get(ws);
        if (!sender) return;

        // Route messages to opposite role
        const targetRole = sender.role === 'app' ? 'agent' : 'app';
        broadcastToRole(sender.sessionId, targetRole, data.toString(), ws);

        // Also call callbacks for CLI display (backward compatibility)
        if (sender.role === 'app') {
          if (msg.type === 'hello') {
            callbacks.onAppConnected(msg as HelloMessage);
          } else if (msg.type === 'command_result') {
            callbacks.onCommandResult(msg as CommandResultMessage);
          } else {
            callbacks.onTelemetry(msg);
          }
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on('close', () => {
      const client = clients.get(ws);
      if (client) {
        clients.delete(ws);

        // Notify about disconnection
        const disconnEvent = {
          protocolVersion: 1,
          sessionId: client.sessionId,
          timestamp: Date.now(),
          origin: 'server',
          type: 'connection_event',
          event: client.role === 'app' ? 'app_disconnected' : 'agent_disconnected',
          appId: client.role === 'app' ? client.appId : undefined,
        };

        for (const [clientWs, c] of clients) {
          if (c.sessionId === client.sessionId && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(disconnEvent));
          }
        }

        if (client.role === 'app') {
          callbacks.onAppDisconnected();
        }
      }
    });
  });

  return {
    sendCommand: (cmd: CommandMessage) => {
      // Send to all apps in the configured session (CLI acts as an agent)
      broadcastToRole(config.session, 'app', JSON.stringify(cmd));
    },
    close: () => {
      wss.close();
    },
  };
}
