---
name: debug-bridge
description: Zero-instrumentation browser sidecar, visual feedback annotation, and in-browser Design Mode for AI agents
triggers:
  - debug the app
  - test this flow
  - click the button
  - take a screenshot
  - inspect the UI
  - capture network requests
  - design mode
  - quick render
  - copy prompt
  - feedback overlay
type: cli-tool
protocol_version: 1
default_port: 4000
capabilities:
  - browser_sidecar
  - design_mode
  - quick_render
  - copy_prompt
  - feedback_annotation
  - ui_tree
  - dom_snapshot
  - console
  - errors
  - network
  - navigation
  - screenshot
  - eval
---

# Debug Bridge Runbook

Debug Bridge provides autonomous browser control, visual feedback annotations, and in-browser Design Mode for AI agents.

```
┌─────────────────┐       CDP / WS       ┌─────────────────┐       CDP / DOM      ┌─────────────────┐
│    AI Agent     │ ◄──────────────────► │  Debug Bridge   │ ◄──────────────────► │ Target Browser  │
│ (Claude/Codex)  │                      │ (Server+Sidecar)│                      │ (Pure Sidecar)  │
└─────────────────┘                      └─────────────────┘                      └─────────────────┘
```

---

## Operating Modes

### Mode 1: Zero-Instrumentation Browser Sidecar (Recommended Default)

No changes needed in target webapp. Playwright manages Chromium, attaches via CDP, and exposes interactive element handles (`@e1`, `@e2`, ...), live CSS injection, and full console/network observation.

#### Quick Start:
```bash
# 1. Start bridge server with CDP browser sidecar
PORT=$(shuf -i 4000-4999 -n 1)
SESSION="dev-session-$(date +%s)"
debug-bridge connect --port $PORT --session $SESSION --cdp --browser managed &

# 2. Open page in sidecar browser
debug-bridge browser open "http://localhost:3000" --port $PORT --session $SESSION

# 3. Take interactive snapshot (returns @e handles, roles, selectors, and XPaths)
debug-bridge browser snapshot --port $PORT --session $SESSION

# 4. Click or fill interactive elements
debug-bridge browser click @e1 --port $PORT --session $SESSION
debug-bridge browser fill @e2 "user@example.com" --port $PORT --session $SESSION

# 5. Capture screenshot
debug-bridge browser screenshot --out ./screenshot.png --port $PORT --session $SESSION

# 6. Apply live temporary CSS preview patch
debug-bridge browser preview-patch --css "button { background: #2563eb !important; }" --port $PORT --session $SESSION
```

---

### Mode 2: In-Browser Design Mode (Floating Palette)

Design Mode enables users and agents to click elements, tweak styles live, inspect anchored XPaths, batch multiple element tweaks, draw annotations (pen, rect, region, arrow), quick render live preview patches, and copy paste-ready prompts for agents with generated screenshot artifacts.

> **Auto-Show by Default**: Whenever a page is opened or navigated via `debug-bridge browser open`, the Design Mode floating feedback overlay automatically shows on page load without requiring manual activation.

#### Key Capabilities:
- **Auto-Show on Open**: Automatically mounts and activates on all browser sidecar navigations.
- **Sleek Floating Pill Palette**: Minimal dark capsule (`bottom: 24px; left: 50%`) with mode toggles, chips, inline change description, and action controls.
- **Pointer & Visual Annotation Tools**:
  - `↖` Pointer: Element inspection, highlighting, and multi-selection (`@e1`, `@e2`, ...).
  - `✏` Freehand Pen: Smooth polyline drawing directly on the page canvas.
  - `◰` Region Box: Dashed purple bounding box for region-level changes.
  - `↗` Directional Arrow: Point arrows directly at elements or areas to change.
- **Dynamic Selection & Drawing Chips**:
  - Element chips (`▢ <tag>`): Colored to match element border. Clicking opens style tweakers; `✕` removes selection.
  - Region & Drawing chips (`◰ region`, `↗ arrow`, `✏ pen`): Colored badges with quick removal.
