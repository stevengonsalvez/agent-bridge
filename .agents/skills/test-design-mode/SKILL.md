---
name: test-design-mode
description: Automated end-to-end testing suite and subagent protocol for validating Agent Bridge Design Mode across mobile (phone) and desktop viewports, testing toolbar visibility, tool switching, info popovers, AI quick render, manual tweaks, and batch submissions.
user-invocable: true
triggers:
  - test design mode
  - run design mode tests
  - verify design mode
  - test mobile toolbar
  - test developer mode toolbar
  - test toolbar responsive
type: testing-skill
protocol_version: 1
capabilities:
  - mobile_viewport_testing
  - desktop_viewport_testing
  - responsive_toolbar_validation
  - tool_switching_verification
  - element_selection_verification
  - info_popovers_validation
  - ai_quick_render_validation
  - manual_quick_render_validation
  - batch_submission_verification
  - screenshot_artifact_generation
---

# Test Design Mode Runbook

This skill provides an automated, reproducible end-to-end test suite and subagent delegation protocol for validating Agent Bridge Design Mode across mobile (Developer Mode device simulation) and desktop viewports.

```
┌────────────────────────┐
│  Orchestrator Agent    │
└───────────┬────────────┘
            │ spawns via invoke_subagent
            ▼
┌────────────────────────┐       Runs Suite       ┌────────────────────────┐
│ Browser Tester Subagent│ ─────────────────────► │ Playwright Test Runner │
└────────────────────────┘                        └───────────┬────────────┘
                                                              │
                                    ┌─────────────────────────┴─────────────────────────┐
                                    ▼                                                   ▼
                        ┌───────────────────────┐                           ┌───────────────────────┐
                        │   Mobile Viewport     │                           │   Desktop Viewport    │
                        │   (Phone 375x667)     │                           │   (Desktop 1280x850)  │
                        ├───────────────────────┤                           ├───────────────────────┤
                        │ • Toolbar fits screen │                           │ • Full toolbar pills  │
                        │ • Overflow-x scroll   │                           │ • Canvas annotations  │
                        │ • Popover max-widths  │                           │ • Resize re-anchoring │
                        │ • AI Quick Render     │                           │ • Multi-item batch    │
                        │ • Manual Tweaks       │                           │ • High-res screenshot │
                        └───────────────────────┘                           └───────────────────────┘
```

---

## What This Skill Tests

| Category | Item Tested | Verification Method |
| :--- | :--- | :--- |
| **Responsive Viewports** | Phone Surface (`375x667`) | Ensures palette is constrained (`max-width: calc(100vw - 16px)`), horizontally scrollable (`overflow-x: auto`), and no buttons clip. |
| **Responsive Viewports** | Desktop Surface (`1280x850`) | Full-width display with tool group, prompt input, render wraps, tweaker, batch, and copy buttons. |
| **Dynamic Resizing** | DevTools Mode Toggle | Resizes viewport from desktop to mobile and back; verifies `.box-layer` and canvas reposition without drift. |
| **Tool Palette** | Mode Switching | Cycles through `interact`, `select`, `pen`, `region`, `arrow`; verifies snapshot updates. |
| **Target Selection** | Element Pick & Highlight | Picks target element (`button[data-testid="logout-btn"]`), checks `@e1` badge and selection box. |
| **Info Popovers** | AI Quick Render Info (`?`) | Opens AI info popover; verifies title "Quick Render (AI)", "TypeSafe AI • Jev" badge, and viewport bounds. |
| **Info Popovers** | Manual Quick Render Info (`?`) | Opens Manual info popover; verifies title "Quick Render (Manual)", "Inspector" badge, and viewport bounds. |
| **Instant Preview** | AI Quick Render (Jev) | Synthesizes CSS from prompt, injects `<style id="__agent_bridge_live_preview__">`, verifies computed styles. |
| **Instant Preview** | Manual Quick Render (Tweaker) | Opens inspector, adjusts style properties (e.g. padding), injects live CSS overrides, verifies computed styles. |
| **Batch Workflow** | Batch Review & Send | Inspects batch summary, triggers `➤ Send`, verifies submission transition state. |
| **Visual Annotations** | Canvas Drawing | Draws pen lines, region boxes, and arrows; verifies snapshot marks count. |
| **Visual Artifacts** | Screenshots | Captures full page screenshots for mobile and desktop surfaces. |
| **React Reflection** | Fiber & Prop Inspection | Extracts component hierarchy (`App`, `Home`, etc.) and prop keys via `__reactFiber$` and `__reactProps$`. |
| **Per-Element Crops** | Bounding Box Screenshots | Captures tight cropped screenshots per element in batch (`surface-...-crop-...-screenshot.png`). |
| **CMUX Line 1 Parity** | Multimodal Prompt Format | Emits line 1 `<crop0> <text> <crop1> <crop2>`, `Page: <url>`, and `Details: <context.json>`. |
| **Structured Handoff** | Tokenized Prompt Array | Populates `prompt: [{ selection: 0 }, { text: ... }, ...]` and `context.json` schema matching cmux. |

