# UI Feedback Annotation

Agent Bridge can expose an SDK-present feedback overlay in development apps. It lets a developer select elements or regions, draw annotations, write comments, submit a multi-route batch, and receive agent visual suggestions back in the same live browser session.

## Enable

```ts
createDebugBridge({
  url: 'ws://localhost:4000/debug?sessionId=default',
  sessionId: 'default',
  feedback: {
    enabled: true,
    shortcut: 'Mod+Shift+F',
    captureTelemetry: true,
    captureAppState: true,
    captureSourceHints: true,
  },
});
```

The overlay can be opened by:

- `Mod+Shift+F`
- bridge command `ui_feedback_enable`
- CLI alias `feedback on`

Use `feedback off` or bridge command `ui_feedback_disable` to hide it.

## Workflow

The default overlay renders:

- top toolbar with select, region, rectangle, highlight, arrow, pen, text, undo, redo, clear, interact, and submit controls
- right panel with `Batch`, `Context`, and `Thread` tabs
- active batch pill when the panel is collapsed

Drawing tools capture app clicks while active. `Interact` mode lets the developer navigate normally while keeping the current feedback batch active.

The overlay is only the capture and review surface. A two-way agent workflow also needs an agent-side consumer connected to the same bridge session. The recommended product setup is:

1. Start the app with the SDK feedback overlay enabled.
2. Start `debug-bridge connect` so submitted batches are persisted and broadcast.
3. Start `debug-bridge-feedback-mcp` so agents can watch feedback events and send suggestions through MCP tools.
4. The user annotates the app and submits feedback.
5. The coding agent calls MCP tools to read the batch, inspect artifacts, send a visual suggestion, and then apply code changes only after user approval.

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

`debug-bridge-feedback-mcp` is the persistent watcher/API layer. It connects to the bridge as `role=agent`, exposes feedback artifacts as MCP resources, and provides tools for the coding agent.

Example MCP command:

```bash
debug-bridge-feedback-mcp \
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
- `set_feedback_overlay` opens or closes the overlay in the app.
- `send_visual_suggestion` renders an agent suggestion card and marks back in the live overlay.

The user-facing instruction should be:

```text
Start UI feedback mode for this app, watch for my submissions, suggest fixes visually in the overlay, and apply accepted changes.
```

The skill or setup command should then start app + bridge + MCP server. The user should not need to know WebSocket URLs, batch IDs, or artifact paths.

## CLI

```bash
debug-bridge connect --feedback-dir .debug-bridge/feedback
debug-bridge connect --no-feedback-artifacts
```

Manual testing aliases:

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

`pnpm test` runs the existing bridge validation, feedback annotation validation, feedback MCP validation, and CDP sidecar validation.
