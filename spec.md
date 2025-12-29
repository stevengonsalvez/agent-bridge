# `@debug-bridge` Protocol Specification v1.0

> **Agent-Friendly In-App Debug Bridge**
>
> A generic, framework-agnostic debug bridge for web applications that enables external agents (Claude, Codex, Copilot, etc.) to inspect and interact with your app via WebSocket using a small, LLM-friendly JSON protocol.

---

## 1. Overview

### 1.1 Problem

Existing approaches for AI-driven debugging/testing (Playwright, Selenium, Chrome DevTools / CDP) are:

- **Browser-centric**, not app-centric
- **Heavyweight** and brittle for LLMs to drive directly
- Optimized for QA humans or code-based tests, not for agentic tooling

### 1.2 Solution

A **debug bridge** that:

- Runs **in the browser app** and connects to a WebSocket server
- Streams telemetry: DOM snapshots, UI tree, console logs, errors, app state
- Accepts **commands** from agents: click, type, navigate, evaluate, screenshot
- Uses a **small, versioned JSON protocol** designed for LLM consumption

### 1.3 Packages

| Package | Description |
|---------|-------------|
| `@debug-bridge/browser` | Browser Client SDK — embeds in your app |
| `@debug-bridge/server` | Node.js WebSocket relay server |
| `@debug-bridge/types` | Shared TypeScript types |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Debug Server                              │
│                    (WebSocket Relay)                             │
│                                                                  │
│   ┌─────────────┐                      ┌─────────────────────┐  │
│   │   App Pool  │◄────── sessionId ───►│    Agent Pool       │  │
│   │  (role=app) │                      │   (role=agent)      │  │
│   └─────────────┘                      └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        ▲                                          ▲
        │ WebSocket                                │ WebSocket
        │                                          │
┌───────┴───────┐                         ┌───────┴───────┐
│  Browser App  │                         │  LLM Agent    │
│  (React/Vue/  │                         │  (Claude/     │
│   Vanilla)    │                         │   Codex/etc)  │
└───────────────┘                         └───────────────┘
```

### 2.1 Components

1. **Browser Client** — Runs inside your web app
   - Opens WebSocket to debug server
   - Emits telemetry (DOM, UI tree, console, errors, state)
   - Executes commands from agents

2. **Debug Server** — Stateless WebSocket relay
   - Groups connections by `sessionId`
   - Routes app messages → agents, agent messages → apps
   - Handles connection lifecycle events

3. **Agents** — External LLM-based tools
   - Connect with `role=agent`
   - Consume telemetry, send commands
   - Use protocol as action/observation space

---

## 3. Protocol Specification

### 3.1 Base Message

All messages share this structure:

```typescript
type BaseMessage = {
  protocolVersion: 1;           // Protocol version (always 1 for this spec)
  sessionId: string;            // Logical session/group ID
  timestamp: number;            // Unix timestamp in milliseconds
  origin: "app" | "agent" | "server";
  type: string;                 // Message type discriminant
  appId?: string;               // Unique app instance ID (for multi-app sessions)
};
```

### 3.2 Message Type Union

```typescript
type BridgeMessage =
  // Connection lifecycle
  | HelloMessage
  | CapabilitiesMessage
  | ConnectionEventMessage

  // Telemetry (app → agent)
  | DomSnapshotMessage
  | DomMutationsMessage
  | UiTreeMessage
  | UiElementUpdateMessage
  | ConsoleMessage
  | ErrorMessage
  | CustomStateMessage
  | ScreenshotMessage

  // Commands (agent → app)
  | CommandMessage
  | CommandResultMessage;
```

---

## 4. Connection & Lifecycle

### 4.1 Connection URLs

```
App:   ws://{host}:{port}/debug?role=app&sessionId={sid}&appId={appId}
Agent: ws://{host}:{port}/debug?role=agent&sessionId={sid}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `role` | Yes | `app` or `agent` |
| `sessionId` | Yes | Shared session identifier |
| `appId` | No (app only) | Unique app instance ID (auto-generated if omitted) |
| `token` | No | Authentication token |

