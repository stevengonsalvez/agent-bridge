# Design Mode dock reference

Reference for the in-page Design Mode dock that the sidecar shows on every page it opens. The dock is the single feedback surface; the former top toolbar and side panel were removed.

## Tools

Rail buttons, in order:

| Tool | Name in CLI | Purpose |
|------|-------------|---------|
| Select | `select` | Hover, highlight, and multi-select elements (`@e1`, `@e2`, ...) |
| Interact | `interact` | Use the page normally (type, click, navigate). `Escape` toggles between Interact and Select |
| Pen | `pen` | Freehand drawing |
| Region | `region` | Dashed bounding box for region-level changes |
| Rectangle | `rect` | Rectangle box |
| Highlight | (dock only) | Highlight box |
| Arrow | `arrow` | Arrow pointing at an element or area |
| Text | (dock only) | Text label |

`debug-bridge browser design-mode tool <name>` accepts `select`, `pen`, `rect`, `arrow`, `region`, `interact`. Highlight and Text are dock-only today.

Other controls: quick render (AI and manual), style tweaker (padding, margin, font size, colors, border radius, text), batch view, **Send**, copy prompt, clear all, flip dock side, and switch between vertical rail and horizontal bar. Selections and drawings appear as chips next to the change description input. In the compact prompt bar, `Enter` sends.

## Send and copy

**Send** does three things in the sidecar:

```
Send ─▶ write artifacts ─▶ try terminal injection (tmux/cmux) ─▶ broadcast browser_design_mode_submit
                                                                      │
                                                         `browser wait` listeners exit 0
```

Terminal injection is described in [tmux-injection](./tmux-injection.md). The broadcast is what [`browser wait`](./cli-reference.md#browser-wait) consumes. Sending also sets the pill to Working immediately.

**Copy is copy-only.** The dock's copy buttons write the screenshot artifacts so the copied prompt can reference them, then copy the prompt. They do not inject into tmux and do not wake `browser wait`; only Send submits. The CLI command `debug-bridge browser design-mode copy-prompt -r "<change>"` is also copy-only. Clipboard writes from the page are best effort, and under automation they often fail silently.

The prompt has this shape:

```
<element screenshot paths> <change description>

Page: <URL>
Details: <path to context JSON>
```

Line 1 holds the selected elements' screenshot paths followed by the text you typed. The live-context screenshot is saved but not named in the prompt.

## Artifacts

Written under the OS temp directory (`os.tmpdir()`), in `debug-bridge-design-mode/process-<pid>-<session>/`. The session part is stripped to letters, digits, `_` and `-` and cut to 8 characters. The live-context file suffix is the same session part.

| File | Content |
|------|---------|
| `surface-...-screenshot.png` | Clean screenshot with overlay hidden |
| `surface-...-live-context-<session>.png` | Screenshot with annotations |
| `surface-...-context.json` | Selected elements: selector, XPath, DOM snippet |

Per-element screenshots are also reported (`element_screenshot_paths`) when elements are selected.

## Status pill

The pill in the dock reflects the agent connection and work state.

| Pill | Meaning |
|------|---------|
| Agent Ready | At least one `debug-bridge browser wait` listener is connected to the session, or an embedded SDK app reports it is connected |
| Offline (Copy) | Neither of the above; prompts only copy to the clipboard |
| Working | Set by the dock itself the moment you press Send |
| Done | The agent ran `design-mode done`: a green check with the message, back to idle after about 12 seconds |
| Error | The agent ran `design-mode error "<message>"` |

How the listener state reaches the page:

```
browser wait (listener=1) ─▶ bridge counts listeners ─▶ connection event carries connectedListeners
                                                                │
                              sidecar ─▶ __agentBridgeDesignMode.setAgentListening(n > 0) ─▶ pill
```

`browser wait` connects with `listener=1`. One-shot commands (`browser snapshot`, `click`, and so on) do not count as listeners, so the pill goes back to Offline (Copy) once the last `wait` exits. Re-arm `wait` promptly ([agent-loop](./agent-loop.md)).

## AI Render key badge

A badge next to the AI Render button (in the horizontal bar only, not the vertical rail) shows whether AI Render has a key.

| Badge | Meaning |
|-------|---------|
| Amber "⚠ No key" | No TypeSafe or Vercel AI Gateway key found. AI Render falls back to heuristic CSS |
| Green dot | A key was found. Hover to see the kind (TypeSafe or Vercel AI Gateway) and the last 4 characters |

The badge uses the same lookup as AI Render (`resolveGatewayKey` in `packages/browser/src/runtime/quick-render-jev.ts`), in this order:

1. `window.__agentBridgeGatewayKey`
2. `localStorage` key `__agent_bridge_gateway_key__`
3. `TYPESAFE_API_KEY`, then `VERCEL_AI_GATEWAY_KEY`, only where the runtime is bundled into your own app and the bundler exposes `process.env` (the sample app's Vite config does)

**Sidecar mode:** the sidecar injects a prebuilt runtime in which `process` is undefined, so environment variables never reach it. With the sidecar, only the "?" panel field or `window.__agentBridgeGatewayKey` can supply a key. Environment variables apply only when the runtime is bundled into your app and no sidecar is attached.

Keys starting with `apikey_` go direct to TypeSafe. Keys starting with `vck_` go through the Vercel AI Gateway.

To set a key, open the "?" panel next to AI Render and paste it into the field. It is saved to the page's `localStorage` (per origin, so it persists in the browser profile for that site only) and applied immediately. Clearing the field removes it.

## Liveness and target shimmer

While the status is Working, each selected element's badge shows a shimmer with "Working". When Done, it shows "Updated".

Send sets Working. The agent clears it with the CLI after handling the request:

```bash
debug-bridge browser design-mode done "Made the CTA larger" --port 4000 --session default
debug-bridge browser design-mode error "Selector not found in source" --port 4000 --session default
```

The accepted actions are `done`, `error`, `working`, and `idle`, with an optional message ([cli-reference](./cli-reference.md#browser-design-mode)). This works in sidecar mode.

For pages running the embedded SDK there is also a helper that broadcasts the status to SDK apps. It connects as `role=agent` on a hard-coded session `default`, and only SDK (`role=app`) clients receive it, so it does not affect sidecar-only pages:

```bash
node skills/test-design-mode/scripts/notify-status.mjs --status done --msg "Applied change" --port 4000
```

## Enabling and disabling

`debug-bridge browser open` enables Design Mode automatically. Toggle it manually with `debug-bridge browser design-mode enable|disable`.
