---
name: debug-bridge
description: |
  Browser automation and inspection toolkit for AI agents. Debug web apps,
  inspect UI elements, automate workflows, take screenshots, click buttons,
  type text, and interact with web applications via WebSocket.
aliases:
  - ui-inspector
  - browser-controller
  - web-automation
  - screenshot-tool
  - browser-debugger
triggers:
  - debug the app
  - debug this app
  - inspect the UI
  - inspect the page
  - test the login flow
  - test the form
  - click the button
  - click this button
  - take a screenshot
  - screenshot the app
  - automate this workflow
  - automate the test
  - interact with the browser
  - interact with the web app
  - control the browser
  - fill in the form
  - type into the input
  - check the page state
  - get the DOM
  - run browser automation
type: cli-tool
capabilities:
  - click
  - type
  - hover
  - select
  - focus
  - scroll
  - navigate
  - evaluate
  - screenshot
  - inspect-dom
  - get-ui-tree
  - get-state
prerequisites:
  runtime: node >= 18
  packages:
    - debug-bridge-cli (npx debug-bridge-cli or npm install -g debug-bridge-cli)
    - debug-bridge-browser (npm install debug-bridge-browser)
compatibility:
  claude-code: full
  cursor: full
  codex: limited (sandbox may restrict WebSocket)
  copilot: untested
protocol_version: 1
default_port: 4000
---

# Debug Bridge Skill

Enables AI agents to inspect and control web applications via WebSocket. Use this skill when you need to debug, test, automate, or interact with a running web application.

## When to Use This Skill

Use debug-bridge when the user asks you to:
- **Debug the app** - Inspect UI, check state, find issues
- **Test a flow** - Login, checkout, form submission
- **Automate interactions** - Click buttons, fill forms, navigate
- **Take screenshots** - Capture current state for verification
- **Inspect elements** - Get UI tree, DOM snapshot, element properties

## Architecture Overview

```
┌─────────────┐     WebSocket      ┌─────────────┐     WebSocket      ┌─────────────┐
│   AI Agent  │ ◄──────────────────► │  CLI Server │ ◄──────────────────►│   Browser   │
│  (You/Claude)│   role=agent      │  (Port 4000) │   role=app         │  (Your App) │
└─────────────┘                    └─────────────┘                    └─────────────┘
```

## Quick Start

### Step 1: Start the Debug Server

```bash
# Using npx (recommended - no install needed)
npx debug-bridge-cli connect --session my-session

# Or with custom port
npx debug-bridge-cli connect --session my-session --port 4001
```

**Expected output:**
```
[DebugBridge] Server listening on ws://localhost:4000
[DebugBridge] Waiting for connections...
[DebugBridge] Session: my-session
```

### Step 2: Open Browser with Debug Params

The web app must have `debug-bridge-browser` SDK installed and configured.

Navigate to your app with query params:
```
http://localhost:5173?session=my-session&port=4000
```

**Expected console output in browser:**
```
[DebugBridge] Connecting to ws://localhost:4000/debug?role=app&sessionId=my-session
[DebugBridge] Connected
```

### Step 3: Connect as Agent

```javascript
const sessionId = 'my-session';
const ws = new WebSocket(`ws://localhost:4000/debug?role=agent&sessionId=${sessionId}`);

