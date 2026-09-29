import { chromium } from 'playwright';
import fs from 'node:fs';

async function main() {
  console.log('Connecting to http://localhost:5173...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Enable design mode if not already active
  await page.evaluate(() => {
    const dm = window.__agentBridgeDesignMode;
    if (dm) {
      dm.enable();
    }
  });
  await page.waitForTimeout(800);

  // Check shadow root and status pill
  const statusPillInfo = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host?.shadowRoot;
    const pill = root?.querySelector('.agent-status-pill');
    return {
      hostFound: Boolean(host),
      pillText: pill?.textContent?.trim() || null,
      pillClasses: pill ? Array.from(pill.classList) : [],
    };
  });
  console.log('Initial Status Pill Info:', statusPillInfo);

  // Select an element: the new size dropdown or the title
  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="size-dropdown"]') || document.querySelector('.hero-title');
    if (target && window.__agentBridgeDesignMode?.selectElement) {
      window.__agentBridgeDesignMode.selectElement(target);
    }
  });
  await page.waitForTimeout(400);

  // Test working status (shimmer-working)
  await page.evaluate(() => {
    window.__agentBridgeDesignMode?.setAgentStatus({
      status: 'working',
      message: 'Agent refactoring component...',
    });
  });
  await page.waitForTimeout(400);

  const workingState = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host?.shadowRoot;
    const pill = root?.querySelector('.agent-status-pill');
    const selectedBox = root?.querySelector('.selected-box');
    const sendBtn = root?.querySelector('.btn-send-agent');
    return {
      pillText: pill?.textContent?.trim() || null,
      isWorkingPill: pill?.classList.contains('status-working'),
      hasShimmerWorking: selectedBox?.classList.contains('shimmer-working'),
      shimmerTag: selectedBox?.querySelector('.target-shimmer-tag')?.textContent?.trim() || null,
      sendBtnText: sendBtn?.textContent?.trim() || null,
    };
  });
  console.log('Working State Verification:', workingState);

  // Test done status (shimmer-done)
  await page.evaluate(() => {
    window.__agentBridgeDesignMode?.setAgentStatus({
      status: 'done',
      message: 'Changes applied successfully',
    });
  });
  await page.waitForTimeout(400);

  const doneState = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const root = host?.shadowRoot;
    const pill = root?.querySelector('.agent-status-pill');
    const selectedBox = root?.querySelector('.selected-box');
    return {
      pillText: pill?.textContent?.trim() || null,
      isDonePill: pill?.classList.contains('status-done'),
      hasShimmerDone: selectedBox?.classList.contains('shimmer-done'),
      doneTag: selectedBox?.querySelector('.target-done-tag')?.textContent?.trim() || null,
    };
  });
  console.log('Done State Verification:', doneState);

  // Reset to idle / ready
  await page.evaluate(() => {
    window.__agentBridgeDesignMode?.setAgentStatus({
      status: 'idle',
      message: 'Agent Ready',
    });
  });
  await page.waitForTimeout(300);

  const screenshotPath = '/tmp/feedback-loop-dock-verified.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved to ${screenshotPath}`);

  await browser.close();
  console.log('Verification finished successfully!');
}

main().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
