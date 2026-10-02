# Run the agent loop

How-to for an agent (or the person configuring one) that wants to receive change requests from the Design Mode dock. You already have the CLI built and the `debug-bridge` skill installed (see the [README](../README.md#install-the-skill)).

The loop: open the page, arm `debug-bridge browser wait` as a background job. When it exits, re-arm first, then handle the request, then report `done` or `error` to the dock.

```
┌───────────┐  Send   ┌──────────────┐  submit   ┌──────────────────┐
│ dock      │────────▶│ bridge :PORT │──────────▶│ browser wait     │
└───────────┘         └──────────────┘           │ exits 0, wakes   │
                                                 │ the agent        │
                                                 └────────┬─────────┘
                                                          ▼
                                              apply change, re-arm wait
```

`wait` is single-shot: one request, one exit. The agent must re-arm it every time. This is the rule the skill enforces under "MANDATORY: Arm the Agent Inbox on Every Run" in [`skills/debug-bridge/SKILL.md`](../skills/debug-bridge/SKILL.md).

## Steps

Agent harnesses often run each command in a fresh shell, so env vars and shell variables do not persist between commands. The commands below use literal values and put env vars on the same command line.

1. Start the bridge with tmux injection off. The `wait` loop is how requests reach the agent, so injection would only deliver each request twice (once pasted into the agent's pane, once from `wait`). In `auto` mode it can also type into an unrelated pane such as a dev server ([details](./tmux-injection.md)). `connect` holds its terminal (it runs the REPL), so run it in its own tmux window or background job:

   ```bash
   AGENT_BRIDGE_TMUX_TARGET=none debug-bridge connect --port 4000 --session default --cdp --browser managed
   ```

2. In another shell, open the page ([cli-reference](./cli-reference.md#browser-open)):

   ```bash
   debug-bridge browser open "http://localhost:5173" --port 4000 --session default
   ```

   If no bridge answers, `browser open` starts its own bridge and stays in the foreground, so run it as a background job (Claude Code: Bash with `run_in_background: true`). Use the same `AGENT_BRIDGE_TMUX_TARGET=none` prefix in that case.

3. Arm the inbox as a background job the harness tracks:

   ```bash
   debug-bridge browser wait --port 4000 --session default --timeout 1800000
   ```

4. When the job exits, branch on the exit code:

   | Exit | Meaning | Agent action |
   |------|---------|--------------|
   | `0` | Request received | Re-arm step 3 first so the next Send is not missed. Then read the printed change, page URL, and artifact paths, edit the source, and verify with `debug-bridge browser screenshot`. Finally report back (step 5). |
   | `1` | Timeout, nobody pressed Send | Re-arm step 3. |
   | `2` | Bridge unreachable or connection closed | Restart the bridge (step 1), then re-arm. |

5. Close the loop in the dock. Send sets the pill to Working, so tell it you are finished:

   ```bash
   debug-bridge browser design-mode done "Made the CTA larger" --port 4000 --session default
   # or, if you could not apply the change:
   debug-bridge browser design-mode error "Selector not found in source" --port 4000 --session default
   ```

   `done` shows a green check with your message and returns to idle shortly after.

6. Stop only when the user ends the session or the bridge is shut down.

Start `wait` before pressing Send, and re-arm before doing anything slow. Requests are not queued; one submitted while no `wait` is running is missed.

Only target a tmux pane (`AGENT_BRIDGE_TMUX_TARGET=%3`, a pane id) when you are not running the `wait` loop.

## What `wait` prints

On exit `0` (without `--json`):

```
DESIGN MODE REQUEST
Change:  <text typed in the dock>
Page:    <page URL>
clean_screenshot_path: <path>
live_context_path: <path>
context_json_path: <path>
element_screenshot_paths: <paths, comma separated>

Prompt:
<full formatted prompt>
```

The `context_json_path` file holds the selected elements' selector, XPath, and DOM snippet. Use `--json` to get the raw `browser_design_mode_submit` message instead. Status text goes to stderr (`Waiting for Design Mode request on session "..."`), so stdout stays parseable.

## Dock status

The dock shows **Agent Ready** while at least one `wait` listener is connected to the session, or while an embedded SDK app (for example the sample app) is connected. Otherwise it shows **Offline (Copy)**. One-shot commands such as `browser snapshot` do not count. After Send the pill shows Working. Details: [design-mode-dock](./design-mode-dock.md#status-pill).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `wait` exits `2` at once with `BRIDGE DOWN` | No bridge on that port or session mismatch | Start the bridge, use the same `--port` and `--session` as `open` |
| Text appears in the dev server terminal | tmux auto mode picked a sibling pane | Set `AGENT_BRIDGE_TMUX_TARGET=none` ([guide](./tmux-injection.md)) |
| Dock says Offline (Copy) | No `wait` listener and no SDK app connected | Re-arm `wait` with the same `--port` and `--session` |
| Every request arrives twice | tmux injection is on as well as `wait` | Start the bridge with `AGENT_BRIDGE_TMUX_TARGET=none` |
