import type { BrowserCommandMessage, BridgeMessage } from 'debug-bridge-types';
import { PROTOCOL_VERSION } from 'debug-bridge-types';
import { PlaywrightProvider } from './providers/playwright-provider';
import { SidecarClient } from './session/sidecar-client';

export type BrowserSidecarOptions = {
  host: string;
  port: number;
  sessionId: string;
  providerId?: string;
  profile?: string;
  mode?: 'managed' | 'connect';
  cdpEndpoint?: string;
  storageState?: string;
  headless?: boolean;
};

export type BrowserSidecar = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function createBrowserSidecar(options: BrowserSidecarOptions): BrowserSidecar {
  const providerId = options.providerId ?? 'cdp-default';
  let client: SidecarClient | null = null;
  let provider: PlaywrightProvider | null = null;

  const base = (type: string) => ({
    protocolVersion: PROTOCOL_VERSION,
    sessionId: options.sessionId,
    timestamp: Date.now(),
    type,
  });

  const send = (msg: Record<string, unknown> & { type: string }) => {
    client?.send({
      ...base(msg.type),
      ...msg,
    } as BridgeMessage);
  };

  return {
    start: async () => {
      provider = new PlaywrightProvider({
        sessionId: options.sessionId,
        providerId,
        profile: options.profile ?? 'agent-bridge-default',
        mode: options.mode ?? 'managed',
        cdpEndpoint: options.cdpEndpoint,
        storageState: options.storageState,
        headless: options.headless ?? true,
        send,
      });

      await provider.start();

      const wsUrl = `ws://${options.host}:${options.port}/debug?sessionId=${encodeURIComponent(options.sessionId)}&role=provider&providerType=cdp&providerId=${encodeURIComponent(providerId)}`;
      client = new SidecarClient({
        url: wsUrl,
        onOpen: () => {
          send({
            type: 'provider_hello',
            providerId,
            providerType: 'cdp',
            capabilities: provider?.capabilities ?? [],
            target: provider?.selectedTarget(),
            profile: options.profile ?? 'agent-bridge-default',
          });
          send({
            type: 'provider_lifecycle',
            providerId,
            providerType: 'cdp',
            state: 'connected',
            target: provider?.selectedTarget(),
          });
        },
        onMessage: async (msg) => {
          if (isBrowserCommand(msg)) {
            await provider?.execute(msg);
          }
        },
        onClose: () => {
          send({
            type: 'provider_lifecycle',
            providerId,
            providerType: 'cdp',
            state: 'detached',
          });
        },
      });
      client.connect();
    },
    stop: async () => {
      client?.close();
      await provider?.stop();
      client = null;
      provider = null;
    },
  };
}

function isBrowserCommand(msg: BridgeMessage): msg is BrowserCommandMessage {
  return msg.type.startsWith('browser_') || msg.type === 'cdp_send';
}
