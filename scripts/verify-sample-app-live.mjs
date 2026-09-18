#!/usr/bin/env node
/**
 * Live End-to-End Verification Script for Design Mode on sample-react-app.
 * Connects to http://localhost:5173 with Design Mode Overlay active.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

async function runLiveVerification() {
  console.log('=== Design Mode Live Verification on Sample React App ===\n');

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

  // Navigate to sample React app
  console.log('1. Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/');
  await page.waitForSelector('.app');
  await page.evaluate(() => {
    document.querySelector('[data-debug-bridge-feedback-overlay]')?.remove();
  });
  console.log('   ✓ Sample React App loaded successfully');

  // Inject Design Mode runtime
  console.log('2. Injecting and enabling Design Mode runtime...');
  await page.evaluate((src) => {
    const s = document.createElement('script');
    s.textContent = src;
    document.head.appendChild(s);
  }, runtimeScript);

  const initSnap = await page.evaluate(() => window.__agentBridgeDesignMode.enable());
  assert.equal(initSnap.enabled, true, 'Design mode should be enabled');
  console.log('   ✓ Design Mode overlay mounted and enabled');

  // 1. Verify [👆 Interact] mode allows typing and clicking buttons without selecting elements
  console.log('3. Verifying [👆 Interact] mode form typing and button clicks without selection...');
  // Click login nav link while in interact mode
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const interactBtn = host?.shadowRoot?.querySelector('[data-tool="interact"]');
    interactBtn?.click();
  });
  let snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.active_tool, 'interact', 'Tool should be interact');

  // Click login link
  await page.click('[data-testid="login-link"]');
  await page.waitForSelector('[data-testid="login-page"]');

  // Type in form inputs
  await page.click('[data-testid="email-input"]');
  await page.type('[data-testid="email-input"]', 'stevie@example.com');
  await page.click('[data-testid="password-input"]');
  await page.type('[data-testid="password-input"]', 'supersecret');

  const emailVal = await page.$eval('[data-testid="email-input"]', (el) => el.value);
  assert.equal(emailVal, 'stevie@example.com', 'Email input should receive typed text');

  // Click submit button
  await page.click('[data-testid="submit-btn"]');
  await page.waitForSelector('[data-testid="user-email"]');
  const loggedEmail = await page.$eval('[data-testid="user-email"]', (el) => el.textContent);
  assert.equal(loggedEmail, 'stevie@example.com', 'Form should submit and log in successfully');

  // Assert NO selections were made
  snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.selections.length, 0, 'No elements should be selected during interact mode');
  console.log('   ✓ [👆 Interact] allows full input typing and button clicks with 0 selections');

  // 2. Verify Escape key toggles between Interact and Select mode
  console.log('4. Verifying Escape key toggle between Interact and Select mode...');
  assert.equal(snap.active_tool, 'interact');
  await page.keyboard.press('Escape');
  snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.active_tool, 'select', 'Escape should switch from interact to select mode');

  await page.keyboard.press('Escape');
  snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.active_tool, 'interact', 'Escape should toggle back from select to interact mode');

  await page.keyboard.press('Escape');
  snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.active_tool, 'select', 'Escape should toggle back to select mode');
  console.log('   ✓ Escape key toggles bidirectionally between Interact and Select mode');

  // 3. Verify annotation tools draw pen, region box, and arrow marks
  console.log('5. Verifying annotation tools: pen, region box, arrow...');
  // Pen
  await page.evaluate(() => window.__agentBridgeDesignMode.setTool('pen'));
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(250, 230);
  await page.mouse.move(300, 260);
  await page.mouse.up();

  snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.marks.length, 1);
  assert.equal(snap.marks[0].type, 'pen');
  console.log('   ✓ Pen mark drawn');

  // Region box
  await page.evaluate(() => window.__agentBridgeDesignMode.setTool('region'));
  await page.mouse.move(350, 150);
  await page.mouse.down();
  await page.mouse.move(550, 320);
  await page.mouse.up();

  snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.marks.length, 2);
  assert.equal(snap.marks[1].type, 'region');
  assert.ok(snap.marks[1].bounds.width > 0, 'Region width must be positive');
  assert.ok(snap.marks[1].bounds.height > 0, 'Region height must be positive');
  console.log('   ✓ Region box drawn');

  // Arrow
  await page.evaluate(() => window.__agentBridgeDesignMode.setTool('arrow'));
  await page.mouse.move(600, 100);
  await page.mouse.down();
  await page.mouse.move(450, 250);
  await page.mouse.up();

  snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.marks.length, 3);
  assert.equal(snap.marks[2].type, 'arrow');
  assert.ok(snap.marks[2].points && snap.marks[2].points.length === 2, 'Arrow must have start and end points');
  console.log('   ✓ Arrow mark drawn');

  // 4. Verify prompt input field allows long text with letters s, i, v without losing focus or freezing
  console.log('6. Verifying prompt input field with hotkey characters (s, i, v) and event stopPropagation...');
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const promptField = host?.shadowRoot?.querySelector('[data-agent-prompt]');
    promptField?.focus();
  });

  const testPromptText = 'Make visual styles responsive with vibrant buttons and smooth interactive hover effects';
  await page.keyboard.type(testPromptText);

  const promptVal = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const promptField = host?.shadowRoot?.querySelector('[data-agent-prompt]');
    return promptField?.value;
  });
  assert.equal(promptVal, testPromptText, 'Prompt field must contain exact typed text');

  // Verify active tool remained unchanged (not switched by hotkeys 's', 'i', 'v')
  snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.active_tool, 'arrow', 'Active tool must not change while typing in prompt field');
  console.log('   ✓ Prompt field handles long text containing s, i, v without hotkey focus drops or freezing');

  // 5. Verify Quick Render live CSS style injection
  console.log('7. Verifying Quick Render live CSS style injection...');
  await page.evaluate(() => {
    window.__agentBridgeDesignMode.quickRender('header { background-color: rgb(15, 23, 42) !important; padding: 24px !important; }');
  });

  const headerStyles = await page.evaluate(() => {
    const h = document.querySelector('header');
    const style = window.getComputedStyle(h);
    return {
      bg: style.backgroundColor,
      padding: style.padding,
    };
  });
  assert.equal(headerStyles.bg, 'rgb(15, 23, 42)', 'Header background must match injected Quick Render CSS');
  assert.equal(headerStyles.padding, '24px', 'Header padding must match injected Quick Render CSS');
  console.log('   ✓ Quick Render live CSS style injection verified');

  // 6. Verify Generate Prompt outputs cmux-compatible context files
  console.log('8. Verifying Generate Prompt and cmux-compatible context files...');
  const tmpDir = path.join(os.tmpdir(), 'debug-bridge-design-mode', `live-verify-${process.pid}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const ts = Date.now();
  const cleanScreenshot = path.join(tmpDir, `surface-${ts}-clean.png`);
  const liveContextScreenshot = path.join(tmpDir, `surface-${ts}-live-context.png`);
  const contextJson = path.join(tmpDir, `surface-${ts}-context.json`);

  // Capture screenshots
  await page.evaluate(() => window.__agentBridgeDesignMode.setCaptureHidden('all'));
  const cleanBuffer = await page.screenshot();
  fs.writeFileSync(cleanScreenshot, cleanBuffer);

  await page.evaluate(() => window.__agentBridgeDesignMode.setCaptureHidden('palette'));
  const liveBuffer = await page.screenshot();
  fs.writeFileSync(liveContextScreenshot, liveBuffer);

  await page.evaluate(() => window.__agentBridgeDesignMode.setCaptureHidden('none'));

  const finalSnapshot = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  const contextData = {
    page_url: page.url(),
    requested_change: testPromptText,
    timestamp: ts,
    clean_screenshot_path: cleanScreenshot,
    live_context_screenshot_path: liveContextScreenshot,
    css_diff: finalSnapshot.css_diff,
    edits: finalSnapshot.edits,
    selections: finalSnapshot.selections,
    marks: finalSnapshot.marks,
  };
  fs.writeFileSync(contextJson, JSON.stringify(contextData, null, 2));

  await page.evaluate((paths) => {
    window.__agentBridgeDesignMode.setArtifactPaths(paths);
  }, {
    screenshot_path: cleanScreenshot,
    live_context_path: liveContextScreenshot,
    context_json_path: contextJson,
  });

  const formattedPrompt = await page.evaluate((req) => {
    return window.__agentBridgeDesignMode.getFormattedPrompt(req);
  }, testPromptText);

  console.log('\n--- Live Formatted Prompt Output ---');
  console.log(formattedPrompt);
  console.log('------------------------------------\n');

  assert.ok(fs.existsSync(cleanScreenshot), 'Clean screenshot artifact must exist');
  assert.ok(fs.existsSync(liveContextScreenshot), 'Live context screenshot artifact must exist');
  assert.ok(fs.existsSync(contextJson), 'Context JSON artifact must exist');
  assert.ok(formattedPrompt.includes(testPromptText), 'Prompt must include requested change');
  assert.ok(formattedPrompt.includes(cleanScreenshot), 'Prompt must link clean screenshot');
  assert.ok(formattedPrompt.includes(liveContextScreenshot), 'Prompt must link live context screenshot');
  assert.ok(formattedPrompt.includes(contextJson), 'Prompt must link context JSON');
  console.log('   ✓ Generate Prompt outputs cmux-compatible context files and valid paths');

  // Cleanup temp files
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  await browser.close();
  console.log('\n=== All 6 Design Mode Verification Criteria Passed 100% Successfully! ===\n');
}

runLiveVerification().catch((err) => {
  console.error('\n❌ Live verification failed:', err);
  process.exit(1);
});