### 4.2 Hello Message

Sent by app immediately after connection:

```typescript
type HelloMessage = BaseMessage & {
  type: "hello";
  appName?: string;             // e.g., "MyApp"
  appVersion?: string;          // e.g., "1.2.3"
  url: string;                  // Current page URL
  userAgent: string;            // Browser user agent
  viewport: {                   // Viewport dimensions
    width: number;
    height: number;
  };
};
```

### 4.3 Capabilities Message

Sent by app after hello:

```typescript
type CapabilitiesMessage = BaseMessage & {
  type: "capabilities";
  capabilities: Capability[];
};

type Capability =
  | "dom_snapshot"
  | "dom_mutations"
  | "ui_tree"
  | "ui_element_updates"
  | "console"
  | "errors"
  | "eval"
  | "screenshot"
  | "custom_state";
```

### 4.4 Connection Events

Sent by server when connection state changes:

```typescript
type ConnectionEventMessage = BaseMessage & {
  type: "connection_event";
  event: "app_connected" | "app_disconnected" | "agent_connected" | "agent_disconnected";
  appId?: string;               // For app events
  agentId?: string;             // For agent events
  connectedApps?: string[];     // List of connected appIds
  connectedAgents?: number;     // Count of connected agents
};
```

---

## 5. Telemetry Messages (App → Agent)

### 5.1 DOM Snapshot

Full DOM capture (on connect or on request):

```typescript
type DomSnapshotMessage = BaseMessage & {
  type: "dom_snapshot";
  html: string;                 // document.documentElement.outerHTML
  requestId?: string;           // If response to request_dom_snapshot
};
```

### 5.2 DOM Mutations

Incremental changes via MutationObserver:

```typescript
type DomMutationsMessage = BaseMessage & {
  type: "dom_mutations";
  batchId: string;              // Unique batch identifier
  batchSize: number;            // Total mutations in this batch
  mutations: DomMutation[];
};

type DomMutation = {
  mutationType: "childList" | "attributes" | "characterData";
  targetSelector: string;       // CSS selector path to target
  targetStableId?: string;      // Stable ID if available
  attributeName?: string;       // For attribute mutations
  oldValue?: string;            // Previous value (if configured)
  addedNodes?: SerializedNode[];
  removedNodes?: SerializedNode[];
  textContent?: string | null;  // For characterData mutations
};

type SerializedNode = {
  type: "element" | "text" | "comment";
  tagName?: string;             // For elements
  html?: string;                // Outer HTML for elements
  text?: string;                // Text content for text nodes
};
```

### 5.3 UI Tree

Distilled interactive elements — the primary interface for agent reasoning:

```typescript
type UiTreeMessage = BaseMessage & {
  type: "ui_tree";
  requestId?: string;           // If response to request_ui_tree
  items: UiTreeItem[];
};

type UiTreeItem = {
  // Identification (in priority order for targeting)
  stableId: string;             // Stable identifier (see 5.3.1)
  selector: string;             // CSS selector fallback

  // Semantics
  role: string;                 // ARIA role or tag name
  text?: string;                // Visible text content
  label?: string;               // aria-label or title

  // State
  disabled: boolean;
  visible: boolean;
  checked?: boolean;            // For checkboxes/radios
  selected?: boolean;           // For options
  expanded?: boolean;           // For expandable elements
  value?: string;               // Current input value

  // Position (optional, for visual reasoning)
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Additional metadata
  meta: {
    tagName: string;
    type?: string;              // input type
    name?: string;              // form field name
    href?: string;              // link destination
    placeholder?: string;
    maxLength?: number;
    pattern?: string;
    required?: boolean;
    [key: string]: unknown;     // Custom attributes
  };
};
```

#### 5.3.1 Stable ID Generation

The `stableId` field provides a consistent identifier for elements across DOM mutations. Priority order:

1. `data-testid` attribute (highest priority — developers should use this)
2. `data-debug-id` attribute
3. `id` attribute (if not auto-generated)
4. Content hash: `{role}-{truncatedText}-{positionIndex}`
5. Structural path: `{parentStableId}>{tagName}[{siblingIndex}]`