ws.onopen = () => console.log('Connected to debug bridge');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('Received:', msg.type);
};
```

## Connection Lifecycle

### Messages You Will Receive

1. **On browser connect** - `hello` message with app info:
```json
{
  "type": "hello",
  "protocolVersion": 1,
  "sessionId": "my-session",
  "appName": "My App",
  "url": "http://localhost:5173/",
  "viewport": { "width": 1920, "height": 1080 }
}
```

2. **After hello** - `capabilities` message:
```json
{
  "type": "capabilities",
  "capabilities": ["dom_snapshot", "dom_mutations", "ui_tree", "console", "errors", "eval"]
}
```

3. **Ongoing** - `console`, `error`, `state_update`, `dom_mutations` messages

### Health Check Sequence

**Before sending commands, verify the system is ready:**

```javascript
async function healthCheck(ws, sessionId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Health check timeout')), 5000);

    let serverReady = false;
    let browserConnected = false;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'hello') {
        browserConnected = true;
        console.log('Browser connected:', msg.appName || msg.url);
      }

      if (msg.type === 'capabilities') {
        serverReady = true;
        console.log('Capabilities:', msg.capabilities);
      }

      if (serverReady && browserConnected) {
        clearTimeout(timeout);
        resolve({ serverReady, browserConnected, capabilities: msg.capabilities });
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}
```

## Available Commands

All commands require base message fields:
```javascript
const baseMessage = {
  protocolVersion: 1,
  sessionId: 'my-session',
  timestamp: Date.now(),
  requestId: crypto.randomUUID()  // For correlating responses
};
```

### Element Targeting

Commands that target elements accept:
```typescript
type ElementTarget = {
  stableId?: string;   // Preferred - stable across renders
  selector?: string;   // CSS selector fallback
  text?: string;       // Match by visible text
  role?: string;       // ARIA role
};
```

**Priority:** `stableId` > `selector` > `text + role`

### Command Reference

| Command | Description | Parameters | Returns |
|---------|-------------|------------|---------|
| `request_ui_tree` | Get all interactive elements | - | `UiTreeItem[]` |
| `click` | Click an element | `target: ElementTarget` | `success: boolean` |
| `type` | Type text into input | `target: ElementTarget, text: string, options?: {clear?, delay?, pressEnter?}` | `success: boolean` |
| `hover` | Hover over element | `target: ElementTarget` | `success: boolean` |
| `select` | Select option in dropdown | `target: ElementTarget, value?: string, label?: string, index?: number` | `success: boolean` |
| `focus` | Focus an element | `target: ElementTarget` | `success: boolean` |
| `scroll` | Scroll page or element | `target?: ElementTarget, x?: number, y?: number` | `success: boolean` |
| `navigate` | Navigate to URL | `url: string` | `success: boolean` |
| `evaluate` | Execute JavaScript | `code: string` | `result: any` |
| `request_screenshot` | Capture viewport | `selector?: string, fullPage?: boolean` | Base64 PNG |
| `request_state` | Get cookies/localStorage | `scope?: string` | State object |
| `request_dom_snapshot` | Get full HTML | - | `html: string` |

### Command Examples

#### Get UI Tree
```javascript
ws.send(JSON.stringify({
  ...baseMessage,
  type: 'request_ui_tree'
}));
// Response: { type: 'ui_tree', items: [...] }
```

#### Click Element
```javascript
ws.send(JSON.stringify({
  ...baseMessage,
  type: 'click',
  target: { stableId: 'submit-btn-abc123' }
}));
// Response: { type: 'command_result', success: true, requestId: '...' }
```

#### Type Text with Options
```javascript
ws.send(JSON.stringify({
  ...baseMessage,
  type: 'type',
  target: { selector: '#email-input' },
  text: 'user@example.com',
  options: {
    clear: true,       // Clear existing text first
    delay: 50,         // Delay between keystrokes (ms)
    pressEnter: false  // Press Enter after typing
  }
}));
```

#### Select Dropdown Option
```javascript
ws.send(JSON.stringify({
  ...baseMessage,
  type: 'select',
  target: { selector: '#country-select' },
  label: 'United States'  // Or: value: 'US', index: 5
}));
```

#### Scroll
```javascript
// Scroll by pixels
ws.send(JSON.stringify({
  ...baseMessage,
  type: 'scroll',
  y: 500  // Scroll down 500px
}));

