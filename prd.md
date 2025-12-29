# `@debug-bridge` — Agent-Friendly In-App Debug Bridge

> **Purpose**  
> A generic, framework-agnostic “debug bridge” you embed in your web app so any external **agent** (Codex, Claude, Copilot, etc.) can connect via **WebSocket** and:
>
> - Inspect: DOM, UI tree, console logs, runtime errors, and custom app state  
> - Act: click, type, navigate, evaluate code  
>
> All without Playwright/Selenium/DevTools, and with a **small, LLM-friendly JSON protocol**.

---

## 1. High-Level Overview

### 1.1 Problem

Existing approaches for AI-driven debugging/testing (Playwright, Selenium, Chrome DevTools / CDP / MCP servers) are:

- **Browser-centric**, not app-centric  
- **Heavyweight** and brittle for LLMs to drive directly  
- Optimized for QA humans or code-based tests, not for agentic tooling

We want something simpler:

> “Let my web app expose a **first-class debug surface** over WebSocket that agents can use directly.”

### 1.2 Solution

Build a **`debug-bridge`** that:

- Runs **in the browser app** and connects to a WebSocket server  
- Streams:
  - DOM snapshots & incremental DOM mutations
  - A distilled UI tree of interactive elements
  - Console logs and runtime errors
  - Optional app state (Redux/Zustand/etc.)
- Listens for **commands** from an agent:
  - `click`, `type`, `navigate`, `evaluate`, `request_dom_snapshot`, `request_ui_tree`

This is packaged as:

- A **Browser Client SDK**: `@debug-bridge/browser`  
- A **Node Debug Server**: `@debug-bridge/server`  
- A small **JSON protocol** designed to be easily promptable for LLM agents

---

## 2. Architecture

### 2.1 Components

1. **Browser Client (in-app)**  
   - Runs inside your React/Vue/vanilla app  
   - Opens a WebSocket to the debug server  
   - Emits telemetry:
     - `hello`, `capabilities`
     - `dom_snapshot`, `dom_mutations`
     - `ui_tree`
     - `console`, `error`, `unhandledrejection`
     - optional `state_update`  
   - Executes commands:
     - `click`, `type`, `navigate`, `evaluate`
     - `request_dom_snapshot`, `request_ui_tree`

2. **Debug Server (Node)**  
   - Relays messages between:
     - App connections (`role=app`)
     - Agent connections (`role=agent`)
   - Groups connections by `sessionId`  
   - Stateless and tiny (can run next to your dev server)

3. **Agents (Codex/Claude/Copilot/etc.)**  
   - Connect to the WebSocket server with `role=agent&sessionId=...`  
   - Consume JSON messages  
   - Send JSON commands  
   - Use the protocol as their action/observation space

---

## 3. Protocol Design

All messages are JSON objects with a shared base shape.

### 3.1 Base Message

Every message includes:

- `sessionId`: logical session/group ID  
- `timestamp`: milliseconds since epoch  
- `origin`: `"app"` or `"agent"`  
- `type`: discriminant string

Example TypeScript type (for docs):

```ts
type BaseMessage = {
  sessionId: string;
  timestamp: number;
  origin: "app" | "agent";
  type: string;
};
```

Protocol messages are then:

```ts
type BridgeMessage =
  | ConnectionMessage
  | CapabilityMessage
  | DomSnapshotMessage
  | DomMutationMessage
  | UiTreeMessage
  | ConsoleMessage
  | ErrorMessage
  | CustomStateMessage
  | CommandMessage
  | CommandResultMessage;
```

---

### 3.2 Connection & Capabilities

App → Agent on connection:

```ts
type ConnectionMessage = BaseMessage & {
  type: "hello";
  appName?: string;
  appVersion?: string;
  url: string;
  userAgent: string;
};

type CapabilityMessage = BaseMessage & {
  type: "capabilities";
  capabilities: string[]; // e.g. ["dom_snapshot", "dom_mutations", "ui_tree", "console", "eval"]
};
```

Agents use this to know what they can do.

---

### 3.3 DOM Snapshot & Mutations

Full DOM snapshot (on connect or on request):

```ts
type DomSnapshotMessage = BaseMessage & {
  type: "dom_snapshot";
  html: string; // document.documentElement.outerHTML
};
```

Incremental DOM mutations (via MutationObserver):

