# Debug Bridge Architecture

Explanation of how the pieces fit together and why. For commands see [cli-reference](./cli-reference.md); for the agent workflow see [agent-loop](./agent-loop.md).

## System Overview

The default setup is zero-instrumentation: nothing is added to your app. A Playwright CDP sidecar drives a managed Chrome from outside, the bridge server routes messages, and agents attach as clients.

```
┌────────────┐ WS role=agent ┌───────────────────────┐ WS role=provider ┌──────────────┐
│  Agent     │◀─────────────▶│ Bridge server (:4000) │◀────────────────▶│ Sidecar      │
│ browser *  │               │ packages/cli          │                  │ (Playwright) │
│ browser    │               └───────────┬───────────┘                  └──────┬───────┘
│  wait      │                           │ WS role=app (optional)              │ CDP
└────────────┘                 ┌─────────┴─────────┐                           ▼
                               │ Embedded SDK app  │                    ┌──────────────┐
                               └───────────────────┘                    │ Managed      │
                                                                        │ Chrome + dock│
                                                                        └──────────────┘
```

Roles on the bridge WebSocket (`/debug?role=...&sessionId=...`):

| Role | Who | Notes |
|------|-----|-------|
| `agent` | CLI browser commands, `browser wait`, feedback MCP, scripts | `browser wait` adds `listener=1` so the bridge can count connected listeners |
| `provider` | The CDP sidecar | Announces itself with `provider_hello`, executes `browser_*` commands |
| `app` | Page running the optional embedded SDK | Telemetry and in-page commands |

## The Send path

```
dock Send
   │  page calls window.__agentBridgeHost (exposed by the sidecar)
   ▼
sidecar: write screenshots + context JSON, try tmux/cmux injection
   │
   ▼
broadcast browser_design_mode_submit ─▶ bridge ─▶ every agent client on the session
                                                  (`browser wait` exits 0)
```

Two delivery routes exist on purpose. Terminal injection (Send only; the copy buttons never inject) types the prompt into a pane for agents that live in a terminal. The WebSocket broadcast reaches any agent harness that can run a background command. Injection is best effort and can misfire in auto mode ([tmux-injection](./tmux-injection.md)); the broadcast is the dependable route.

`browser wait` is single-shot. If a Send arrives while no `wait` is connected, the bridge keeps the latest one and hands it to the next `wait` that connects (only the latest; earlier unclaimed Sends are dropped). The skill still tells agents to re-arm first so a second Send isn't dropped.

## Package Responsibilities

| Package | Role |
|---------|------|
| `debug-bridge-cli` (`packages/cli`) | `debug-bridge` binary: bridge WebSocket server, provider registry, feedback store, `browser` and `skill` commands, REPL |
| `debug-bridge-browser-sidecar` (`packages/browser-sidecar`) | Playwright provider: managed or connected Chrome, profiles and storage state, Design Mode artifacts, tmux injector |
| `debug-bridge-browser` (`packages/browser`) | Optional in-app SDK, feedback controller, and the Design Mode dock runtime |
| `debug-bridge-feedback-mcp` (`packages/feedback-mcp`) | MCP server over stdio for feedback batches and browser tools |
| `debug-bridge-skill` (`packages/skill`) | Skill installer package (not published to npm) |
| `debug-bridge-types` (`packages/types`) | Protocol message and config types |
| `apps/sample-react-app` | Test app exercising the SDK and the dock |

Skills live in `skills/` at the repo root and are the installable artifact (`skills/debug-bridge/SKILL.md`).

### debug-bridge-types

Shared TypeScript definitions for the protocol.

| Module | Purpose |
|--------|---------|
| `messages/base`, `connection`, `telemetry`, `commands`, `results` | Core protocol: handshake, telemetry, app commands, results with error codes |
| `messages/browser` | Sidecar `browser_*` commands, results, and `browser_design_mode_submit` |
| `messages/design-mode`, `messages/feedback` | Design Mode and feedback batch messages |
| `config` | CLI and SDK configuration types |
| `utils` | Element targets, UI tree items, DOM mutations |

### debug-bridge-cli

| Component | Responsibility |
|-----------|----------------|
| WebSocket server | Listens on the configured port, tracks clients per session, routes messages |
| Provider registry | Tracks connected providers such as the sidecar |
| Feedback store | Persists feedback batches under `.debug-bridge/feedback` |
| Browser commands | One-shot agent clients for `browser open`, `snapshot`, `click`, `wait`, and so on |
| Output formatter and stdin handler | JSON mode for agents, REPL for humans |

### debug-bridge-browser (optional embedded SDK)

Browser SDK that embeds in web applications. Not needed for the sidecar flow. The package also contains the Design Mode runtime that the sidecar injects into pages (`packages/browser/src/runtime/design-mode-runtime.ts`).

| Component | Responsibility |
|-----------|----------------|
| **Bridge** | Main entry point, manages connection lifecycle, coordinates telemetry and commands |
| **WebSocket Client** | Connects to CLI server, handles reconnection, message serialization |

**Telemetry Collectors:**