// Scroll element into view
ws.send(JSON.stringify({
  ...baseMessage,
  type: 'scroll',
  target: { stableId: 'footer-element' }
}));
```

#### Execute JavaScript
```javascript
ws.send(JSON.stringify({
  ...baseMessage,
  type: 'evaluate',
  code: 'document.title'
}));
// Response: { type: 'command_result', result: 'My App Title' }
```

#### Screenshot
```javascript
ws.send(JSON.stringify({
  ...baseMessage,
  type: 'request_screenshot',
  fullPage: true  // Or selector: '#specific-element'
}));
// Response: { type: 'screenshot', data: 'base64...', width: 1920, height: 1080 }
```

## Error Handling

### Error Codes

| Code | Cause | Recovery Strategy |
|------|-------|-------------------|
| `TARGET_NOT_FOUND` | Element not in DOM | Call `request_ui_tree` to refresh, verify selector |
| `TARGET_NOT_VISIBLE` | Element off-screen or hidden | `scroll` to element first, wait for animation |
| `TARGET_DISABLED` | Element is disabled | Check preconditions, wait for enable |
| `TIMEOUT` | Operation exceeded time limit | Retry with backoff, check if page is loading |
| `EVAL_DISABLED` | JavaScript eval blocked | Feature not available, use alternative |
| `EVAL_ERROR` | JavaScript execution failed | Check code syntax, handle exceptions |
| `NAVIGATION_FAILED` | URL navigation failed | Verify URL, check network |
| `INVALID_COMMAND` | Malformed command | Check command structure against spec |
| `UNKNOWN_ERROR` | Unexpected error | Log details, retry |

### Error Response Format

```json
{
  "type": "command_result",
  "requestId": "abc123",
  "requestType": "click",
  "success": false,
  "error": {
    "code": "TARGET_NOT_FOUND",
    "message": "Element with stableId 'btn-xyz' not found in DOM"
  },
  "duration": 150
}
```

### Recovery Patterns

```javascript
async function clickWithRetry(ws, target, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await sendCommand(ws, { type: 'click', target });

    if (result.success) return result;

    if (result.error?.code === 'TARGET_NOT_FOUND') {
      // Element may have re-rendered, refresh UI tree
      await sendCommand(ws, { type: 'request_ui_tree' });
      await delay(500);
      continue;
    }

    if (result.error?.code === 'TARGET_NOT_VISIBLE') {
      // Scroll element into view
      await sendCommand(ws, { type: 'scroll', target });
      await delay(300);
      continue;
    }

    throw new Error(`Click failed: ${result.error?.message}`);
  }
  throw new Error('Max retries exceeded');
}
```

## Workflow Patterns

### Pattern: Login Flow

```javascript
async function loginFlow(ws, email, password) {
  // 1. Get UI tree to discover elements
  const uiTree = await requestUiTree(ws);

  // 2. Find form elements
  const emailInput = uiTree.find(i =>
    i.role === 'textbox' && (i.meta.name?.includes('email') || i.meta.placeholder?.includes('email'))
  );
  const passwordInput = uiTree.find(i =>
    i.role === 'textbox' && i.meta.type === 'password'
  );
  const submitBtn = uiTree.find(i =>
    i.role === 'button' && (i.text?.toLowerCase().includes('sign') || i.text?.toLowerCase().includes('log'))
  );

  if (!emailInput || !passwordInput || !submitBtn) {
    throw new Error('Login form elements not found');
  }

  // 3. Enter credentials
  await type(ws, emailInput.stableId, email, { clear: true });
  await type(ws, passwordInput.stableId, password, { clear: true });

  // 4. Submit
  await click(ws, submitBtn.stableId);

  // 5. Wait for navigation/redirect
  await waitForCondition(ws, async () => {
    const state = await requestState(ws);
    return state.localStorage?.authToken || state.cookies?.session;
  }, 10000);

  // 6. Verify success
  const screenshot = await requestScreenshot(ws);
  return { success: true, screenshot };
}
```

### Pattern: Wait for Element

```javascript
async function waitForElement(ws, predicate, timeout = 5000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const uiTree = await requestUiTree(ws);
    const element = uiTree.find(predicate);

    if (element) return element;

    await delay(200);
  }

  throw new Error(`Element not found within ${timeout}ms`);
}

