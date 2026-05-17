#!/usr/bin/env node
import { chromium } from 'playwright';
import WebSocket from 'ws';

const sessionId = process.env.DEBUG_BRIDGE_SESSION ?? 'test';
const port = Number(process.env.DEBUG_BRIDGE_PORT ?? 6925);
const appUrl =
  process.env.DEBUG_BRIDGE_APP_URL ??
  `http://127.0.0.1:9090/?session=${encodeURIComponent(sessionId)}&port=${port}`;
const wsUrl =
  process.env.DEBUG_BRIDGE_WS_URL ??
  `ws://127.0.0.1:${port}/debug?role=agent&sessionId=${encodeURIComponent(sessionId)}`;

const timeoutMs = 10000;
const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name} - ${detail}`);
}

function assert(condition, name, detail = '') {
  if (!condition) {
    fail(name, detail || 'assertion failed');
    throw new Error(`${name}: ${detail || 'assertion failed'}`);
  }
  pass(name, detail);
}

function waitFor(predicate, messages, name) {
  const found = messages.find(predicate);
  if (found) return Promise.resolve(found);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${name}`));
    }, timeoutMs);

    const onMessage = (msg) => {
      if (!predicate(msg)) return;
      cleanup();
      resolve(msg);
    };

    const cleanup = () => {
      clearTimeout(timer);
      listeners.delete(onMessage);
    };

    listeners.add(onMessage);
  });
}

const messages = [];
const listeners = new Set();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordMessage(raw) {
  const text = raw.toString();
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  messages.push(msg);
  for (const listener of listeners) listener(msg);
}

