#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('=== Design Mode Jev Instant Quick Render Validation ===\n');

  const runtimePath = path.resolve('packages/browser/dist/design-mode-runtime.global.js');
  if (!fs.existsSync(runtimePath)) {
    throw new Error(`Runtime bundle not found at: ${runtimePath}`);
  }
  const runtimeCode = fs.readFileSync(runtimePath, 'utf-8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Load a mock page
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Quick Render Jev Test</title>
        <style>
          body { font-family: sans-serif; padding: 40px; background: #f8fafc; }
          .card { padding: 20px; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          #target-btn {
            background-color: rgb(239, 68, 68);
            color: #ffffff;
            border: none;
            border-radius: 4px;
            padding: 10px 16px;
            font-size: 14px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Product Checkout</h1>
          <button id="target-btn" data-testid="checkout-btn">Complete Purchase</button>
        </div>
      </body>
    </html>
  `);

  console.log('1. Injecting Design Mode Runtime...');
  await page.evaluate(runtimeCode);
  console.log('   ✓ Runtime script injected');

  console.log('2. Enabling Design Mode and selecting button...');
  await page.evaluate(() => {
    window.__agentBridgeDesignMode.enable();
    const btn = document.getElementById('target-btn');
    btn.click(); // Select target-btn
  });

  const snapshot = await page.evaluate(() => window.__agentBridgeDesignMode.getSnapshot());
  console.log(`   ✓ Selected elements count: ${snapshot.selections.length}`);
  if (snapshot.selections.length === 0) {
    throw new Error('Failed to select target element');
  }

  console.log('3. Testing prompt-to-CSS Quick Render...');
  const prompt = 'Change the background color to coral and border-radius to 20px';
  console.log(`   Prompt: "${prompt}"`);

  const t0 = Date.now();
  await page.evaluate(async (p) => {
    // Set prompt in runtime input
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const shadow = host.shadowRoot;
    const input = shadow.querySelector('[data-agent-prompt]');
    input.value = p;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Click Quick Render button
    const quickBtn = shadow.querySelector('[data-action="quick-render"]');
    quickBtn.click();
  }, prompt);

  // Wait for async quick render to inject live preview style tag
  await page.waitForFunction(() => {
    const el = document.getElementById('__agent_bridge_live_preview__');
    return el && el.textContent && el.textContent.length > 0;
  }, { timeout: 10000 });
  const elapsedMs = Date.now() - t0;
  console.log(`   ✓ Quick Render completed and live patch injected in ${elapsedMs}ms`);

  console.log('4. Verifying DOM live preview style injection...');
  const styleContent = await page.evaluate(() => {
    const el = document.getElementById('__agent_bridge_live_preview__');
    return el ? el.textContent : null;
  });
  console.log('   Injected style content:');
  console.log(styleContent?.trim().split('\n').map(l => '     ' + l).join('\n'));

  if (!styleContent || !styleContent.includes('coral') || !styleContent.includes('20px')) {
    throw new Error(`Injected CSS missing coral or 20px: ${styleContent}`);
  }
  console.log('   ✓ <style id="__agent_bridge_live_preview__"> injected with expected rules');

  console.log('5. Verifying computed styles of target element...');
  const computed = await page.evaluate(() => {
    const btn = document.getElementById('target-btn');
    const style = window.getComputedStyle(btn);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
    };
  });
  console.log(`   Computed backgroundColor: ${computed.backgroundColor}`);
  console.log(`   Computed borderRadius: ${computed.borderRadius}`);

  if (computed.backgroundColor !== 'rgb(255, 127, 80)' && computed.backgroundColor !== 'coral') {
    throw new Error(`Expected coral/rgb(255, 127, 80) but got ${computed.backgroundColor}`);
  }
  if (computed.borderRadius !== '20px') {
    throw new Error(`Expected 20px but got ${computed.borderRadius}`);
  }
  console.log('   ✓ Button style reflects coral background and 20px border radius live in DOM!');

  console.log('6. Testing programmatic quickRender() API with font change prompt...');
  const fontPrompt = 'change font to poppins and font size to 18px';
  await page.evaluate(async (fp) => {
    await window.__agentBridgeDesignMode.quickRender(fp);
  }, fontPrompt);

  const updatedComputed = await page.evaluate(() => {
    const btn = document.getElementById('target-btn');
    const style = window.getComputedStyle(btn);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
    };
  });
  console.log(`   Computed fontFamily: ${updatedComputed.fontFamily}`);
  console.log(`   Computed fontSize: ${updatedComputed.fontSize}`);

  if (!updatedComputed.fontFamily.toLowerCase().includes('poppins')) {
    throw new Error(`Expected fontFamily to include Poppins but got ${updatedComputed.fontFamily}`);
  }
  if (updatedComputed.fontSize !== '18px') {
    throw new Error(`Expected fontSize 18px but got ${updatedComputed.fontSize}`);
  }
  console.log('7. Testing Question Mark (?) Info Popover for Quick Render (AI)...');
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const aiInfoBtn = host.shadowRoot.querySelector('[data-action="toggle-info-ai"]');
    aiInfoBtn.click();
  });

  const aiInfoVisible = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const popover = host.shadowRoot.querySelector('.info-popover');
    return {
      isOpen: Boolean(popover),
      title: popover?.querySelector('.info-title')?.textContent,
      badge: popover?.querySelector('.info-badge')?.textContent,
    };
  });

  if (!aiInfoVisible.isOpen || !aiInfoVisible.title?.includes('Quick Render (AI)')) {
    throw new Error(`Expected AI info popover to open but got: ${JSON.stringify(aiInfoVisible)}`);
  }
  console.log(`   ✓ AI Info Popover rendered: "${aiInfoVisible.title}" [${aiInfoVisible.badge}]`);

  // Close AI info
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    host.shadowRoot.querySelector('[data-action="close-info"]')?.click();
  });

  console.log('8. Testing Question Mark (?) Info Popover for Quick Render (Manual)...');
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const manualInfoBtn = host.shadowRoot.querySelector('[data-action="toggle-info-manual"]');
    manualInfoBtn.click();
  });

  const manualInfoVisible = await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const popover = host.shadowRoot.querySelector('.info-popover');
    return {
      isOpen: Boolean(popover),
      title: popover?.querySelector('.info-title')?.textContent,
      badge: popover?.querySelector('.info-badge')?.textContent,
    };
  });

  if (!manualInfoVisible.isOpen || !manualInfoVisible.title?.includes('Quick Render (Manual)')) {
    throw new Error(`Expected Manual info popover to open but got: ${JSON.stringify(manualInfoVisible)}`);
  }
  console.log(`   ✓ Manual Info Popover rendered: "${manualInfoVisible.title}" [${manualInfoVisible.badge}]`);

  // Close Manual info
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    host.shadowRoot.querySelector('[data-action="close-info"]')?.click();
  });

  console.log('9. Testing Quick Render (Manual) with direct style tweaks...');
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    // Open tweaker popover
    host.shadowRoot.querySelector('[data-action="toggle-tweaker"]')?.click();
  });

  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const padInput = host.shadowRoot.querySelector('[data-edit-prop="padding"]');
    if (padInput) {
      padInput.value = '22px 35px';
      padInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const manualBtn = host.shadowRoot.querySelector('[data-action="quick-render-manual"]');
    manualBtn.click();
  });

  const manualComputed = await page.evaluate(() => {
    const btn = document.getElementById('target-btn');
    const style = window.getComputedStyle(btn);
    return {
      padding: style.padding,
    };
  });
  console.log(`   Computed padding after manual render: ${manualComputed.padding}`);
  if (!manualComputed.padding.includes('22px')) {
    throw new Error(`Expected padding to include 22px but got ${manualComputed.padding}`);
  }
  console.log('   ✓ Quick Render (Manual) successfully updated DOM live preview!');

  await browser.close();
  console.log('\n=== All Design Mode Jev & Manual Quick Render Validations Passed 100% Green ===');
}

main().catch((err) => {
  console.error('\n❌ Validation failed:', err);
  process.exit(1);
});
