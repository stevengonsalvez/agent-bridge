# debug-bridge-browser

Browser SDK for debug-bridge - enables AI agents to inspect and control web applications.

## Installation

```bash
npm install debug-bridge-browser
```

## Quick Start

```typescript
import { createDebugBridge } from 'debug-bridge-browser';

// Only enable in development
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session') || 'debug';
  const port = params.get('port') || '4000';

  const bridge = createDebugBridge({
    url: `ws://localhost:${port}/debug?role=app&sessionId=${sessionId}`,
    sessionId,
    appName: 'My App',
  });

  bridge.connect();
}
```

## Configuration Options

```typescript
interface DebugBridgeConfig {
  // Required
  url: string;                    // WebSocket URL
  sessionId: string;              // Session identifier

  // App identification
  appName?: string;               // App name shown in CLI
  appVersion?: string;            // App version

  // Features (all default to true except enableEval)
  enableDomSnapshot?: boolean;    // Send initial DOM snapshot
  enableDomMutations?: boolean;   // Track DOM changes
  enableUiTree?: boolean;         // Build interactive element tree
  enableConsole?: boolean;        // Forward console logs
  enableErrors?: boolean;         // Forward runtime errors
  enableEval?: boolean;           // Allow JS execution (default: false)

  // Tuning
  domMutationBatchMs?: number;    // Batch mutations (default: 100ms)
  maxConsoleArgs?: number;        // Max console args (default: 10)
  maxConsoleArgLength?: number;   // Max arg length (default: 1000)
  maxDomSnapshotSize?: number;    // Max snapshot size (default: 5MB)

  // Custom state
  getCustomState?: () => Record<string, unknown>;
  getStableId?: (el: Element) => string | null;

  // Callbacks
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}
```

## API

### createDebugBridge(config)

Creates a debug bridge instance.

```typescript
const bridge = createDebugBridge({
  url: 'ws://localhost:4000/debug?role=app&sessionId=myapp',
  sessionId: 'myapp',
  appName: 'My App',
});
```

### bridge.connect()

Connects to the debug server.

```typescript
bridge.connect();
```

### bridge.disconnect()

Disconnects from the debug server.

```typescript
bridge.disconnect();
```

### bridge.isConnected()

Returns whether the bridge is connected.

```typescript
if (bridge.isConnected()) {
  console.log('Connected!');
}
```

### bridge.sendState(scope, state)

Sends custom state updates.

```typescript
bridge.sendState('cart', { items: 3, total: 99.99 });
bridge.sendState('user', { id: '123', name: 'John' });
```

## Custom State Provider

For reactive state updates, use `getCustomState`:

```typescript
const bridge = createDebugBridge({
  url: 'ws://localhost:4000/debug?role=app&sessionId=myapp',
  sessionId: 'myapp',

  getCustomState: () => ({
    // Return current state from your state management
    auth: useAuthStore.getState(),
    cart: useCartStore.getState(),
    route: window.location.pathname,
  }),
});
```

For React/Zustand integration with live updates:

```typescript
// Subscribe to store changes
useAuthStore.subscribe(() => {
  bridge.sendState('auth', useAuthStore.getState());
});

useCartStore.subscribe(() => {
  bridge.sendState('cart', useCartStore.getState());
});
```

## Custom Stable IDs

By default, the SDK generates stable IDs from:
1. `data-testid` attribute
2. Element `id` (if not auto-generated)
3. Role + content hash

You can customize this:

```typescript
const bridge = createDebugBridge({
  url: 'ws://localhost:4000/debug?role=app&sessionId=myapp',
  sessionId: 'myapp',

  getStableId: (el) => {
    // Prefer data-cy for Cypress compatibility
    return el.getAttribute('data-cy') ||
           el.getAttribute('data-testid') ||
           null; // Fall back to default
  },
});
```

## Supported Commands

The SDK responds to these commands from the CLI/agent:

| Command | Description |
|---------|-------------|
| `request_ui_tree` | Returns interactive elements |
| `click` | Clicks element by stableId/selector/text |
| `type` | Types text into input element |
| `navigate` | Changes page URL |
| `evaluate` | Executes JavaScript (if enabled) |
| `scroll` | Scrolls to position |
| `hover` | Hovers over element |
| `select` | Selects option in dropdown |
| `focus` | Focuses element |
| `request_dom_snapshot` | Returns full DOM HTML |
| `request_screenshot` | Captures viewport image |
| `request_state` | Returns app/browser state |

## TypeScript

Full TypeScript support is included. Import types from `debug-bridge-types`:

```typescript
import type { DebugBridgeConfig, UiTreeItem } from 'debug-bridge-types';
```

## License

MIT
