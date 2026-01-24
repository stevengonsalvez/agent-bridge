import type {
  DebugBridgeConfig,
  BridgeMessage,
  CommandMessage,
  Capability,
} from 'debug-bridge-types';
import { PROTOCOL_VERSION } from 'debug-bridge-types';
import { DomObserver } from './telemetry/dom-observer';
import { UiTreeBuilder } from './telemetry/ui-tree';
import { ConsoleHook } from './telemetry/console-hook';
import { ErrorHook } from './telemetry/error-hook';
import { NetworkHook } from './telemetry/network-hook';
import { NavigationHook } from './telemetry/navigation-hook';
import { CommandExecutor } from './commands/executor';

export type DebugBridge = {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
  sendState: (scope: string, state: unknown) => void;
};

export function createDebugBridge(config: DebugBridgeConfig): DebugBridge {
  const resolvedConfig = {
    enableDomSnapshot: true,
    enableDomMutations: true,
    enableUiTree: true,
    enableConsole: true,
    enableErrors: true,
    enableEval: false,
    enableNetwork: true,
    enableNavigation: true,
    domMutationBatchMs: 100,
    maxConsoleArgs: 10,
    maxConsoleArgLength: 1000,
    maxDomSnapshotSize: 5 * 1024 * 1024,
    maxNetworkBodySize: 10000,
    ...config,
  };

  let ws: WebSocket | null = null;
  let domObserver: DomObserver | null = null;
  let consoleHook: ConsoleHook | null = null;
  let errorHook: ErrorHook | null = null;
  let networkHook: NetworkHook | null = null;
  let navigationHook: NavigationHook | null = null;
  let commandExecutor: CommandExecutor | null = null;

  const send = (msg: Partial<BridgeMessage> & { type: string }) => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        sessionId: resolvedConfig.sessionId,
        timestamp: Date.now(),
        ...msg,
      })
    );
  };

  const connect = () => {
    if (ws?.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(resolvedConfig.url);

    ws.onopen = () => {
      send({
        type: 'hello',
        appName: resolvedConfig.appName,
        appVersion: resolvedConfig.appVersion,
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });

      const capabilities: Capability[] = [];
      if (resolvedConfig.enableDomSnapshot) capabilities.push('dom_snapshot');
      if (resolvedConfig.enableDomMutations) capabilities.push('dom_mutations');
      if (resolvedConfig.enableUiTree) capabilities.push('ui_tree');
      if (resolvedConfig.enableConsole) capabilities.push('console');
      if (resolvedConfig.enableErrors) capabilities.push('errors');
      if (resolvedConfig.enableEval) capabilities.push('eval');
      if (resolvedConfig.getCustomState) capabilities.push('custom_state');
      if (resolvedConfig.enableNetwork) capabilities.push('network');
      if (resolvedConfig.enableNavigation) capabilities.push('navigation');
      send({ type: 'capabilities', capabilities });

      if (resolvedConfig.enableDomSnapshot) {
        const html = document.documentElement.outerHTML;
        send({
          type: 'dom_snapshot',
          html: html.substring(0, resolvedConfig.maxDomSnapshotSize),
        });
      }

      if (resolvedConfig.enableUiTree) {
        send({ type: 'ui_tree', items: UiTreeBuilder.build(resolvedConfig.getStableId) });
      }

      if (resolvedConfig.getCustomState) {
        const state = resolvedConfig.getCustomState();
        for (const [scope, value] of Object.entries(state)) {
          send({ type: 'state_update', scope, state: value });
        }
      }

      if (resolvedConfig.enableDomMutations) {
        domObserver = new DomObserver((mutations) => {
          send({ type: 'dom_mutations', batchId: String(Date.now()), mutations });
        }, resolvedConfig.domMutationBatchMs);
        domObserver.start();
      }

      if (resolvedConfig.enableConsole) {
        consoleHook = new ConsoleHook(
          (level, args) => {
            send({ type: 'console', level, args });
          },
          resolvedConfig.maxConsoleArgs,
          resolvedConfig.maxConsoleArgLength
        );
        consoleHook.start();
      }

      if (resolvedConfig.enableErrors) {
        errorHook = new ErrorHook((errorMsg) => {
          send(errorMsg);
        });
        errorHook.start();
      }

      if (resolvedConfig.enableNetwork) {
        networkHook = new NetworkHook(
          (request) => {
            send({
              type: 'network_request',
              requestId: request.requestId,
              method: request.method,
              url: request.url,
              headers: request.headers,
              body: request.body,
              initiator: request.initiator,
            });
          },
          (response) => {
            send({
              type: 'network_response',
              requestId: response.requestId,
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              body: response.body,
              duration: response.duration,
              ok: response.ok,
            });
          },
          resolvedConfig.maxNetworkBodySize ?? 10000,
          resolvedConfig.networkUrlFilter
        );
        networkHook.start();
      }

      if (resolvedConfig.enableNavigation) {
        navigationHook = new NavigationHook((event) => {
          send({
            type: 'navigation',
            url: event.url,
            previousUrl: event.previousUrl,
            trigger: event.trigger,
          });
        });
        navigationHook.start();
      }

      commandExecutor = new CommandExecutor(resolvedConfig, send);

      resolvedConfig.onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as CommandMessage;
        commandExecutor?.execute(msg);
      } catch {
        // Ignore
      }
    };

    ws.onclose = () => {
      cleanup();
      resolvedConfig.onDisconnect?.();
    };

    ws.onerror = () => {
      resolvedConfig.onError?.(new Error('WebSocket error'));
    };
  };

  const disconnect = () => {
    cleanup();
    ws?.close();
    ws = null;
  };

  const cleanup = () => {
    domObserver?.stop();
    domObserver = null;
    consoleHook?.stop();
    consoleHook = null;
    errorHook?.stop();
    errorHook = null;
    networkHook?.stop();
    networkHook = null;
    navigationHook?.stop();
    navigationHook = null;
  };

  return {
    connect,
    disconnect,
    isConnected: () => ws?.readyState === WebSocket.OPEN,
    sendState: (scope, state) => send({ type: 'state_update', scope, state }),
  };
}
