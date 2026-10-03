# Control where Design Mode prompts are typed (tmux)

How-to for anyone running the bridge inside tmux. You want to either turn terminal injection off (the usual choice with the [`browser wait` loop](./agent-loop.md)) or aim it at the right pane.

## Background

When a request is sent with the dock's Send button (the copy buttons never inject), the sidecar builds the prompt and tries to type it into a terminal, in this order:

1. cmux, if `CMUX_WORKSPACE_ID` or `CMUX_SURFACE_ID` is set.
2. A tmux pane, chosen by the target setting below. It uses tmux bracketed paste, then presses Enter unless disabled.

If no target resolves, nothing is typed. The prompt is also written to the clipboard on a best-effort basis (a clipboard failure is swallowed). The same prompt is always broadcast to `browser wait` listeners regardless of injection.

Pick one delivery route. If an agent runs the `wait` loop, leave injection off, or the agent receives every request twice: pasted into its pane and printed by `wait`.

In `auto` mode (the default when nothing is set) the sidecar picks a pane like this:

```
inside tmux (TMUX_PANE set)?
  yes ─▶ sibling panes in the same session
          ├─ one running claude / agy / antigravity / codex ─▶ that pane
          ├─ otherwise the active sibling, else the first sibling   <── may be a dev server
          └─ no siblings ─▶ fall through to the global search below
  no  ─▶ any pane running claude / agy / antigravity / codex
          (one match, or the active one, or the first) ─▶ that pane
          none ─▶ no injection
```

The "active or first sibling" fallback is the hazard: it can type your prompt into a dev server's stdin.

## Turn injection off (recommended with `wait`)

Put the variable on the same command line as the one that starts the bridge (`connect` or `browser open`). Harness shells often do not keep exported variables between commands.

```bash
AGENT_BRIDGE_TMUX_TARGET=none debug-bridge connect --port 4000 --session default --cdp --browser managed
```

`none` is not a real pane, so resolution fails and nothing is typed in tmux. It disables tmux only: inside cmux, the prompt is still sent to cmux.

## Aim injection at one pane (when not using `wait`)

```bash
AGENT_BRIDGE_TMUX_TARGET="${TMUX_PANE:-none}" debug-bridge connect --port 4000 --session default --cdp --browser managed
```

Inside tmux this targets the pane the command runs in. To target the agent's pane, pass its pane id (for example `%3`; list ids with `tmux list-panes -a -F '#{pane_id} #{pane_current_command}'`).

| Value | Effect |
|-------|--------|
| a pane id such as `%3` | Always inject into that pane. If it does not exist, injection fails and nothing is typed |
| `none` | Disable tmux injection |
| `auto` or unset | Heuristic above |

An explicit target never falls back to auto-detection.

## Change it on a running sidecar

```bash
debug-bridge browser design-mode set-tmux none --port 4000 --session default
```

`--no-tmux-enter` on `design-mode` commands stops the Enter keypress after pasting.

## Flags that do not disable injection

`--tmux none` on the CLI is converted to "no target", which falls back to the env var and then to auto mode. It does not disable injection. Use `AGENT_BRIDGE_TMUX_TARGET=none` or `design-mode set-tmux none`. `connect --cdp` has no tmux flag, so the env var is the only control there. See [cli-reference](./cli-reference.md#environment-variables).
