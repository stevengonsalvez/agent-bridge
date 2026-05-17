import type { BrowserCommandMessage, BridgeMessage, ProviderType } from 'debug-bridge-types';

export type ClientRole = 'app' | 'agent' | 'provider';

export type ClientRecord<TSocket> = {
  ws: TSocket;
  role: ClientRole;
  sessionId: string;
  appId?: string;
  providerId?: string;
  providerType?: ProviderType;
};

export class ProviderRegistry<TSocket> {
  private readonly clients = new Map<TSocket, ClientRecord<TSocket>>();

  set(ws: TSocket, client: ClientRecord<TSocket>): void {
    this.clients.set(ws, client);
  }

  get(ws: TSocket): ClientRecord<TSocket> | undefined {
    return this.clients.get(ws);
  }

  delete(ws: TSocket): ClientRecord<TSocket> | undefined {
    const client = this.clients.get(ws);
    this.clients.delete(ws);
    return client;
  }

  values(): ClientRecord<TSocket>[] {
    return [...this.clients.values()];
  }

  entries(): [TSocket, ClientRecord<TSocket>][] {
    return [...this.clients.entries()];
  }

  apps(sessionId: string): ClientRecord<TSocket>[] {
    return this.values().filter((client) => client.sessionId === sessionId && client.role === 'app');
  }

  agents(sessionId: string): ClientRecord<TSocket>[] {
    return this.values().filter((client) => client.sessionId === sessionId && client.role === 'agent');
  }

  providers(sessionId: string, providerType?: ProviderType): ClientRecord<TSocket>[] {
    return this.values().filter(
      (client) =>
        client.sessionId === sessionId &&
        client.role === 'provider' &&
        (!providerType || client.providerType === providerType)
    );
  }
}

export function isBrowserCommand(msg: BridgeMessage): msg is BrowserCommandMessage {
  return msg.type.startsWith('browser_') || msg.type === 'cdp_send';
}
