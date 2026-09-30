---
name: agentic-e2e-test
description: Full-stack agentic end-to-end test suite and dual-agent delegation runbook for Agent Bridge. Validates live app spin-up, AI Quick Render style synthesis, human developer simulation (selecting elements, drawing annotations, prompt batch submission), and reactive agent feedback loops (dock status pill, target DOM shimmer, agent broadcast completion).
user-invocable: true
triggers:
  - agentic e2e test
  - run agentic e2e
  - test agent bridge e2e
  - test human loop
  - test feedback loop
  - test ai quick render e2e
type: testing-skill
protocol_version: 1
capabilities:
  - service_health_check
  - design_mode_mount
  - ai_quick_render_synthesis
  - human_simulation_interaction
  - batch_submission_validation
  - reactive_feedback_loop
  - agent_broadcast_completion
  - screenshot_artifact_generation
---

# Agentic E2E Test Runbook

This skill defines the complete agentic end-to-end testing workflow for Agent Bridge. It verifies that when developers improve Agent Bridge, the entire loop: live local app, bridge sidecar, AI Quick Render, human interaction simulation, and reactive agent feedback, works reliably.

```
┌───────────────────────┐
│  Orchestrator Agent   │
└──────────┬────────────┘
           │ spawns via invoke_subagent
           ▼
┌───────────────────────┐      Executes Flow       ┌────────────────────────┐
│ Browser Human Sim     │ ───────────────────────► │   Sample React App     │
│ Subagent              │                          │   (http://localhost:   │
└───────────────────────┘                          │    5173)               │
           │                                       └───────────┬────────────┘
           │ 1. AI Quick Render style synthesis                │
           │ 2. Selects element + draws marks                  │
           │ 3. Submits batch prompt                           ▼
           │                                       ┌────────────────────────┐
           ▼                                       │   Debug Bridge Server  │
┌───────────────────────┐                          │   (ws://localhost:     │
│ Reactive Feedback     │ ◀─────────────────────── │    4000)               │
│ Loop Validation       │                          └────────────────────────┘
│ • Dock pill: working  │
│ • Target DOM shimmer  │
│ • Broadcast completed │
└───────────────────────┘
```

---

## What This Skill Tests

| Phase | Component | Verification Focus | Evidence |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Local Services Health | Vite dev server (:5173) and Bridge WebSocket sidecar (:4000) responsiveness | HTTP 200 checks |
| **Phase 2** | Design Mode Mount | Floating dock palette in Shadow DOM and agent status pill (`status-ready` / `Agent Ready`) | Shadow DOM assertion |
| **Phase 3** | AI Quick Render | Prompt-driven semantic style synthesis without roundtrips (`#__agent_bridge_live_preview__`) | Computed CSS diff |
| **Phase 4** | Human Simulator | Real developer actions: selecting target CTA button and drawing freehand/region bounding boxes | Dock status counts |
| **Phase 5** | Feedback Submission | Batch prompt submission, transition to `status-working`, target element `.shimmer-working` pulse + `⚡ Working` tag | Reactive DOM state |
| **Phase 6** | Agent Broadcast | WebSocket broadcast of agent completion (`notify-status.mjs`), transition to `status-done` + `✓ Updated` badge | High-res screenshot |

---

## Automated Execution

To execute all 6 phases programmatically in one command:

```bash
node scripts/run-agentic-e2e.mjs
```

### Environment Overrides

```bash
TARGET_URL="http://localhost:5173" \
DEBUG_BRIDGE_PORT="4000" \
ARTIFACT_DIR="/tmp" \
node scripts/run-agentic-e2e.mjs
```

---

## Dual-Agent Delegation Protocol

When performing major changes to Agent Bridge (runtime, UI dock, socket bridge, or parser), delegate the human simulation role to a subagent:

### Orchestrator Instructions

1. Ensure Vite dev server and Debug Bridge server are running in background tmux sessions.
2. Spawn the `Browser Human Simulator` subagent with the prompt template below.
3. Monitor subagent completion and inspect generated artifacts.

### Subagent Prompt Template

```markdown
Role: Browser Human Simulator
TypeName: self

Goal:
Act as a human developer testing Agent Bridge Design Mode on http://localhost:5173.

Steps:
1. Launch Chromium and navigate to http://localhost:5173.
2. Verify Design Mode is mounted and Dock shows "Agent Ready".
3. Trigger AI Quick Render on [data-testid="pdp-title"] with prompt:
   "Make the title electric cyan #06b6d4 and add 12px letter spacing"
4. Verify #__agent_bridge_live_preview__ exists in document.head and clean it up.
5. Select [data-testid="add-to-cart-btn"], switch to region tool, and draw an annotation box.
6. Enter prompt "Add glow pulse effect to primary CTA button" and click Send.
7. Verify that dock displays "Working...", target element receives .shimmer-working class with "⚡ Working" tag.
8. Trigger agent completion broadcast via:
   node skills/test-design-mode/scripts/notify-status.mjs --status done --msg "Agent completed CTA pulse styling"
9. Verify dock displays "Done" and target element receives .shimmer-done with "✓ Updated" tag.
10. Save evidence screenshot to /tmp/agentic-e2e-verified.png.
```

---

## Verification Artifacts

- **Run Log**: Exit code 0 with phase markers `Phase 1` through `Phase 6`.
- **Screenshot**: `/tmp/agentic-e2e-verified.png` capturing:
  - Unified bottom dock with completion status pill (`Done`).
  - Target CTA button with green flash box (`.shimmer-done`) and `✓ Updated` badge.
  - Drawn bounding region box around product card details.
