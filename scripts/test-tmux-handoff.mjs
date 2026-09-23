import { execFileSync } from 'node:child_process';
import assert from 'node:assert';
import { chromium } from 'playwright';
import { resolveTmuxTarget, injectPromptToTerminal } from '../packages/browser-sidecar/dist/index.js';

const TEST_SESSION = `test-handoff-${Date.now()}`;
let testPaneId = '';

async function run() {
  console.log('====================================================');
  console.log('🧪 Testing Tmux PTY Injection & End-to-End Handoff');
  console.log('====================================================\n');

  try {
    // 1. Create temporary isolated tmux session
    console.log(`1. Creating isolated test tmux session: ${TEST_SESSION}...`);
    execFileSync('tmux', ['new-session', '-d', '-s', TEST_SESSION]);
    const paneOut = execFileSync('tmux', ['display-message', '-p', '-t', TEST_SESSION, '#{pane_id}']);
    testPaneId = paneOut.toString().trim();
    assert(testPaneId.startsWith('%'), `Expected pane id starting with %, got ${testPaneId}`);
    console.log(`   ✓ Created session ${TEST_SESSION} with pane ${testPaneId}`);

    // 2. Test unit resolution and injection
    console.log('2. Testing target resolution and bracketed paste injection...');
    const resolved = await resolveTmuxTarget(TEST_SESSION);
    assert.strictEqual(resolved.target, testPaneId, 'resolveTmuxTarget should match target pane ID');
    console.log(`   ✓ resolveTmuxTarget(${TEST_SESSION}) -> ${resolved.target}`);

    const promptText = `make the header clean and modern\n\nPage: http://localhost:5173/\nDetails: /tmp/test-details.json`;
    const injectResult = await injectPromptToTerminal(promptText, {
      target: testPaneId,
      autoEnter: false,
    });
    assert.strictEqual(injectResult.success, true, 'injectPromptToTerminal should succeed');
    assert.strictEqual(injectResult.method, 'tmux', 'Method should be tmux');

    // Verify pane captured content
    const captured = execFileSync('tmux', ['capture-pane', '-pt', testPaneId]).toString();
    assert(captured.includes('make the header clean and modern'), 'Pane buffer should contain injected prompt');
    console.log('   ✓ Pane buffer successfully received bracketed paste prompt:\n     ' + captured.trim().split('\n')[0]);

    // Clear test pane buffer
    execFileSync('tmux', ['send-keys', '-t', testPaneId, 'C-c']);

    // 3. Test overlay button feedback with mock host returning terminal injection
    console.log('3. Testing overlay button feedback in browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    await context.addInitScript(`
      window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
        auth: { isLoggedIn: true, email: 'stevie@example.com' },
        cart: { items: [] }
      }));
    `);

    const page = await context.newPage();

    let hostCalled = false;
    let receivedPayload = null;

    // Expose host function simulating sidecar behavior
    await page.exposeFunction('__agentBridgeHost', async (msg) => {
      hostCalled = true;
      receivedPayload = msg;
      return {
        success: true,
        terminalInjection: {
          success: true,
          method: 'tmux',
          target: testPaneId,
        },
      };
    });

    await page.goto('http://localhost:5173');
    await page.addScriptTag({ path: './packages/browser/dist/design-mode-runtime.global.js' });
    await page.evaluate(() => window.__agentBridgeDesignMode.enable());

    // Select an element
    const logoutBtn = page.locator('button[data-testid="logout-btn"]');
    await logoutBtn.waitFor({ state: 'visible', timeout: 5000 });
    await logoutBtn.click();

    // Enter prompt text
    await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const input = host?.shadowRoot?.querySelector('[data-agent-prompt]');
      if (input) {
        input.value = 'Update cart button style';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // 4. Test Copy button in toolbar
    console.log('4. Testing manual Copy icon button in toolbar...');
    await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const copyBtn = host?.shadowRoot?.querySelector('.btn-copy-prompt');
      copyBtn?.click();
    });
    await page.waitForTimeout(300);
    const copyFeedback = await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const copyBtn = host?.shadowRoot?.querySelector('.btn-copy-prompt');
      return {
        title: copyBtn?.getAttribute('title'),
        hasCheckSvg: copyBtn?.innerHTML?.includes('22c55e'),
      };
    });
    console.log(`   ✓ Copy button feedback: title="${copyFeedback.title}", checkmark=${copyFeedback.hasCheckSvg}`);
    assert(copyFeedback.hasCheckSvg, 'Copy button should show green checkmark icon on click');

    // 5. Test Copy button in Batch Review popover
    console.log('5. Testing Copy button in Batch Review popover...');
    await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const batchBtn = host?.shadowRoot?.querySelector('.btn-batch');
      batchBtn?.click();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const batchCopyBtn = host?.shadowRoot?.querySelector('.btn-copy-batch');
      batchCopyBtn?.click();
    });
    await page.waitForTimeout(300);
    const batchCopyText = await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const batchCopyBtn = host?.shadowRoot?.querySelector('.btn-copy-batch');
      return batchCopyBtn?.textContent?.trim();
    });
    console.log(`   ✓ Batch copy button text: "${batchCopyText}"`);
    assert.strictEqual(batchCopyText, '✓ Copied!', 'Batch copy button should display ✓ Copied!');

    // 6. Test Send to Agent execution & feedback
    console.log('6. Testing Send to Agent execution & terminal status...');
    await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const sendBtn = host?.shadowRoot?.querySelector('.btn-send-agent');
      sendBtn?.click();
    });

    await page.waitForTimeout(500);

    assert(hostCalled, '__agentBridgeHost should have been called');
    assert.strictEqual(receivedPayload?.type, 'design_mode_handoff', 'Payload type should be design_mode_handoff');

    const buttonFeedback = await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const btn = host?.shadowRoot?.querySelector('.btn-send-agent');
      return {
        text: btn?.textContent?.trim(),
        title: btn?.getAttribute('title'),
      };
    });

    console.log(`   ✓ Overlay send button feedback: "${buttonFeedback.text}"`);
    console.log(`   ✓ Overlay send button title: "${buttonFeedback.title}"`);
    assert(buttonFeedback.text?.includes('Sent to Agent (Terminal)'), 'Button text should confirm terminal injection');
    assert(buttonFeedback.title?.includes(testPaneId), 'Button title should name the target pane');

    await browser.close();

    console.log('\n====================================================');
    console.log('🎉 All Tmux PTY Injection & Copy Button Tests Passed!');
    console.log('====================================================\n');
  } finally {
    // Clean up test session safely per tmux protection rule
    if (TEST_SESSION) {
      try {
        execFileSync('tmux', ['kill-session', '-t', TEST_SESSION]);
        console.log(`Cleaned up test session: ${TEST_SESSION}`);
      } catch {}
    }
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  if (TEST_SESSION) {
    try {
      execFileSync('tmux', ['kill-session', '-t', TEST_SESSION]);
    } catch {}
  }
  process.exit(1);
});