// Usage
const modal = await waitForElement(ws,
  item => item.role === 'dialog' && item.visible
);
```

### Pattern: Form Submission

```javascript
async function fillForm(ws, formData) {
  const uiTree = await requestUiTree(ws);

  for (const [fieldName, value] of Object.entries(formData)) {
    const input = uiTree.find(i =>
      i.meta.name === fieldName ||
      i.meta.id === fieldName ||
      i.label?.toLowerCase().includes(fieldName.toLowerCase())
    );

    if (!input) {
      console.warn(`Field ${fieldName} not found`);
      continue;
    }

    if (input.role === 'combobox' || input.meta.tagName === 'SELECT') {
      await select(ws, input.stableId, { label: value });
    } else if (input.role === 'checkbox') {
      if (input.checked !== (value === true || value === 'true')) {
        await click(ws, input.stableId);
      }
    } else {
      await type(ws, input.stableId, value, { clear: true });
    }
  }
}
```

## Troubleshooting

### Server won't start
```bash
# Check if port is in use
lsof -i :4000

# Kill existing process
lsof -ti:4000 | xargs kill -9

# Try different port
npx debug-bridge-cli connect --session my-session --port 4001
```

### Browser not connecting
1. Verify URL has correct query params: `?session=<id>&port=<port>`
2. Check browser console for `[DebugBridge]` logs
3. Verify SDK is initialized in dev mode only
4. Check CORS if server and app on different origins

### Commands timing out
1. Check if browser tab is focused/active
2. Page may be loading - wait for `load` event
3. Heavy page - increase timeout
4. Network issues - check connectivity

### Element not found
1. Element may not be rendered yet - use `waitForElement`
2. Element may be in iframe - iframes not yet supported
3. Element may have dynamic ID - use `text` or `selector` instead of `stableId`
4. Re-request UI tree - DOM may have changed

### Session ID mismatch
- CLI session and URL param must match exactly
- Session IDs are case-sensitive
- Only one browser can connect per session

## Browser SDK Integration

For the web app to work with debug-bridge, add the SDK:

```bash
npm install debug-bridge-browser
```

```typescript
// src/debug-bridge.ts
import { createDebugBridge } from 'debug-bridge-browser';

// Only in development
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');
  const port = params.get('port') || '4000';

  if (sessionId) {
    const bridge = createDebugBridge({
      url: `ws://localhost:${port}/debug?role=app&sessionId=${sessionId}`,
      sessionId,
      appName: 'My App',
    });

    bridge.connect();

    // Expose for debugging
    (window as any).__debugBridge = bridge;
  }
}
```

## Cross-Platform Installation

### Claude Code
```bash
# Via plugin (recommended)
claude plugin install github:stevengonsalvez/agent-bridge

# Or copy skill manually
cp -r skills/debug-bridge ~/.claude/skills/
```

### Cursor
```bash
cp -r skills/debug-bridge ~/.cursor/skills/
```

### Codex
```bash
cp -r skills/debug-bridge ~/.codex/skills/
```

### VS Code / GitHub Copilot
```bash
cp -r skills/debug-bridge .github/skills/
```

## API Reference

### UiTreeItem Structure

```typescript
type UiTreeItem = {
  stableId: string;      // Stable identifier for targeting
  selector: string;      // CSS selector
  role: string;          // ARIA role (button, textbox, link, etc.)
  text?: string;         // Visible text content
  label?: string;        // aria-label or associated label
  disabled: boolean;     // Is element disabled
  visible: boolean;      // Is element visible
  checked?: boolean;     // For checkboxes/radios
  value?: string;        // Current value
  meta: {
    tagName: string;     // HTML tag (BUTTON, INPUT, etc.)
    type?: string;       // Input type (text, password, etc.)
    name?: string;       // Input name attribute
    href?: string;       // Link href
    placeholder?: string;
  };
};
```

### Capabilities

| Capability | Description |
|------------|-------------|
| `dom_snapshot` | Can request full HTML |
| `dom_mutations` | Receives live DOM changes |
| `ui_tree` | Can request interactive elements |
| `console` | Receives console.log output |
| `errors` | Receives JavaScript errors |
| `eval` | Can execute JavaScript |
| `custom_state` | App sends custom state |

## Version History

- **0.1.2** - Current version, npm published
- **Protocol Version: 1** - Message format specification
