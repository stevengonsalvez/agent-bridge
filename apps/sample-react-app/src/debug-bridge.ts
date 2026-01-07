import { createDebugBridge } from 'debug-bridge-browser';
import { useStore } from './store';

export function initDebugBridge() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session') ?? 'default';
  const port = params.get('port') ?? '4000';

  const bridge = createDebugBridge({
    url: `ws://localhost:${port}/debug?sessionId=${sessionId}`,
    sessionId,
    appName: 'Sample React App',
    appVersion: '0.1.0',
    enableEval: true,
    getCustomState: () => ({
      auth: useStore.getState().auth,
      cart: useStore.getState().cart,
      route: window.location.pathname,
    }),
    onConnect: () => console.log('[DebugBridge] Connected'),
    onDisconnect: () => console.log('[DebugBridge] Disconnected'),
  });

  bridge.connect();

  useStore.subscribe(() => {
    bridge.sendState('auth', useStore.getState().auth);
    bridge.sendState('cart', useStore.getState().cart);
  });

  (window as unknown as { __debugBridge: typeof bridge }).__debugBridge = bridge;
}
