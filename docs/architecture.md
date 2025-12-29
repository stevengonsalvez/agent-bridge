# Debug Bridge Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT (Claude Code)                                │
│                                                                              │
│   Sends commands via stdin ──────────────────────────────────────────┐      │
│   Receives telemetry via stdout ◄────────────────────────────────────┤      │
└──────────────────────────────────────────────────────────────────────┼──────┘
                                                                       │
                                                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           @debug-bridge/cli                                   │
│                                                                               │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │  WebSocket Server   │  │  Output Formatter   │  │  Stdin Handler      │  │
│  │                     │  │                     │  │                     │  │
│  │  • Listens for app  │  │  • JSON mode        │  │  • Parses commands  │  │
│  │  • Routes messages  │  │  • Human REPL mode  │  │  • Validates input  │  │
│  │  • Session mgmt     │  │  • Telemetry format │  │  • Forwards to app  │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  │
│              ▲                                                                │
└──────────────┼────────────────────────────────────────────────────────────────┘
               │ WebSocket
               │
┌──────────────┴────────────────────────────────────────────────────────────────┐
│                           BROWSER                                             │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    @debug-bridge/browser SDK                             │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │                    Telemetry Collectors                           │   │ │
│  │  │                                                                   │   │ │
│  │  │  • DOM Observer      - MutationObserver for DOM changes          │   │ │
│  │  │  • UI Tree Builder   - Extracts interactive elements             │   │ │
│  │  │  • Console Hook      - Intercepts console.log/warn/error         │   │ │
│  │  │  • Error Hook        - Catches runtime errors & rejections       │   │ │
│  │  │  • State Subscriber  - Connects to app state (Zustand/Redux)     │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │                    Command Executor                               │   │ │
│  │  │                                                                   │   │ │
│  │  │  • click, type, hover, focus, select                             │   │ │
│  │  │  • navigate, scroll                                              │   │ │
│  │  │  • evaluate (JS execution)                                       │   │ │
│  │  │  • request_ui_tree, request_state, request_dom_snapshot          │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         Web Application                                  │ │
│  │                    (React, Vue, Angular, etc.)                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Package Responsibilities

### @debug-bridge/types

Shared TypeScript definitions for the protocol.

| Module | Purpose |
|--------|---------|
| `messages/base` | Base message structure with protocol version, session ID, timestamp |
| `messages/connection` | Hello and capabilities handshake messages |
| `messages/telemetry` | DOM snapshot, mutations, UI tree, console, errors, state updates |
| `messages/commands` | All command types (click, type, navigate, etc.) |
| `messages/results` | Command result structure with error codes |
| `config` | CLI and browser SDK configuration types |
| `utils` | Element targets, UI tree items, DOM mutations |

---

### @debug-bridge/cli

Command-line interface with embedded WebSocket server.

| Component | Responsibility |
|-----------|----------------|
| **WebSocket Server** | Listens on configurable port, manages app connections, routes messages between app and agent |
| **Session Manager** | Validates session IDs, ensures single app per session |
| **Output Formatter** | Transforms internal messages to stdout (JSON mode for agents, human-readable for REPL) |
| **Stdin Handler** | Parses incoming commands (JSON or simple text), validates, forwards to connected app |
| **Telemetry Receiver** | Receives telemetry from app, formats and outputs to agent |

**CLI Modes:**

| Mode | Purpose | Output Format |
|------|---------|---------------|
| JSON | Agent consumption (Claude Code) | JSONL to stdout, JSON from stdin |
| Human | Interactive debugging | Formatted text, REPL prompt |

---

### @debug-bridge/browser

Browser SDK that embeds in web applications.

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

## Data Flow

### Telemetry Flow (App → Agent)

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

### Command Flow (Agent → App)

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

## Connection Lifecycle

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

## UI Tree Structure

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

## Monorepo Structure

```
agent-bridge/
├── packages/
│   ├── types/              @debug-bridge/types
│   ├── cli/                @debug-bridge/cli
│   └── browser/            @debug-bridge/browser
├── apps/
│   └── sample-react-app/   Test application
├── docs/
│   └── architecture.md     This document
├── .claude/
│   └── skills/
│       └── debug-bridge.md CLI reference for agents
├── package.json            Root workspace config
├── pnpm-workspace.yaml     pnpm workspace definition
├── turbo.json              Turborepo build config
├── tsconfig.base.json      Shared TypeScript config
├── spec.md                 Protocol specification
└── prd.md                  Product requirements
```

---

## Build Dependencies

```
                 @debug-bridge/types
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
   @debug-bridge/cli           @debug-bridge/browser
          │                             │
          │                             │
          └──────────────┬──────────────┘
                         │
                         ▼
               sample-react-app
```

---

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Monorepo | pnpm + Turborepo | Fast installs, efficient caching |
| Language | TypeScript | Type safety across packages |
| CLI Server | ws (WebSocket) | Lightweight, no framework overhead |
| CLI Parser | commander | Standard Node.js CLI tooling |
| Browser SDK | Vanilla TS | Zero dependencies, minimal bundle |
| Test App | React + Vite | Fast development iteration |
| State | Zustand | Simple, easy to expose to bridge |
| Build | tsup | Fast, zero-config TypeScript builds |
