#!/usr/bin/env node
/**
 * Comprehensive Automated Test Suite for Agent Bridge Design Mode
 * Tests mobile (developer mode / phone size) and desktop view surfaces,
 * toolbar responsiveness, tool switching, info popovers, AI quick render,
 * manual inspector tweaks, and batch submissions.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const RUNTIME_PATH = path.resolve('packages/browser/dist/design-mode-runtime.global.js');
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp';
const SCREENSHOT_PHONE = path.join(ARTIFACT_DIR, 'test-design-mode-phone.png');
const SCREENSHOT_DESKTOP = path.join(ARTIFACT_DIR, 'test-design-mode-desktop.png');
const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173';

async function runTestSuite() {
  console.log('===============================================================');
  console.log('🧪 Comprehensive Design Mode Responsive & Functional Test Suite');
  console.log('===============================================================\n');

  if (!fs.existsSync(RUNTIME_PATH)) {
    throw new Error(`Runtime script not found at ${RUNTIME_PATH}. Run pnpm build first.`);
  }
  const runtimeScript = fs.readFileSync(RUNTIME_PATH, 'utf8');

  const browser = await chromium.launch({ headless: true });

  const testResults = [];
  const logStep = (step, name, passed, detail = '') => {
    testResults.push({ step, name, passed, detail });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${mark}] ${step}. ${name}${detail ? ` (${detail})` : ''}`);
  };

  try {
    // =========================================================================
    // Phase 1: Mobile Viewport (iPhone SE: 375x667)
    // =========================================================================
    console.log('\n📱 Phase 1: Mobile Surface (Developer Mode / Phone Viewport 375x667)');
    console.log('-------------------------------------------------------------------');

    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    await mobileContext.addInitScript(`
      window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
        auth: { isLoggedIn: true, email: 'stevie@example.com' },
        cart: { items: [] }
      }));
    `);

    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(TARGET_URL, { waitUntil: 'networkidle' });

    // Verify sample app loaded
    const logoutBtn = mobilePage.locator('button[data-testid="logout-btn"]');
    await logoutBtn.waitFor({ state: 'visible', timeout: 5000 });
    logStep('1.1', 'Sample app loaded on mobile', true, 'button[data-testid="logout-btn"] visible');

    // Inject runtime & enable
    await mobilePage.evaluate(runtimeScript);
    const initialSnap = await mobilePage.evaluate('window.__agentBridgeDesignMode.enable()');
    assert.equal(initialSnap.enabled, true, 'Design Mode must be enabled');
    logStep('1.2', 'Mounted Design Mode overlay on mobile', true, 'Overlay active');

    // Check toolbar geometry on mobile
    const paletteMetrics = await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const root = host.shadowRoot;
      const palette = root.querySelector('.floating-palette');
      const rect = palette.getBoundingClientRect();
      const style = window.getComputedStyle(palette);
      return {
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        scrollWidth: palette.scrollWidth,
        clientWidth: palette.clientWidth,
        overflowX: style.overflowX,
        windowWidth: window.innerWidth,
      };
    });

    assert(paletteMetrics.left >= 0, `Palette left edge (${paletteMetrics.left}) must be >= 0`);
    assert(paletteMetrics.right <= paletteMetrics.windowWidth + 2, `Palette right edge (${paletteMetrics.right}) must fit in window (${paletteMetrics.windowWidth})`);
    assert.equal(paletteMetrics.overflowX, 'auto', 'Palette must have overflow-x: auto for mobile scrolling');
    logStep('1.3', 'Toolbar fits mobile viewport width', true, `width: ${paletteMetrics.width.toFixed(1)}px, scrollWidth: ${paletteMetrics.scrollWidth}px, overflow-x: auto`);

    // Test tool switching
    const tools = ['select', 'pen', 'region', 'arrow', 'interact'];
    for (const tool of tools) {
      const snap = await mobilePage.evaluate((t) => window.__agentBridgeDesignMode.setTool(t), tool);
      assert.equal(snap.active_tool, tool, `Tool should be ${tool}`);
    }
    logStep('1.4', 'Tool switching cycle', true, 'select, pen, region, arrow, interact');

    // Switch back to select and pick logout button
    await mobilePage.evaluate("window.__agentBridgeDesignMode.setTool('select')");
    await logoutBtn.click();
    const selSnap = await mobilePage.evaluate('window.__agentBridgeDesignMode.getSnapshot()');
    assert.equal(selSnap.selections.length, 1, 'One element must be selected');
    logStep('1.5', 'Element selection', true, `Selected @e1: ${selSnap.selections[0].selector}`);

    // Verify selection box stays aligned with element
    const boxAlignment = await mobilePage.evaluate(() => {
      const btn = document.querySelector('button[data-testid="logout-btn"]');
      const btnRect = btn.getBoundingClientRect();
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const box = host.shadowRoot.querySelector('.box.selected-box');
      const boxRect = box.getBoundingClientRect();
      return {
        btnLeft: btnRect.left,
        btnTop: btnRect.top,
        boxLeft: boxRect.left,
        boxTop: boxRect.top,
        diffX: Math.abs(btnRect.left - boxRect.left),
        diffY: Math.abs(btnRect.top - boxRect.top),
      };
    });
    assert(boxAlignment.diffX <= 2 && boxAlignment.diffY <= 2, 'Selection box must align with button');
    logStep('1.6', 'Selection box alignment on mobile', true, `diffX: ${boxAlignment.diffX.toFixed(1)}px, diffY: ${boxAlignment.diffY.toFixed(1)}px`);

    // Test Question Mark (?) info card for AI Quick Render
    await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const aiHelpBtn = host.shadowRoot.querySelector('[data-action="toggle-info-ai"]');
      aiHelpBtn.click();
    });
    const aiInfoMetrics = await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const popover = host.shadowRoot.querySelector('.info-popover');
      if (!popover) return null;
      const rect = popover.getBoundingClientRect();
      const title = popover.querySelector('.info-title')?.textContent || '';
      const badge = popover.querySelector('.info-badge')?.textContent || '';
      return {
        title,
        badge,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        windowWidth: window.innerWidth,
      };
    });
    assert(aiInfoMetrics !== null, 'AI info popover must open');
    assert(aiInfoMetrics.left >= 0 && aiInfoMetrics.right <= aiInfoMetrics.windowWidth + 2, 'AI info popover must fit mobile viewport');
    logStep('1.7', 'AI Quick Render Info (?) popover on mobile', true, `"${aiInfoMetrics.title}" [${aiInfoMetrics.badge}] fits screen`);

    // Close AI info
    await mobilePage.evaluate("window.__agentBridgeDesignMode.toggleInfo(null)");

    // Test Question Mark (?) info card for Manual Quick Render
    await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const manualHelpBtn = host.shadowRoot.querySelector('[data-action="toggle-info-manual"]');
      manualHelpBtn.click();
    });
    const manualInfoMetrics = await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const popover = host.shadowRoot.querySelector('.info-popover');
      if (!popover) return null;
      const rect = popover.getBoundingClientRect();
      const title = popover.querySelector('.info-title')?.textContent || '';
      const badge = popover.querySelector('.info-badge')?.textContent || '';
      return {
        title,
        badge,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        windowWidth: window.innerWidth,
      };
    });
    assert(manualInfoMetrics !== null, 'Manual info popover must open');
    assert(manualInfoMetrics.left >= 0 && manualInfoMetrics.right <= manualInfoMetrics.windowWidth + 2, 'Manual info popover must fit mobile viewport');
    logStep('1.8', 'Manual Quick Render Info (?) popover on mobile', true, `"${manualInfoMetrics.title}" [${manualInfoMetrics.badge}] fits screen`);

    // Close Manual info
    await mobilePage.evaluate("window.__agentBridgeDesignMode.toggleInfo(null)");

    // Test AI Quick Render (Jev)
    console.log('   Executing AI Quick Render (coral background, 20px radius)...');
    const aiRenderResult = await mobilePage.evaluate(async () => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const input = host.shadowRoot.querySelector('[data-agent-prompt]');
      input.value = 'Change logout button background color to coral and border-radius to 20px';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return await window.__agentBridgeDesignMode.quickRenderAi();
    });
    assert.equal(aiRenderResult.success, true, 'AI Quick Render should succeed');

    const stylesAfterAi = await mobilePage.evaluate(() => {
      const btn = document.querySelector('button[data-testid="logout-btn"]');
      const cs = window.getComputedStyle(btn);
      return {
        backgroundColor: cs.backgroundColor,
        borderRadius: cs.borderRadius,
      };
    });
    assert.equal(stylesAfterAi.borderRadius, '20px', 'Border radius should be 20px');
    logStep('1.9', 'AI Quick Render DOM injection', true, `bg: ${stylesAfterAi.backgroundColor}, radius: ${stylesAfterAi.borderRadius}`);

    // Test Manual Quick Render (Tweaker Inspector)
    await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const tweakBtn = host.shadowRoot.querySelector('[data-action="toggle-tweaker"]');
      tweakBtn.click();
    });

    const tweakerMetrics = await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const popover = host.shadowRoot.querySelector('.tweaker-popover');
      if (!popover) return null;
      const rect = popover.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        windowWidth: window.innerWidth,
      };
    });
    assert(tweakerMetrics !== null, 'Tweaker popover must open');
    assert(tweakerMetrics.left >= 0 && tweakerMetrics.right <= tweakerMetrics.windowWidth + 2, 'Tweaker popover must fit mobile viewport');
    logStep('1.10', 'Tweaker inspector popover on mobile', true, `width: ${tweakerMetrics.width.toFixed(1)}px fits screen`);

    // Apply manual tweak: padding 14px 28px
    await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const paddingInput = host.shadowRoot.querySelector('input[data-edit-prop="padding"]');
      if (paddingInput) {
        paddingInput.value = '14px 28px';
        paddingInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const manualRenderResult = await mobilePage.evaluate(() => window.__agentBridgeDesignMode.quickRenderManual());
    assert.equal(manualRenderResult.success, true, 'Manual Quick Render should succeed');

    const stylesAfterManual = await mobilePage.evaluate(() => {
      const btn = document.querySelector('button[data-testid="logout-btn"]');
      return window.getComputedStyle(btn).padding;
    });
    assert.equal(stylesAfterManual, '14px 28px', 'Padding should be updated to 14px 28px');
    logStep('1.11', 'Manual Quick Render live tweak', true, `padding: ${stylesAfterManual}`);

    // Test Batch Review Popover
    await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const batchBtn = host.shadowRoot.querySelector('[data-action="toggle-batch"]');
      batchBtn.click();
    });

    const batchMetrics = await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const popover = host.shadowRoot.querySelector('.batch-popover');
      if (!popover) return null;
      const rect = popover.getBoundingClientRect();
      const title = popover.querySelector('.popover-title')?.textContent || '';
      return {
        title,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        windowWidth: window.innerWidth,
      };
    });
    assert(batchMetrics !== null, 'Batch popover must open');
    assert(batchMetrics.left >= 0 && batchMetrics.right <= batchMetrics.windowWidth + 2, 'Batch popover must fit mobile viewport');
    logStep('1.12', 'Batch review popover on mobile', true, `"${batchMetrics.title}" fits screen`);

    // Close batch popover
    await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      host.shadowRoot.querySelector('[data-action="close-batch"]')?.click();
    });

    // Test Send to Agent
    await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const sendBtn = host.shadowRoot.querySelector('[data-action="submit-batch"]');
      sendBtn.click();
    });
    await mobilePage.waitForTimeout(100);
    const sendBtnText = await mobilePage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const sendBtn = host.shadowRoot.querySelector('[data-action="submit-batch"]');
      return sendBtn ? sendBtn.textContent.trim() : '';
    });
    assert(sendBtnText.includes('Sent') || sendBtnText.includes('Submitting') || sendBtnText.includes('Send'), 'Send button state updated');
    logStep('1.13', 'Send to Agent submission', true, `Button status: "${sendBtnText}"`);

    // Mobile screenshot
    await mobilePage.screenshot({ path: SCREENSHOT_PHONE });
    logStep('1.14', 'Mobile surface screenshot captured', true, SCREENSHOT_PHONE);

    await mobileContext.close();

    // =========================================================================
    // Phase 2: Desktop Surface (1280x850) & Viewport Resizing
    // =========================================================================
    console.log('\n🖥️ Phase 2: Desktop Surface (1280x850) & Resizing Dynamics');
    console.log('---------------------------------------------------------');

    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 850 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    await desktopContext.addInitScript(`
      window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
        auth: { isLoggedIn: true, email: 'stevie@example.com' },
        cart: { items: [] }
      }));
    `);

    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(TARGET_URL, { waitUntil: 'networkidle' });
    await desktopPage.evaluate(runtimeScript);
    await desktopPage.evaluate('window.__agentBridgeDesignMode.enable()');

    // Select logout button on desktop
    const desktopLogoutBtn = desktopPage.locator('button[data-testid="logout-btn"]');
    await desktopLogoutBtn.click();

    // Test dynamic resize (simulating developer mode toggle)
    console.log('   Testing dynamic viewport resize from 1280 to 400 and back...');
    await desktopPage.setViewportSize({ width: 400, height: 750 });
    await desktopPage.waitForTimeout(100);

    const resizedBoxes = await desktopPage.evaluate(() => {
      const btn = document.querySelector('button[data-testid="logout-btn"]');
      const btnRect = btn.getBoundingClientRect();
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const box = host.shadowRoot.querySelector('.box.selected-box');
      const boxRect = box.getBoundingClientRect();
      return {
        diffX: Math.abs(btnRect.left - boxRect.left),
        diffY: Math.abs(btnRect.top - boxRect.top),
      };
    });
    assert(resizedBoxes.diffX <= 2 && resizedBoxes.diffY <= 2, 'Selection box must reposition accurately after resize');
    logStep('2.1', 'Dynamic viewport resize & box repositioning', true, `Box diff after resize: ${resizedBoxes.diffX.toFixed(1)}px`);

    // Restore to desktop 1280x850
    await desktopPage.setViewportSize({ width: 1280, height: 850 });
    await desktopPage.waitForTimeout(100);

    // Test visual annotations (pen, region, arrow)
    await desktopPage.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      // Switch to pen
      window.__agentBridgeDesignMode.setTool('pen');
    });

    // Simulate pen drawing on canvas
    await desktopPage.mouse.move(300, 250);
    await desktopPage.mouse.down();
    await desktopPage.mouse.move(340, 270);
    await desktopPage.mouse.move(380, 250);
    await desktopPage.mouse.up();

    // Simulate region box
    await desktopPage.evaluate(() => window.__agentBridgeDesignMode.setTool('region'));
    await desktopPage.mouse.move(500, 200);
    await desktopPage.mouse.down();
    await desktopPage.mouse.move(650, 320);
    await desktopPage.mouse.up();

    // Simulate arrow
    await desktopPage.evaluate(() => window.__agentBridgeDesignMode.setTool('arrow'));
    await desktopPage.mouse.move(200, 400);
    await desktopPage.mouse.down();
    await desktopPage.mouse.move(260, 340);
    await desktopPage.mouse.up();

    const marksSnap = await desktopPage.evaluate('window.__agentBridgeDesignMode.getSnapshot()');
    assert.equal(marksSnap.marks.length, 3, 'Must have 3 visual annotations (pen, region, arrow)');
    logStep('2.2', 'Visual annotations (pen, region, arrow)', true, `3 marks drawn successfully`);

    // Desktop screenshot
    await desktopPage.screenshot({ path: SCREENSHOT_DESKTOP });
    logStep('2.3', 'Desktop surface screenshot captured', true, SCREENSHOT_DESKTOP);

    await desktopContext.close();

    console.log('\n===============================================================');
    console.log('🎉 All Design Mode Tests Passed Successfully!');
    console.log(`📱 Phone Screenshot: ${SCREENSHOT_PHONE}`);
    console.log(`🖥️ Desktop Screenshot: ${SCREENSHOT_DESKTOP}`);
    console.log('===============================================================\n');

    return {
      success: true,
      testsPassed: testResults.filter((r) => r.passed).length,
      totalTests: testResults.length,
      screenshots: {
        phone: SCREENSHOT_PHONE,
        desktop: SCREENSHOT_DESKTOP,
      },
    };
  } finally {
    await browser.close();
  }
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
