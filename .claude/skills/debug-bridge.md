# Debug Bridge CLI

Debug bridge for interacting with web applications. Requires a browser running the app with the `@debug-bridge/browser` SDK.

## Starting the CLI

```bash
# JSON mode (for Claude) - outputs JSONL, accepts JSON commands via stdin
node packages/cli/dist/bin/cli.js connect --port 4000 --session my-session --json

# Human mode (interactive REPL)
node packages/cli/dist/bin/cli.js connect --port 4000 --session my-session
```

**Important**: The web app must be opened with matching session/port query params:
```
http://localhost:3000?session=my-session&port=4000
```

## JSON Mode Protocol

### Output Events (stdout, one JSON per line)

```jsonl
{"event":"server_started","url":"ws://localhost:4000/debug","session":"my-session"}
{"event":"app_connected","appName":"My App","appVersion":"0.1.0","url":"http://localhost:3000/"}
{"event":"telemetry","type":"ui_tree","itemCount":47,"items":[...]}
{"event":"telemetry","type":"state_update","scope":"auth","state":{"isLoggedIn":false}}
{"event":"command_result","requestId":"1","success":true,"duration":12}
```

### Input Commands (stdin, JSON)

**Click an element:**
```json
{"type":"click","requestId":"1","target":{"stableId":"login-button"}}
```

**Type text:**
```json
{"type":"type","requestId":"2","target":{"stableId":"email-input"},"text":"user@example.com","options":{"clear":true}}
```

**Navigate:**
```json
{"type":"navigate","requestId":"3","url":"/products"}
```

**Request UI tree:**
```json
{"type":"request_ui_tree","requestId":"4"}
```

**Request app state:**
```json
{"type":"request_state","requestId":"5","scope":"cart"}
```

**Scroll:**
```json
{"type":"scroll","requestId":"6","x":0,"y":500}
```

**Hover:**
```json
{"type":"hover","requestId":"7","target":{"stableId":"dropdown-menu"}}
```

**Select dropdown:**
```json
{"type":"select","requestId":"8","target":{"stableId":"country-select"},"value":"US"}
```

**Focus element:**
```json
{"type":"focus","requestId":"9","target":{"stableId":"search-input"}}
```

**Evaluate JS (if enabled):**
```json
{"type":"evaluate","requestId":"10","code":"document.title"}
```

## Target Resolution

Elements can be targeted by (in priority order):
1. `stableId` - matches `data-testid` attribute or element `id`
2. `selector` - CSS selector
3. `text` - text content (for buttons/links)

```json
{"target":{"stableId":"submit-btn"}}
{"target":{"selector":"#app button.primary"}}
{"target":{"text":"Sign In"}}
```

## UI Tree Items

Each item in the UI tree contains:
```json
{
  "stableId": "login-button",
  "selector": "button#login",
  "role": "button",
  "text": "Sign In",
  "label": "Sign in to your account",
  "disabled": false,
  "visible": true,
  "meta": {
    "tagName": "button",
    "type": "submit"
  }
}
```

## Error Codes

- `TARGET_NOT_FOUND` - Element not found
- `TARGET_NOT_VISIBLE` - Element hidden
- `TARGET_DISABLED` - Element disabled
- `EVAL_DISABLED` - JS eval not enabled
- `INVALID_COMMAND` - Unknown command type

## Claude Usage Pattern (via tmux)

Since the CLI requires bidirectional communication, use tmux with named pipes:

```bash
# 1. Setup
PORT=4000
SESSION=debug-$(date +%s)
PIPE=/tmp/debug-bridge-$SESSION

mkfifo $PIPE
tmux new-session -d -s $SESSION

# 2. Start CLI reading from pipe, writing to log
tmux send-keys -t $SESSION "tail -f $PIPE | node packages/cli/dist/bin/cli.js connect --port $PORT --session $SESSION --json > /tmp/debug-bridge-$SESSION.log 2>&1" C-m

# 3. Send a command
echo '{"type":"request_ui_tree","requestId":"1"}' > $PIPE

# 4. Read output
cat /tmp/debug-bridge-$SESSION.log

# 5. Cleanup
tmux kill-session -t $SESSION
rm $PIPE
```

**Simpler alternative** - use the human REPL mode and parse output:
```bash
# Start in tmux
tmux new-session -d -s debug-cli
tmux send-keys -t debug-cli "node packages/cli/dist/bin/cli.js connect --port 4000 --session test" C-m

# Send command (human mode accepts simple commands)
tmux send-keys -t debug-cli "click login-button" C-m
tmux send-keys -t debug-cli "ui" C-m

# Read output
tmux capture-pane -t debug-cli -p
```

## Browser Requirement

A browser MUST be running the web app with the debug-bridge SDK. Without a browser, there's nothing to interact with.

**Options:**
1. **Manual** - User opens browser to `http://localhost:3000?session=test&port=4000`
2. **Playwright** - Use webapp-testing skill to launch headless browser:
   ```bash
   # Playwright can navigate to the app URL
   # The debug-bridge SDK in the app will auto-connect to CLI
   ```

## Integration with webapp-testing Skill

Debug-bridge complements Playwright by providing:
- **Richer telemetry**: App state, console logs, errors
- **Stable IDs**: `data-testid` based targeting
- **State awareness**: Know auth status, cart contents, etc.

Workflow:
1. Start debug-bridge CLI (port 4000, session X)
2. Use Playwright to open `http://localhost:3000?session=X&port=4000`
3. CLI receives telemetry from app
4. Use either CLI commands OR Playwright for interactions
