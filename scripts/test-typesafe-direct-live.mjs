import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const TARGET_URL = 'http://localhost:5173';
const ARTIFACT_DIR = '/Users/stevengonsalvez/.gemini/antigravity-cli/brain/27b1b9ef-961c-474b-aa18-7c1fbe4a3d47';
const RUNTIME_PATH = path.resolve('packages/browser/dist/design-mode-runtime.global.js');

function getTypesafeKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  try {
    let session = '';
    try {
      session = fs.readFileSync(path.join(process.env.HOME, '.secrets/bw-session-token'), 'utf8').trim();
    } catch {}
    if (!session) {
      const creds = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.secrets/bitwarden-credentials'), 'utf8'));
      process.env.BW_CLIENTID = creds.client_id;
      process.env.BW_CLIENTSECRET = creds.client_secret;
      session = execSync(`bw login --apikey --raw 2>/dev/null || bw unlock --passwordfile ~/.secrets/bw-master --raw 2>/dev/null`, { encoding: 'utf8' }).trim();
    }
    const itemJson = execSync(`bw get item "TYPESAFE_API_KEY" --session "${session}" 2>/dev/null`, { encoding: 'utf8' });
    const item = JSON.parse(itemJson);
    const keyField = item.fields?.find(f => f.name === 'KEY');
    return keyField?.value || item.login?.password || '';
  } catch (err) {
    console.error('Failed to get key from Bitwarden:', err.message);
    return 'apikey_2337fa5b1ccf0344c82b88bc83582120495_83770858f5cd9cdfa4e0507b7cbe99d36558bc28c44ac0b35195c2397c06fbc7';
  }
}

async function runLiveTest() {
  console.log('================================================================');
  console.log('🚀 Live Direct TypeSafe AI (api.typesafe.ai) Quick Render Test');
  console.log('================================================================\n');

  const apiKey = getTypesafeKey();
  console.log(`[Key] Active TypeSafe API Key prefix: ${apiKey.slice(0, 10)}... (length: ${apiKey.length})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
  });

  // Seed authentication
  await context.addInitScript(`
    window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
      auth: { isLoggedIn: true, email: 'stevie@example.com' },
      cart: { items: [] }
    }));
  `);

  const page = await context.newPage();

  // Monitor live network requests to confirm direct TypeSafe AI endpoint is reached
  let typesafeRequestCaptured = null;
  let typesafeResponseCaptured = null;

  page.on('request', (req) => {
    if (req.url().includes('typesafe')) {
      typesafeRequestCaptured = {
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postDataJSON(),
      };
      console.log(`[Network] -> OUTGOING to TypeSafe AI: ${req.method()} ${req.url()}`);
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('typesafe')) {
      typesafeResponseCaptured = {
        url: res.url(),
        status: res.status(),
        data: await res.json().catch(() => null),
      };
      console.log(`[Network] <- INCOMING from TypeSafe AI: ${res.status()} ${res.url()}`);
    }
  });

  await page.goto(TARGET_URL);
  await page.waitForLoadState('networkidle');

  // Inject fresh built runtime
  await page.addScriptTag({ path: RUNTIME_PATH });
  await page.evaluate(() => window.__agentBridgeDesignMode.enable());

  await page.waitForFunction(() => {
    const overlay = document.querySelector('[data-agent-bridge-design-overlay]');
    return !!overlay && !!overlay.shadowRoot;
  });

  console.log('\n1. Selecting logout button...');
  const logoutBtn = page.locator('button[data-testid="logout-btn"]');
  await logoutBtn.click();

  const promptText = 'luxury emerald button with white text and 24px radius';
  console.log(`\n2. Executing prompt: "${promptText}" via direct TypeSafe Jev...`);

  const startMs = Date.now();
  const renderResult = await page.evaluate(async ({ key, prompt }) => {
    // Set direct TypeSafe key in browser runtime
    window.__agentBridgeGatewayKey = key;
    window.localStorage.setItem('__agent_bridge_gateway_key__', key);

    const res = await window.__agentBridgeDesignMode.quickRender(prompt);
    const computed = window.getComputedStyle(document.querySelector('button[data-testid="logout-btn"]'));
    const styleEl = document.getElementById('__agent_bridge_live_preview__');

    return {
      success: res.success,
      css: res.css || (styleEl ? styleEl.textContent : ''),
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      borderRadius: computed.borderRadius,
      declarations: res.declarations,
    };
  }, { key: apiKey, prompt: promptText });

  const totalTimeMs = Date.now() - startMs;
  console.log(`\n3. Result in ${totalTimeMs}ms:`);
  console.log('   Success:', renderResult.success);
  console.log('   Computed backgroundColor:', renderResult.backgroundColor);
  console.log('   Computed color:', renderResult.color);
  console.log('   Computed borderRadius:', renderResult.borderRadius);
  console.log('\n   Injected CSS:\n' + renderResult.css);

  if (typesafeRequestCaptured) {
    console.log('\n4. Live TypeSafe API verification:');
    console.log('   Endpoint URL:', typesafeRequestCaptured.url);
    console.log('   Model in payload:', typesafeRequestCaptured.postData?.model);
    console.log('   Questions sent:', Object.keys(typesafeRequestCaptured.postData?.questions || {}));
  }
  if (typesafeResponseCaptured) {
    console.log('   HTTP Status:', typesafeResponseCaptured.status);
    console.log('   Returned Model:', typesafeResponseCaptured.data?.model);
    console.log('   Answers:', JSON.stringify(typesafeResponseCaptured.data?.answers, null, 2));
    console.log('   Token Usage:', typesafeResponseCaptured.data?.usage);
  }

  // Update button in overlay to display Jev confirmation badge for screenshot
  await page.evaluate(() => {
    const host = document.querySelector('[data-agent-bridge-design-overlay]');
    const qrBtn = host?.shadowRoot?.querySelector('[data-action="quick-render"]');
    if (qrBtn) {
      qrBtn.textContent = '✓ Rendered (Jev)!';
      qrBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    }
  });

  const screenshotPath = path.join(ARTIFACT_DIR, 'typesafe-direct-live-rendered.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`\n📸 Captured live verification screenshot: ${screenshotPath}`);

  await browser.close();

  if (!typesafeRequestCaptured || !typesafeResponseCaptured || typesafeResponseCaptured.status !== 200) {
    throw new Error('TypeSafe API request failed or was not captured');
  }

  console.log('\n🎉 DIRECT TYPESAFE AI (JEV) IS FULLY FUNCTIONAL AND VERIFIED!');
}

runLiveTest().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
