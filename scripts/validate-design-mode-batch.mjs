#!/usr/bin/env node
/**
 * Automated Verification Script for Design Mode Multi-Element Batching,
 * Quick Render Live Preview, and Clipboard Prompt Handoff.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

async function runValidation() {
  console.log('=== Design Mode Batch & Quick Render Validation ===\n');

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
        <title>Design Mode Batch Test</title>
        <style>
          body { font-family: sans-serif; margin: 0; padding: 20px; background: #f8fafc; color: #0f172a; }
          header { background: #e2e8f0; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          .cta-section { padding: 16px 0; }
          button.primary-btn {
            background: #64748b; color: white; border: none; padding: 8px 16px;
            border-radius: 6px; font-size: 14px; cursor: pointer;
          }
          .card { background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-top: 16px; }
        </style>
      </head>
      <body>
        <header id="main-header">
          <h1>Welcome to Agent Bridge</h1>
          <p>Test page for multi-element design tweaks.</p>
        </header>
        <main>
          <section class="cta-section">
            <button id="cta" class="primary-btn">Get Started</button>
          </section>
          <div class="card" data-testid="feature-card">
            <h3>Feature 1</h3>
            <p>Inspectable card element.</p>
          </div>
        </main>
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

  // 2. Enable Design Mode
  console.log('2. Enabling Design Mode...');
  const initSnap = await page.evaluate(() => window.__agentBridgeDesignMode.enable());
  assert.equal(initSnap.enabled, true, 'Design mode should be enabled');
  console.log('   ✓ Design mode enabled');

  // 3. Multi-selection batching: Click Header, then Click CTA Button
  console.log('3. Selecting multiple elements (Header and CTA Button)...');
  await page.click('header#main-header');
  await page.waitForTimeout(100);
  await page.click('button#cta');
  await page.waitForTimeout(100);

  const snap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(snap.selections.length, 2, 'Should have 2 elements in selection batch');
  const sel1 = snap.selections[0];
  const sel2 = snap.selections[1];

  console.log(`   ✓ Selection 1: <${sel1.tag_name}> selector=${sel1.selector} xpath=${sel1.xpath}`);
  console.log(`   ✓ Selection 2: <${sel2.tag_name}> selector=${sel2.selector} xpath=${sel2.xpath}`);
  assert.ok(sel1.xpath, 'Selection 1 should have XPath');
  assert.ok(sel2.xpath, 'Selection 2 should have XPath');
  assert.equal(sel1.tag_name, 'header');
  assert.equal(sel2.tag_name, 'button');

  // 4. Verify Shadow DOM Floating Pill Palette & Chips
  console.log('4. Verifying Floating Pill Palette and Selection Chips in Shadow DOM...');
  const overlayInfo = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    if (!host || !host.shadowRoot) return null;
    const chips = Array.from(host.shadowRoot.querySelectorAll('.chip')).map((c) => c.textContent.trim());
    const palette = host.shadowRoot.querySelector('.floating-palette');
    const hasQuickRender = Boolean(host.shadowRoot.querySelector('[data-action="quick-render"]'));
    const hasCopy = Boolean(host.shadowRoot.querySelector('[data-action="copy-prompt"]')) || Boolean(host.shadowRoot.querySelector('[data-action="copy-for-agent"]'));
    return {
      hasPalette: Boolean(palette),
      chips,
      hasQuickRender,
      hasCopy,
    };
  });

  assert.ok(overlayInfo?.hasPalette, 'Floating pill palette should be visible');
  assert.equal(overlayInfo.chips.length, 2, 'Chips bar should show 2 selection chips');
  assert.ok(overlayInfo.hasQuickRender, 'Palette should have Quick Render button');
  assert.ok(overlayInfo.hasCopy, 'Palette should have Copy button');
  console.log('   ✓ Floating pill palette rendered with chips:', overlayInfo.chips);

  // 5. Apply Tweaks Across Both Elements
  console.log('5. Applying style tweaks across elements...');
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host.shadowRoot;

    // Open tweaker popover
    root.querySelector('[data-action="toggle-tweaker"]')?.click();

    // Active element is currently @e2 (button#cta)
    const paddingInput = root.querySelector('[data-edit-prop="padding"]');
    if (paddingInput) {
      paddingInput.value = '14px 28px';
      paddingInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const colorInput = root.querySelector('[data-edit-prop="background-color"]');
    if (colorInput) {
      colorInput.value = '#2563eb';
      colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Switch to chip 0 (@e1 header)
    const chip0 = root.querySelector('[data-select-chip="0"]');
    chip0.click();

    // Now edit @e1 header
    const headerBg = root.querySelector('[data-edit-prop="background-color"]');
    if (headerBg) {
      headerBg.value = '#0f172a';
      headerBg.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  const diffSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.ok(diffSnap.css_diff.length > 0, 'CSS diff should be non-empty after edits');
  console.log('   ✓ Generated CSS Batch Diff:');
  console.log(diffSnap.css_diff.split('\n').map((l) => '     ' + l).join('\n'));

  // 6. Test Quick Render (Live Preview)
  console.log('6. Testing Quick Render (live preview patch injection)...');
  await page.evaluate(() => window.__agentBridgeDesignMode.quickRender());

  const livePreviewApplied = await page.evaluate(() => {
    const styleTag = document.getElementById('__agent_bridge_live_preview__');
    const headerBg = window.getComputedStyle(document.querySelector('header#main-header')).backgroundColor;
    const btnPadding = window.getComputedStyle(document.querySelector('button#cta')).padding;
    return {
      hasStyleTag: Boolean(styleTag),
      cssContent: styleTag?.textContent || '',
      headerBg,
      btnPadding,
    };
  });

  assert.ok(livePreviewApplied.hasStyleTag, 'Live preview <style> tag must exist in page head');
  assert.ok(livePreviewApplied.cssContent.includes('!important'), 'Rules should have !important flag');
  console.log('   ✓ Live preview style tag active:');
  console.log('     Header background:', livePreviewApplied.headerBg);
  console.log('     Button padding:', livePreviewApplied.btnPadding);

  // 7. Test Formatted Prompt Generation & Clipboard Copy
  console.log('7. Testing Formatted Agent Prompt and Clipboard Copy...');
  const userInstruction = 'Make the header dark navy and enlarge the primary CTA button.';
  const promptText = await page.evaluate((inst) => {
    return window.__agentBridgeDesignMode.getFormattedPrompt(inst);
  }, userInstruction);

  console.log('   ✓ Formatted Prompt Output:\n' + promptText.split('\n').map((l) => '     ' + l).join('\n'));

  assert.ok(promptText.includes(userInstruction), 'Prompt must contain user requested change');
  assert.ok(promptText.includes('Selected Elements (2):'), 'Prompt must show selected elements count');
  assert.ok(promptText.includes('XPath:'), 'Prompt must include XPath references');
  assert.ok(promptText.includes('Proposed CSS Diff:'), 'Prompt must include CSS Diff');

  // Test clipboard copy execution
  const copied = await page.evaluate(async (inst) => {
    return await window.__agentBridgeDesignMode.copyHandoffToClipboard(inst);
  }, userInstruction);

  assert.equal(copied, true, 'copyHandoffToClipboard should return true');
  console.log('   ✓ Clipboard copy succeeded');

  // 8. Test Structured Handoff Payload
  console.log('8. Testing Structured Handoff Payload...');
  const handoff = await page.evaluate((inst) => {
    return window.__agentBridgeDesignMode.getHandoff(inst);
  }, userInstruction);

  assert.equal(handoff.selections.length, 2, 'Handoff must contain both selections');
  assert.ok(handoff.css_diff, 'Handoff must contain css_diff');
  assert.ok(handoff.prompt, 'Handoff must contain prompt string');
  console.log('   ✓ Handoff payload verified');

  // 9. Test Clear Previews & Selections
  console.log('9. Testing clear preview and selections...');
  await page.evaluate(() => window.__agentBridgeDesignMode.clearSelections());
  const clearedSnap = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  assert.equal(clearedSnap.selections.length, 0, 'Selections should be empty after clearSelections');
  const styleRemaining = await page.evaluate(() => Boolean(document.getElementById('__agent_bridge_live_preview__')));
  assert.equal(styleRemaining, false, 'Live preview style tag should be removed');
  console.log('   ✓ Preview and selections cleared cleanly');

  await browser.close();
  console.log('\n=== All Design Mode Validations Passed 100% Green ===');
}

runValidation().catch((err) => {
  console.error('\n❌ Validation Failed:', err);
  process.exit(1);
});
