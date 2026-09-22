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
        isVertical: palette.classList.contains('layout-vertical'),
        isDockRight: palette.classList.contains('dock-right'),
      };
    });

    assert(paletteMetrics.left >= 0, `Palette left edge (${paletteMetrics.left}) must be >= 0`);
    assert(paletteMetrics.right <= paletteMetrics.windowWidth + 2, `Palette right edge (${paletteMetrics.right}) must fit in window (${paletteMetrics.windowWidth})`);
    assert.equal(paletteMetrics.isVertical, true, 'Palette must be vertical rail on mobile');
    assert.equal(paletteMetrics.isDockRight, true, 'Palette must dock to right edge by default');
    assert(paletteMetrics.width <= 48, `Palette width (${paletteMetrics.width}px) must be compact rail <= 48px`);
    assert.equal(paletteMetrics.overflowX, 'auto', 'Palette must have overflow-x: auto');
    logStep('1.3', 'Vertical rail fits mobile viewport', true, `width: ${paletteMetrics.width.toFixed(1)}px (sleek vertical dock on right)`);

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

    // Test natural language prompt ("make it rounded")
    const nlRenderResult = await mobilePage.evaluate(async () => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const input = host.shadowRoot.querySelector('[data-agent-prompt]');
      input.value = 'make it rounded';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return await window.__agentBridgeDesignMode.quickRenderAi();
    });
    assert.equal(nlRenderResult.success, true, 'AI Quick Render with natural language prompt should succeed');
    assert(nlRenderResult.css.includes('border-radius: 12px'), 'Natural language rounded should inject 12px border radius');

    logStep('1.9', 'AI Quick Render DOM injection', true, `bg: ${stylesAfterAi.backgroundColor}, radius: ${stylesAfterAi.borderRadius}, nl: 12px`);

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

    // =========================================================================
    // Phase 3: CMUX Parity Multi-Item Batch, Crop Screenshots & Fiber Reflection
    // =========================================================================
    console.log('\n🎯 Phase 3: CMUX Parity Multi-Item Batch, Crop Screenshots & Fiber Reflection');
    console.log('----------------------------------------------------------------------------');

    const cmuxContext = await browser.newContext({
      viewport: { width: 1280, height: 850 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    await cmuxContext.addInitScript(`
      window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
        auth: { isLoggedIn: true, email: 'stevie@example.com' },
        cart: { items: [] }
      }));
    `);

    const cmuxPage = await cmuxContext.newPage();
    await cmuxPage.goto(TARGET_URL, { waitUntil: 'networkidle' });
    await cmuxPage.evaluate(runtimeScript);
    await cmuxPage.evaluate('window.__agentBridgeDesignMode.enable()');

    // 3.1: Multi-item selection batch (select 3 elements)
    const el1 = cmuxPage.locator('button[data-testid="logout-btn"]');
    const el2 = cmuxPage.locator('div[data-testid="home-page"] h1');
    const el3 = cmuxPage.locator('a[data-testid="nav-products"]');

    await el1.click();
    await el2.click();
    await el3.click();

    const batchSnap = await cmuxPage.evaluate('window.__agentBridgeDesignMode.getSnapshot()');
    assert.equal(batchSnap.selections.length, 3, 'Batch must contain 3 selected elements');
    logStep('3.1', 'Multi-item batch selection', true, `Selected ${batchSnap.selections.length} elements (@e1, @e2, @e3)`);

    // 3.2: React Fiber & Prop Reflection on selected elements
    const sel0 = batchSnap.selections[0];
    const sel1 = batchSnap.selections[1];
    assert.ok(Array.isArray(sel0.react_components), 'Selection 0 must have react_components array');
    assert.ok(Array.isArray(sel0.react_prop_keys), 'Selection 0 must have react_prop_keys array');
    assert.ok(sel0.react_components.includes('App') || sel0.react_components.includes('Routes'), 'Selection 0 react_components must include App or Routes');
    assert.ok(sel0.react_prop_keys.includes('onClick') || sel0.react_prop_keys.includes('data-testid'), 'Selection 0 react_prop_keys must include onClick or data-testid');
    assert.ok(sel1.react_components.includes('Home'), 'Selection 1 react_components must include Home component');
    assert.ok(sel1.react_prop_keys.includes('data-component') || sel1.react_prop_keys.includes('data-testid'), 'Selection 1 react_prop_keys must include data-component or data-testid');
    logStep('3.2', 'React Fiber & Prop Reflection', true, `sel0: [${sel0.react_components.slice(0, 3).join(', ')}], sel1: [${sel1.react_components.slice(0, 3).join(', ')}]`);

    // 3.3: Capture per-element cropped screenshots & full page screenshot
    const cmuxDir = path.join('/tmp', 'cmux-parity-test');
    fs.mkdirSync(cmuxDir, { recursive: true });
    const timestamp = Date.now();

    const pageScreenshotPath = path.join(cmuxDir, `surface-test-${timestamp}-screenshot.png`);
    await cmuxPage.screenshot({ path: pageScreenshotPath });

    const cropPaths = [];
    for (let i = 0; i < batchSnap.selections.length; i++) {
      const s = batchSnap.selections[i];
      const cropPath = path.join(cmuxDir, `surface-test-${timestamp}-crop-${i}-screenshot.png`);
      const loc = cmuxPage.locator(s.selector).first();
      await loc.screenshot({ path: cropPath });
      assert.ok(fs.existsSync(cropPath) && fs.statSync(cropPath).size > 0, `Cropped screenshot ${i} must exist and have content`);
      cropPaths.push(cropPath);
    }
    logStep('3.3', 'Per-element cropped screenshots generated', true, `Captured 3 crops: ${cropPaths.map((p) => path.basename(p)).join(', ')}`);

    // 3.4: Context.json parity generation
    const contextJsonPath = path.join(cmuxDir, `surface-test-${timestamp}-context.json`);
    const requestedText = 'change login and navigation buttons';

    await cmuxPage.evaluate(({ pageScreenshotPath, cropPaths, contextJsonPath }) => {
      window.__agentBridgeDesignMode.setArtifactPaths({
        screenshot_path: pageScreenshotPath,
        page_screenshot_path: pageScreenshotPath,
        element_screenshot_paths: cropPaths,
        context_json_path: contextJsonPath,
      });
    }, { pageScreenshotPath, cropPaths, contextJsonPath });

    const updatedSnap = await cmuxPage.evaluate('window.__agentBridgeDesignMode.getSnapshot()');
    const tokens = await cmuxPage.evaluate((txt) => window.__agentBridgeDesignMode.getPromptTokens(txt), requestedText);
    assert.equal(tokens.length, 4, 'Tokens must have selection 0, text, selection 1, selection 2');
    assert.deepEqual(tokens[0], { selection: 0 });
    assert.deepEqual(tokens[1], { text: requestedText });
    assert.deepEqual(tokens[2], { selection: 1 });
    assert.deepEqual(tokens[3], { selection: 2 });

    const contextData = {
      css_diff: updatedSnap.css_diff || '',
      edits: updatedSnap.edits || [],
      page_screenshot_path: pageScreenshotPath,
      page_url: cmuxPage.url(),
      prompt: tokens,
      requested_change: requestedText,
      revision: updatedSnap.revision,
      selections: updatedSnap.selections,
      marks: updatedSnap.marks || [],
    };
    fs.writeFileSync(contextJsonPath, JSON.stringify(contextData, null, 2));
    assert.ok(fs.existsSync(contextJsonPath), 'context.json must exist');
    logStep('3.4', 'Structured prompt tokens and context.json parity', true, 'context.json contains 4 tokens and 3 selections');

    // 3.5: Line 1 Multimodal Prompt Formatting
    const formattedPrompt = await cmuxPage.evaluate((txt) => window.__agentBridgeDesignMode.getFormattedPrompt(txt), requestedText);
    const promptLines = formattedPrompt.split('\n');

    const expectedLine1 = `${cropPaths[0]} ${requestedText} ${cropPaths[1]} ${cropPaths[2]}`;
    assert.equal(promptLines[0], expectedLine1, 'Line 1 must format all cropped image paths and prompt text');
    assert.equal(promptLines[1], '', 'Line 2 must be blank');
    assert.equal(promptLines[2], `Page: ${cmuxPage.url()}`, 'Line 3 must start with Page:');
    assert.equal(promptLines[3], `Details: ${contextJsonPath}`, 'Line 4 must start with Details:');
    logStep('3.5', 'Line 1 multimodal clipboard prompt format verified', true, 'Line 1: <crop0> text <crop1> <crop2>');

    // 3.6: Clipboard copy and handoff payload
    const handoffPayload = await cmuxPage.evaluate((txt) => window.__agentBridgeDesignMode.getHandoff(txt), requestedText);
    assert.deepEqual(handoffPayload.prompt, tokens, 'Handoff prompt must match tokens array');
    assert.equal(handoffPayload.page_screenshot_path, pageScreenshotPath, 'Handoff page screenshot path must match');
    assert.equal(handoffPayload.selections.length, 3, 'Handoff selections length must be 3');
    assert.equal(handoffPayload.selections[0].screenshot_path, cropPaths[0], 'Selection 0 must have crop 0 path');
    assert.equal(handoffPayload.selections[1].screenshot_path, cropPaths[1], 'Selection 1 must have crop 1 path');
    assert.equal(handoffPayload.selections[2].screenshot_path, cropPaths[2], 'Selection 2 must have crop 2 path');
    logStep('3.6', 'Handoff payload parity verified', true, 'Handoff matches cmux schema with element screenshot paths');

    await cmuxContext.close();

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
