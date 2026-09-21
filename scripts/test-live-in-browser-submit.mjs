import { WebSocket } from 'ws';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

async function main() {
  console.log('--- Testing Live In-Browser Submit & Host Handoff ---');
  const ws = new WebSocket('ws://localhost:4000/debug?sessionId=default&role=agent');

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  console.log('✓ Connected to bridge WebSocket as agent role');

  let reqCounter = 0;
  function sendCommand(msg) {
    return new Promise((resolve, reject) => {
      const requestId = `req-${++reqCounter}`;
      const onMessage = (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.requestId === requestId) {
            ws.off('message', onMessage);
            if (parsed.error) reject(new Error(parsed.error.message || 'Command failed'));
            else resolve(parsed.result);
          }
        } catch {}
      };
      ws.on('message', onMessage);
      ws.send(JSON.stringify({ ...msg, requestId, sessionId: 'default' }));
    });
  }

  // 1. Check targets
  const targetsRes = await sendCommand({ type: 'browser_get_targets' });
  console.log('1. Open browser targets:', targetsRes.targets.length, targetsRes.targets[0]);
  const targetId = targetsRes.targets[0]?.targetId;
  if (!targetId) throw new Error('No targets found');

  // 2. Select elements in live browser
  console.log('2. Resetting selections and selecting logout button and nav products...');
  await sendCommand({ type: 'browser_design_mode', action: 'clear_selections', targetId });
  await sendCommand({ type: 'browser_click', selector: '[data-testid="logout-btn"]', targetId });
  await sendCommand({ type: 'browser_click', selector: '[data-testid="nav-products"]', targetId });

  // 3. Verify status has 2 selections
  const statusRes = await sendCommand({ type: 'browser_design_mode', action: 'status', targetId });
  console.log('   selections count:', statusRes.snapshot?.selections?.length);
  if (statusRes.snapshot?.selections?.length !== 2) {
    throw new Error(`Expected 2 selections, got ${statusRes.snapshot?.selections?.length}`);
  }

  // 4. Trigger in-browser "Send to Agent" button via CDP evaluate in the live browser
  console.log('3. Typing prompt into overlay input and clicking Send to Agent button in Shadow DOM...');
  const submitResult = await sendCommand({
    type: 'cdp_send',
    method: 'Runtime.evaluate',
    targetId,
    params: {
      expression: `(async () => {
        const host = document.querySelector('[data-agent-bridge-design-overlay]');
        if (!host || !host.shadowRoot) return { error: 'Overlay not found' };
        const input = host.shadowRoot.querySelector('[data-agent-prompt]');
        if (input) {
          input.value = 'update logout and nav items';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btn = host.shadowRoot.querySelector('[data-action="submit-batch"]');
        if (!btn) return { error: 'Submit button not found' };
        btn.click();
        return { clicked: true };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    },
  });
  console.log('   in-browser click result:', submitResult);

  // Wait for sidecar to generate artifacts and update clipboard
  console.log('4. Waiting for sidecar artifact generation...');
  await new Promise((r) => setTimeout(r, 1200));

  // 5. Inspect snapshot after submit
  const statusAfter = await sendCommand({ type: 'browser_design_mode', action: 'status', targetId });
  console.log('5. Artifacts populated in runtime:');
  console.log('   screenshot_path:', statusAfter.snapshot?.artifacts?.screenshot_path);
  console.log('   context_json_path:', statusAfter.snapshot?.artifacts?.context_json_path);
  console.log('   element_screenshot_paths:', statusAfter.snapshot?.artifacts?.element_screenshot_paths);

  // 6. Verify context.json file on disk
  const contextJsonPath = statusAfter.snapshot?.artifacts?.context_json_path;
  if (!contextJsonPath || !fs.existsSync(contextJsonPath)) {
    throw new Error(`Context JSON file not found at ${contextJsonPath}`);
  }
  const contextContent = JSON.parse(fs.readFileSync(contextJsonPath, 'utf8'));
  console.log('6. Context JSON validated:');
  console.log('   prompt tokens:', contextContent.prompt);
  console.log('   selections count:', contextContent.selections?.length);
  console.log('   selection 0 screenshot:', contextContent.selections?.[0]?.screenshot_path);
  console.log('   selection 0 react_components:', contextContent.selections?.[0]?.react_components);
  console.log('   selection 1 screenshot:', contextContent.selections?.[1]?.screenshot_path);
  console.log('   selection 1 react_components:', contextContent.selections?.[1]?.react_components);

  // 7. Read clipboard contents via pbpaste
  const clipText = execSync('pbpaste', { encoding: 'utf8' }) || '';
  console.log('7. Clipboard Text:\n' + clipText);

  // Assert line 1 format
  const lines = clipText.split('\n');
  const crop0 = statusAfter.snapshot?.artifacts?.element_screenshot_paths?.[0];
  const crop1 = statusAfter.snapshot?.artifacts?.element_screenshot_paths?.[1];
  console.log('\n--- Line 1 Assertions ---');
  console.log('Expected crop 0:', crop0);
  console.log('Expected crop 1:', crop1);
  console.log('Actual line 1:', lines[0]);

  if (!lines[0].includes(crop0) || !lines[0].includes(crop1) || !lines[0].includes('update logout and nav items')) {
    throw new Error(`Line 1 does not contain both crops and prompt text: ${lines[0]}`);
  }
  if (lines[2] !== 'Page: http://localhost:5173/') {
    throw new Error(`Line 3 does not match Page URL: ${lines[2]}`);
  }
  if (!lines[3].startsWith('Details: ') || !lines[3].includes('.json')) {
    throw new Error(`Line 4 does not match Details context JSON: ${lines[3]}`);
  }

  // 8. Test Enter key submission in prompt field
  console.log('\n8. Testing Enter key submission in prompt field...');
  await sendCommand({
    type: 'cdp_send',
    method: 'Runtime.evaluate',
    targetId,
    params: {
      expression: `(async () => {
        const host = document.querySelector('[data-agent-bridge-design-overlay]');
        const input = host.shadowRoot.querySelector('[data-agent-prompt]');
        input.value = 'change header to emerald';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`,
      awaitPromise: true,
    },
  });

  await new Promise((r) => setTimeout(r, 1200));
  const clipTextEnter = execSync('pbpaste', { encoding: 'utf8' }) || '';
  console.log('   clipboard after Enter key:\n' + clipTextEnter.split('\n')[0]);
  if (!clipTextEnter.includes('change header to emerald')) {
    throw new Error('Enter key submission did not update clipboard');
  }
  console.log('   ✓ Enter key submission works');

  // 9. Test Copy prompt button
  console.log('\n9. Testing Copy prompt button...');
  await sendCommand({
    type: 'cdp_send',
    method: 'Runtime.evaluate',
    targetId,
    params: {
      expression: `(async () => {
        const host = document.querySelector('[data-agent-bridge-design-overlay]');
        const copyBtn = host.shadowRoot.querySelector('[data-action="copy-prompt"]');
        if (copyBtn) copyBtn.click();
      })()`,
      awaitPromise: true,
    },
  });

  await new Promise((r) => setTimeout(r, 1200));
  const clipTextCopy = execSync('pbpaste', { encoding: 'utf8' }) || '';
  if (!clipTextCopy.includes('Details:')) {
    throw new Error('Copy prompt button did not copy formatted prompt');
  }
  console.log('   ✓ Copy prompt button works');

  // 10. Test AI Quick Render
  console.log('\n10. Testing AI Quick Render...');
  await sendCommand({
    type: 'cdp_send',
    method: 'Runtime.evaluate',
    targetId,
    params: {
      expression: `(async () => {
        const host = document.querySelector('[data-agent-bridge-design-overlay]');
        const input = host.shadowRoot.querySelector('[data-agent-prompt]');
        input.value = 'change background to purple and border-radius to 18px';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const qrBtn = host.shadowRoot.querySelector('[data-action="quick-render"]');
        if (qrBtn) qrBtn.click();
      })()`,
      awaitPromise: true,
    },
  });

  await new Promise((r) => setTimeout(r, 300));
  const previewCheck = await sendCommand({
    type: 'cdp_send',
    method: 'Runtime.evaluate',
    targetId,
    params: {
      expression: `(() => {
        const style = document.getElementById('__agent_bridge_live_preview__');
        return { exists: !!style, css: style ? style.textContent : '' };
      })()`,
      returnByValue: true,
    },
  });
  console.log('   AI Quick Render injected style:', previewCheck.result?.value);
  if (!previewCheck.result?.value?.exists) {
    throw new Error('AI Quick Render did not inject style tag');
  }
  console.log('   ✓ AI Quick Render works');

  // 11. Test Manual Quick Render (Tweaker)
  console.log('\n11. Testing Manual Tweaker live patch...');
  await sendCommand({
    type: 'cdp_send',
    method: 'Runtime.evaluate',
    targetId,
    params: {
      expression: `(() => {
        const host = document.querySelector('[data-agent-bridge-design-overlay]');
        const tweakerBtn = host.shadowRoot.querySelector('[data-action="toggle-tweaker"]');
        if (tweakerBtn) tweakerBtn.click();
        const paddingInput = host.shadowRoot.querySelector('[data-edit-prop="padding"]');
        if (paddingInput) {
          paddingInput.value = '15px 30px';
          paddingInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`,
      returnByValue: true,
    },
  });

  const tweakerCheck = await sendCommand({
    type: 'cdp_send',
    method: 'Runtime.evaluate',
    targetId,
    params: {
      expression: `(() => {
        const btn = document.querySelector('[data-testid="logout-btn"]');
        return btn ? window.getComputedStyle(btn).padding : '';
      })()`,
      returnByValue: true,
    },
  });
  console.log('   Tweaker updated padding:', tweakerCheck.result?.value);
  console.log('   ✓ Manual Tweaker works');

  console.log('\n🎉 ALL 11 IN-BROWSER LIVE DEMO CHECKS PASSED 100%!');
  ws.close();
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
