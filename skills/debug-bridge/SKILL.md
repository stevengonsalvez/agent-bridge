---
name: debug-bridge
description: Browser automation and inspection for AI agents via WebSocket
triggers:
  - debug the app
  - test this flow
  - click the button
  - take a screenshot
  - inspect the UI
type: cli-tool
protocol_version: 1
default_port: 4000
---

# Debug Bridge Runbook

Control web apps via WebSocket. Click, type, screenshot, inspect.

## Quick Start

```bash
# 1. Start server (in tmux for persistence)
SESSION="debug-$(date +%s)"
PORT=$(shuf -i 4000-4999 -n 1)
tmux new-session -d -s "$SESSION"
tmux send-keys -t "$SESSION" "npx debug-bridge-cli connect --session $SESSION --port $PORT 2>&1 | tee debug-bridge-$PORT.log" C-m

# 2. Open app with debug params
open "http://localhost:5173?session=$SESSION&port=$PORT"

# 3. Use CLI commands (attach to tmux)
tmux attach -t "$SESSION"
```

## CLI Commands

| Command | Example | Description |
|---------|---------|-------------|
| `ui` | `ui` | List interactive elements |
| `click <target>` | `click 3` or `click "Sign In"` | Click element |
| `type <target> <text>` | `type 1 "hello"` or `type "email" "a@b.com"` | Type into input |
| `js <code>` | `js document.title` | Run JavaScript, shows result |
| `screenshot` | `screenshot` | Save viewport as PNG |
| `state` | `state` | Get cookies, localStorage |
| `go <url>` | `go /login` | Navigate to URL |
| `find <query>` | `find email` | Search UI tree |

### Targeting

Elements can be targeted by:
- **Index**: `click 3` (element #3 from `ui` output)
- **Text**: `click "Submit"` (matches button text)
- **Placeholder**: `type "email" "test@example.com"`
- **StableId**: `click btn-656b07` (shown in `ui` output)

## WebSocket API (for agents)

```javascript
// Connect
const ws = new WebSocket(`ws://localhost:4000/debug?role=agent&sessionId=my-session`);

// Base message
const msg = {
  protocolVersion: 1,
  sessionId: 'my-session',
  timestamp: Date.now(),
  requestId: crypto.randomUUID()
};

// Commands
ws.send(JSON.stringify({ ...msg, type: 'request_ui_tree' }));
ws.send(JSON.stringify({ ...msg, type: 'click', target: { stableId: 'btn-abc' } }));
ws.send(JSON.stringify({ ...msg, type: 'type', target: { selector: '#email' }, text: 'test@example.com' }));
ws.send(JSON.stringify({ ...msg, type: 'evaluate', code: 'document.title' }));
ws.send(JSON.stringify({ ...msg, type: 'request_screenshot' }));
ws.send(JSON.stringify({ ...msg, type: 'navigate', url: '/dashboard' }));
```

### Target Resolution

```typescript
target: {
  stableId?: string;   // Best - stable across renders
  selector?: string;   // CSS selector
  text?: string;       // Visible text match
}
```

### Response Types

```javascript
// UI Tree
{ type: 'ui_tree', items: [{ stableId, role, text, label, visible, meta }] }

// Command result
{ type: 'command_result', success: true, result: any, duration: 5 }

// Screenshot
{ type: 'screenshot', data: 'base64...', width: 1920, height: 1080 }

// Errors
{ type: 'command_result', success: false, error: { code: 'TARGET_NOT_FOUND', message: '...' } }
```

## Common Workflows

### Login Flow
```
ui                           # Discover elements
type "email" "user@test.com" # Fill email
type "password" "secret123"  # Fill password
click "Sign In"              # Submit
screenshot                   # Verify result
```

### Form Testing
```
go /register                 # Navigate
ui                           # List fields
type 1 "John"                # First input
type 2 "john@test.com"       # Second input
click "Submit"               # Submit form
state                        # Check localStorage
```

### Debug Issue
```
ui                           # See current state
js localStorage.getItem('token')  # Check auth
js window.__REDUX_STATE__    # Inspect state
screenshot                   # Capture for analysis
```

## Error Recovery

| Error | Fix |
|-------|-----|
| `TARGET_NOT_FOUND` | Run `ui` to refresh, check element exists |
| `TARGET_NOT_VISIBLE` | Scroll first: `scroll 0 500` |
| `EVAL_DISABLED` | App disabled eval - use DOM commands |
| `SCREENSHOT_FAILED` | Modern CSS issue - use DOM inspection |

## Setup Requirements

**App must have SDK installed:**
```typescript
// In your app (dev only)
import { createDebugBridge } from 'debug-bridge-browser';

if (import.meta.env.DEV) {
  const params = new URLSearchParams(location.search);
  const session = params.get('session');
  const port = params.get('port') || '4000';

  if (session) {
    createDebugBridge({
      url: `ws://localhost:${port}/debug?role=app&sessionId=${session}`,
      sessionId: session,
      appName: 'My App'
    }).connect();
  }
}
```

## Troubleshooting

```bash
# Port in use
lsof -ti:4000 | xargs kill -9

# Check connection
tmux attach -t debug-*

# View logs
tail -f debug-bridge-*.log

# Browser not connecting
# - Check URL has ?session=X&port=Y
# - Check browser console for [DebugBridge] logs
```
