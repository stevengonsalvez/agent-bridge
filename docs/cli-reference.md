# CLI reference

Reference for the `debug-bridge` command (package `debug-bridge-cli`, version 0.2.0 in this repo). Every flag below was checked against `node packages/cli/dist/bin/cli.js <command> --help`. The published npm 0.1.2 has only `connect` (4 options): no `browser`, `design-mode`, or `skill` commands.

Top-level commands: `connect`, `browser`, `design-mode`, `skill`.

Shared options on all `browser` subcommands that talk to a bridge: `-p, --port <number>` (default `4000`), `-s, --session <string>` (default `default`), `--json`.

## connect

Start the bridge server (and optionally a CDP sidecar). Also provides an interactive REPL for apps using the [embedded SDK](../packages/browser/README.md).

```bash
debug-bridge connect --port 4000 --cdp --browser managed
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <number>` | `4000` | Port to listen on |
| `-s, --session <string>` | `default` | Internal bridge session ID. Page URLs need no query params |
| `--json` | off | JSON output for agents |
| `--host <string>` | `localhost` | Host to bind |
| `--cdp` | off | Start a CDP browser sidecar provider |
| `--browser <mode>` | `managed` | `managed`, `connect`, or `none` |
| `--cdp-endpoint <url>` | none | CDP WebSocket endpoint for `--browser connect` |
| `--profile <nameOrPath>` | `agent-bridge-default` | Persistent profile name or absolute path ([profiles](./browser-profiles.md)) |
| `--storage-state <path>` | none | Playwright storageState file to import and export |
| `--feedback-dir <path>` | `.debug-bridge/feedback` | Feedback artifact directory |
| `--headed` | on | Visible browser window |
| `--headless` | off | Headless browser |
| `--channel <string>` | auto | `chrome`, `msedge`, `chromium`, and so on |