| Collector | What It Captures |
|-----------|------------------|
| **DOM Observer** | DOM mutations via MutationObserver, batched for efficiency |
| **UI Tree Builder** | Interactive elements (buttons, inputs, links) with stable IDs, roles, labels |
| **Console Hook** | Intercepts console methods, serializes arguments |
| **Error Hook** | Runtime errors and unhandled promise rejections |
| **State Subscriber** | Custom app state via user-provided getter function |

**Command Executor:**

| Command | Action |
|---------|--------|
| `click` | Dispatches click event on target element |
| `type` | Sets value, dispatches input/change events |
| `hover` | Dispatches mouseenter/mouseover events |
| `focus` | Focuses element |
| `select` | Sets select element value |
| `scroll` | Scrolls window or element |
| `navigate` | Changes window.location |
| `evaluate` | Executes arbitrary JavaScript (if enabled) |
| `request_ui_tree` | Returns current UI tree |
| `request_state` | Returns current app state |
| `request_dom_snapshot` | Returns full DOM HTML |

**Element Resolution Priority:**

1. `data-testid` attribute
2. Element `id` attribute
3. CSS selector
4. Text content match

---

## Monorepo Structure

```
agent-bridge/
├── packages/
│   ├── types/            debug-bridge-types
│   ├── cli/              debug-bridge-cli
│   ├── browser-sidecar/  debug-bridge-browser-sidecar
│   ├── browser/          debug-bridge-browser (SDK + Design Mode runtime)
│   ├── feedback-mcp/     debug-bridge-feedback-mcp
│   └── skill/            debug-bridge-skill
├── apps/
│   └── sample-react-app/ Test application
├── skills/               Installable agent skills (debug-bridge, test-design-mode, agentic-e2e-test)
├── scripts/              Validation and test scripts
├── docs/                 These documents
├── .claude-plugin/       Claude Code plugin and marketplace metadata
├── spec.md               Protocol specification
└── prd.md                Product requirements
```

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Monorepo | pnpm + Turborepo | Fast installs, efficient caching |
| Language | TypeScript | Type safety across packages |
| Bridge server | ws (WebSocket) | Lightweight, no framework overhead |
| CLI parser | commander | Standard Node.js CLI tooling |
| Browser control | Playwright over CDP | Real Chrome, no app instrumentation |
| Browser SDK | Vanilla TS | Zero dependencies, minimal bundle |
| Test app | React + Vite | Fast development iteration |
| Build | tsup | Fast, zero-config TypeScript builds |

## Embedded SDK internals (optional path)

Applies only when an app uses `debug-bridge-browser`.

### Data flow

#### Telemetry flow (App → Agent)

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │         │    CLI      │         │   Agent     │
│   SDK       │         │   Server    │         │             │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  hello                │                       │
       │──────────────────────►│                       │
       │                       │  app_connected        │
       │                       │──────────────────────►│
       │                       │                       │
       │  ui_tree              │                       │
       │──────────────────────►│                       │
       │                       │  telemetry:ui_tree    │
       │                       │──────────────────────►│
       │                       │                       │
       │  state_update         │                       │
       │══════════════════════►│  telemetry:state      │
       │  (on state change)    │══════════════════════►│
       │                       │                       │
       │  console              │                       │
       │══════════════════════►│  telemetry:console    │
       │  (on console.log)     │══════════════════════►│
       │                       │                       │
```

#### Command flow (Agent → App)

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Agent     │         │    CLI      │         │   Browser   │
│             │         │   Server    │         │   SDK       │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  click command        │                       │
       │──────────────────────►│                       │
       │  (stdin)              │  click command        │
       │                       │──────────────────────►│
       │                       │                       │
       │                       │                       │  Execute
       │                       │                       │  click
       │                       │                       │
       │                       │  command_result       │
       │                       │◄──────────────────────│
       │  command_result       │                       │
       │◄──────────────────────│                       │
       │  (stdout)             │                       │
       │                       │                       │
```

---

### Connection lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                      Connection States                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   CLI Started                                                     │
│       │                                                           │
│       ▼                                                           │
│   ┌───────────────────┐                                          │
│   │  Waiting for App  │◄─────────────────────────────────┐       │
│   └─────────┬─────────┘                                  │       │
│             │ App connects with matching session         │       │
│             ▼                                            │       │
│   ┌───────────────────┐                                  │       │
│   │  App Connected    │                                  │       │
│   └─────────┬─────────┘                                  │       │
│             │ Receive hello + capabilities               │       │
│             ▼                                            │       │
│   ┌───────────────────┐                                  │       │
│   │  Active Session   │──── App disconnects ─────────────┘       │
│   │                   │                                          │
│   │  • Telemetry flow │                                          │
│   │  • Commands work  │                                          │
│   └───────────────────┘                                          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

### UI tree structure

The UI Tree is a distilled view of interactive elements, optimized for agent reasoning.

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Tree Item                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   stableId     Unique identifier for targeting                  │
│                Priority: data-testid > id > generated           │
│                                                                  │
│   selector     CSS selector path to element                     │
│                                                                  │
│   role         Semantic role (button, link, input, etc.)        │
│                                                                  │
│   text         Visible text content (truncated)                 │
│                                                                  │
│   label        aria-label or title attribute                    │
│                                                                  │
│   disabled     Whether element is disabled                      │
│                                                                  │
│   visible      Whether element is visible                       │
│                                                                  │
│   meta         Additional metadata (tagName, type, href, etc.)  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---