**Guidance for developers**: Always use `data-testid` for elements agents will interact with.

### 5.4 UI Element Updates

Targeted updates when specific elements change state (reduces need for full UI tree refresh):

```typescript
type UiElementUpdateMessage = BaseMessage & {
  type: "ui_element_update";
  stableId: string;
  changes: Partial<Omit<UiTreeItem, "stableId" | "selector">>;
  changeType: "added" | "removed" | "modified";
};
```

### 5.5 Console Messages

Captured console output:

```typescript
type ConsoleMessage = BaseMessage & {
  type: "console";
  level: "log" | "info" | "warn" | "error" | "debug";
  args: string[];               // Stringified arguments
  stack?: string;               // Call stack (for errors)
};
```

### 5.6 Error Messages

Runtime errors and unhandled rejections:

```typescript
type ErrorMessage = BaseMessage & {
  type: "error";
  errorType: "runtime" | "unhandledrejection";
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  componentStack?: string;      // React error boundary info
};
```

### 5.7 Custom State

Application-specific state updates:

```typescript
type CustomStateMessage = BaseMessage & {
  type: "state_update";
  scope: string;                // e.g., "auth", "cart", "router"
  state: unknown;               // JSON-serializable value
  diff?: {                      // Optional: what changed
    added?: string[];
    removed?: string[];
    modified?: string[];
  };
};
```

### 5.8 Screenshot

Visual capture of the current viewport:

```typescript
type ScreenshotMessage = BaseMessage & {
  type: "screenshot";
  requestId: string;
  format: "png" | "jpeg" | "webp";
  data: string;                 // Base64-encoded image
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
};
```

---

## 6. Commands (Agent → App)

### 6.1 Command Base

All commands include a `requestId` for response correlation:

```typescript
type CommandBase = BaseMessage & {
  requestId: string;            // Unique ID for response correlation
};
```

### 6.2 Target Resolution

Commands that target elements use this structure:

```typescript
type ElementTarget = {
  stableId?: string;            // Preferred: stable ID
  selector?: string;            // CSS selector
  text?: string;                // Match by visible text
  role?: string;                // Combined with text for specificity
};
```

Resolution priority:
1. `stableId` → `[data-testid="{id}"]` or `[data-debug-id="{id}"]` or `#{id}`
2. `selector` → Direct CSS selector
3. `text` + `role` → Find element with matching role and text content
4. `text` only → Find interactive element with matching text

### 6.3 Click Command

```typescript
type ClickCommand = CommandBase & {
  type: "click";
  target: ElementTarget;
  options?: {
    button?: "left" | "right" | "middle";
    clickCount?: number;        // For double-click: 2
    modifiers?: ("alt" | "ctrl" | "meta" | "shift")[];
    position?: { x: number; y: number };  // Relative to element
  };
};
```

### 6.4 Type Command

```typescript
type TypeCommand = CommandBase & {
  type: "type";
  target: ElementTarget;
  text: string;
  options?: {
    clear?: boolean;            // Clear existing value first (default: false)
    delay?: number;             // Delay between keystrokes in ms
    pressEnter?: boolean;       // Press Enter after typing
  };
};
```

### 6.5 Navigate Command

```typescript
type NavigateCommand = CommandBase & {
  type: "navigate";
  url: string;                  // Absolute or relative URL
  options?: {
    waitUntil?: "load" | "domcontentloaded" | "networkidle";
    timeout?: number;           // Max wait time in ms
  };
};
```

### 6.6 Evaluate Command

```typescript
type EvaluateCommand = CommandBase & {
  type: "evaluate";
  code: string;                 // JavaScript to execute
  options?: {
    timeout?: number;           // Execution timeout in ms
    returnByValue?: boolean;    // Serialize return value (default: true)
  };
};
```

### 6.7 Scroll Command