function send(ws, payload) {
  ws.send(
    JSON.stringify({
      protocolVersion: 1,
      sessionId,
      timestamp: Date.now(),
      requestId: `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...payload,
    })
  );
}

async function command(ws, payload, responsePredicate) {
  const requestId = `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  ws.send(
    JSON.stringify({
      protocolVersion: 1,
      sessionId,
      timestamp: Date.now(),
      requestId,
      ...payload,
    })
  );
  return await waitFor(
    (msg) => (responsePredicate ? responsePredicate(msg, requestId) : msg.type === 'command_result' && msg.requestId === requestId),
    messages,
    `${payload.type}:${requestId}`
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const ws = new WebSocket(wsUrl);
  ws.on('message', recordMessage);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  pass('agent-websocket-connected', wsUrl);

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  assert(page.url().includes('session=test'), 'app-loaded-with-session', page.url());

  const hello = await waitFor((msg) => msg.type === 'hello', messages, 'hello');
  assert(hello.appName === 'Sample React App', 'hello-app-name', hello.appName);

  const capabilities = await waitFor((msg) => msg.type === 'capabilities', messages, 'capabilities');
  for (const capability of ['ui_tree', 'dom_snapshot', 'console', 'errors', 'eval', 'custom_state', 'network', 'navigation']) {
    assert(capabilities.capabilities.includes(capability), `capability-${capability}`);
  }

  const initialStateScopes = new Set(messages.filter((msg) => msg.type === 'state_update').map((msg) => msg.scope));
  for (const scope of ['auth', 'cart', 'route']) {
    if (!initialStateScopes.has(scope)) await waitFor((msg) => msg.type === 'state_update' && msg.scope === scope, messages, `state:${scope}`);
    pass(`initial-state-${scope}`);
  }

  const uiTree = await command(ws, { type: 'request_ui_tree' }, (msg, requestId) => msg.type === 'ui_tree' && msg.requestId === requestId);
  const stableIds = new Set(uiTree.items.map((item) => item.stableId));
  for (const id of ['nav-home', 'nav-products', 'nav-cart', 'login-link']) {
    assert(stableIds.has(id), `ui-tree-has-${id}`);
  }

  await command(ws, { type: 'click', target: { stableId: 'login-link' } });
  await waitFor((msg) => msg.type === 'navigation' && msg.url.includes('/login'), messages, 'navigation-login');
  await delay(150);
  pass('click-login-navigated');

  const loginTree = await command(ws, { type: 'request_ui_tree' }, (msg, requestId) => msg.type === 'ui_tree' && msg.requestId === requestId);
  const loginIds = new Set(loginTree.items.map((item) => item.stableId));
  for (const id of ['email-input', 'password-input', 'submit-btn']) {
    assert(loginIds.has(id), `ui-tree-has-${id}`);
  }

  await command(ws, { type: 'type', target: { stableId: 'email-input' }, text: 'stevie@example.com', options: { clear: true } });
  await command(ws, { type: 'type', target: { stableId: 'password-input' }, text: 'secret-password', options: { clear: true } });
  const typedValues = await command(ws, {
    type: 'evaluate',
    code: `({
      email: document.querySelector('[data-testid="email-input"]')?.value,
      passwordLength: document.querySelector('[data-testid="password-input"]')?.value.length
    })`,
  });
  assert(typedValues.result?.email === 'stevie@example.com', 'type-command-email-value', JSON.stringify(typedValues.result));
  assert(typedValues.result?.passwordLength === 15, 'type-command-password-value', JSON.stringify(typedValues.result));

  await command(ws, {
    type: 'evaluate',
    code: `document.querySelector('[data-testid="submit-btn"]').click(); 'submitted'`,
  });
  const authState = await waitFor(
    (msg) => msg.type === 'state_update' && msg.scope === 'auth' && msg.state?.email === 'stevie@example.com',
    messages,
    'auth-state-after-login'
  );
  assert(authState.state.isLoggedIn === true, 'login-state-updated', JSON.stringify(authState.state));

  await command(ws, { type: 'click', target: { stableId: 'nav-products' } });
  await waitFor((msg) => msg.type === 'navigation' && msg.url.includes('/products'), messages, 'navigation-products');
  await delay(150);
  pass('click-products-navigated');

  const productsTree = await command(ws, { type: 'request_ui_tree' }, (msg, requestId) => msg.type === 'ui_tree' && msg.requestId === requestId);
  const productIds = new Set(productsTree.items.map((item) => item.stableId));
  for (const id of ['add-p1', 'add-p2', 'add-p3']) {
    assert(productIds.has(id), `ui-tree-has-${id}`);
  }

  await command(ws, { type: 'click', target: { stableId: 'add-p1' } });
  await command(ws, { type: 'click', target: { stableId: 'add-p2' } });
  const cartState = await waitFor(
    (msg) => msg.type === 'state_update' && msg.scope === 'cart' && msg.state?.items?.length === 2,
    messages,
    'cart-state-two-items'
  );
  assert(cartState.state.items.length === 2, 'cart-state-updated', JSON.stringify(cartState.state));

  await command(ws, { type: 'click', target: { stableId: 'nav-cart' } });
  await waitFor((msg) => msg.type === 'navigation' && msg.url.includes('/cart'), messages, 'navigation-cart');
  await delay(150);
  pass('click-cart-navigated');

  const stateMessagesBefore = messages.length;
  send(ws, { type: 'request_state' });
  await waitFor((msg) => messages.indexOf(msg) >= stateMessagesBefore && msg.type === 'state_update' && msg.scope === 'location', messages, 'location-state');
  await waitFor((msg) => messages.indexOf(msg) >= stateMessagesBefore && msg.type === 'state_update' && msg.scope === 'auth', messages, 'requested-auth-state');
  await waitFor((msg) => messages.indexOf(msg) >= stateMessagesBefore && msg.type === 'state_update' && msg.scope === 'cart', messages, 'requested-cart-state');
  pass('request-state-returned-browser-and-custom-scopes');

  await command(ws, { type: 'request_dom_snapshot' }, (msg, requestId) => msg.type === 'dom_snapshot' && msg.requestId === requestId);
  pass('dom-snapshot-returned');

  const screenshot = await command(ws, { type: 'request_screenshot' }, (msg, requestId) => msg.type === 'screenshot' && msg.requestId === requestId);
  assert(!screenshot.error, 'screenshot-no-error', screenshot.error ? JSON.stringify(screenshot.error) : '');
  assert(typeof screenshot.data === 'string' && screenshot.data.startsWith('data:image/png;base64,'), 'screenshot-data-url');

  await command(ws, { type: 'scroll', x: 0, y: 200 });
  await command(ws, { type: 'focus', target: { stableId: 'clear-cart' } });
  const focusResult = await command(ws, {
    type: 'evaluate',
    code: `document.activeElement?.getAttribute('data-testid')`,
  });
  assert(focusResult.result === 'clear-cart', 'focus-command-clear-cart', String(focusResult.result));

  await browser.close();
  ws.close();

  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, checks: results.length, failed }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
