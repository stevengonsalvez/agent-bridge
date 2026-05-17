import { WebSocketServer, WebSocket } from 'ws';
import type {
  BrowserResultMessage,
  BridgeMessage,
  HelloMessage,
  CommandMessage,
  CommandResultMessage,
  CliConfig,
  ProviderType,
} from 'debug-bridge-types';
import { ProviderRegistry, isBrowserCommand, type ClientRecord, type ClientRole } from './provider-registry';

type ServerCallbacks = {
  onAppConnected: (hello: HelloMessage) => void;
  onAppDisconnected: () => void;
  onTelemetry: (msg: BridgeMessage) => void;
  onCommandResult: (msg: CommandResultMessage | BrowserResultMessage) => void;
};

export type DebugBridgeServer = {
  sendCommand: (cmd: CommandMessage | BridgeMessage) => void;
  close: () => void;
};

export function startServer(config: CliConfig, callbacks: ServerCallbacks): DebugBridgeServer {
  const wss = new WebSocketServer({
    port: config.port,
    host: config.host,
    path: '/debug',
  });

  const clients = new ProviderRegistry<WebSocket>();

  // Helper to broadcast to clients of a specific role in a session
  function broadcastToRole(sessionId: string, role: 'app' | 'agent' | 'provider', msg: string, excludeWs?: WebSocket) {
    for (const [ws, client] of clients.entries()) {
      if (client.sessionId === sessionId && client.role === role && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  // Helper to get apps in a session
  function getApps(sessionId: string) {
    return clients.apps(sessionId);
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${config.host}`);
    const sessionId = url.searchParams.get('sessionId');
    const role = url.searchParams.get('role') as 'app' | 'agent' | 'provider' | null;
    const appId = url.searchParams.get('appId') || `app-${Date.now()}`;
    const providerId = url.searchParams.get('providerId') || undefined;
    const providerType = url.searchParams.get('providerType') as ProviderType | null;

    // Validate session
    if (sessionId !== config.session) {
      ws.close(4000, 'Invalid session');
      return;
    }

    // Default to 'app' for backward compatibility if role not specified
    const clientRole: ClientRole = role === 'agent' || role === 'provider' ? role : 'app';

    const client: ClientRecord<WebSocket> = {
      ws,
      role: clientRole,
      sessionId,
      appId: clientRole === 'app' ? appId : undefined,
      providerId: clientRole === 'provider' ? providerId ?? `provider-${Date.now()}` : undefined,
      providerType: clientRole === 'provider' ? providerType ?? 'cdp' : undefined,
    };
    clients.set(ws, client);

    // Notify about connection
    const connEvent = {
      protocolVersion: 1,
      sessionId,
      timestamp: Date.now(),
      origin: 'server',
      type: 'connection_event',
      event:
        clientRole === 'app' ? 'app_connected' : clientRole === 'provider' ? 'provider_connected' : 'agent_connected',
      appId: clientRole === 'app' ? appId : undefined,
      providerId: client.providerId,
      providerType: client.providerType,
      connectedApps: getApps(sessionId).map(c => c.appId!),
      connectedProviders: clients.providers(sessionId).map(c => ({ providerId: c.providerId, providerType: c.providerType })),
      connectedAgents: clients.agents(sessionId).length,
    };

    // Broadcast connection event to all in session except sender
    for (const [clientWs, c] of clients.entries()) {
      if (c.sessionId === sessionId && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(connEvent));
      }
    }

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeMessage;
        const sender = clients.get(ws);
        if (!sender) return;

        // Route messages by sender role. Agents command app or browser providers; providers/apps emit to agents.
        if (sender.role === 'agent') {
          broadcastToRole(sender.sessionId, isBrowserCommand(msg) ? 'provider' : 'app', data.toString(), ws);
        } else {
          broadcastToRole(sender.sessionId, 'agent', data.toString(), ws);
        }

        // Also call callbacks for CLI display (backward compatibility)
        if (sender.role === 'app') {
          if (msg.type === 'hello') {
            callbacks.onAppConnected(msg as HelloMessage);
          } else if (msg.type === 'command_result') {
            callbacks.onCommandResult(msg as CommandResultMessage);
          } else {
            callbacks.onTelemetry(msg);
          }
        } else if (sender.role === 'provider') {
          if (msg.type === 'browser_result') {
            callbacks.onCommandResult(msg as BrowserResultMessage);
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
          event:
            client.role === 'app'
              ? 'app_disconnected'
              : client.role === 'provider'
                ? 'provider_disconnected'
                : 'agent_disconnected',
          appId: client.role === 'app' ? client.appId : undefined,
          providerId: client.role === 'provider' ? client.providerId : undefined,
          providerType: client.role === 'provider' ? client.providerType : undefined,
        };

        for (const [clientWs, c] of clients.entries()) {
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
    sendCommand: (cmd: CommandMessage | BridgeMessage) => {
      // The CLI acts as an agent. Browser-scoped commands go to providers.
      broadcastToRole(config.session, isBrowserCommand(cmd) ? 'provider' : 'app', JSON.stringify(cmd));
    },
    close: () => {
      wss.close();
    },
  };
}