```typescript
type ScrollCommand = CommandBase & {
  type: "scroll";
  target?: ElementTarget;       // If omitted, scrolls window
  options: {
    x?: number;                 // Horizontal scroll position/delta
    y?: number;                 // Vertical scroll position/delta
    behavior?: "auto" | "smooth";
    mode?: "absolute" | "delta"; // absolute = scrollTo, delta = scrollBy
  };
};
```

### 6.8 Hover Command

```typescript
type HoverCommand = CommandBase & {
  type: "hover";
  target: ElementTarget;
  options?: {
    position?: { x: number; y: number };
  };
};
```

### 6.9 Select Command

For dropdown/select elements:

```typescript
type SelectCommand = CommandBase & {
  type: "select";
  target: ElementTarget;
  options: {
    value?: string;             // Select by value
    label?: string;             // Select by visible text
    index?: number;             // Select by index
  };
};
```

### 6.10 Focus Command

```typescript
type FocusCommand = CommandBase & {
  type: "focus";
  target: ElementTarget;
};
```

### 6.11 Request Commands

```typescript
type RequestUiTreeCommand = CommandBase & {
  type: "request_ui_tree";
  options?: {
    includeHidden?: boolean;    // Include non-visible elements
    includeBounds?: boolean;    // Include position/size info
    filter?: {
      roles?: string[];         // Filter by roles
      selector?: string;        // Filter by CSS selector
    };
  };
};

type RequestDomSnapshotCommand = CommandBase & {
  type: "request_dom_snapshot";
  options?: {
    selector?: string;          // Capture subtree only
    sanitize?: boolean;         // Remove scripts/styles
  };
};

type RequestScreenshotCommand = CommandBase & {
  type: "request_screenshot";
  options?: {
    format?: "png" | "jpeg" | "webp";
    quality?: number;           // 0-100 for jpeg/webp
    selector?: string;          // Capture element only
    fullPage?: boolean;         // Capture full scrollable area
  };
};

type RequestStateCommand = CommandBase & {
  type: "request_state";
  scope?: string;               // Specific scope, or all if omitted
};
```

### 6.12 Command Message Union

```typescript
type CommandMessage =
  | ClickCommand
  | TypeCommand
  | NavigateCommand
  | EvaluateCommand
  | ScrollCommand
  | HoverCommand
  | SelectCommand
  | FocusCommand
  | RequestUiTreeCommand
  | RequestDomSnapshotCommand
  | RequestScreenshotCommand
  | RequestStateCommand;
```

### 6.13 Command Result

Response to any command:

```typescript
type CommandResultMessage = BaseMessage & {
  type: "command_result";
  requestId: string;            // Matches command's requestId
  requestType: string;          // Original command type
  success: boolean;
  error?: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  result?: unknown;             // Command-specific return value
  duration: number;             // Execution time in ms
};

type ErrorCode =
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_VISIBLE"
  | "TARGET_DISABLED"
  | "TIMEOUT"
  | "EVAL_DISABLED"
  | "EVAL_ERROR"
  | "NAVIGATION_FAILED"
  | "INVALID_COMMAND"
  | "RATE_LIMITED"
  | "UNKNOWN_ERROR";
```

---

## 7. Server Specification

### 7.1 Configuration

```typescript
type ServerConfig = {
  port: number;                 // Default: 4000
  host?: string;                // Default: "0.0.0.0"
  path?: string;                // Default: "/debug"

  auth?: {
    enabled: boolean;
    tokens?: string[];          // Valid tokens
    validateToken?: (token: string) => boolean | Promise<boolean>;
  };

  rateLimiting?: {
    enabled: boolean;
    maxCommandsPerSecond?: number;  // Default: 10
    maxMessagesPerSecond?: number;  // Default: 100
  };

  logging?: {
    level: "debug" | "info" | "warn" | "error";
    logMessages?: boolean;      // Log all messages (verbose)
  };
};
```

### 7.2 Server Behavior

1. **Connection Handling**
   - Validate query parameters (`role`, `sessionId`)
   - Authenticate if `auth.enabled`
   - Generate `appId` if not provided (for apps)
   - Broadcast `connection_event` to relevant parties