- **Inline Change Description**: `Describe the change` text input embedded right in the floating pill.
- **⚡ Quick Render**: Injects live preview `<style id="__agent_bridge_live_preview__">` with `!important` rules directly into the page so visual adjustments appear instantaneously.
- **Compact Property Tweakers Popover**: Accessible via `⚙ Tweak` button to modify padding, margin, font-size, color, background-color, border-radius, text content, and view unified CSS batch diff.
- **📋 Copy for Agent (Structured Handoff)**:
  - Generates 3 artifacts saved under `/tmp/debug-bridge-design-mode/process-<pid>-<session>/`:
    1. Clean screenshot (`surface-...-screenshot.png`)
    2. Live-context screenshot with annotations (`surface-...-live-context-<session>.png`)
    3. Structured JSON details (`surface-...-context.json`)
  - Formats and copies paste-ready prompt to system clipboard:
    ```
    <Describe the change>

    Page: <URL>
    <path/to/surface-...-screenshot.png>
    <path/to/surface-...-live-context.png>
    Details: <path/to/surface-...-context.json>
    ```

#### CLI Commands:
```bash
# Open page (automatically shows Design Mode overlay)
debug-bridge browser open "http://localhost:3000" --port $PORT --session $SESSION

# Check status and current selections
debug-bridge browser design-mode status --port $PORT --session $SESSION

# Set active tool (select, pen, rect, arrow, region)
debug-bridge browser design-mode tool pen --port $PORT --session $SESSION

# Trigger Quick Render from CLI
debug-bridge browser design-mode quick-render --port $PORT --session $SESSION

# Copy formatted prompt and generate screenshot artifacts
debug-bridge browser design-mode copy-prompt -r "Make header dark navy and enlarge CTA" --port $PORT --session $SESSION

# Retrieve structured handoff payload
debug-bridge browser design-mode handoff -r "Apply visual adjustments" --json --port $PORT --session $SESSION

# Clear live preview and selections
debug-bridge browser design-mode clear --port $PORT --session $SESSION

# Disable design mode
debug-bridge browser design-mode disable --port $PORT --session $SESSION
```

---

### Mode 3: Feedback MCP Server (Claude Code Integration)

The Feedback MCP Server exposes tools to Claude Code and other agent runners over stdio:

```bash
# Start MCP server
npx debug-bridge-feedback-mcp --bridge-port 4000 --session default
```

#### Available MCP Tools:
1. `browser_control`:
   - Actions: `open`, `click`, `fill`, `screenshot`, `snapshot`, `preview_patch`, `evaluate`
   - Target by `@e1` ref, CSS selector, or XPath.
2. `design_mode_control`:
   - Actions: `enable`, `disable`, `status`, `quick_render`, `copy_prompt`, `get_handoff`, `clear_preview`, `clear_selections`
   - Parameters: `requestedChange`, `cssPatch`
3. `feedback_annotation`:
   - Actions: `list_batches`, `get_batch`, `create_mark`, `add_suggestion`
   - Visual pins, bounding boxes, annotations, and triage.

---

### Mode 4: Embedded Webapp SDK (Optional)

For projects that choose to include runtime telemetry inside their source tree:

```bash
npm install debug-bridge-browser
```

```typescript
import { createDebugBridge } from 'debug-bridge-browser';

// Auto-connects in DEV without requiring query parameters:
if (import.meta.env.DEV) {
  const bridge = createDebugBridge({
    url: 'ws://localhost:4000/debug?role=app&sessionId=default',
    sessionId: 'default',
    appName: 'My App',
    appVersion: '1.0.0',
  });
  bridge.connect();
}
```

> **Note**: Page URLs stay clean (`http://localhost:5173/`). Query parameters like `?session=` or `?port=` are never required.

