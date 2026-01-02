#!/usr/bin/env node
/**
 * Automated Login Test via Debug Bridge
 *
 * This script automatically:
 * 1. Launches browser with SHOT app
 * 2. Connects to debug bridge
 * 3. Navigates and logs in
 */

import { chromium } from 'playwright';
import WebSocket from 'ws';

const APP_URL = 'http://localhost:6001?session=shot-debug';
const DEBUG_BRIDGE_URL = 'ws://localhost:4000/debug?role=agent&sessionId=shot-debug';

let ws = null;
let browser = null;
let page = null;
let uiTree = [];
let pendingCommands = new Map();
let requestCounter = 0;

function log(msg, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  if (data) {
    console.log(`[${timestamp}] ${msg}`, typeof data === 'string' ? data : JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] ${msg}`);
  }
}

function generateRequestId() {
  return `req-${++requestCounter}`;
}

function sendCommand(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    const cmd = {
      protocolVersion: 1,
      sessionId: 'shot-debug',
      timestamp: Date.now(),
      origin: 'agent',
      type,
      requestId,
      ...payload
    };

    // For request_* commands, the response comes as the data type itself (not command_result)
    const isRequestCommand = type.startsWith('request_');
    pendingCommands.set(requestId, { resolve, reject, type, isRequestCommand });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingCommands.has(requestId)) {
        pendingCommands.delete(requestId);
        reject(new Error(`Command ${type} timed out`));
      }
    }, 10000);

    log(`→ ${type}`, payload.target?.stableId || payload.text || payload.url || '');
    ws.send(JSON.stringify(cmd));
  });
}

async function click(target) {
  return sendCommand('click', { target });
}

async function typeText(target, text, options = {}) {
  return sendCommand('type', { target, text, options });
}

async function navigate(url) {
  return sendCommand('navigate', { url });
}

async function requestUiTree() {
  return sendCommand('request_ui_tree');
}

async function waitForUiTree() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (uiTree.length > 0) {
        clearInterval(checkInterval);
        resolve(uiTree);
      }
    }, 500);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve(uiTree);
    }, 10000);
  });
}

function printUiTree() {
  console.log('\n=== UI TREE ===');
  uiTree.slice(0, 30).forEach((item, i) => {
    const text = item.text ? ` "${item.text.substring(0, 50)}"` : '';
    const label = item.label ? ` [${item.label}]` : '';
    const visible = item.visible ? '' : ' (hidden)';
    console.log(`${i}: [${item.role}] ${item.stableId}${text}${label}${visible}`);
  });
  if (uiTree.length > 30) {
    console.log(`... and ${uiTree.length - 30} more elements`);
  }
  console.log('===============\n');
}

function findElement(query) {
  const q = query.toLowerCase();
  return uiTree.find(item =>
    (item.stableId && item.stableId.toLowerCase().includes(q)) ||
    (item.text && item.text.toLowerCase().includes(q)) ||
    (item.label && item.label.toLowerCase().includes(q)) ||
    (item.meta?.placeholder && item.meta.placeholder.toLowerCase().includes(q))
  );
}

function findAllElements(query) {
  const q = query.toLowerCase();
  return uiTree.filter(item =>
    (item.stableId && item.stableId.toLowerCase().includes(q)) ||
    (item.text && item.text.toLowerCase().includes(q)) ||
    (item.label && item.label.toLowerCase().includes(q)) ||
    (item.meta?.placeholder && item.meta.placeholder.toLowerCase().includes(q))
  );
}

async function connectAgent() {
  return new Promise((resolve, reject) => {
    log('Connecting to debug bridge...');
    ws = new WebSocket(DEBUG_BRIDGE_URL);

    ws.on('open', () => {
      log('✓ Connected to debug bridge as agent');
      resolve();
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Check if this message resolves a pending request_* command
        if (msg.requestId && pendingCommands.has(msg.requestId)) {
          const pending = pendingCommands.get(msg.requestId);
          pendingCommands.delete(msg.requestId);
          pending.resolve(msg);
        }

        switch (msg.type) {
          case 'hello':
            log('← App connected:', msg.appName);
            break;
          case 'capabilities':
            log('← Capabilities:', msg.capabilities?.join(', '));
            break;
          case 'ui_tree':
            uiTree = msg.items || [];
            log(`← UI Tree: ${uiTree.length} elements`);
            break;
          case 'command_result':
            const pending = pendingCommands.get(msg.requestId);
            if (pending) {
              pendingCommands.delete(msg.requestId);
              if (msg.success) {
                pending.resolve(msg);
              } else {
                log(`✗ Command failed: ${msg.error?.message || 'Unknown error'}`);
                pending.reject(new Error(msg.error?.message || 'Command failed'));
              }
            }
            break;
          case 'console':
            if (msg.level === 'error' || msg.level === 'warn') {
              log(`← Console [${msg.level}]:`, msg.args?.[0]);
            }
            break;
          case 'error':
            log(`← Error: ${msg.message}`);
            break;
          case 'state_update':
            log(`← State [${msg.scope}]:`, JSON.stringify(msg.state));
            break;
          case 'connection_event':
            log(`← ${msg.event}`);
            break;
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      log('WebSocket error:', err.message);
      reject(err);
    });

    ws.on('close', () => {
      log('Disconnected from debug bridge');
    });
  });
}

async function launchBrowser() {
  log('Launching browser...');
  browser = await chromium.launch({
    headless: false,
    slowMo: 50
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  page = await context.newPage();

  log(`Navigating to ${APP_URL}`);
  await page.goto(APP_URL);
  await page.waitForTimeout(3000);
  log('✓ Browser ready');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function exploreAndLogin() {
  log('\n========== EXPLORING APP ==========\n');

  // Request initial UI tree
  await requestUiTree();
  await sleep(2000);

  printUiTree();

  // Use Playwright to navigate (keeps connection alive via SPA routing)
  log('Navigating to /login via Playwright...');
  await page.goto('http://localhost:6001/login?session=shot-debug');
  await page.waitForTimeout(3000);

  // Wait for reconnection
  log('Waiting for app to reconnect...');
  await sleep(2000);

  // Request updated UI tree
  await requestUiTree();
  await sleep(1000);
  printUiTree();

  // Use evaluate to find what's on the page
  log('Evaluating page content...');
  try {
    const evalResult = await sendCommand('evaluate', {
      code: `
        const inputs = document.querySelectorAll('input');
        const buttons = document.querySelectorAll('button');
        const forms = document.querySelectorAll('form');
        JSON.stringify({
          inputCount: inputs.length,
          inputs: Array.from(inputs).map(i => ({
            type: i.type,
            name: i.name,
            id: i.id,
            placeholder: i.placeholder,
            visible: getComputedStyle(i).display !== 'none'
          })),
          buttonCount: buttons.length,
          buttons: Array.from(buttons).slice(0, 5).map(b => b.textContent?.trim()),
          formCount: forms.length,
          url: window.location.pathname
        })
      `
    });
    log('Page content:', evalResult.result);
  } catch (e) {
    log('Evaluate failed:', e.message);
  }

  // Look for login/sign-in button
  log('Looking for login elements...');

  const loginButtons = findAllElements('login');
  const signInButtons = findAllElements('sign');
  const emailInputs = findAllElements('email');
  const passwordInputs = findAllElements('password');

  log(`Found: ${loginButtons.length} login buttons, ${signInButtons.length} sign-in buttons`);
  log(`Found: ${emailInputs.length} email inputs, ${passwordInputs.length} password inputs`);

  // Use Playwright to fill the login form since UI tree isn't capturing inputs
  log('\n========== FILLING LOGIN FORM VIA PLAYWRIGHT ==========\n');

  try {
    // Wait for email input and fill it
    log('Looking for email input...');
    const emailInput = await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: 5000 });
    if (emailInput) {
      log('Filling email: player1@test.com');
      await emailInput.fill('player1@test.com');
      await page.waitForTimeout(500);
    }

    // Fill password
    log('Looking for password input...');
    const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: 5000 });
    if (passwordInput) {
      log('Filling password: ********');
      await passwordInput.fill('password123');
      await page.waitForTimeout(500);
    }

    // Take screenshot before submit
    log('Taking screenshot...');
    await page.screenshot({ path: '/tmp/login-form-filled.png' });
    log('Screenshot saved to /tmp/login-form-filled.png');

    // Find and click submit button
    log('Looking for submit button...');
    const submitBtn = await page.waitForSelector('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Login")', { timeout: 5000 });
    if (submitBtn) {
      const btnText = await submitBtn.textContent();
      log(`Clicking submit button: "${btnText?.trim()}"`);
      await submitBtn.click();
      await page.waitForTimeout(3000);

      // Check if login succeeded by looking at URL or state
      const currentUrl = page.url();
      log(`Current URL after login: ${currentUrl}`);

      // Request updated state from debug bridge
      await requestUiTree();
      await sleep(1000);

      log('\n=== POST-LOGIN UI TREE ===');
      printUiTree();

      // Take post-login screenshot
      await page.screenshot({ path: '/tmp/post-login.png' });
      log('Post-login screenshot saved to /tmp/post-login.png');

      // Check auth state
      const authState = uiTree.find(el => el.text?.includes('Dashboard') || el.text?.includes('Welcome') || el.text?.includes('Logout'));
      if (authState || currentUrl.includes('dashboard') || !currentUrl.includes('login')) {
        log('✓ LOGIN SUCCESSFUL!');
      } else {
        log('⚠ Login may have failed - checking for error messages...');
        const errorEl = uiTree.find(el => el.text?.toLowerCase().includes('error') || el.text?.toLowerCase().includes('invalid'));
        if (errorEl) {
          log(`Error found: ${errorEl.text}`);
        }
      }
    }
  } catch (err) {
    log(`Error during login: ${err.message}`);
    await page.screenshot({ path: '/tmp/login-error.png' });
    log('Error screenshot saved to /tmp/login-error.png');
  }

  log('\n========== EXPLORATION COMPLETE ==========\n');
}

async function cleanup() {
  log('Cleaning up...');
  if (ws) ws.close();
  if (browser) await browser.close();
}

async function main() {
  try {
    await connectAgent();
    await launchBrowser();

    // Wait for app to connect
    await sleep(3000);

    await exploreAndLogin();

    // Keep running for a bit to see results
    log('Waiting 10 seconds before cleanup...');
    await sleep(10000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await cleanup();
  }
}

main();