```ts
type DomMutationMessage = BaseMessage & {
  type: "dom_mutations";
  mutations: Array<{
    mutationType: "childList" | "attributes" | "characterData";
    targetSelector: string;
    attributeName?: string;
    addedNodes?: string[];    // HTML or text
    removedNodes?: string[];  // HTML or text
    textContent?: string | null;
  }>;
};
```

---

### 3.4 UI Tree (Interactive Elements)

Rather than raw DOM only, the bridge provides a distilled **UI tree** of interactive elements (buttons, links, inputs, etc.), which is much easier for LLMs.

```ts
type UiTreeMessage = BaseMessage & {
  type: "ui_tree";
  items: Array<{
    id: string;             // stable identifier (data-testid, or generated)
    selector: string;       // CSS path fallback
    role: string;           // e.g. "button", "link", "input"
    text?: string;          // inner text
    disabled?: boolean;
    visible?: boolean;
    meta?: Record<string, any>; // e.g. aria-label, type, name
  }>;
};
```

Agents can reason in terms of `id`, `role`, and `text` to decide which element to interact with.

---

### 3.5 Console Logs & Errors

Console events:

```ts
type ConsoleMessage = BaseMessage & {
  type: "console";
  level: "log" | "info" | "warn" | "error";
  args: string[]; // pre-stringified
};
```

Errors and unhandled promise rejections:

```ts
type ErrorMessage = BaseMessage & {
  type: "error" | "unhandledrejection";
  message?: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  reason?: string; // for unhandledrejection
};
```

Agents can use these to debug failures, look for warnings, etc.

---

### 3.6 Custom State

Optional app-level state exposure:

```ts
type CustomStateMessage = BaseMessage & {
  type: "state_update";
  scope: string; // e.g. "auth", "cart", "route", "featureFlags"
  state: any;    // JSON-serializable value
};
```

You can plug Redux/Zustand/router or anything else into this.

---

### 3.7 Commands (Agent → App)

**Command types:**

```ts
type ClickCommand = {
  type: "click";
  target: { selector?: string; id?: string; text?: string };
};

type TypeCommand = {
  type: "type";
  target: { selector?: string; id?: string };
  text: string;
  clear?: boolean;
};

type NavigateCommand = {
  type: "navigate";
  url: string;
};

type EvaluateCommand = {
  type: "evaluate";
  code: string;
  requestId?: string;
};

type RequestUiTreeCommand = {
  type: "request_ui_tree";
};

type RequestDomSnapshotCommand = {
  type: "request_dom_snapshot";
};

type CommandMessage = BaseMessage &
  (
    | ClickCommand
    | TypeCommand
    | NavigateCommand
    | EvaluateCommand
    | RequestUiTreeCommand
    | RequestDomSnapshotCommand
  );
```

**Command results:**

```ts
type CommandResultMessage = BaseMessage & {
  type: "command_result";
  requestType: string;
  requestId?: string;
  success: boolean;
  error?: string;
  result?: string; // e.g. eval result
};
```

This gives agents a clear notion of whether an action worked or failed.

---

## 4. Browser Client SDK (`@debug-bridge/browser`)

### 4.1 Developer Usage (React Example)

**Initialization:**

```ts
// src/debugBridge.ts
import { createDebugBridge } from "@debug-bridge/browser";

const bridge = createDebugBridge({
  url: "ws://localhost:4000/debug?role=app&sessionId=local-dev",
  sessionId: "local-dev",

  enableDomSnapshot: true,
  enableDomMutations: true,
  enableUiTree: true,
  enableConsole: true,
  enableErrors: true,
  enableEval: true,

  // Optional: provide semantic state
  getCustomState: () => ({
    route: window.location.pathname,
    // cart: store.cart,
  }),
});

export function initDebugBridge() {
  if (process.env.NODE_ENV === "development") {
    bridge.connect();
  }
}
```

Then in your app’s entrypoint:

```ts
import { initDebugBridge } from "./debugBridge";
initDebugBridge();
```

---

### 4.2 SDK API

```ts
type DebugBridgeOptions = {
  url: string;              // WebSocket endpoint
  sessionId: string;        // logical session ID shared with agent
  headers?: Record<string, string>; // optional auth

  enableDomSnapshot?: boolean;
  enableDomMutations?: boolean;
  enableUiTree?: boolean;
  enableConsole?: boolean;
  enableErrors?: boolean;
  enableEval?: boolean;

  // Optional hooks
  getCustomState?: () => Record<string, any>;
  getUiTreeItems?: () => UiTreeMessage["items"];
};

type DebugBridge = {
  connect(): void;
  disconnect(): void;
  sendCustomState(scope: string, state: any): void;
};
```