---

## Quick Execution

### Method 1: Direct Command Line Runner

Run the test suite directly in the project workspace:

```bash
# Ensure browser package is built
pnpm --filter debug-bridge-browser build

# Run comprehensive test suite
node scripts/test-design-mode-suite.mjs
```

Environment variables:
- `TARGET_URL`: Defaults to `http://localhost:5173`.
- `ARTIFACT_DIR`: Defaults to `/tmp`. Set to the session artifact directory to automatically export screenshot artifacts.

Example with custom artifact path:
```bash
ARTIFACT_DIR="/tmp/test-artifacts" node scripts/test-design-mode-suite.mjs
```

### Method 2: Tester Subagent Delegation (Orchestrator Protocol)

When the orchestrator agent tests Design Mode, spawn a dedicated tester subagent:

```json
{
  "typeName": "self",
  "role": "Browser Tester Subagent",
  "Prompt": "You are the Tester Subagent validating Agent Bridge Design Mode across mobile (developer mode / phone size), desktop viewports, and CMUX parity.\n\nInstructions:\n1. Execute the comprehensive test suite:\n   `node scripts/test-design-mode-suite.mjs`\n2. Verify that all 23 test steps across Phase 1 (Mobile Surface), Phase 2 (Desktop Surface), and Phase 3 (CMUX Parity Multi-Item Batch, Crops & Fiber) pass with code 0.\n3. Verify that the two verification screenshots are generated:\n   - /tmp/test-design-mode-phone.png\n   - /tmp/test-design-mode-desktop.png\n4. Report back with the test results summary, toolbar scroll metrics, computed styles before vs after AI/manual render, React Fiber components detected, cropped element screenshots, and screenshot paths."
}
```

---

## Test Suite Implementation Details

The test suite is maintained at `scripts/test-design-mode-suite.mjs`.

Key assertions:
1. **Palette Bounds on Mobile**:
   ```javascript
   assert(paletteMetrics.left >= 0);
   assert(paletteMetrics.right <= paletteMetrics.windowWidth + 2);
   assert.equal(paletteMetrics.overflowX, 'auto');
   ```
2. **Popover Bounds on Mobile**:
   ```javascript
   assert(popoverRect.left >= 0);
   assert(popoverRect.right <= windowWidth + 2);
   ```
3. **DOM Live Injection**:
   ```javascript
   const styleTag = page.locator('#__agent_bridge_live_preview__');
   await styleTag.waitFor({ state: 'attached' });
   ```
4. **Dynamic Resizing Accuracy**:
   ```javascript
   assert(boxAlignment.diffX <= 2 && boxAlignment.diffY <= 2);
   ```
5. **React Fiber & Prop Reflection**:
   ```javascript
   assert.ok(Array.isArray(sel0.react_components));
   assert.ok(sel0.react_components.includes('App') || sel0.react_components.includes('Routes'));
   assert.ok(sel1.react_components.includes('Home'));
   ```
6. **Line 1 Multimodal Prompt Format**:
   ```javascript
   const expectedLine1 = `${cropPaths[0]} ${requestedText} ${cropPaths[1]} ${cropPaths[2]}`;
   assert.equal(promptLines[0], expectedLine1);
   assert.equal(promptLines[2], `Page: ${cmuxPage.url()}`);
   assert.equal(promptLines[3], `Details: ${contextJsonPath}`);
   ```
7. **Structured Prompt Tokens**:
   ```javascript
   assert.deepEqual(tokens[0], { selection: 0 });
   assert.deepEqual(tokens[1], { text: requestedText });
   assert.deepEqual(tokens[2], { selection: 1 });
   assert.deepEqual(tokens[3], { selection: 2 });
   ```