2. **Message Routing**
   - App messages → All agents in same `sessionId`
   - Agent messages → All apps in same `sessionId` (or specific `appId` if provided)
   - Server messages → Broadcast to all in `sessionId`

3. **Disconnection**
   - Remove client from pool
   - Broadcast `connection_event` with disconnect info
   - Clean up empty sessions after timeout

4. **Rate Limiting**
   - Track message rate per connection
   - Return `RATE_LIMITED` error when exceeded
   - Implement token bucket algorithm

### 7.3 Server Implementation

```typescript
// @debug-bridge/server

import { WebSocketServer, WebSocket } from "ws";
import { parse } from "url";
import type { BridgeMessage, ServerConfig } from "@debug-bridge/types";

type Client = {
  ws: WebSocket;
  role: "app" | "agent";
  sessionId: string;
  appId?: string;
  agentId?: string;
  connectedAt: number;
  messageCount: number;
  lastMessageAt: number;
};

export function createDebugServer(config: ServerConfig = { port: 4000 }) {
  const wss = new WebSocketServer({
    port: config.port,
    host: config.host ?? "0.0.0.0",
    path: config.path ?? "/debug"
  });

  const clients = new Map<WebSocket, Client>();
  const sessions = new Map<string, Set<Client>>();

  wss.on("connection", (ws, req) => {
    const { query } = parse(req.url || "", true);
    const role = query.role as "app" | "agent";
    const sessionId = query.sessionId as string;
    const token = query.token as string | undefined;

    // Validate
    if (!role || !sessionId) {
      ws.close(4000, "Missing role or sessionId");
      return;
    }

    if (config.auth?.enabled) {
      const valid = config.auth.tokens?.includes(token ?? "")
        ?? config.auth.validateToken?.(token ?? "");
      if (!valid) {
        ws.close(4001, "Unauthorized");
        return;
      }
    }

    // Create client
    const client: Client = {
      ws,
      role,
      sessionId,
      appId: role === "app" ? (query.appId as string) ?? generateId() : undefined,
      agentId: role === "agent" ? generateId() : undefined,
      connectedAt: Date.now(),
      messageCount: 0,
      lastMessageAt: Date.now(),
    };

    clients.set(ws, client);

    // Add to session
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, new Set());
    }
    sessions.get(sessionId)!.add(client);

    // Broadcast connection event
    broadcastToSession(sessionId, {
      protocolVersion: 1,
      sessionId,
      timestamp: Date.now(),
      origin: "server",
      type: "connection_event",
      event: role === "app" ? "app_connected" : "agent_connected",
      appId: client.appId,
      agentId: client.agentId,
      connectedApps: getConnectedApps(sessionId),
      connectedAgents: getConnectedAgentCount(sessionId),
    });

    // Handle messages
    ws.on("message", (data) => {
      const client = clients.get(ws);
      if (!client) return;

      // Rate limiting
      if (config.rateLimiting?.enabled) {
        const now = Date.now();
        if (now - client.lastMessageAt < 1000 / (config.rateLimiting.maxMessagesPerSecond ?? 100)) {
          ws.send(JSON.stringify({
            protocolVersion: 1,
            sessionId: client.sessionId,
            timestamp: now,
            origin: "server",
            type: "command_result",
            requestId: "rate_limit",
            requestType: "unknown",
            success: false,
            error: { code: "RATE_LIMITED", message: "Too many messages" },
            duration: 0,
          }));
          return;
        }
        client.lastMessageAt = now;
      }

      let msg: BridgeMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      // Route to opposite role
      const targetRole = client.role === "app" ? "agent" : "app";
      const session = sessions.get(client.sessionId);
      if (!session) return;

      for (const target of session) {
        if (target.role === targetRole && target.ws.readyState === WebSocket.OPEN) {
          target.ws.send(JSON.stringify(msg));
        }
      }
    });

    // Handle disconnect
    ws.on("close", () => {
      const client = clients.get(ws);
      if (!client) return;

      clients.delete(ws);
      sessions.get(client.sessionId)?.delete(client);

      broadcastToSession(client.sessionId, {
        protocolVersion: 1,
        sessionId: client.sessionId,
        timestamp: Date.now(),
        origin: "server",
        type: "connection_event",
        event: client.role === "app" ? "app_disconnected" : "agent_disconnected",
        appId: client.appId,
        agentId: client.agentId,
        connectedApps: getConnectedApps(client.sessionId),
        connectedAgents: getConnectedAgentCount(client.sessionId),
      });

      // Cleanup empty sessions
      if (sessions.get(client.sessionId)?.size === 0) {
        sessions.delete(client.sessionId);
      }
    });
  });

  function broadcastToSession(sessionId: string, msg: BridgeMessage) {
    const session = sessions.get(sessionId);
    if (!session) return;
    const data = JSON.stringify(msg);
    for (const client of session) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  function getConnectedApps(sessionId: string): string[] {
    const session = sessions.get(sessionId);
    if (!session) return [];
    return [...session]
      .filter(c => c.role === "app" && c.appId)
      .map(c => c.appId!);
  }

  function getConnectedAgentCount(sessionId: string): number {
    const session = sessions.get(sessionId);
    if (!session) return 0;
    return [...session].filter(c => c.role === "agent").length;
  }

  function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  return {
    wss,
    close: () => wss.close(),
  };
}
```

