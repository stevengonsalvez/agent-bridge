# Debug Bridge

AI-friendly debugging for web applications. Enables LLM agents to inspect, interact with, and control web apps via WebSocket.

## Quick Start

### 1. Install the CLI

```bash
npm install -g debug-bridge-cli
```

### 2. Add to your web app

```bash
npm install debug-bridge-browser
```

```typescript
// src/debug-bridge.ts
import { createDebugBridge } from 'debug-bridge-browser';

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

Import it in your app entry point:

```typescript
// main.tsx
import './debug-bridge';
```

### 3. Start debugging

```bash
# Terminal 1: Start the debug server
debug-bridge connect --session myapp

# Terminal 2: Start your app
npm run dev

# Terminal 3: Open browser with debug params
open "http://localhost:5173?session=myapp&port=4000"
```

### 4. Use CLI commands

```
debug> ui                    # Get UI tree (interactive elements)
debug> find login            # Search for elements matching "login"
debug> click button-abc123   # Click element by stableId
debug> type input-xyz "hello" # Type text into input
debug> screenshot            # Capture viewport
debug> state                 # Get app state (cookies, localStorage, etc.)
debug> eval document.title   # Execute JavaScript
debug> help                  # Show all commands
```

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| `debug-bridge-cli` | CLI with WebSocket server | `npm install -g debug-bridge-cli` |
| `debug-bridge-browser` | Browser SDK | `npm install debug-bridge-browser` |
| `debug-bridge-types` | TypeScript types | `npm install debug-bridge-types` |

## How It Works

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   Your Web App  │◄──────────────────►│  Debug Bridge   │
│  (browser SDK)  │                    │     Server      │
└─────────────────┘                    └────────┬────────┘
                                                │
                                       ┌────────▼────────┐
                                       │    CLI / Agent  │
                                       │  (sends cmds)   │
                                       └─────────────────┘
```

1. **Browser SDK** connects to the Debug Bridge server via WebSocket
2. **Server** routes messages between your app and the CLI/agent
3. **CLI/Agent** sends commands (click, type, screenshot) and receives telemetry

## Browser SDK Configuration

```typescript
const bridge = createDebugBridge({
  // Required
  url: 'ws://localhost:4000/debug?role=app&sessionId=myapp',
  sessionId: 'myapp',

  // Optional
  appName: 'My App',
  appVersion: '1.0.0',
  enableEval: false,              // Enable JavaScript execution (security risk)
  enableDomSnapshot: true,        // Send DOM snapshots
  enableDomMutations: true,       // Track DOM changes
  enableUiTree: true,             // Build interactive element tree
  enableConsole: true,            // Forward console logs
  enableErrors: true,             // Forward errors

  // Custom state provider (for auth, cart, etc.)
  getCustomState: () => ({
    user: { id: '123', name: 'John' },
    cart: { items: 3 },
  }),

  // Custom stable ID generator for elements
  getStableId: (el) => el.getAttribute('data-testid'),

  // Callbacks
  onConnect: () => console.log('Connected'),
  onDisconnect: () => console.log('Disconnected'),
  onError: (err) => console.error(err),
});
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `ui` / `tree` | Get interactive UI elements |
| `find <query>` | Search cached UI tree |
| `click <id>` | Click element by stableId |
| `type <id> <text>` | Type text into element |
| `eval <code>` / `js` | Execute JavaScript |
| `snapshot` / `dom` | Get full DOM HTML |
| `screenshot` / `ss` | Capture viewport |
| `state [scope]` | Get application state |
| `navigate <url>` / `go` | Navigate to URL |
| `focus <id>` | Focus an element |
| `scroll <x> <y>` | Scroll to position |
| `clear` | Clear console |
| `help` / `?` | Show help |

## Agent Integration

For programmatic control (e.g., from Claude Code or other AI agents), connect via WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:4000/debug?role=agent&sessionId=myapp');

// Get UI tree
ws.send(JSON.stringify({
  type: 'request_ui_tree',
  requestId: '1',
  protocolVersion: 1,
  sessionId: 'myapp',
  timestamp: Date.now()
}));

// Click element
ws.send(JSON.stringify({
  type: 'click',
  target: { stableId: 'login-button' },
  requestId: '2',
  protocolVersion: 1,
  sessionId: 'myapp',
  timestamp: Date.now()
}));
```

## Documentation

- [Protocol Specification](./spec.md)
- [Architecture](./docs/architecture.md)

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run in development mode
pnpm run dev
```

## License

MIT
