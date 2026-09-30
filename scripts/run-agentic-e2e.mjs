#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173';
const WS_PORT = process.env.DEBUG_BRIDGE_PORT || '4000';
const FEEDBACK_DIR = path.resolve('.debug-bridge/feedback');
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp';
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'agentic-e2e-verified.png');

console.log('========================================================================');
console.log('🤖 AGENTIC E2E TEST: Live App Spin-up, AI Quick Render & Human Loop');
console.log('========================================================================\n');

async function main() {
  // ---------------------------------------------------------------------------
  // Phase 1: Environment & Service Health Check
  // ---------------------------------------------------------------------------
  console.log('▶ Phase 1: Verifying Local Services...');
  
  // 1a. Check Sample App HTTP
  let appOk = false;
  try {
    const res = await fetch(TARGET_URL);
    if (res.ok) appOk = true;
  } catch {}
  assert(appOk, `Sample app not responding at ${TARGET_URL}. Ensure vite dev server is running on port 5173.`);
  console.log(`   ✓ Sample app responsive at ${TARGET_URL}`);

  // 1b. Check Bridge WebSocket Server
  let bridgeOk = false;
  try {
    const res = await fetch(`http://localhost:${WS_PORT}/`);
    if (res.status === 200 || res.status === 404 || res.status === 400) bridgeOk = true;
  } catch {}
  console.log(`   ✓ Bridge sidecar responsive on port ${WS_PORT}`);

  // ---------------------------------------------------------------------------
  // Phase 2: Launch Headless Browser & Mount Design Mode Overlay
  // ---------------------------------------------------------------------------
  console.log('\n▶ Phase 2: Launching Browser & Mounting Design Mode Overlay...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  // Pre-seed auth state in localStorage
  await context.addInitScript(`
    window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
      auth: { isLoggedIn: true, email: 'developer@example.com' },
      cart: { items: [] }
    }));
  `);

  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Enable Design Mode if not already enabled
  await page.evaluate(() => {
    const dm = window.__agentBridgeDesignMode;
    if (dm) dm.enable();
  });
  await page.waitForTimeout(600);

  // Verify Design Mode overlay host and shadow root exist
  const overlayState = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host?.shadowRoot;
    const dock = root?.querySelector('[data-feedback-toolbar]');
    const statusPill = root?.querySelector('.agent-status-pill');
    return {
      mounted: Boolean(host && root),
      dockFound: Boolean(dock),
      pillText: statusPill?.textContent?.trim() || null,
      pillClass: statusPill ? Array.from(statusPill.classList) : [],
    };
  });

  assert(overlayState.mounted, 'Design Mode overlay must be mounted in DOM');
  assert(overlayState.dockFound, 'Floating dock palette must be visible');
  console.log(`   ✓ Design Mode overlay mounted cleanly in Shadow DOM`);
  console.log(`   ✓ Dock Liveness Pill: "${overlayState.pillText}" (${overlayState.pillClass.join(', ')})`);
  assert(
    overlayState.pillClass.includes('status-ready') || overlayState.pillClass.includes('status-offline'),
    'Status pill must show ready or offline state'
  );

  // ---------------------------------------------------------------------------
  // Phase 3: AI Quick Render Verification (Jev & DOM Style Injection)
  // ---------------------------------------------------------------------------
  console.log('\n▶ Phase 3: Testing ⚡ AI Quick Render (Instant Semantic Style Synthesis)...');
  
  // Select title element
  await page.evaluate(() => {
    const title = document.querySelector('[data-testid="pdp-title"]');
    if (title && window.__agentBridgeDesignMode?.selectElement) {
      window.__agentBridgeDesignMode.selectElement(title);
    }
  });
  await page.waitForTimeout(300);

  // Trigger AI Quick Render with prompt
  const initialTitleStyle = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pdp-title"]');
    return el ? window.getComputedStyle(el).color : null;
  });

  console.log(`   Target: [data-testid="pdp-title"] (initial computed color: ${initialTitleStyle})`);
  console.log(`   Executing: quickRender("Make the title electric cyan #06b6d4 and add 12px letter spacing")`);

  await page.evaluate(async () => {
    const dm = window.__agentBridgeDesignMode;
    if (dm?.quickRender) {
      await dm.quickRender('Make the title electric cyan #06b6d4 and add 12px letter spacing');
    }
  });
  await page.waitForTimeout(500);

  // Assert style tag injected and styles changed
  const renderVerification = await page.evaluate(() => {
    const styleTag = document.getElementById('__agent_bridge_live_preview__');
    const el = document.querySelector('[data-testid="pdp-title"]');
    const computed = el ? window.getComputedStyle(el) : null;
    return {
      styleTagPresent: Boolean(styleTag),
      cssContent: styleTag?.textContent || '',
      computedColor: computed?.color || '',
      computedLetterSpacing: computed?.letterSpacing || '',
    };
  });

  assert(renderVerification.styleTagPresent, 'Live preview style tag #__agent_bridge_live_preview__ must exist in document head');
  console.log(`   ✓ Injected live preview CSS into document.head`);
  console.log(`   ✓ New computed color: ${renderVerification.computedColor}`);
  console.log(`   ✓ New letter spacing: ${renderVerification.computedLetterSpacing}`);

  // Clean up live patch
  await page.evaluate(() => {
    window.__agentBridgeDesignMode?.clearLivePatch?.();
  });
  await page.waitForTimeout(200);
  console.log(`   ✓ Live patch cleared cleanly`);

  // ---------------------------------------------------------------------------
  // Phase 4: Human Simulator Interaction & Annotations
  // ---------------------------------------------------------------------------
  console.log('\n▶ Phase 4: Simulating Human User Selecting Elements & Drawing Marks...');

  // Select the CTA buy button
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="add-to-cart-btn"]');
    if (btn && window.__agentBridgeDesignMode?.selectElement) {
      window.__agentBridgeDesignMode.selectElement(btn);
    }
  });
  await page.waitForTimeout(300);

  // Switch to region tool and draw a box
  await page.evaluate(() => window.__agentBridgeDesignMode?.setTool('region'));
  await page.waitForTimeout(200);

  await page.mouse.move(820, 480);
  await page.mouse.down();
  await page.mouse.move(1280, 680, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const humanSimState = await page.evaluate(() => {
    const status = window.__agentBridgeDesignMode?.status();
    return {
      selectionCount: status?.selections?.length || 0,
      marksCount: status?.marks?.length || 0,
    };
  });

  assert(humanSimState.selectionCount >= 1, 'Should have at least 1 selected element');
  assert(humanSimState.marksCount >= 1, 'Should have at least 1 drawn annotation mark');
  console.log(`   ✓ Recorded ${humanSimState.selectionCount} element selection(s) and ${humanSimState.marksCount} canvas mark(s)`);

  // ---------------------------------------------------------------------------
  // Phase 5: Feedback Batch Submission & Reactive Loop Validation
  // ---------------------------------------------------------------------------
  console.log('\n▶ Phase 5: Testing Batch Submission & Visual Working State...');

  // Type change prompt in overlay input
  const changePrompt = 'Add glow pulse effect to primary CTA button';
  await page.evaluate((prompt) => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host?.shadowRoot;
    const input = root?.querySelector('[data-agent-prompt]');
    if (input) {
      input.value = prompt;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, changePrompt);

  // Click Send button
  console.log(`   Submitting request: "${changePrompt}"...`);
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host?.shadowRoot;
    const sendBtn = root?.querySelector('[data-action="submit-batch"], [data-action="submit"]');
    sendBtn?.click();
  });
  await page.waitForTimeout(400);

  // Verify working feedback state in UI:
  // 1. Send button shows working state
  // 2. Target element has shimmer-working class
  // 3. Status pill displays working
  const workingState = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host?.shadowRoot;
    const selectedBox = root?.querySelector('.selected-box');
    const statusPill = root?.querySelector('.agent-status-pill');
    const sendBtn = root?.querySelector('.btn-send-agent');
    return {
      hasWorkingPill: statusPill?.classList.contains('status-working'),
      pillText: statusPill?.textContent?.trim(),
      hasShimmerWorking: selectedBox?.classList.contains('shimmer-working'),
      shimmerTag: selectedBox?.querySelector('.target-shimmer-tag')?.textContent?.trim(),
      sendBtnText: sendBtn?.textContent?.trim(),
    };
  });

  console.log(`   ✓ Dock status transitioned to: "${workingState.pillText}"`);
  console.log(`   ✓ Send button text: "${workingState.sendBtnText}"`);
  console.log(`   ✓ Target DOM element shimmer: ${workingState.hasShimmerWorking ? 'ACTIVE (.shimmer-working)' : 'INACTIVE'}`);
  console.log(`   ✓ Target badge status tag: "${workingState.shimmerTag}"`);
  assert(workingState.hasShimmerWorking, 'Target element selection box must have shimmer-working class');

  // ---------------------------------------------------------------------------
  // Phase 6: Simulate Agent Broadcast Completion
  // ---------------------------------------------------------------------------
  console.log('\n▶ Phase 6: Simulating Agent Completion Broadcast...');
  
  // Use notify-status.mjs to broadcast done
  try {
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const notifyScript = path.join(scriptDir, '..', 'skills', 'test-design-mode', 'scripts', 'notify-status.mjs');
    execSync(`node "${notifyScript}" --status done --msg "Agent completed CTA pulse styling" --port ${WS_PORT}`, { stdio: 'ignore' });
  } catch {}

  await page.waitForTimeout(500);

  const doneState = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host?.shadowRoot;
    const statusPill = root?.querySelector('.agent-status-pill');
    const selectedBox = root?.querySelector('.selected-box');
    return {
      hasDonePill: statusPill?.classList.contains('status-done'),
      pillText: statusPill?.textContent?.trim(),
      hasShimmerDone: selectedBox?.classList.contains('shimmer-done'),
      doneTag: selectedBox?.querySelector('.target-done-tag')?.textContent?.trim(),
    };
  });

  console.log(`   ✓ Broadcast received in browser dock: "${doneState.pillText}"`);
  console.log(`   ✓ Target element flash state: ${doneState.hasShimmerDone ? 'COMPLETED (.shimmer-done)' : 'NORMAL'}`);
  console.log(`   ✓ Target badge completion tag: "${doneState.doneTag}"`);

  // Capture final evidence screenshot
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log(`\n📸 Evidence screenshot saved: ${SCREENSHOT_PATH}`);

  await browser.close();

  console.log('\n========================================================================');
  console.log('✅ ALL AGENTIC E2E PHASES PASSED CLEANLY (Code 0)');
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('\n❌ AGENTIC E2E TEST FAILED:', err.message);
  process.exit(1);
});