Internally, `createDebugBridge`:

- Opens the WebSocket connection  
- Sends `hello` and `capabilities`  
- Emits initial `dom_snapshot`, `ui_tree`, `state_update` where enabled  
- Installs:
  - `MutationObserver` for `dom_mutations`
  - `console` monkeypatch for `console` messages
  - `window.onerror` & `unhandledrejection` listeners for `error` messages  
- Subscribes to incoming `CommandMessage` instances and executes them

---

### 4.3 Internal Helpers (Sketch)

**Sending messages:**

```ts
function send(socket: WebSocket | null, options: DebugBridgeOptions, payload: any) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const base: BaseMessage = {
    sessionId: options.sessionId,
    timestamp: Date.now(),
    origin: "app",
    type: payload.type,
  };
  socket.send(JSON.stringify({ ...base, ...payload }));
}
```

**Console hook:**

```ts
function hookConsole(sendFn: (m: any) => void) {
  const levels: (keyof Console)[] = ["log", "info", "warn", "error"];

  levels.forEach((level) => {
    const orig = console[level].bind(console);
    (console as any)[level] = (...args: any[]) => {
      const safeArgs = args.map(stringifySafe);
      sendFn({
        type: "console",
        level,
        args: safeArgs,
      });
      orig(...args);
    };
  });
}
```

**Error handlers:**

```ts
function hookErrors(sendFn: (m: any) => void) {
  window.addEventListener("error", (event) => {
    sendFn({
      type: "error",
      message: event.message,
      stack: event.error?.stack,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    sendFn({
      type: "unhandledrejection",
      reason: stringifySafe(event.reason),
    });
  });
}
```

**DOM observation:**

```ts
function observeDom(sendFn: (m: any) => void) {
  const observer = new MutationObserver((mutations) => {
    const simplified = mutations.map((m) => ({
      mutationType: m.type,
      targetSelector: cssPath(m.target as Element),
      attributeName: m.attributeName ?? undefined,
      addedNodes: [...m.addedNodes].map(serializeNode),
      removedNodes: [...m.removedNodes].map(serializeNode),
      textContent: m.target?.textContent ?? null,
    }));

    sendFn({ type: "dom_mutations", mutations: simplified });
  });

  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
}
```

**UI tree builder (default):**

```ts
function buildDefaultUiTree(): UiTreeMessage["items"] {
  const interactive = Array.from(
    document.querySelectorAll("button, a, input, [role='button']")
  ) as HTMLElement[];

  return interactive.map((el, index) => ({
    id: el.dataset.testid || `el-${index}`,
    selector: cssPath(el),
    role: el.getAttribute("role") || el.tagName.toLowerCase(),
    text: el.innerText?.trim(),
    disabled: (el as any).disabled ?? false,
    visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    meta: {
      "aria-label": el.getAttribute("aria-label") || undefined,
      type: el.getAttribute("type") || undefined,
      name: el.getAttribute("name") || undefined,
    },
  }));
}
```

**Command execution:**

```ts
function executeCommand(
  msg: CommandMessage,
  sendFn: (m: any) => void,
  options: DebugBridgeOptions
) {
  const baseResult = {
    type: "command_result",
    requestType: msg.type,
    requestId: (msg as any).requestId,
  };

  try {
    switch (msg.type) {
      case "click": {
        const el = resolveTargetElement(msg.target);
        if (!el) throw new Error("target_not_found");
        el.click();
        sendFn({ ...baseResult, success: true });
        break;
      }

      case "type": {
        const el = resolveTargetElement(msg.target) as HTMLInputElement | null;
        if (!el) throw new Error("target_not_found");
        if (msg.clear) el.value = "";
        el.focus();
        el.value += msg.text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        sendFn({ ...baseResult, success: true });
        break;
      }

      case "navigate": {
        window.location.href = msg.url;
        sendFn({ ...baseResult, success: true });
        break;
      }

      case "evaluate": {
        if (!options.enableEval) {
          sendFn({ ...baseResult, success: false, error: "eval_disabled" });
          break;
        }
        // eslint-disable-next-line no-eval
        const result = eval(msg.code);
        sendFn({
          ...baseResult,
          success: true,
          result: stringifySafe(result),
        });
        break;
      }

      case "request_ui_tree": {
        const items =
          options.getUiTreeItems?.() ?? buildDefaultUiTree();
        sendFn({ type: "ui_tree", items });
        sendFn({ ...baseResult, success: true });
        break;
      }

      case "request_dom_snapshot": {
        sendFn({
          type: "dom_snapshot",
          html: document.documentElement.outerHTML,
        });
        sendFn({ ...baseResult, success: true });
        break;
      }
    }
  } catch (err: any) {
    sendFn({
      ...baseResult,
      success: false,
      error: err?.message ?? "unknown_error",
    });
  }
}
```