---

## 8. Browser Client SDK

### 8.1 Configuration

```typescript
type DebugBridgeConfig = {
  // Connection
  url: string;                          // WebSocket endpoint
  sessionId: string;                    // Shared session ID
  appId?: string;                       // Unique app instance ID
  appName?: string;                     // Display name
  appVersion?: string;                  // App version
  token?: string;                       // Auth token

  // Feature toggles
  enableDomSnapshot?: boolean;          // Default: true
  enableDomMutations?: boolean;         // Default: true
  enableUiTree?: boolean;               // Default: true
  enableUiElementUpdates?: boolean;     // Default: true
  enableConsole?: boolean;              // Default: true
  enableErrors?: boolean;               // Default: true
  enableEval?: boolean;                 // Default: false (security)
  enableScreenshot?: boolean;           // Default: true

  // Performance tuning
  domMutationBatchMs?: number;          // Default: 100
  uiTreeThrottleMs?: number;            // Default: 500
  maxConsoleArgs?: number;              // Default: 10
  maxConsoleArgLength?: number;         // Default: 1000
  maxDomSnapshotSize?: number;          // Default: 5MB

  // Customization
  getCustomState?: () => Record<string, unknown>;
  getUiTreeItems?: () => UiTreeItem[];
  getStableId?: (el: Element) => string | null;

  // Lifecycle hooks
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onCommand?: (cmd: CommandMessage) => void;
};
```

### 8.2 SDK API

```typescript
type DebugBridge = {
  // Connection
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;

  // Manual telemetry
  sendState(scope: string, state: unknown): void;
  sendUiTree(): void;
  sendDomSnapshot(): void;

  // Event subscription
  on(event: "connect" | "disconnect" | "error" | "command", handler: Function): void;
  off(event: string, handler: Function): void;
};

export function createDebugBridge(config: DebugBridgeConfig): DebugBridge;
```

### 8.3 Usage Example

```typescript
// src/debug-bridge.ts
import { createDebugBridge } from "@debug-bridge/browser";
import { store } from "./store";

export const debugBridge = createDebugBridge({
  url: `ws://localhost:4000/debug?role=app&sessionId=${getSessionId()}`,
  sessionId: getSessionId(),
  appName: "MyApp",
  appVersion: "1.0.0",

  enableDomSnapshot: true,
  enableDomMutations: true,
  enableUiTree: true,
  enableConsole: true,
  enableErrors: true,
  enableEval: process.env.NODE_ENV === "development",
  enableScreenshot: true,

  getCustomState: () => ({
    route: window.location.pathname,
    auth: { isLoggedIn: store.auth.isLoggedIn, userId: store.auth.userId },
    cart: { itemCount: store.cart.items.length },
  }),

  onConnect: () => console.log("[DebugBridge] Connected"),
  onDisconnect: () => console.log("[DebugBridge] Disconnected"),
});

