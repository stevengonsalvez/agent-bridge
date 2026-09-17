# Debug Bridge

AI-friendly debugging, autonomous browser control, visual feedback annotations, and in-browser Design Mode for web applications. Enables LLM agents to inspect, interact with, and control web apps.

## Quick Start (Zero-Instrumentation Sidecar - Recommended)

No code modifications needed in your application. Debug Bridge drives a managed browser via CDP and exposes numbered interactive handles (`@e1`, `@e2`), live CSS preview patches, and in-browser Design Mode with multi-element batching.

### 1. Install the CLI

```bash
npm install -g debug-bridge-cli
```

### 2. Start Bridge Server with Browser Sidecar

```bash
# Start the bridge server with managed browser sidecar
PORT=4000
debug-bridge connect --port $PORT --cdp --browser managed
```

### 3. Open Your Web App

Navigate to any local or remote web app. No query parameters (`?session=`, `?port=`) are needed:

```bash
# Open URL in managed browser
debug-bridge browser open "http://localhost:5173" --port 4000
```

### 4. Inspect, Control, and Patch

```bash
# Capture numbered interactive elements tree (@e1, @e2, ...)
debug-bridge browser snapshot --port 4000

# Click or fill elements by handle or selector
debug-bridge browser click @e1 --port 4000
debug-bridge browser fill @e2 "user@example.com" --port 4000

# Capture screenshot
debug-bridge browser screenshot --out ./screenshot.png --port 4000

# Inject temporary CSS preview patch
debug-bridge browser preview-patch --css "button { background: #2563eb !important; }" --port 4000
```

### 5. In-Browser Design Mode (cmux-style)

```bash
# Enable in-browser Design Mode
debug-bridge browser design-mode enable --port 4000

# Inspect selections and triggered tweaks
debug-bridge browser design-mode status --port 4000

# Inject live quick render preview styles
debug-bridge browser design-mode quick-render --port 4000

# Copy formatted batch prompt for agent to clipboard
debug-bridge browser design-mode copy-prompt -r "Make header navy and enlarge CTA" --port 4000
```

---

## Alternative: Optional Embedded Browser SDK

For projects that want in-app telemetry or custom state providers directly inside their source tree:

```bash
npm install debug-bridge-browser
```

```typescript
// src/debug-bridge.ts
import { createDebugBridge } from 'debug-bridge-browser';

// Auto-connects in DEV without requiring query parameters
if (import.meta.env.DEV) {
  const bridge = createDebugBridge({
    url: 'ws://localhost:4000/debug?role=app&sessionId=default',
    sessionId: 'default',
    appName: 'My App',
  });

  bridge.connect();
}
```

> **Note**: Page URLs stay clean (`http://localhost:5173/`). Query parameters like `?session=` or `?port=` are never required.


## Packages

| Package | Description | Install |
|---------|-------------|---------|
| `debug-bridge-cli` | CLI with WebSocket server & browser commands | `npm install -g debug-bridge-cli` |
| `debug-bridge-browser-sidecar` | Playwright-driven CDP sidecar provider | `npm install debug-bridge-browser-sidecar` |
| `debug-bridge-feedback-mcp` | MCP server for Claude Code and agent runners | `npm install debug-bridge-feedback-mcp` |
| `debug-bridge-browser` | Optional in-app browser SDK | `npm install debug-bridge-browser` |
| `debug-bridge-types` | TypeScript protocol definitions | `npm install debug-bridge-types` |

## How It Works

```
┌─────────────────┐       CDP / WS       ┌─────────────────┐       CDP / DOM      ┌─────────────────┐
│    AI Agent     │ ◄──────────────────► │  Debug Bridge   │ ◄──────────────────► │ Target Browser  │
│ (Claude/Codex)  │                      │ (Server+Sidecar)│                      │ (Pure Sidecar)  │
└─────────────────┘                      └─────────────────┘                      └─────────────────┘
```

1. **Zero-Instrumentation (Default)**: Playwright CDP sidecar controls any web app directly from outside. URLs remain clean (`http://localhost:5173/`) without query parameters.
2. **Design Mode (cmux-style)**: Injected inspector overlay supporting multi-element batching (`@e1`, `@e2`), live quick render style patches, and one-click copy prompt formatting.
3. **Optional In-App SDK**: For teams wanting custom state providers or embedded feedback launcher inside development builds.


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

## AI Agent Integration

Debug Bridge includes a skill/plugin system for seamless integration with AI coding assistants.

### Installation for AI Assistants

#### Claude Code (Recommended)

**Method 1: From GitHub Marketplace (Recommended)**

```bash
# 1. Add the agent-bridge marketplace
/plugin marketplace add stevengonsalvez/agent-bridge

# 2. Install the debug-bridge plugin
/plugin install debug-bridge@agent-bridge-marketplace
```

