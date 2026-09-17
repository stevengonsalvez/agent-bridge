# debug-bridge-cli

CLI for debug-bridge: WebSocket server, autonomous browser control, and in-browser Design Mode for AI agents.

## Installation

```bash
npm install -g debug-bridge-cli
```

Or run directly with npx:

```bash
npx debug-bridge-cli connect --port 4000 --cdp --browser managed
```

## Quick Start (Zero-Instrumentation Sidecar)

No changes to your web application are required.

### 1. Start Server with Browser Sidecar

```bash
debug-bridge connect --port 4000 --cdp --browser managed
```

Key Options:
- `-p, --port <number>`: Port to listen on (default: 4000)
- `-s, --session <string>`: Internal bridge session ID for multiplexing (default: 'default')
- `--cdp`: Enable Chrome DevTools Protocol sidecar provider
- `--browser <mode>`: Browser sidecar mode: `managed`, `connect`, or `none` (default: `managed`)
- `--headless`: Run managed browser headlessly (default: true)
- `--headed`: Run managed browser with a visible window
- `--json`: Output JSON for agent automation

> **Important**: The `--session` flag is an internal multiplexing identifier between the CLI and bridge server. Browser URLs require NO query parameters (`?session=` or `?port=`).

### 2. Open App in Managed Browser

```bash
debug-bridge browser open "http://localhost:5173" --port 4000
```

### 3. Inspect, Click, and Patch

```bash
# Capture numbered interactive elements tree (@e1, @e2, ...)
debug-bridge browser snapshot --port 4000

# Click or fill elements by handle
debug-bridge browser click @e1 --port 4000
debug-bridge browser fill @e2 "user@example.com" --port 4000

# Capture screenshot
debug-bridge browser screenshot --out ./screenshot.png --port 4000

# Inject temporary CSS preview patch
debug-bridge browser preview-patch --css "button { background: #2563eb !important; }" --port 4000
```

### 4. In-Browser Design Mode (cmux-style)

```bash
# Enable in-browser Design Mode
debug-bridge browser design-mode enable --port 4000

# Check status and current multi-element selections
debug-bridge browser design-mode status --port 4000

# Quick Render live styles into page
debug-bridge browser design-mode quick-render --port 4000

# Copy formatted prompt for agent to clipboard
debug-bridge browser design-mode copy-prompt -r "Make header navy and enlarge CTA" --port 4000
```

### Interactive REPL Commands


Once an app is connected, use these commands:

```
debug> ui                    # Get interactive UI elements
debug> find login            # Search for elements matching "login"
debug> click button-abc123   # Click element by stableId
debug> type input-xyz "hello" # Type text into input
debug> screenshot            # Capture viewport screenshot
debug> state                 # Get cookies, localStorage, etc.
debug> eval document.title   # Execute JavaScript
debug> navigate https://...  # Navigate to URL
debug> help                  # Show all commands
```

### Command Aliases

| Command | Aliases |
|---------|---------|
| `ui` | `tree` |
| `eval` | `js` |
| `snapshot` | `dom` |
| `screenshot` | `ss` |
| `navigate` | `goto`, `go` |
| `find` | `search` |
| `help` | `?` |

### JSON Mode

For programmatic use (e.g., piping to other tools):

```bash
debug-bridge connect --session myapp --json
```

In JSON mode:
- All output is JSON-formatted
- Input can be JSON command objects
- Screenshots are saved to files

### Example Session

```bash
$ debug-bridge connect --session demo

🔌 Debug Bridge v0.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Server: ws://localhost:4000/debug
Session: demo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Waiting for app connection...
Type "help" for available commands.

✓ Connected: My App 1.0.0
  URL: http://localhost:5173/
  Viewport: 1920x1080

debug> ui
[ui_tree] 6 elements
   1. [button   ] login-btn     "Sign In"
   2. [input    ] email-input   placeholder: "Email"
   3. [input    ] password-input placeholder: "Password"
   4. [a        ] forgot-pwd    "Forgot password?"
   5. [a        ] signup-link   "Create account"
   6. [button   ] theme-toggle  [Toggle theme]

debug> click login-btn
✓ click (12ms)

debug> screenshot
[screenshot] 1920x1080 saved to screenshot-1704067200000.png
```

## Programmatic Usage

```typescript
import { startServer } from 'debug-bridge-cli';

const server = startServer(
  { port: 4000, host: 'localhost', session: 'myapp', json: false },
  {
    onAppConnected: (hello) => console.log('App connected:', hello.appName),
    onAppDisconnected: () => console.log('App disconnected'),
    onTelemetry: (msg) => console.log('Telemetry:', msg.type),
    onCommandResult: (msg) => console.log('Result:', msg.success),
  }
);

// Send a command
server.sendCommand({
  type: 'click',
  target: { stableId: 'login-btn' },
  requestId: 'cmd-1',
  protocolVersion: 1,
  sessionId: 'myapp',
  timestamp: Date.now(),
});

// Cleanup
server.close();
```

## License

MIT