function getSessionId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("debugSession") || "default";
}

// Initialize in dev only
if (process.env.NODE_ENV === "development") {
  debugBridge.connect();
}
```

### 8.4 React Integration

```tsx
// src/components/DebugBridgeProvider.tsx
import { useEffect } from "react";
import { debugBridge } from "../debug-bridge";

export function DebugBridgeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    debugBridge.connect();
    return () => debugBridge.disconnect();
  }, []);

  return <>{children}</>;
}
```

---

## 9. Agent Integration

### 9.1 Connecting as an Agent

```python
# Python example using websockets
import asyncio
import websockets
import json

async def connect_as_agent(session_id: str):
    uri = f"ws://localhost:4000/debug?role=agent&sessionId={session_id}"

    async with websockets.connect(uri) as ws:
        # Wait for hello and capabilities
        hello = json.loads(await ws.recv())
        print(f"Connected to: {hello['appName']} at {hello['url']}")

        capabilities = json.loads(await ws.recv())
        print(f"Capabilities: {capabilities['capabilities']}")

        # Request UI tree
        await ws.send(json.dumps({
            "protocolVersion": 1,
            "sessionId": session_id,
            "timestamp": int(time.time() * 1000),
            "origin": "agent",
            "type": "request_ui_tree",
            "requestId": "req-1"
        }))

        # Process messages
        async for message in ws:
            msg = json.loads(message)
            await handle_message(msg, ws)
```

### 9.2 LLM System Prompt

For LLM-based agents, include this protocol description:

```markdown
## Debug Bridge Protocol

You are connected to a web application via the Debug Bridge protocol. You will receive telemetry messages and can send commands.

### Telemetry You'll Receive

- `ui_tree`: List of interactive elements with `stableId`, `role`, `text`, `disabled`, `visible`
- `dom_mutations`: Changes to the DOM
- `console`: Console logs from the app
- `error`: Runtime errors
- `state_update`: App state changes (auth, cart, route, etc.)

### Commands You Can Send

1. **Click an element**:
   ```json
   {"type": "click", "requestId": "unique-id", "target": {"stableId": "login-button"}}
   ```

2. **Type into an input**:
   ```json
   {"type": "type", "requestId": "unique-id", "target": {"stableId": "email-input"}, "text": "user@example.com"}
   ```

3. **Navigate to a URL**:
   ```json
   {"type": "navigate", "requestId": "unique-id", "url": "/dashboard"}
   ```

4. **Request fresh UI tree**:
   ```json
   {"type": "request_ui_tree", "requestId": "unique-id"}
   ```

### Targeting Elements

Use these methods in priority order:
1. `stableId`: The `stableId` from `ui_tree` items (most reliable)
2. `selector`: A CSS selector
3. `text` + `role`: Find by visible text and role

### Handling Results

Every command returns a `command_result` with `success: true/false`. Always check results before proceeding.
```

---

## 10. Security Considerations

### 10.1 Production Deployment

**DO NOT** enable the debug bridge in production unless:

1. Behind VPN/internal network only
2. Strong authentication enabled
3. `eval` capability disabled
4. Rate limiting enabled
5. Connections audited and logged

### 10.2 Security Checklist

- [ ] Debug bridge disabled in production builds
- [ ] Auth tokens rotated regularly
- [ ] `enableEval: false` unless absolutely necessary
- [ ] Rate limiting configured
- [ ] Network access restricted
- [ ] Sensitive state excluded from `getCustomState`
- [ ] Screenshot capability disabled if sensitive data visible

### 10.3 Content Security Policy

If using CSP, add the WebSocket endpoint:

```html
<meta http-equiv="Content-Security-Policy" content="connect-src 'self' ws://localhost:4000">
```

---

## 11. Performance Guidelines

### 11.1 DOM Mutation Batching

Mutations are batched to reduce message volume:

```typescript
// Internal batching logic
let pendingMutations: DomMutation[] = [];
let batchTimeout: number | null = null;

