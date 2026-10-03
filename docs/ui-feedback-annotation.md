# UI Feedback Annotation

Reference for feedback batches, their artifacts and protocol messages, and the `debug-bridge-feedback-mcp` server. The capture surface is the [Design Mode dock](./design-mode-dock.md), which the sidecar shows on every page by default. The legacy top toolbar and right-hand panel no longer exist.

Two ways to get the dock on a page:

| Setup | How | Needs code changes |
|-------|-----|--------------------|
| Sidecar (default) | `debug-bridge browser open <url>` enables Design Mode automatically | No |
| Embedded SDK (optional) | `createDebugBridge({ ..., feedback: { enabled: true } })` | Yes |

For the sidecar flow, an agent receives requests with `debug-bridge browser wait` ([agent-loop](./agent-loop.md)). The rest of this page covers batches persisted through the bridge and the MCP server, which suit agents that prefer MCP tools.

## Embedded SDK options

```ts
createDebugBridge({
  url: 'ws://localhost:4000/debug?sessionId=default',
  sessionId: 'default',
  feedback: {
    enabled: true,
    launcher: false,
    shortcut: 'Mod+Shift+F',
    captureTelemetry: true,
    captureAppState: true,
    captureSourceHints: true,
  },
});
```

With `launcher: false` the SDK dock opens only through the shortcut (`Mod+Shift+F`) or the bridge commands below. Fields of `FeedbackConfig` (see `packages/types/src/config/index.ts`): `enabled`, `launcher`, `shortcut`, `maxImageBytes`, `maxImageDimension`, `captureTelemetry`, `captureAppState`, `captureSourceHints`. The overlay can also be shown or hidden with bridge commands `ui_feedback_enable` and `ui_feedback_disable`, or the REPL aliases `feedback on` and `feedback off`.

## Artifacts

Submitted batches are persisted locally by the CLI/server:

```text
.debug-bridge/feedback/<batch-id>/
  batch.json
  summary.md
  items/
    <item-id>/
      item.json
      screenshot.webp|png
      annotated.webp|png
```

Artifacts include routes, viewport, marks, comments, source hints, app state, recent telemetry, and git/worktree metadata. `.debug-bridge/feedback/` is gitignored.

## Protocol

Browser to server:

- `ui_feedback_batch_submit`
- `ui_feedback_suggestion_accepted`
- `ui_feedback_suggestion_rejected`
- `ui_feedback_suggestion_commented`

Server to agent:

- `ui_feedback_batch_created`
- `ui_feedback_suggestion_decision`

Agent to browser:

- `ui_feedback_suggestion_added`
- `ui_feedback_status_update`
- `ui_feedback_comment_added`

Accepted suggestions are persisted as patch hints. The browser SDK does not auto-apply DOM or CSS changes.

## MCP Server

`debug-bridge-feedback-mcp` (a workspace package, not on npm; run its built binary from this repo) is the persistent watcher/API layer. It connects to the bridge as `role=agent`, exposes feedback artifacts as MCP resources, and provides tools for the coding agent.

Example MCP command:

```bash
node packages/feedback-mcp/dist/bin/feedback-mcp.js \
  --bridge-port 4000 \
  --session default \
  --feedback-dir .debug-bridge/feedback
```

Equivalent environment variables:

```bash
DEBUG_BRIDGE_PORT=4000
DEBUG_BRIDGE_SESSION=default
DEBUG_BRIDGE_FEEDBACK_DIR=.debug-bridge/feedback
```

Resources:

- `feedback://latest`
- `feedback://batch/<batch-id>`
- `feedback://summary/<batch-id>`

Tools:

- `feedback_status` reports bridge connection state and latest feedback event.
- `list_feedback_batches` lists persisted feedback artifacts.
- `read_feedback_batch` reads a batch plus its summary.
- `wait_for_feedback_batch` waits for the next submitted batch event.
- `wait_for_feedback_decision` waits for the user to accept, reject, or comment on a suggestion.
- `set_feedback_overlay` shows or hides the feedback overlay in the connected app.
- `send_visual_suggestion` renders an agent suggestion card and marks back in the live overlay.
- `browser_open`, `browser_snapshot`, `browser_click`, `browser_fill` drive the managed browser sidecar.
- `preview_code_fix` injects temporary CSS for instant review before editing files.
- `design_mode_control` controls Design Mode.

Options: `--bridge-host`, `--bridge-port`, `--session`, `--feedback-dir`, `--ws-url`.

## CLI

```bash
debug-bridge connect --feedback-dir .debug-bridge/feedback
```

REPL aliases for manual testing (`connect` prompt):

```text
feedback on
feedback off
feedback-suggest <item-id> <comment>
```

## Validate

```bash
pnpm run type-check
pnpm run build
pnpm test
```

`pnpm test` runs type-check, builds, then `scripts/run-demo-validations.mjs`: bridge, feedback annotation, feedback MCP (two scripts), and CDP sidecar validations.
