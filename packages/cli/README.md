# debug-bridge-cli

CLI for debug-bridge: WebSocket server, autonomous browser control, and in-browser Design Mode for AI agents.

## Installation

The npm release `debug-bridge-cli@0.1.2` has only the `connect` command (no `browser`, `design-mode`, or `skill`); this repo is 0.2.0. Build from the repo until a new release is published:

```bash
pnpm install && pnpm run build
node packages/cli/dist/bin/cli.js --help
```

The examples below write `debug-bridge` for that binary. (`npm install -g debug-bridge-cli` installs 0.1.2, which lacks these commands.)

## Quick Start (Zero-Instrumentation Sidecar)

No changes to your web application are required. Full command reference: [docs/cli-reference.md](../../docs/cli-reference.md).

### 1. Open your app in the managed browser

```bash
debug-bridge browser open "http://localhost:5173" --port 4000
```

If nothing is listening on the port, this starts the bridge and a managed Chrome in the same process and keeps running. Design Mode turns on automatically.

To run the bridge separately, use `connect`:

```bash
debug-bridge connect --port 4000 --cdp --browser managed
```

Key options: `-p, --port` (default 4000), `-s, --session` (default `default`), `--cdp`, `--browser managed|connect|none` (default `managed`), `--headed` (default) / `--headless`, `--profile`, `--json`. The `--session` flag is an internal multiplexing identifier; browser URLs need no query parameters.

### 2. Inspect, click, and patch

```bash
debug-bridge browser snapshot --port 4000          # @e1, @e2, ...
debug-bridge browser click @e1 --port 4000
debug-bridge browser fill @e2 "user@example.com" --port 4000
debug-bridge browser screenshot --out ./screenshot.png --port 4000
debug-bridge browser preview-patch --css "button { background: #2563eb !important; }" --port 4000
```

### 3. Receive requests from the Design Mode dock

```bash
debug-bridge browser wait --port 4000 --session default
```

Blocks until **Send** is pressed in the dock. Exit `0`: request received (change, page URL, artifact paths, and prompt are printed). Exit `1`: timeout (`--timeout`, default 1800000 ms). Exit `2`: bridge unreachable or closed. It is single-shot, so agents re-arm it first after each request, then handle it, then report back with `debug-bridge browser design-mode done "<summary>"` (or `error`) so the dock leaves its Working state ([docs/agent-loop.md](../../docs/agent-loop.md)).

When an agent runs the `wait` loop, start the bridge with tmux injection off so prompts are not typed into another pane or delivered twice ([docs/tmux-injection.md](../../docs/tmux-injection.md)):

```bash
AGENT_BRIDGE_TMUX_TARGET=none debug-bridge connect --port 4000 --cdp --browser managed
```

### 4. Design Mode from the CLI

```bash
debug-bridge browser design-mode status --port 4000
debug-bridge browser design-mode quick-render --port 4000
debug-bridge browser design-mode copy-prompt -r "Make header navy and enlarge CTA" --port 4000
```

### 5. Install the AI agent skill

Use the `skills` CLI, which installs the current `SKILL.md` from this repo:

```bash
npx skills add stevengonsalvez/agent-bridge --skill debug-bridge -g -y
```

`debug-bridge-skill` is not published to npm, so `npx debug-bridge-skill` does not work. Prefer the command above.

### Interactive REPL Commands (embedded-SDK apps)

After `debug-bridge connect`, an app running the optional `debug-bridge-browser` SDK can be driven from the prompt. These commands do not act on the sidecar browser (use `debug-bridge browser ...` for that):

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
| `clear` | `cls` |
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
