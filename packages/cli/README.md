# debug-bridge-cli

CLI for debug-bridge - WebSocket server for AI agent debugging of web applications.

## Installation

```bash
npm install -g debug-bridge-cli
```

Or run directly with npx:

```bash
npx debug-bridge-cli connect --session myapp
```

## Usage

### Start the Server

```bash
debug-bridge connect --session myapp
```

Options:
- `-p, --port <number>` - Port to listen on (default: 4000)
- `-s, --session <string>` - Session ID (default: 'default')
- `--host <string>` - Host to bind to (default: 'localhost')
- `--json` - Output JSON for programmatic use

### Connect Your App

Open your web app with debug params:

```
http://localhost:5173?session=myapp&port=4000
```

### Interactive Commands

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
