import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { chromium } from 'playwright';

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173';
const RUNTIME_PATH = path.resolve('packages/browser/dist/design-mode-runtime.global.js');
const ARTIFACT_DIR = '/Users/stevengonsalvez/.gemini/antigravity-cli/brain/27b1b9ef-961c-474b-aa18-7c1fbe4a3d47';
const SCREENSHOT_PATH = '/tmp/human-sim-crop-verified.png';

async function main() {
  console.log('=================================================================');
  console.log('🧑‍💻 Browser Human Simulator: Testing Design Mode Crop Flow');
  console.log('=================================================================\n');

  console.log('1. Launching Chromium and establishing browser context...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  // Pre-seed auth state
  await context.addInitScript(`
    window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
      auth: { isLoggedIn: true, email: 'stevie@example.com' },
      cart: { items: [] }
    }));
  `);

  const page = await context.newPage();

  console.log(`2. Navigating to ${TARGET_URL}...`);
  await page.goto(TARGET_URL);
  await page.waitForLoadState('networkidle');

  console.log('3. Mounting Design Mode runtime...');
  await page.addScriptTag({ path: RUNTIME_PATH });
  await page.evaluate(() => window.__agentBridgeDesignMode.enable());

  await page.waitForFunction(() => {
    const overlay = document.querySelector('[data-agent-bridge-design-overlay]');
    return !!overlay && !!overlay.shadowRoot;
  });
  console.log('   ✓ Design Mode overlay mounted');

  // Step 4: Human selects element (logout button)
  console.log('4. Selecting element @e1 (logout button)...');
  const logoutBtn = page.locator('button[data-testid="logout-btn"]');
  await logoutBtn.waitFor({ state: 'visible', timeout: 5000 });
  await logoutBtn.click();

  let status = await page.evaluate(() => window.__agentBridgeDesignMode.status());
  assert.strictEqual(status.selections.length, 1, 'Should have 1 selection');
  console.log(`   ✓ Selected @e1: ${status.selections[0].selector}`);

  // Step 5: Switch to Region tool and draw a region box
  console.log('5. Switching to Region tool...');
  await page.evaluate(() => window.__agentBridgeDesignMode.setTool('region'));

  // Give overlay time to switch active tool
  await page.waitForTimeout(200);

  console.log('   Drawing region box across hero area (from 120, 180 to 450, 320)...');
  await page.mouse.move(120, 180);
  await page.mouse.down();
  await page.mouse.move(450, 320, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  status = await page.evaluate(() => window.__agentBridgeDesignMode.status());
  console.log(`   ✓ Total marks recorded: ${status.marks.length}`);
  const regionMark = status.marks.find((m) => m.type === 'region');
  assert(regionMark, 'Region mark should be present');
  console.log(`   ✓ Region mark bounds: ${Math.round(regionMark.bounds.width)}x${Math.round(regionMark.bounds.height)} at (${Math.round(regionMark.bounds.x)}, ${Math.round(regionMark.bounds.y)})`);

  // Step 6: Enter user prompt and trigger crop capture & clipboard copy
  console.log('6. Typing feedback prompt and triggering crop handoff...');
  const testPrompt = 'Refine logout button styling and hero banner card borders';

  // Use copyHandoffToClipboard to trigger crop capture for all selections and marks
  const handoffRes = await page.evaluate(async (prompt) => {
    return await window.__agentBridgeDesignMode.copyHandoffToClipboard(prompt);
  }, testPrompt);

  console.log(`   ✓ Handoff generated. Clipboard copied: ${handoffRes.copied}`);

  const formattedPrompt = await page.evaluate((prompt) => {
    return window.__agentBridgeDesignMode.getFormattedPrompt(prompt);
  }, testPrompt);

  console.log('\n--- Formatted Prompt Output ---');
  console.log(formattedPrompt);
  console.log('-------------------------------\n');

  // Step 7: Verify Cropped PNG Files & Prompt Formatting
  console.log('7. Verifying cropped PNG files on disk...');
  const lines = formattedPrompt.split('\n');
  const line1 = lines[0];
  console.log(`   Line 1: "${line1}"`);

  // Check that line 1 contains image paths
  assert(line1.includes('.png'), 'Line 1 must contain cropped .png file path(s)');

  // Verify selections and marks have paths
  status = await page.evaluate(() => window.__agentBridgeDesignMode.status());
  const elCropPath = status.selections[0].screenshot_path;
  console.log(`   Element crop path: ${elCropPath}`);
  assert(elCropPath, 'Element selection must have screenshot_path');
  assert(fs.existsSync(elCropPath), `Element crop file must exist on disk: ${elCropPath}`);
  const elStat = fs.statSync(elCropPath);
  console.log(`   ✓ Element crop exists on disk (${elStat.size} bytes)`);

  const regCropPath = status.marks.find((m) => m.type === 'region')?.screenshot_path;
  console.log(`   Region crop path: ${regCropPath}`);
  assert(regCropPath, 'Region mark must have screenshot_path');
  assert(fs.existsSync(regCropPath), `Region crop file must exist on disk: ${regCropPath}`);
  const regStat = fs.statSync(regCropPath);
  console.log(`   ✓ Region crop exists on disk (${regStat.size} bytes)`);

  // Step 8: Submit batch to Agent
  console.log('8. Submitting batch to Agent...');
  await page.evaluate(async (prompt) => {
    const overlay = document.querySelector('[data-agent-bridge-design-overlay]');
    const sendBtn = overlay?.shadowRoot?.querySelector('[data-action="send-batch-btn"]');
    if (sendBtn) {
      sendBtn.click();
    } else {
      // Fallback submit direct
      await window.__agentBridgeDesignMode.copyHandoffToClipboard(prompt);
    }
  }, testPrompt);

  await page.waitForTimeout(800);

  // Step 9: Capture Evidence Screenshot
  console.log('9. Capturing full browser screenshot...');
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log(`   ✓ Browser screenshot saved to ${SCREENSHOT_PATH}`);

  // Copy to brain artifact dir
  if (fs.existsSync(ARTIFACT_DIR)) {
    fs.copyFileSync(SCREENSHOT_PATH, path.join(ARTIFACT_DIR, 'human-sim-crop-verified.png'));
    fs.copyFileSync(elCropPath, path.join(ARTIFACT_DIR, 'human-sim-element-crop.png'));
    fs.copyFileSync(regCropPath, path.join(ARTIFACT_DIR, 'human-sim-region-crop.png'));
    console.log(`   ✓ Artifacts copied to ${ARTIFACT_DIR}`);
  }

  await browser.close();

  console.log('\n=================================================================');
  console.log('🎉 Human Simulator Crop Flow Verified Successfully!');
  console.log(`- Element Crop: ${elCropPath} (${elStat.size} bytes)`);
  console.log(`- Region Crop:  ${regCropPath} (${regStat.size} bytes)`);
  console.log(`- Line 1 Prompt: ${line1}`);
  console.log('=================================================================');
}

main().catch((err) => {
  console.error('❌ Human Simulator Test Error:', err);
  process.exit(1);
});