**Method 2: Local Development/Testing**

```bash
# Use during development or testing
claude --plugin-dir /path/to/agent-bridge
```

**Method 3: Manual Installation**

```bash
# Clone and manually copy
git clone https://github.com/stevengonsalvez/agent-bridge.git
cp -r agent-bridge/.claude-plugin ~/.claude/plugins/debug-bridge
cp -r agent-bridge/skills ~/.claude/plugins/debug-bridge/
```

After installation, trigger the skill by saying:
- "Debug the app"
- "Inspect the UI"
- "Take a screenshot of the page"
- "Click the login button"
- "Automate this workflow"

#### Cursor

```bash
cp -r skills/debug-bridge ~/.cursor/skills/
```

#### Codex

```bash
cp -r skills/debug-bridge ~/.codex/skills/
```

#### VS Code / GitHub Copilot

```bash
cp -r skills/debug-bridge .github/skills/
```

### Skill Documentation

See [`skills/debug-bridge/SKILL.md`](./skills/debug-bridge/SKILL.md) for complete documentation including:
- All available commands with parameters
- Error handling and recovery patterns
- Workflow examples (login, form filling, etc.)
- Troubleshooting guide

### Programmatic WebSocket API

For direct programmatic control, connect via WebSocket:

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

// Type text with options
ws.send(JSON.stringify({
  type: 'type',
  target: { stableId: 'email-input' },
  text: 'user@example.com',
  options: { clear: true, pressEnter: false },
  requestId: '3',
  protocolVersion: 1,
  sessionId: 'myapp',
  timestamp: Date.now()
}));

// Take screenshot
ws.send(JSON.stringify({
  type: 'request_screenshot',
  fullPage: true,
  requestId: '4',
  protocolVersion: 1,
  sessionId: 'myapp',
  timestamp: Date.now()
}));
```

### Available Commands

| Command | Description | Key Parameters |
|---------|-------------|----------------|
| `request_ui_tree` | Get interactive elements | - |
| `click` | Click element | `target: { stableId?, selector?, text? }` |
| `type` | Type text | `target, text, options: { clear?, delay?, pressEnter? }` |
| `hover` | Hover over element | `target` |
| `select` | Select dropdown option | `target, value?, label?, index?` |
| `focus` | Focus element | `target` |
| `scroll` | Scroll page/element | `target?, x?, y?` |
| `navigate` | Go to URL | `url` |
| `evaluate` | Execute JavaScript | `code` |
| `request_screenshot` | Capture viewport | `selector?, fullPage?` |
| `request_state` | Get cookies/localStorage | `scope?` |
| `request_dom_snapshot` | Get full HTML | - |

### Error Handling

Commands return structured error responses:

```json
{
  "type": "command_result",
  "success": false,
  "error": {
    "code": "TARGET_NOT_FOUND",
    "message": "Element not found"
  }
}
```

Error codes: `TARGET_NOT_FOUND`, `TARGET_NOT_VISIBLE`, `TARGET_DISABLED`, `TIMEOUT`, `EVAL_DISABLED`, `EVAL_ERROR`, `NAVIGATION_FAILED`, `INVALID_COMMAND`

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

## Plugin Publishing

### How Publishing Works

Debug Bridge uses **GitHub as a plugin marketplace**. There's no central registry - your GitHub repository acts as the distribution source.

**Publishing Flow:**

1. **Create Plugin Structure** (already done ✅)
   ```
   .claude-plugin/
   ├── plugin.json        # Plugin metadata
   └── marketplace.json   # Marketplace catalog
   skills/
   └── debug-bridge/      # Skill implementation
   ```

2. **Push to GitHub**
   ```bash
   git add .claude-plugin/ skills/
   git commit -m "feat: add Claude Code plugin"
   git push origin main
   ```

3. **Users Install**
   ```bash
   # Add your marketplace
   /plugin marketplace add stevengonsalvez/agent-bridge

   # Install the plugin
   /plugin install debug-bridge@agent-bridge-marketplace
   ```

### Version Management

- Use semantic versioning in `.claude-plugin/plugin.json`
- Update version for each release:
  ```json
  {
    "version": "0.2.0"  // Update this
  }
  ```
- Tag releases in Git:
  ```bash
  git tag v0.2.0
  git push origin v0.2.0
  ```

### No Approval Required

- No review process by Anthropic
- You control the release cycle
- Users pull updates when they reinstall

### Distribution Methods

| Method | Use Case | Installation |
|--------|----------|--------------|
| **GitHub Marketplace** | Public distribution | `/plugin marketplace add owner/repo` |
| **Local Development** | Testing, development | `claude --plugin-dir ./path` |
| **Manual Copy** | Team sharing, private use | Copy to `~/.claude/plugins/` |

## License

MIT
