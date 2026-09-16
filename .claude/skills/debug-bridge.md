# Debug Bridge CLI

Debug Bridge provides autonomous browser control, visual feedback annotations, and in-browser Design Mode for AI agents.

## Quick Start (Zero-Instrumentation Sidecar)

Launch and control any web app without code modifications:

```bash
# 1. Start bridge server with CDP browser sidecar
PORT=$(shuf -i 4000-4999 -n 1)
SESSION="dev-session-$(date +%s)"
debug-bridge connect --port $PORT --session $SESSION --cdp --browser managed &

# 2. Open URL in managed browser
debug-bridge browser open "http://localhost:3000" --port $PORT --session $SESSION

# 3. Inspect interactive elements (@e1, @e2, ...)
debug-bridge browser snapshot --port $PORT --session $SESSION

# 4. Click or fill inputs
debug-bridge browser click @e1 --port $PORT --session $SESSION
debug-bridge browser fill @e2 "user@example.com" --port $PORT --session $SESSION

# 5. Capture screenshot
debug-bridge browser screenshot --out ./screenshot.png --port $PORT --session $SESSION

# 6. Apply live temporary CSS preview patch
debug-bridge browser preview-patch --css "header { background: #0f172a !important; }" --port $PORT --session $SESSION
```

## In-Browser Design Mode (cmux-style)

Click elements, tweak styles live, inspect anchored XPaths, batch multiple element tweaks, quick render live preview patches, and copy paste-ready prompts for agents:

```bash
# Enable design mode in browser
debug-bridge browser design-mode enable --port $PORT --session $SESSION

# Check status and current selections
debug-bridge browser design-mode status --port $PORT --session $SESSION

# Trigger Quick Render from CLI (injects live CSS patch)
debug-bridge browser design-mode quick-render --port $PORT --session $SESSION

# Copy formatted prompt to clipboard (or stdout)
debug-bridge browser design-mode copy-prompt -r "Make header dark navy and enlarge CTA" --port $PORT --session $SESSION

# Retrieve structured handoff payload
debug-bridge browser design-mode handoff -r "Apply visual adjustments" --json --port $PORT --session $SESSION

# Clear live preview and selections
debug-bridge browser design-mode clear --port $PORT --session $SESSION

# Disable design mode
debug-bridge browser design-mode disable --port $PORT --session $SESSION
```

### Design Mode Floating Composer Features:
- **Multi-Element Batching**: Selection chips (`[@e1 <header>]`, `[@e2 <button>]`) with 14-color palette.
- **Property Tweakers**: Padding, margin, font-size, color, background-color, border-radius, and text content.
- **⚡ Quick Render**: Injects live preview `<style id="__agent_bridge_live_preview__">` with `!important` declarations.
- **📋 Copy for Agent**: Formats complete prompt with user instruction, page URL, each selected target (handle, tag, selector, full anchored XPath, property edits), and CSS diff block, copying directly to system clipboard.
- **🚀 Send to Agent**: Dispatches structured batch handoff event to the agent bridge host.

## Feedback MCP Server (Claude Code Integration)

```bash
# Run MCP server for Claude Code
npx debug-bridge-feedback-mcp --bridge-port 4000 --session default
```

Available tools:
- `browser_control`: open, click, fill, screenshot, snapshot, preview_patch
- `design_mode_control`: enable, disable, status, quick_render, copy_prompt, get_handoff, clear_preview, clear_selections
- `feedback_annotation`: visual pins, notes, highlights, and batch triage
