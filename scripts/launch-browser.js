// Minimal script to launch browser with debug bridge connected
// All actual testing happens via the debug-bridge CLI
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate to app with debug bridge params
  await page.goto('http://localhost:3000?session=test&port=4000');

  console.log('Browser launched. Use debug-bridge CLI to interact.');
  console.log('Press Ctrl+C to close browser.');

  // Keep browser open
  await new Promise(() => {});
})();