**Target resolution helper:**

```ts
function resolveTargetElement(target: {
  selector?: string;
  id?: string;
  text?: string;
}): HTMLElement | null {
  if (target.selector) {
    return document.querySelector(target.selector) as HTMLElement | null;
  }

  if (target.id) {
    const byTestId = document.querySelector(
      `[data-testid="${target.id}"]`
    ) as HTMLElement | null;
    if (byTestId) return byTestId;
  }

  if (target.text) {
    const candidates = Array.from(
      document.querySelectorAll("button, a, [role='button']")
    ) as HTMLElement[];
    return (
      candidates.find(
        (el) => el.innerText.trim() === target.text
      ) ?? null
    );
  }

  return null;
}
```

---

## 5. Node Debug Server (`@debug-bridge/server`)

### 5.1 Responsibilities

- Expose a WebSocket endpoint (e.g. `ws://localhost:4000/debug`)  
- Accept connections from:
  - Apps: `role=app`  
  - Agents: `role=agent`  
- Group clients by `sessionId`  
- For each message from app, forward to agents with same `sessionId`  
- For each message from agent, forward to apps with same `sessionId`  

### 5.2 Minimal Implementation Sketch

```ts
// server.ts
import { WebSocketServer, WebSocket } from "ws";
import { parse } from "url";

type Role = "app" | "agent";

type ClientInfo = {
  ws: WebSocket;
  role: Role;
  sessionId: string;
};

const wss = new WebSocketServer({ port: 4000 });
const clients: ClientInfo[] = [];

wss.on("connection", (ws, req) => {
  const { query } = parse(req.url || "", true);
  const role = (query.role as Role) || "app";
  const sessionId = (query.sessionId as string) || "default";
  const client: ClientInfo = { ws, role, sessionId };

  clients.push(client);

  ws.on("message", (data) => {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const targetRole: Role = role === "app" ? "agent" : "app";

    const targets = clients.filter(
      (c) =>
        c.sessionId === sessionId &&
        c.role === targetRole &&
        c.ws.readyState === ws.OPEN
    );

    for (const t of targets) {
      t.ws.send(JSON.stringify(msg));
    }
  });

  ws.on("close", () => {
    const idx = clients.indexOf(client);
    if (idx >= 0) clients.splice(idx, 1);
  });
});
```

### 5.3 Connection URLs

- App connects as:  
  `ws://localhost:4000/debug?role=app&sessionId=my-session`

- Agent connects as:  
  `ws://localhost:4000/debug?role=agent&sessionId=my-session`

No special SDK is needed on the agent side; just any WebSocket client that understands the JSON protocol.

---

## 6. Agent Integration Model

An LLM-based agent using this bridge would:

1. **Connect** to the debug server as `role=agent` with a chosen `sessionId`.  
2. **Wait** for:
   - `hello` → get context about app and URL  
   - `capabilities` → know what is supported  
   - initial `dom_snapshot`, `ui_tree`, `state_update` if enabled  
3. **Observe**:
   - `ui_tree` for structured list of interactive elements  
   - `dom_mutations` for changes after actions  
   - `console` & `error` for debugging signals  
   - `state_update` for semantic app state  
4. **Plan Actions**:
   - e.g., decide to click the button with `id="start"` and `text="Start"`  
   - or type into input with `role="input"` and `meta.name="email"`  
5. **Act**:
   - Send `click`, `type`, `navigate`, or `evaluate` commands  
6. **Check Results**:
   - Inspect `command_result` messages  
   - Examine updated `ui_tree`, `dom_mutations`, logs, and errors  

This protocol is small and regular enough to be described succinctly in a system prompt for Codex/Claude/Copilot.

---

## 7. Security & Performance

### 7.1 Security

- Enable only in **non-production** environments by default (`NODE_ENV === "development"`)  
- Optional protections:
  - Require an auth token (e.g., in `headers` or query string)  
  - Restrict which agents/origins/IPs can connect  
- Disable `evaluate` where you don’t trust the caller

### 7.2 Performance

