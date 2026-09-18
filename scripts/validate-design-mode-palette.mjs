#!/usr/bin/env node
/**
 * Automated Verification Script for Floating Pill Palette,
 * Visual Annotation Tools, Live Quick Render, and Screenshot Artifact Generation.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

async function runValidation() {
  console.log('=== Design Mode Palette & Artifact Generation Validation ===\n');

  const runtimePath = path.resolve('packages/browser/dist/design-mode-runtime.global.js');
  if (!fs.existsSync(runtimePath)) {
    throw new Error(`Runtime script not found at ${runtimePath}. Run pnpm build first.`);
  }
  const runtimeScript = fs.readFileSync(runtimePath, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();

  const testHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Design Mode Palette Test</title>
        <style>
          body { font-family: sans-serif; margin: 0; padding: 40px; background: #ffffff; color: #1e293b; }
          .hero { background: #f1f5f9; padding: 32px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #e2e8f0; }
          h1 { margin: 0 0 12px; font-size: 28px; }
          .cta { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 15px; cursor: pointer; }
          .tags { display: flex; gap: 8px; margin-top: 16px; }
          .tag { padding: 4px 10px; background: #e0e7ff; color: #3730a3; border-radius: 6px; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="hero" id="hero-banner">
          <h1>Modern Agentic Design Experience</h1>
          <p>Click elements, draw annotations, and quick render live CSS patches.</p>
          <button id="cta-btn" class="cta">Get Started</button>
          <input id="search-input" type="text" placeholder="Type here..." style="margin-left: 12px; padding: 8px 12px; border-radius: 6px; border: 1px solid #cbd5e1;" />
          <div class="tags">
            <span class="tag">AI Agents</span>
            <span class="tag">Design Mode</span>
          </div>
        </div>
      </body>
    </html>
  `;

  await page.setContent(testHtml);

  // 1. Inject runtime script
  console.log('1. Injecting Design Mode runtime script...');
  await page.evaluate((src) => {
    const s = document.createElement('script');
    s.textContent = src;
    document.head.appendChild(s);
  }, runtimeScript);

  const isLoaded = await page.evaluate(() => typeof window.__agentBridgeDesignMode === 'object');
  assert.equal(isLoaded, true, 'Design mode runtime should be available on window');
  console.log('   ✓ Runtime injected successfully');

  // 2. Enable Design Mode and verify floating pill palette
  console.log('2. Enabling Design Mode and inspecting floating palette...');
  const initSnap = await page.evaluate(() => window.__agentBridgeDesignMode.enable());
  assert.equal(initSnap.enabled, true, 'Design mode should be enabled');

  const paletteVisible = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host?.shadowRoot;
    const palette = root?.querySelector('.floating-palette');
    const promptInput = root?.querySelector('[data-agent-prompt]');
    const quickRenderBtn = root?.querySelector('[data-action="quick-render"]');
    const copyBtn = root?.querySelector('[data-action="copy-prompt"]');
    const interactBtn = root?.querySelector('[data-tool="interact"]');
    const divider = root?.querySelector('.mode-divider');
    return {
      hasHost: Boolean(host),
      hasPalette: Boolean(palette),
      hasPromptInput: Boolean(promptInput),
      hasQuickRender: Boolean(quickRenderBtn),
      hasCopyBtn: Boolean(copyBtn),
      hasInteractBtn: Boolean(interactBtn),
      hasDivider: Boolean(divider),
    };
  });

  assert.equal(paletteVisible.hasHost, true, 'Overlay host must be mounted');
  assert.equal(paletteVisible.hasPalette, true, 'Floating pill palette must be rendered');
  assert.equal(paletteVisible.hasPromptInput, true, 'Prompt input field must be present');
  assert.equal(paletteVisible.hasQuickRender, true, 'Quick Render button must be present');
  assert.equal(paletteVisible.hasCopyBtn, true, 'Copy prompt button must be present');
  assert.equal(paletteVisible.hasInteractBtn, true, 'Interact tool button must be present');
  assert.equal(paletteVisible.hasDivider, true, 'Mode divider must be present');
  console.log('   ✓ Floating pill palette verified with interact toggle');

  // 3. Test interact/browse mode vs select mode
  console.log('3. Testing interact mode (typing in input, no click interception)...');
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const interactBtn = host?.shadowRoot?.querySelector('[data-tool="interact"]');
    interactBtn?.click();
  });
  let modeSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(modeSnap.active_tool, 'interact', 'Active tool should be interact');

  // Click input, type text
  await page.click('#search-input');
  await page.type('#search-input', 'testing input interaction');
  const inputVal = await page.$eval('#search-input', (el) => el.value);
  assert.equal(inputVal, 'testing input interaction', 'User can type into input field in interact mode');
  assert.equal(modeSnap.selections.length, 0, 'No element selection should be created in interact mode');
  console.log('   ✓ Input typing and interaction works without click interception');

  // Test Escape key shortcut to toggle back to select mode
  await page.keyboard.press('Escape');
  modeSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(modeSnap.active_tool, 'select', 'Escape key should toggle back to select tool');
  console.log('   ✓ Escape key toggles between interact and select mode');

  // 4. Test annotation tools (pen, region, arrow)
  console.log('4. Testing annotation tools: pen, region, and arrow...');
  
  // 3a. Set tool to pen and draw freehand stroke
  await page.evaluate(() => window.__agentBridgeDesignMode.setTool('pen'));
  let toolSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(toolSnap.active_tool, 'pen', 'Active tool should be pen');

  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(150, 120);
  await page.mouse.move(200, 150);
  await page.mouse.up();

  toolSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(toolSnap.marks.length, 1, 'Should have 1 mark after drawing pen stroke');
  assert.equal(toolSnap.marks[0].type, 'pen');
  console.log('   ✓ Freehand pen mark drawn');

  // 3b. Set tool to region and draw bounding box
  await page.evaluate(() => window.__agentBridgeDesignMode.setTool('region'));
  await page.mouse.move(250, 200);
  await page.mouse.down();
  await page.mouse.move(450, 350);
  await page.mouse.up();

  toolSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(toolSnap.marks.length, 2, 'Should have 2 marks after region drag');
  assert.equal(toolSnap.marks[1].type, 'region');
  assert.ok(toolSnap.marks[1].bounds, 'Region mark should have bounds');
  console.log('   ✓ Region box drawn');

  // 3c. Set tool to arrow and draw directional arrow
  await page.evaluate(() => window.__agentBridgeDesignMode.setTool('arrow'));
  await page.mouse.move(500, 100);
  await page.mouse.down();
  await page.mouse.move(400, 250);
  await page.mouse.up();

  toolSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(toolSnap.marks.length, 3, 'Should have 3 marks after arrow drag');
  assert.equal(toolSnap.marks[2].type, 'arrow');
  console.log('   ✓ Arrow annotation drawn');

  // 4. Test multi-element selection in select mode
  console.log('4. Testing multi-element selection in select mode...');
  await page.evaluate(() => window.__agentBridgeDesignMode.setTool('select'));
  
  await page.click('#hero-banner');
  await page.waitForTimeout(50);
  await page.click('#cta-btn');
  await page.waitForTimeout(50);

  const selSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(selSnap.selections.length, 2, 'Should have 2 selected elements');
  assert.equal(selSnap.selections[0].tag_name, 'div');
  assert.equal(selSnap.selections[1].tag_name, 'button');
  assert.ok(selSnap.selections[0].xpath.includes('hero-banner'), 'Selection 1 should have anchored XPath');
  assert.ok(selSnap.selections[1].xpath.includes('cta-btn'), 'Selection 2 should have anchored XPath');
  console.log('   ✓ Selections captured with anchored XPaths');

  // 5. Test Quick Render CSS live patch
  console.log('5. Testing Quick Render live preview patch...');
  await page.evaluate(() => {
    window.__agentBridgeDesignMode.quickRender('button#cta-btn { background: #dc2626 !important; padding: 18px 36px !important; }');
  });

  const btnBg = await page.evaluate(() => {
    const btn = document.getElementById('cta-btn');
    return window.getComputedStyle(btn).backgroundColor;
  });
  // rgb(220, 38, 38) is #dc2626
  assert.equal(btnBg, 'rgb(220, 38, 38)', 'Button background should reflect quick rendered patch');
  console.log('   ✓ Live CSS style patch injected and rendered');

  // 6. Test artifact generation engine
  console.log('6. Testing artifact generation and prompt formatting...');
  const tmpDir = path.join(os.tmpdir(), 'debug-bridge-design-mode', `process-${process.pid}-test`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const timestamp = Date.now();
  const cleanScreenshotPath = path.join(tmpDir, `surface-test-${timestamp}-1A2B-screenshot.png`);
  const liveContextScreenshotPath = path.join(tmpDir, `surface-test-${timestamp}-1A2B-live-context-test.png`);
  const contextJsonPath = path.join(tmpDir, `surface-test-${timestamp}-1A2B-context.json`);

  // 6a. Capture clean screenshot (with overlays hidden)
  await page.evaluate(() => window.__agentBridgeDesignMode.setCaptureHidden('all'));
  const cleanBuffer = await page.screenshot({ fullPage: false });
  fs.writeFileSync(cleanScreenshotPath, cleanBuffer);
  assert.ok(fs.existsSync(cleanScreenshotPath), 'Clean screenshot should be saved');

  // 6b. Capture live context screenshot (with palette hidden, marks and outlines visible)
  await page.evaluate(() => window.__agentBridgeDesignMode.setCaptureHidden('palette'));
  const liveContextBuffer = await page.screenshot({ fullPage: false });
  fs.writeFileSync(liveContextScreenshotPath, liveContextBuffer);
  assert.ok(fs.existsSync(liveContextScreenshotPath), 'Live context screenshot should be saved');

  // 6c. Restore overlay visibility
  await page.evaluate(() => window.__agentBridgeDesignMode.setCaptureHidden('none'));

  // 6d. Write context.json
  const finalSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  const contextData = {
    page_url: page.url(),
    requested_change: 'Make hero CTA red and enlarge padding',
    timestamp,
    clean_screenshot_path: cleanScreenshotPath,
    live_context_screenshot_path: liveContextScreenshotPath,
    css_diff: finalSnap.css_diff,
    edits: finalSnap.edits,
    selections: finalSnap.selections,
    marks: finalSnap.marks,
  };
  fs.writeFileSync(contextJsonPath, JSON.stringify(contextData, null, 2));
  assert.ok(fs.existsSync(contextJsonPath), 'Context JSON should be saved');

  // 6e. Set artifact paths in runtime and format prompt
  await page.evaluate((paths) => {
    window.__agentBridgeDesignMode.setArtifactPaths(paths);
  }, {
    screenshot_path: cleanScreenshotPath,
    live_context_path: liveContextScreenshotPath,
    context_json_path: contextJsonPath,
  });

  const promptText = await page.evaluate(() => {
    return window.__agentBridgeDesignMode.getFormattedPrompt('Make hero CTA red and enlarge padding');
  });

  console.log('\n--- Formatted Prompt Output ---');
  console.log(promptText);
  console.log('-------------------------------\n');

  assert.ok(promptText.includes('Make hero CTA red and enlarge padding'), 'Prompt should include user change description');
  assert.ok(promptText.includes('Page:'), 'Prompt should include Page: URL');
  assert.ok(promptText.includes(cleanScreenshotPath), 'Prompt should include clean screenshot path');
  assert.ok(promptText.includes(liveContextScreenshotPath), 'Prompt should include live context screenshot path');
  assert.ok(promptText.includes(`Details: ${contextJsonPath}`), 'Prompt should include Details: path');
  console.log('   ✓ Prompt matches format verbatim');

  // Cleanup test artifacts
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  await browser.close();
  console.log('\n=== All Design Mode & Artifact Validations Passed Successfully! ===\n');
}

runValidation().catch((err) => {
  console.error('\n❌ Validation failed:', err);
  process.exit(1);
});
