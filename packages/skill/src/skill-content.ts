import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLED_SKILL_MD = `---
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

\`\`\`
┌─────────────────┐       CDP / WS       ┌─────────────────┐       CDP / DOM      ┌─────────────────┐
│    AI Agent     │ ◄──────────────────► │  Debug Bridge   │ ◄──────────────────► │ Target Browser  │
│ (Claude/Codex)  │                      │ (Server+Sidecar)│                      │ (Pure Sidecar)  │
└─────────────────┘                      └─────────────────┘                      └─────────────────┘
\`\`\`

---

## Operating Modes

### Mode 1: Zero-Instrumentation Browser Sidecar (Recommended Default)

No changes needed in target webapp. Playwright manages Chromium, attaches via CDP, and exposes interactive element handles (\`@e1\`, \`@e2\`, ...), live CSS injection, and full console/network observation.

#### Quick Start:
\`\`\`bash
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
\`\`\`

---

### Mode 2: In-Browser Design Mode (cmux-style)

Design Mode enables users and agents to click elements, tweak styles live, inspect anchored XPaths, batch multiple element tweaks, quick render live preview patches, and copy paste-ready prompts for agents.

#### Key Capabilities:
- **Multi-Element Batching**: Click multiple elements across the page. Each element is added to the selection batch (\`@e1\`, \`@e2\`, ...), assigned a color from a 14-color palette, and highlighted with badges and bounding boxes.
- **Floating Composer Card**: Dark floating panel in Shadow DOM displays horizontal selection chips (\`[@e1 <header>]\`, \`[@e2 <button>]\`). Clicking a chip switches the active element.
- **Property Tweakers**: Real-time inputs for padding, margin, font-size, color, background-color, border-radius, and text content.
- **Batch CSS Diff**: Automatically computes unified CSS diff across all selected targets.
- **⚡ Quick Render**: Injects live preview \`<style id="__agent_bridge_live_preview__">\` with \`!important\` rules directly into the page so user immediately sees rendered visual changes.
- **📋 Copy for Agent**: Formats complete prompt with user instruction, page URL, each selected target (handle, tag, selector, full anchored XPath, original to new value edits), and CSS diff block, copying directly to system clipboard.
- **🚀 Send to Agent**: Dispatches structured batch handoff event to the agent bridge host.

#### CLI Commands:
\`\`\`bash
# Enable design mode in browser
debug-bridge browser design-mode enable --port $PORT --session $SESSION

# Check status and current selections
debug-bridge browser design-mode status --port $PORT --session $SESSION

# Trigger Quick Render from CLI
debug-bridge browser design-mode quick-render --port $PORT --session $SESSION

# Copy formatted prompt to clipboard (or print to stdout)
debug-bridge browser design-mode copy-prompt -r "Make header dark navy and enlarge CTA" --port $PORT --session $SESSION

# Retrieve structured handoff payload
debug-bridge browser design-mode handoff -r "Apply visual adjustments" --json --port $PORT --session $SESSION

# Clear live preview and selections
debug-bridge browser design-mode clear --port $PORT --session $SESSION

# Disable design mode
debug-bridge browser design-mode disable --port $PORT --session $SESSION
\`\`\`

---

### Mode 3: Feedback MCP Server (Claude Code Integration)

The Feedback MCP Server exposes tools to Claude Code and other agent runners over stdio:

\`\`\`bash
# Start MCP server
npx debug-bridge-feedback-mcp --bridge-port 4000 --session default
\`\`\`

#### Available MCP Tools:
1. \`browser_control\`:
   - Actions: \`open\`, \`click\`, \`fill\`, \`screenshot\`, \`snapshot\`, \`preview_patch\`, \`evaluate\`
   - Target by \`@e1\` ref, CSS selector, or XPath.
2. \`design_mode_control\`:
   - Actions: \`enable\`, \`disable\`, \`status\`, \`quick_render\`, \`copy_prompt\`, \`get_handoff\`, \`clear_preview\`, \`clear_selections\`
   - Parameters: \`requestedChange\`, \`cssPatch\`
3. \`feedback_annotation\`:
   - Actions: \`list_batches\`, \`get_batch\`, \`create_mark\`, \`add_suggestion\`
   - Visual pins, bounding boxes, annotations, and triage.

---

### Mode 4: Embedded Webapp SDK (Optional)

For projects that choose to include runtime telemetry inside their source tree:

\`\`\`bash
npm install debug-bridge-browser
\`\`\`

\`\`\`typescript
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
\`\`\`

> **Note**: Page URLs stay clean (\`http://localhost:5173/\`). Query parameters like \`?session=\` or \`?port=\` are never required.
`;

export function getSkillContent(): string {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(currentDir, 'SKILL.md'),
      path.resolve(currentDir, '../SKILL.md'),
      path.resolve(currentDir, '../../skills/debug-bridge/SKILL.md'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf8');
      }
    }
  } catch {
    // Fall back to bundled constant
  }

  return BUNDLED_SKILL_MD;
}

export function getSkillMetadata(): {
  name: string;
  version: string;
  description: string;
  triggers: string[];
} {
  return {
    name: 'debug-bridge',
    version: '0.2.0',
    description:
      'Zero-instrumentation browser sidecar, visual feedback annotation, and in-browser Design Mode for AI agents',
    triggers: [
      'debug the app',
      'test this flow',
      'click the button',
      'take a screenshot',
      'inspect the UI',
      'capture network requests',
      'design mode',
      'quick render',
      'copy prompt',
      'feedback overlay',
    ],
  };
}
