import { chromium } from 'playwright';
import fs from 'fs';
import assert from 'assert';

async function testQuickRenderAiRobustness() {
  console.log('🚀 Testing AI Quick Render Robustness & Stevie Scenarios...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');

  // Inject fresh runtime
  const runtimeJs = fs.readFileSync('packages/browser/dist/design-mode-runtime.global.js', 'utf8');
  await page.evaluate(runtimeJs);
  await page.evaluate(() => window.__agentBridgeDesignMode.enable());

  // 1. Test clicking Quick Render with prompt but NO element selected
  console.log('1. Testing Quick Render click with NO element selected...');
  const noElementStatus = await page.evaluate(async () => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host.shadowRoot;
    const input = root.querySelector('[data-agent-prompt]');
    input.value = 'change login';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const qrBtn = root.querySelector('[data-action="quick-render"]');
    qrBtn.click();
    await new Promise(r => setTimeout(r, 50));
    return {
      btnText: qrBtn.textContent,
      bg: qrBtn.style.background,
    };
  });
  console.log('   Status without selection:', noElementStatus);
  assert.equal(noElementStatus.btnText, 'Select element first', 'Should prompt to select element first');

  // 2. Select the login link element and type "change login"
  console.log('2. Selecting login link element and typing "change login"...');
  const targetSelector = 'a[data-testid="login-link"]';
  await page.locator(targetSelector).click();
  await page.waitForTimeout(100);

  // 3. Test "change login" on the selected button
  console.log('3. Executing AI Quick Render with prompt "change login"...');
  const renderResult = await page.evaluate(async () => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host.shadowRoot;
    const input = root.querySelector('[data-agent-prompt]');
    input.value = 'change login';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const qrBtn = root.querySelector('[data-action="quick-render"]');
    qrBtn.click();
    await new Promise(r => setTimeout(r, 100));
    const btnText = qrBtn.textContent;
    const bg = qrBtn.style.background;

    // Check style element
    const styleEl = document.getElementById('__agent_bridge_live_preview__');
    return {
      btnText,
      btnBg: bg,
      css: styleEl ? styleEl.textContent : '',
    };
  });

  console.log('   Render result:', renderResult);
  assert.equal(renderResult.btnText, '✓ Rendered (Jev)!', 'Button should show ✓ Rendered (Jev)!');
  assert(renderResult.css.includes('linear-gradient'), 'Should synthesize a modern vibrant gradient');
  assert(renderResult.css.includes('border-radius: 8px'), 'Should have 8px border-radius');

  // 4. Check computed styles of the element
  const computed = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const cs = window.getComputedStyle(el);
    return {
      borderRadius: cs.borderRadius,
      boxShadow: cs.boxShadow,
      color: cs.color,
      cursor: cs.cursor,
    };
  }, targetSelector);
  console.log('   Computed styles after "change login":', computed);
  assert.equal(computed.borderRadius, '8px');
  assert.equal(computed.cursor, 'pointer');

  // 5. Test "make it rounded"
  console.log('5. Testing prompt "make it rounded"...');
  const roundedResult = await page.evaluate(async () => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host.shadowRoot;
    const input = root.querySelector('[data-agent-prompt]');
    input.value = 'make it rounded';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const qrBtn = root.querySelector('[data-action="quick-render"]');
    qrBtn.click();
    await new Promise(r => setTimeout(r, 100));
    return {
      btnText: qrBtn.textContent,
      css: document.getElementById('__agent_bridge_live_preview__')?.textContent || '',
    };
  });
  console.log('   "make it rounded" result:', roundedResult);
  assert.equal(roundedResult.btnText, '✓ Rendered (Jev)!');
  assert(roundedResult.css.includes('border-radius: 12px'));

  // 6. Test "primary button"
  console.log('6. Testing prompt "primary button"...');
  const primaryResult = await page.evaluate(async () => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host.shadowRoot;
    const input = root.querySelector('[data-agent-prompt]');
    input.value = 'primary button';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const qrBtn = root.querySelector('[data-action="quick-render"]');
    qrBtn.click();
    await new Promise(r => setTimeout(r, 100));
    return {
      btnText: qrBtn.textContent,
      css: document.getElementById('__agent_bridge_live_preview__')?.textContent || '',
    };
  });
  console.log('   "primary button" result:', primaryResult);
  assert.equal(primaryResult.btnText, '✓ Rendered (Jev)!');
  assert(primaryResult.css.includes('#2563eb'));

  // Capture screenshot of the verified page
  await page.screenshot({ path: '/tmp/test-quick-render-ai-success.png' });
  console.log('✅ All AI Quick Render tests passed! Screenshot: /tmp/test-quick-render-ai-success.png');

  await browser.close();
}

testQuickRenderAiRobustness().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