- Batch DOM mutations (e.g. collect them for 50–100ms before sending)  
- Throttle UI tree updates (e.g. max 1–2 times per second)  
- Truncate:
  - Large console arguments  
  - Huge DOM fragments  
- Make each telemetry feature toggleable (DOM, UI tree, state, logs, errors)

---

## 8. Rationale & Ecosystem Context

### 8.1 Why this design makes a lot of sense

From an **AI agent’s** perspective, this is much nicer than driving Chrome DevTools or Playwright directly:

1. **Small, learnable protocol**  
   - A dozen message types instead of hundreds of CDP methods/events  
   - Human-readable semantics (`role`, `text`, `visible`, `id`) instead of low-level event streams  

2. **App semantics, not just raw DOM**  
   - The protocol talks in terms of “buttons”, “links”, “inputs”, “state slices”, and “routes”  
   - You can pipe in domain concepts (e.g. `state_update` with `scope: "paywall"` or `"cart"`) that an LLM can reason about directly  

3. **Stable, deliberate selectors**  
   - You control `id` semantics (e.g. `data-testid`) and how `ui_tree` is built  
   - No brittle XPath/CSS guessing or reliance on flaky heuristics  

4. **No browser-runner overhead**  
   - No need to spin up a headless browser, no Playwright install headaches, no CDP version mismatch  
   - It’s just your app + a small WebSocket connection  

5. **Extremely composable**  
   - You can plug in Redux, Zustand, router info, feature flags, A/B test variants, etc. into `state_update` events  
   - Agents can become state-aware instead of being blind “DOM clickers”  

In short: this bridge gives agents a clean, **app-native control surface** instead of a noisy, low-level browser protocol.

---

### 8.2 Why this isn’t already “a thing”

This architecture feels very natural, but the ecosystem just hasn’t standardized around it yet. Reasons:

1. **Historical inertia around browser-centric tools**  
   - Selenium/WebDriver → Puppeteer/Playwright → CDP  
   - All of these treat the **browser** as the target, not the **app**  
   - Tooling and mental models grew around “black-box URL plus automation”

2. **Most QA systems can’t modify the app**  
   - They want tools that work against any arbitrary site on the internet  
   - Your approach assumes you can **change the app** and embed a bridge  
   - That’s ideal for your own product/internal apps, but not universal  

3. **Browser vendors already expose DevTools protocols**  
   - Chrome DevTools Protocol is the standardized way to inspect/drive browsers  
   - Playwright/Puppeteer wrap this nicely for code-based tests  
   - There hasn’t been strong pressure to create an *app-level* protocol because CDP already “does everything” (for humans and scripted tests)

4. **The “agentic tools” use case is very new**  
   - Only recently have LLMs been good enough to run meaningful interactive debug/test loops  
   - We’re just starting to see “AI co-pilots for browsing/testing” appear  
   - Standards and libraries haven’t caught up to this specific need yet  

5. **Existing things rhyme with it, but don’t target agents**  
   - **Session replay tools** (rrweb, FullStory, etc.) already record DOM changes, events, logs, errors  
   - **Devtools overlays** and Redux/React DevTools already introspect app state  
   - But they rarely expose:
     - A small, generic **command API** (`click`, `type`, `navigate`, `evaluate`)  
     - A **public, framework-agnostic package** meant for AI agents to attach to  

So in spirit, the building blocks exist — but not packaged into a:

> “Drop this into your app; point any LLM agent at this WebSocket; now your app is agent-controllable and debuggable.”

That’s the gap `@debug-bridge` is meant to fill.

---

## 9. How to Move Forward

If you want to turn this into a real, reusable thing:

1. **Lock a v1 protocol**  
   - Keep the current message types and add a `protocolVersion: 1` field in `hello`/`capabilities`.  

2. **Implement the two NPM packages**  
   - `@debug-bridge/browser` — the SDK as sketched  
   - `@debug-bridge/server` — minimal Node WS relay  

3. **Write an “Agent Spec” document**  
   - A short description of the protocol aimed at LLMs (e.g. “When you see `ui_tree`, pick an element and send a `click` command”).  
   - This becomes the system prompt/tool description for Codex/Claude/Copilot.  

4. **Dogfood it on your own apps**  
   - Use it for your own agentic debugging/testing flows  
   - Iterate based on where the agent struggles (add metadata, new message types, better `ui_tree` semantics, etc.)  

Because nothing exactly like this exists as a generic, agent-focused, in-app debug bridge, there’s a genuine opportunity to define a pattern that others will likely converge on later.