The sidecar only starts when `--cdp` is set and `--browser` is not `none`. `connect` has no tmux flag; use [`AGENT_BRIDGE_TMUX_TARGET`](#environment-variables).

## browser open

```bash
debug-bridge browser open <url> [--port] [--session] [--profile] [--channel] [--headed|--headless] [--json]
```

It first tries to navigate through an existing bridge: if a sidecar answers within 3 seconds, it navigates to `<url>` and enables Design Mode. Otherwise it starts its own bridge and managed browser in this process, navigates, enables Design Mode, and keeps running until Ctrl+C (run it as a background job). If a bridge without a sidecar already holds the port, starting its own server can fail with `EADDRINUSE`; start the bridge with `--cdp` instead.

## browser snapshot

`debug-bridge browser snapshot [-i, --interactive]` prints numbered handles (`@e1`, `@e2`, ...) with role, text, selector, and position. It does not print XPaths.

## browser click / fill

```bash
debug-bridge browser click <target> [--snapshot-after]
debug-bridge browser fill <target> <text> [--snapshot-after]
```

`<target>` is a handle (`@e1`) or a CSS selector.

## browser screenshot

`debug-bridge browser screenshot [--selector <css>] [--out <path>]`. With `--json`, prints base64 JSON.

## browser preview-patch

`debug-bridge browser preview-patch --css "<rules>"` injects a temporary CSS override. `--clear` removes it.

## browser design-mode

`debug-bridge browser design-mode [action] [subArg]`. Default action is `status`. `copy-prompt` and the dock's copy buttons are copy-only: no tmux injection, no `wait` wake-up. Only the dock's Send submits.

| Action | Effect |
|--------|--------|
| `enable`, `disable`, `status` | Toggle or inspect Design Mode and the current selections |
| `tool <name>` | Set active tool: `select`, `pen`, `rect`, `arrow`, `region`, `interact` |
| `quick-render` | Apply live preview styles (`--css` for a custom patch) |
| `copy-prompt` | Generate screenshot artifacts and the formatted prompt (`-r <text>` sets the change) |
| `handoff` | Return the structured handoff payload (`-r`, `--json`) |
| `clear` (`clear-selections`), `clear-marks`, `clear-preview` | Clear selections, drawings, or the preview patch |
| `set-tmux <target>` | Change the tmux target of a running sidecar (`none` disables tmux injection) |
| `done [message]`, `error [message]`, `working`, `idle` | Set the dock's agent status. `done "Made the CTA larger"` shows a green check with the message, then returns to idle after a short delay. Send sets Working; the agent runs `done` or `error` when finished |

Options: `-r, --request <text>`, `-t, --tool <tool>`, `--css <string>`, `-c, --copy`, `--tmux [target]`, `--no-tmux-enter`.

## browser wait

Block until the dock's **Send** fires, print the request, exit. Single-shot. If a Send arrives while no `wait` is connected, the bridge keeps the latest one and hands it to the next `wait` that connects (only the latest; earlier unclaimed Sends are dropped). Loop guidance: [agent-loop](./agent-loop.md).

```bash
debug-bridge browser wait --port 4000 --session default [--host localhost] [--timeout 1800000] [--json]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--host <host>` | `localhost` | Bridge host |
| `--timeout <ms>` | `1800000` (30 min) | Give up after this long. Whole milliseconds, 1 to 2147483647 |
| `--json` | off | Print the raw `browser_design_mode_submit` message |

| Exit code | Meaning |
|-----------|---------|
| `0` | Request received. Prints the change, page URL, artifact paths, and full prompt |
| `1` | Timeout (`TIMEOUT: no Design Mode request after <ms>ms` on stderr) |
| `2` | Bridge unreachable or connection closed (`BRIDGE DOWN: ...` on stderr) |
| `64` | Bad arguments, for example `--timeout 30m`. Fix the command; do not re-arm unchanged |

It connects as `ws://<host>:<port>/debug?role=agent&listener=1&sessionId=<session>`.

## design-mode (top level)

`debug-bridge design-mode [urlOrAction] [subArg]`. If the first argument starts with `http://`, `https://`, or `localhost:`, it behaves like `browser open`. Otherwise it behaves like `browser design-mode <action>`. Accepts the `open` options plus the design-mode options, including `--tmux [target]`.

## skill

| Command | Description |
|---------|-------------|
| `skill install [-g] [-p] [-a <agents>] [-s, --symlink] [-f, --force] [--json]` | Install the skill bundled in this CLI build. Global by default |
| `skill uninstall [-g] [-p] [-a <agents>] [--json]` | Remove it |
| `skill status` (alias `ls`) `[-g] [-p] [--json]` | Show installation state |
| `skill print` (alias `cat`) | Print `SKILL.md` to stdout |

To install the current skill, use `npx skills add stevengonsalvez/agent-bridge --skill debug-bridge -g -y`.

## REPL commands (`connect`, embedded-SDK apps)

`ui` (`tree`), `find <query>` (`search`), `click <id>`, `type <id> <text>`, `eval <code>` (`js`), `snapshot` (`dom`), `screenshot` (`ss`), `state [scope]`, `navigate <url>` (`goto`, `go`), `focus <id>`, `scroll <x> <y>`, `feedback on|off`, `feedback-suggest <item-id> <comment>`, `clear` (`cls`), `help` (`?`). These act on a page running the embedded SDK, not on the sidecar browser.

## Environment variables

| Variable | Read by | Effect |
|----------|---------|--------|
| `AGENT_BRIDGE_TMUX_TARGET` | sidecar, `browser open` | Pane id to inject submitted prompts into, `none` to disable tmux injection, `auto` or unset for the heuristic. With the `wait` loop use `none`, on the same command line as the bridge start. See [tmux-injection](./tmux-injection.md) |
| `TMUX_PANE` | sidecar | Set by tmux. Auto mode uses it to find sibling panes |
| `CMUX_WORKSPACE_ID`, `CMUX_SURFACE_ID` | sidecar | If either is set, prompts are sent through `cmux` first, regardless of the tmux target |
| `DEBUG_BRIDGE_BROWSER_CHANNEL` | sidecar | Fallback browser channel when `--channel` is not given (`--channel` wins) |
| `DEBUG_BRIDGE_RECORD_VIDEO_DIR` | sidecar | Directory for recorded video |
| `DEBUG_BRIDGE_HOST`, `DEBUG_BRIDGE_PORT`, `DEBUG_BRIDGE_SESSION`, `DEBUG_BRIDGE_FEEDBACK_DIR`, `DEBUG_BRIDGE_WS_URL` | `debug-bridge-feedback-mcp` | Bridge location and feedback directory ([feedback docs](./ui-feedback-annotation.md#mcp-server)) |