function queueMutation(mutation: DomMutation) {
  pendingMutations.push(mutation);

  if (!batchTimeout) {
    batchTimeout = setTimeout(() => {
      sendMutationBatch();
      batchTimeout = null;
    }, config.domMutationBatchMs);
  }
}

function sendMutationBatch() {
  if (pendingMutations.length === 0) return;

  send({
    type: "dom_mutations",
    batchId: generateId(),
    batchSize: pendingMutations.length,
    mutations: pendingMutations,
  });

  pendingMutations = [];
}
```

### 11.2 UI Tree Throttling

UI tree updates are throttled:

```typescript
const throttledSendUiTree = throttle(() => {
  send({
    type: "ui_tree",
    items: buildUiTree(),
  });
}, config.uiTreeThrottleMs);
```

### 11.3 Payload Size Limits

- DOM snapshots: Truncate at `maxDomSnapshotSize` (default 5MB)
- Console args: Limit count and length
- Screenshots: Compress with quality setting

---

## 12. Versioning & Compatibility

### 12.1 Protocol Version

The `protocolVersion` field in all messages enables:

- Clients to verify server compatibility
- Servers to handle multiple protocol versions
- Graceful degradation for older clients

### 12.2 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2024-01 | Initial specification |

### 12.3 Compatibility Rules

1. **Adding fields**: New optional fields are backward compatible
2. **New message types**: Clients should ignore unknown types
3. **Breaking changes**: Require major version bump

---

## 13. Appendix

### 13.1 CSS Selector Generation

Helper for generating stable CSS selectors:

```typescript
function cssPath(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const path: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    current = parent;
  }

  return path.join(" > ");
}
```

### 13.2 Stable ID Generation

```typescript
function generateStableId(el: Element): string {
  // Priority 1: data-testid
  const testId = el.getAttribute("data-testid");
  if (testId) return testId;

  // Priority 2: data-debug-id
  const debugId = el.getAttribute("data-debug-id");
  if (debugId) return debugId;

  // Priority 3: id (if not auto-generated)
  const id = el.id;
  if (id && !id.startsWith(":") && !id.match(/^r[a-z0-9]+$/)) {
    return id;
  }

  // Priority 4: Content hash
  const role = el.getAttribute("role") || el.tagName.toLowerCase();
  const text = (el.textContent || "").trim().substring(0, 20);
  if (text) {
    const hash = simpleHash(text);
    return `${role}-${hash}`;
  }

  // Priority 5: Structural path
  return cssPath(el).replace(/[^a-zA-Z0-9]/g, "-");
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
```

### 13.3 Safe Stringify

```typescript
function stringifySafe(value: unknown, maxLength = 1000): string {
  try {
    const seen = new WeakSet();
    const str = JSON.stringify(value, (key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      if (typeof val === "function") return "[Function]";
      if (val instanceof Error) return { message: val.message, stack: val.stack };
      if (val instanceof HTMLElement) return `[HTMLElement: ${val.tagName}]`;
      return val;
    });
    return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
  } catch {
    return String(value);
  }
}
```

---

## 14. Changelog from Original PRD

| Change | Rationale |
|--------|-----------|
| Added `protocolVersion` to all messages | Forward compatibility |
| Added `requestId` to all commands | Async response correlation |
| Added `appId` for multi-app sessions | Support multiple apps per session |
| Added `connection_event` messages | Agents know when apps connect/disconnect |
| Added `ui_element_update` message | Targeted updates reduce UI tree refreshes |
| Added `screenshot` capability | Visual debugging support |
| Added `scroll`, `hover`, `select`, `focus` commands | Complete interaction surface |
| Added `batchId` to DOM mutations | Track mutation batches |
| Enhanced `stableId` generation guidance | Reduce element targeting failures |
| Added rate limiting spec | Prevent abuse |
| Added error codes to results | Structured error handling |
| Added `duration` to command results | Performance monitoring |
| Server config made configurable | Port, auth, limits |
| Added viewport info to messages | Visual context for agents |
