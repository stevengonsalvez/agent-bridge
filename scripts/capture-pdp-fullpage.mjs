import { chromium } from 'playwright';
import path from 'node:path';

const TARGET_URL = 'http://localhost:5173';
const ARTIFACT_DIR = '/Users/stevengonsalvez/.gemini/antigravity-cli/brain/27b1b9ef-961c-474b-aa18-7c1fbe4a3d47';
const RUNTIME_PATH = path.resolve('packages/browser/dist/design-mode-runtime.global.js');

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1380, height: 900 },
  });

  await context.addInitScript(`
    window.localStorage.setItem('debug-bridge-demo-store', JSON.stringify({
      auth: { isLoggedIn: true, email: 'stevie@example.com' },
      cart: { items: [{ id: 'apex-1', name: 'Trail Apex Carbon Pro v2', price: 189, qty: 1 }] }
    }));
  `);

  const page = await context.newPage();
  await page.goto(TARGET_URL);
  await page.waitForLoadState('networkidle');

  // Inject fresh built runtime
  await page.addScriptTag({ path: RUNTIME_PATH });
  await page.evaluate(() => window.__agentBridgeDesignMode.enable());

  await page.waitForFunction(() => {
    const overlay = document.querySelector('[data-agent-bridge-design-overlay]');
    return !!overlay && !!overlay.shadowRoot;
  });

  // Select the Add to Cart button to highlight in Design Mode
  const addCartBtn = page.locator('button[data-testid="pdp-add-to-cart"]');
  await addCartBtn.click();

  // 1. Viewport screenshot (Hero section + Design Mode dock)
  const heroPath = path.join(ARTIFACT_DIR, 'pdp-desktop-hero.png');
  await page.screenshot({ path: heroPath });
  console.log('Hero screenshot:', heroPath);

  // 2. Full-page screenshot showing the entire scrollable PDP
  const fullPath = path.join(ARTIFACT_DIR, 'pdp-desktop-fullpage.png');
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log('Full-page screenshot:', fullPath);

  await browser.close();
  console.log('Capture complete!');
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
