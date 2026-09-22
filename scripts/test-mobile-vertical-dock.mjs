import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const TARGET_URL = 'http://localhost:5173';
const RUNTIME_PATH = path.resolve('packages/browser/dist/design-mode-runtime.global.js');
const SCREENSHOT_OUTPUT = '/tmp/mobile-vertical-dock-verified.png';
const SCREENSHOT_LEFT_OUTPUT = '/tmp/mobile-vertical-dock-left.png';
const SCREENSHOT_COLLAPSED_OUTPUT = '/tmp/mobile-vertical-dock-collapsed.png';

async function run() {
  console.log('📱 Testing Mobile Vertical Toolbar Rail & Interactions...');

  const runtimeScript = fs.readFileSync(RUNTIME_PATH, 'utf-8');
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }, // iPhone SE / Mobile Viewport
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  await context.addInitScript(`
    window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
      auth: { isLoggedIn: true, email: 'stevie@example.com' },
      cart: { items: [] }
    }));
  `);

  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  const logoutBtn = page.locator('button[data-testid="logout-btn"]');
  await logoutBtn.waitFor({ state: 'visible', timeout: 5000 });

  // Inject runtime and enable
  await page.evaluate(runtimeScript);
  const snap = await page.evaluate('window.__agentBridgeDesignMode.enable()');
  assert.equal(snap.enabled, true, 'Design mode enabled');
  console.log('✅ 1. Design Mode enabled on mobile (375x667)');

  // 1. Verify that on 375px width, default auto-layout is vertical
  const initialLayout = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host.shadowRoot;
    const palette = root.querySelector('.floating-palette');
    const isVertical = palette.classList.contains('layout-vertical');
    const isDockRight = palette.classList.contains('dock-right');
    const rect = palette.getBoundingClientRect();
    return {
      isVertical,
      isDockRight,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
  });

  assert.equal(initialLayout.isVertical, true, 'Palette should default to vertical layout on mobile');
  assert.equal(initialLayout.isDockRight, true, 'Palette should dock right by default');
  assert(initialLayout.width <= 48, `Palette width (${initialLayout.width}) should be <= 48px`);
  assert(initialLayout.right <= 375, 'Palette right edge should be within viewport');
  console.log(`✅ 2. Vertical rail verified on right: width ${initialLayout.width.toFixed(1)}px, left ${initialLayout.left.toFixed(1)}px, right ${initialLayout.right.toFixed(1)}px`);

  // 2. Select an element to see selection chip in mobile companion bar
  await logoutBtn.click();
  const selSnap = await page.evaluate('window.__agentBridgeDesignMode.getSnapshot()');
  assert.equal(selSnap.selections.length, 1, 'Logout button selected');
  console.log('✅ 3. Element selected with active vertical rail');

  // Verify mobile prompt bar layout and input
  const promptBarMetrics = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const bar = host.shadowRoot.querySelector('.mobile-prompt-bar');
    const input = host.shadowRoot.querySelector('[data-agent-prompt]');
    const rect = bar.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      bottom: rect.bottom,
      hasInput: !!input,
    };
  });
  assert(promptBarMetrics.hasInput, 'Mobile prompt input present');
  assert(promptBarMetrics.left >= 0, 'Prompt bar within left bound');
  assert(promptBarMetrics.right <= 375, 'Prompt bar within right bound');
  console.log(`✅ 4. Mobile prompt bar verified: width ${promptBarMetrics.width.toFixed(1)}px, left ${promptBarMetrics.left.toFixed(1)}px, right ${promptBarMetrics.right.toFixed(1)}px`);

  // Capture main verification screenshot
  await page.screenshot({ path: SCREENSHOT_OUTPUT });
  console.log(`📸 5. Captured screenshot: ${SCREENSHOT_OUTPUT}`);

  // 3. Test Dock Flip (⇄): flip to left
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const flipBtn = host.shadowRoot.querySelector('[data-action="toggle-dock-side"]');
    flipBtn.click();
  });
  const flippedLayout = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const palette = host.shadowRoot.querySelector('.floating-palette');
    const bar = host.shadowRoot.querySelector('.mobile-prompt-bar');
    return {
      isDockLeft: palette.classList.contains('dock-left'),
      paletteLeft: palette.getBoundingClientRect().left,
      barLeft: bar.getBoundingClientRect().left,
    };
  });
  assert.equal(flippedLayout.isDockLeft, true, 'Palette flipped to left dock');
  assert(flippedLayout.paletteLeft <= 15, 'Palette left edge near 10px');
  assert(flippedLayout.barLeft >= 50, 'Prompt bar shifted right of palette');
  await page.screenshot({ path: SCREENSHOT_LEFT_OUTPUT });
  console.log(`✅ 6. Flipped dock to left side (palette left: ${flippedLayout.paletteLeft.toFixed(1)}px, bar left: ${flippedLayout.barLeft.toFixed(1)}px)`);

  // 4. Test Prompt Bar Minimize / Collapse (▾)
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const collapseBtn = host.shadowRoot.querySelector('.mobile-prompt-collapse-btn');
    collapseBtn.click();
  });
  const isCollapsed = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const bar = host.shadowRoot.querySelector('.mobile-prompt-bar');
    return bar.classList.contains('collapsed');
  });
  assert.equal(isCollapsed, true, 'Prompt bar collapsed to minimize bottom obstruction');
  await page.screenshot({ path: SCREENSHOT_COLLAPSED_OUTPUT });
  console.log('✅ 7. Prompt bar collapsed cleanly to reveal app bottom area');

  // 5. Test Flip back to right and expand
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    host.shadowRoot.querySelector('.mobile-prompt-expand-btn')?.click();
    host.shadowRoot.querySelector('[data-action="toggle-dock-side"]')?.click();
  });

  // 6. Test Orientation Toggle (⬍): switch to horizontal capsule
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const toggleLayoutBtn = host.shadowRoot.querySelector('[data-action="toggle-layout"]');
    toggleLayoutBtn.click();
  });
  const horizontalLayout = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const palette = host.shadowRoot.querySelector('.floating-palette');
    return {
      isVertical: palette.classList.contains('layout-vertical'),
      width: palette.getBoundingClientRect().width,
    };
  });
  assert.equal(horizontalLayout.isVertical, false, 'Palette toggled to horizontal capsule');
  console.log(`✅ 8. Orientation toggled to horizontal capsule (width: ${horizontalLayout.width.toFixed(1)}px)`);

  // Switch back to vertical
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    host.shadowRoot.querySelector('[data-action="toggle-layout"]').click();
  });
  const backToVertical = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    return host.shadowRoot.querySelector('.floating-palette').classList.contains('layout-vertical');
  });
  assert.equal(backToVertical, true, 'Palette toggled back to vertical rail');
  console.log('✅ 9. Toggled back to vertical rail cleanly');

  await browser.close();
  console.log('🎉 All mobile vertical toolbar rail tests passed successfully!');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
