# Debug Bridge

[![Debug Bridge Demo](docs/assets/demo/debug-bridge-jev.gif)](https://github.com/stevengonsalvez/agent-bridge/releases/download/v0.3.2/debug-bridge-launch.mp4)

Let an AI coding agent see, drive, and receive visual change requests directly from your web app with zero code changes.

Debug Bridge launches a managed Chrome browser via a CDP sidecar, exposes interactive element handles (`@e1`, `@e2`), and mounts a Design Mode dock directly in the page. When you click elements, draw annotations, and hit **Send**, your agent receives the exact prompt, DOM context, clean full-page screenshot, and an isolated screenshot crop of only the target element.

---

## 1. Agent Skill (Recommended)

Point your agent to the skill and go.

### Get the Skill

Give your agent the skill from this repo using any of these methods:

**Method A: Point directly to the skill (Fastest)**
Point your agent directly at [`skills/debug-bridge/SKILL.md`](./skills/debug-bridge/SKILL.md) in this repo, or include it in your agent prompt instructions.

**Method B: Install via `skills` CLI**
Installs into Claude Code, Antigravity / Gemini CLI, Cursor, Codex, and OpenCode:
```bash
# Global (links all installed agents automatically):
npx skills add stevengonsalvez/agent-bridge --skill debug-bridge -g -y

# Or install into current project repo:
npx skills add stevengonsalvez/agent-bridge --skill debug-bridge -y
```

**Method C: Claude Code plugin marketplace**
```bash
/plugin marketplace add stevengonsalvez/agent-bridge
/plugin install debug-bridge@agent-bridge-marketplace
```

### Start the Agent

Prompt your agent:

> "Debug the app on http://localhost:5173 with debug-bridge and listen for visual changes."

### How the Agent Loop Works

The agent runs the entire loop autonomously:

```
┌───────────────────┐     opens managed browser     ┌────────────────────────┐
│   Agent Session   │──────────────────────────────▶│    Target Web App      │
│  (Claude / agy)   │◀──────────────────────────────│   + Design Mode Dock   │
└─────────┬─────────┘   arms inbox: `browser wait`  └───────────┬────────────┘
          │                                                     │
          │◀────────────────────────────────────────────────────┘
          │  User selects element & presses "Send"
          ▼
   Wakes agent with:
   • Element screenshot crop (image/component only)
   • Full-page clean screenshot
   • DOM selector, XPath, and coordinates
   • Natural language request
          ▼
   1. Re-arms inbox (`debug-bridge browser wait &`)
   2. Reads element screenshot and applies code edit
   3. Verifies change with screenshot
   4. Closes loop: `debug-bridge browser design-mode done "Updated button styles"`
```

The user never has to leave the browser or ask the agent "did you get it?".

---

## 2. Manual Use (CLI)

Use the CLI directly from your terminal without an agent runner.

### 1. Open your app in managed Chrome

```bash
debug-bridge browser open "http://localhost:5173" --port 4000
```

Launches Chrome with CDP sidecar and activates Design Mode dock. No app instrumentation required.

### 2. Inspect and control the page

```bash
debug-bridge browser snapshot --port 4000                     # numbered handles @e1, @e2, ...
debug-bridge browser click @e1 --port 4000
debug-bridge browser fill @e2 "user@example.com" --port 4000
debug-bridge browser screenshot --out ./screenshot.png --port 4000
debug-bridge browser preview-patch --css "button { background: #2563eb !important; }" --port 4000
```

### 3. Block for change requests

In a second terminal, listen for the dock's **Send** button:

```bash
debug-bridge browser wait --port 4000
```

Select an element in the browser, type a change, and click **Send**. `wait` prints the captured prompt, saves visual artifacts, and exits `0`:

```text
Waiting for Design Mode request on session "default"...

DESIGN MODE REQUEST
Change:   make hero illustration 3D glowing isometric
Page:     http://localhost:5173
Element:  .hero-illustration (@e3)
Image:    /tmp/debug-bridge/demo-element-image.png
Context:  /tmp/debug-bridge/context.json

Prompt:
/tmp/debug-bridge/demo-element-image.png make hero illustration 3D glowing isometric

Page: http://localhost:5173
Details: /tmp/debug-bridge/context.json
```

#### Captured Visual Artifacts

Debug Bridge generates isolated element crops so models inspect exact component pixels:

| Artifact | Type | Description |
|---|---|---|
| `demo-element-image.png` | **Element Crop (Image Only)** | Focused crop containing only the selected target element |
| `demo-page-screenshot.png` | **Full Viewport** | Full-page screenshot without overlays |

<p align="center">
  <img src="docs/assets/demo/demo-element-image.png" alt="Element Screenshot (Image Only)" width="260" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/assets/demo/demo-page-screenshot.png" alt="Full Page Screenshot" width="480" />
</p>
<p align="center">
  <em>Left: Isolated element crop received by the agent. Right: Full viewport reference.</em>
</p>

### 4. Close the loop

Report completion back to the dock:

```bash
debug-bridge browser design-mode done "Updated hero illustration" --port 4000 --session default
```

The dock updates from **Working** to a green checkmark and stays in sync.

---

## Documentation Map

| Need | Document | Type |
|---|---|---|
| Complete Agent Runbook & Inbox Protocol | [`skills/debug-bridge/SKILL.md`](./skills/debug-bridge/SKILL.md) | Runbook |
| Autonomous Agent Loop Guide | [docs/agent-loop.md](./docs/agent-loop.md) | How-to |
| Design Mode Dock & Toolbar Reference | [docs/design-mode-dock.md](./docs/design-mode-dock.md) | Reference |
| CLI Commands & Options Reference | [docs/cli-reference.md](./docs/cli-reference.md) | Reference |
| Tmux Integration & Bracketed Paste | [docs/tmux-injection.md](./docs/tmux-injection.md) | How-to |
| Browser Profiles & Session Storage | [docs/browser-profiles.md](./docs/browser-profiles.md) | How-to |
| UI Feedback Annotations & Batches | [docs/ui-feedback-annotation.md](./docs/ui-feedback-annotation.md) | Reference |
| Architecture & Internal Protocol | [docs/architecture.md](./docs/architecture.md) | Explanation |

---

## Packages

| Package | Description | Status |
|---|---|---|
| [`debug-bridge-cli`](./packages/cli/README.md) | Core CLI: bridge server, browser automation, and agent inbox | Repo 0.2.0, npm 0.1.2 |
| `debug-bridge-browser-sidecar` | Playwright CDP sidecar provider (managed browser instance) | Workspace package |
| [`debug-bridge-skill`](./packages/skill/README.md) | Skill distribution package for Claude, Gemini, Cursor, Codex | Source package |
| `debug-bridge-feedback-mcp` | MCP server for feedback batches | Workspace package |
| [`debug-bridge-browser`](./packages/browser/README.md) | Optional in-app SDK (for custom state & telemetry) | Optional |
| [`debug-bridge-types`](./packages/types/README.md) | Shared TypeScript protocol definitions | Core |

---

## Development

```bash
pnpm install
pnpm run build        # Build all packages (turbo)
pnpm run type-check   # Typecheck all packages
pnpm test             # Run end-to-end test validations
```

Run CLI from source without installing:
```bash
node packages/cli/dist/bin/cli.js --help
```

---

## License

MIT
