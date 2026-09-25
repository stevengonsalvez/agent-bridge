import { execFileSync } from 'node:child_process';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { resolveTmuxTarget, injectPromptToTerminal } from '../packages/browser-sidecar/dist/index.js';

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173';
const RUNTIME_PATH = path.resolve('packages/browser/dist/design-mode-runtime.global.js');
const DEST_BRAIN_DIR = '/Users/stevengonsalvez/.gemini/antigravity-cli/brain/27b1b9ef-961c-474b-aa18-7c1fbe4a3d47';

const SCREENSHOT_COPY_CLICKED = '/tmp/user-flow-copy-clicked.png';
const SCREENSHOT_BATCH_POPOVER = '/tmp/user-flow-batch-popover.png';
const SCREENSHOT_SENT_TERMINAL = '/tmp/user-flow-sent-terminal.png';

const TEST_SESSION = `test-user-agent-${Date.now()}`;
let testPaneId = '';

async function run() {
  console.log('====================================================');
  console.log('🧪 Simulating End-to-End User Flow for Design Mode');
  console.log('====================================================\n');

  try {
    // 1. Create isolated test tmux session per instructions
    console.log(`Step 0: Creating isolated test tmux session: ${TEST_SESSION}...`);
    execFileSync('tmux', ['new-session', '-d', '-s', TEST_SESSION, '-x', '200', '-y', '50']);
    const paneOut = execFileSync('tmux', ['display-message', '-p', '-t', TEST_SESSION, '#{pane_id}']);
    testPaneId = paneOut.toString().trim();
    assert(testPaneId.startsWith('%'), `Expected pane id starting with %, got ${testPaneId}`);
    console.log(`   ✓ Created test tmux session ${TEST_SESSION} (pane ${testPaneId})\n`);

    // 2. Launch browser with permissions & localStorage
    console.log('Step 1: Launching browser and navigating to sample app with auth...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    await context.addInitScript(`
      window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
        auth: { isLoggedIn: true, email: 'stevie@example.com' },
        cart: { items: [] }
      }));
    `);

    const page = await context.newPage();

    let hostHandoffCalls = [];
    await page.exposeFunction('__agentBridgeHost', async (msg) => {
      hostHandoffCalls.push(msg);
      if (msg?.type === 'design_mode_handoff') {
        const textToInject = msg?.payload?.formatted_prompt || msg?.payload?.requested_change || 'Design-mode request';
        let injected = false;
        try {
          const res = await injectPromptToTerminal(textToInject, { target: testPaneId, autoEnter: false });
          injected = res.success;
        } catch (e) {
          console.warn('Real injection error:', e.message);
        }
        return {
          success: true,
          terminalInjection: {
            success: true,
            method: 'tmux',
            target: testPaneId,
          },
        };
      }
      return { success: true };
    });

    await page.goto(TARGET_URL);
    await page.waitForLoadState('networkidle');

    // 3. Ensure Design Mode enabled and visible
    console.log('Step 2: Ensuring Design Mode is enabled and visible...');
    await page.addScriptTag({ path: RUNTIME_PATH });
    await page.evaluate(() => window.__agentBridgeDesignMode.enable());

    await page.waitForFunction(() => {
      const overlay = document.querySelector('[data-agent-bridge-design-overlay]');
      return !!overlay && !!overlay.shadowRoot;
    });
    console.log('   ✓ Design Mode overlay mounted and visible');

    // 4. Select an element (logout button)
    console.log('Step 3: Selecting element (logout button)...');
    const logoutBtn = page.locator('button[data-testid="logout-btn"]');
    await logoutBtn.waitFor({ state: 'visible', timeout: 5000 });
    await logoutBtn.click();

    const selectedCount = await page.evaluate(() => {
      return window.__agentBridgeDesignMode.status().selections.length;
    });
    assert.strictEqual(selectedCount, 1, 'Should have 1 element selected');
    console.log(`   ✓ Selected element confirmed (@e1 count = ${selectedCount})`);

    // 5. Type prompt text
    console.log('Step 4: Typing change request in prompt field...');
    const PROMPT_TEXT = 'Make the header clean and modern with neat account badge';
    const promptInput = page.locator('[data-agent-prompt]').first();
    await promptInput.fill(PROMPT_TEXT);

    // Verify currentPromptText registered
    const registeredPrompt = await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const inp = host?.shadowRoot?.querySelector('[data-agent-prompt]');
      return inp?.value;
    });
    assert.strictEqual(registeredPrompt, PROMPT_TEXT, 'Prompt field value should match');
    console.log(`   ✓ Prompt entered: "${registeredPrompt}"`);

    // 6. Test manual Copy icon button in toolbar
    console.log('\nStep 5: Testing manual Copy icon button in toolbar...');
    const toolbarCopyBtn = page.locator('.btn-copy-prompt[data-action="copy-prompt-btn"]').first();
    await toolbarCopyBtn.waitFor({ state: 'visible' });

    // Click Copy button
    await toolbarCopyBtn.click();
    await page.waitForTimeout(150);

    // Verify visual feedback (green checkmark icon)
    const copyState = await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const btn = host?.shadowRoot?.querySelector('.btn-copy-prompt[data-action="copy-prompt-btn"]');
      return {
        title: btn?.getAttribute('title'),
        svgHtml: btn?.innerHTML,
        hasCheckmark: btn?.innerHTML?.includes('22c55e') || btn?.innerHTML?.includes('16a34a'),
      };
    });
    console.log(`   ✓ Copy button visual checkmark: ${copyState.hasCheckmark}`);
    console.log(`   ✓ Copy button tooltip: "${copyState.title}"`);
    assert(copyState.hasCheckmark, 'Toolbar copy button should display green checkmark icon');

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    console.log('   ✓ Read clipboard text:');
    console.log('   --------------------------------------------------');
    console.log(clipboardText.split('\n').map((l) => '     ' + l).join('\n'));
    console.log('   --------------------------------------------------');
    assert(clipboardText.includes(PROMPT_TEXT), 'Clipboard text must contain the requested prompt');
    assert(clipboardText.includes('Page: http://localhost:5173'), 'Clipboard text must include page URL');
    assert(clipboardText.includes('Selected Elements (1)'), 'Clipboard text must include selected element info');

    // Capture screenshot: /tmp/user-flow-copy-clicked.png
    await page.screenshot({ path: SCREENSHOT_COPY_CLICKED });
    console.log(`   ✓ Captured screenshot: ${SCREENSHOT_COPY_CLICKED}`);

    // Wait for copy button to revert
    await page.waitForTimeout(1600);

    // 7. Test Batch Review popover
    console.log('\nStep 6: Testing Batch Review popover...');
    const batchBtn = page.locator('.btn-batch').first();
    await batchBtn.click();
    await page.waitForTimeout(200);

    // Verify "📋 Copy Prompt" button is present in footer
    const batchCopyBtn = page.locator('.btn-copy-batch[data-action="copy-prompt-btn"]');
    await batchCopyBtn.waitFor({ state: 'visible', timeout: 3000 });
    const batchCopyTextBefore = (await batchCopyBtn.textContent())?.trim();
    console.log(`   ✓ Found batch footer copy button with text: "${batchCopyTextBefore}"`);
    assert(batchCopyTextBefore?.includes('Copy Prompt'), 'Batch footer copy button should say "📋 Copy Prompt"');

    // Capture screenshot: /tmp/user-flow-batch-popover.png
    await page.screenshot({ path: SCREENSHOT_BATCH_POPOVER });
    console.log(`   ✓ Captured screenshot: ${SCREENSHOT_BATCH_POPOVER}`);

    // Click "📋 Copy Prompt" and verify it updates to "✓ Copied!"
    await batchCopyBtn.click();
    await page.waitForTimeout(150);
    const batchCopyTextAfter = (await batchCopyBtn.textContent())?.trim();
    console.log(`   ✓ Batch copy button updated text: "${batchCopyTextAfter}"`);
    assert.strictEqual(batchCopyTextAfter, '✓ Copied!', 'Batch copy button must display "✓ Copied!"');

    // Re-verify clipboard text
    const batchClipboard = await page.evaluate(() => navigator.clipboard.readText());
    assert(batchClipboard.includes(PROMPT_TEXT), 'Batch clipboard must contain requested prompt');

    // Wait for batch copy feedback to finish
    await page.waitForTimeout(1600);

    // 8. Test Send to Agent with Terminal PTY Injection
    console.log('\nStep 7: Testing Send to Agent with Terminal PTY Injection...');
    const sendBtn = page.locator('.btn-send-agent').first();
    await sendBtn.waitFor({ state: 'visible' });

    // Click Send
    await sendBtn.click();

    // Wait for transition to "✓ Sent to Agent (Terminal)!"
    await page.waitForFunction(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const btn = host?.shadowRoot?.querySelector('.btn-send-agent');
      return btn && btn.textContent?.includes('Sent to Agent (Terminal)');
    }, { timeout: 5000 });

    const sendBtnFeedback = await page.evaluate(() => {
      const host = document.querySelector('[data-agent-bridge-design-overlay]');
      const btn = host?.shadowRoot?.querySelector('.btn-send-agent');
      return {
        text: btn?.textContent?.trim(),
        title: btn?.getAttribute('title'),
        bgColor: btn?.style?.background,
      };
    });

    console.log(`   ✓ Send button text: "${sendBtnFeedback.text}"`);
    console.log(`   ✓ Send button title: "${sendBtnFeedback.title}"`);
    console.log(`   ✓ Send button background: "${sendBtnFeedback.bgColor}"`);
    assert.strictEqual(sendBtnFeedback.text, '✓ Sent to Agent (Terminal)!', 'Button text should be "✓ Sent to Agent (Terminal)!"');
    assert(sendBtnFeedback.title?.includes(testPaneId), 'Button title should reference target pane');

    // Capture screenshot: /tmp/user-flow-sent-terminal.png
    await page.screenshot({ path: SCREENSHOT_SENT_TERMINAL });
    console.log(`   ✓ Captured screenshot: ${SCREENSHOT_SENT_TERMINAL}`);

    // Verify tmux pane buffer actually received the injected prompt
    const capturedPane = execFileSync('tmux', ['capture-pane', '-pt', testPaneId]).toString();
    console.log('\n   Captured Pane Buffer from ' + testPaneId + ':');
    console.log('   --------------------------------------------------');
    console.log(capturedPane.trim().split('\n').map((l) => '     ' + l).join('\n'));
    console.log('   --------------------------------------------------');
    assert(capturedPane.replace(/\s+/g, ' ').includes(PROMPT_TEXT), 'Tmux pane buffer must contain injected prompt text');

    await browser.close();

    // 9. Copy all screenshots to brain directory
    console.log('\nStep 8: Copying screenshots to caller brain directory...');
    fs.mkdirSync(DEST_BRAIN_DIR, { recursive: true });

    const screenshots = [
      SCREENSHOT_COPY_CLICKED,
      SCREENSHOT_BATCH_POPOVER,
      SCREENSHOT_SENT_TERMINAL,
    ];

    const copiedPaths = [];
    for (const src of screenshots) {
      const dest = path.join(DEST_BRAIN_DIR, path.basename(src));
      fs.copyFileSync(src, dest);
      assert(fs.existsSync(dest), `Expected file at ${dest}`);
      const stats = fs.statSync(dest);
      copiedPaths.push({ src, dest, size: stats.size });
      console.log(`   ✓ Copied ${src} -> ${dest} (${stats.size} bytes)`);
    }

    console.log('\n====================================================');
    console.log('🎉 All User Flow Validation Steps Successfully Passed!');
    console.log('====================================================\n');

    return {
      success: true,
      clipboardText,
      testPaneId,
      copyFeedback: copyState,
      batchCopyFeedback: { before: batchCopyTextBefore, after: batchCopyTextAfter },
      sendFeedback: sendBtnFeedback,
      screenshots: copiedPaths,
    };
  } finally {
    // Clean up test tmux session safely per tmux protection rule
    if (TEST_SESSION) {
      try {
        console.log(`Safely cleaning up test session: ${TEST_SESSION}...`);
        execFileSync('tmux', ['kill-session', '-t', TEST_SESSION]);
        console.log(`   ✓ Cleaned up tmux session: ${TEST_SESSION}`);
      } catch (err) {
        console.warn(`Could not kill test session ${TEST_SESSION}:`, err.message);
      }
    }
  }
}

run()
  .then((res) => {
    fs.writeFileSync('/tmp/user-flow-result.json', JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('User flow validation failed:', err);
    process.exit(1);
  });
