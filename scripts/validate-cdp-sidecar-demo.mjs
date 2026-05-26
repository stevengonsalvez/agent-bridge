#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../packages/cli/dist/index.js';
import { createBrowserSidecar } from '../packages/browser-sidecar/dist/index.js';

const sessionId = process.env.DEBUG_BRIDGE_SESSION ?? `cdp-test-${Date.now()}`;
const port = Number(process.env.DEBUG_BRIDGE_PORT ?? 7925);
const appPort = Number(process.env.DEBUG_BRIDGE_APP_PORT ?? 9090);
const host = process.env.DEBUG_BRIDGE_HOST ?? '127.0.0.1';
const profile =
  process.env.DEBUG_BRIDGE_PROFILE ??
  path.join(os.tmpdir(), `agent-bridge-cdp-profile-${sessionId}`);
const appUrl =
  process.env.DEBUG_BRIDGE_APP_URL ??
  `http://127.0.0.1:${appPort}/?session=${encodeURIComponent(sessionId)}&port=${port}`;
const wsUrl = `ws://${host}:${port}/debug?role=agent&sessionId=${encodeURIComponent(sessionId)}`;
const timeoutMs = 15000;
const results = [];
const messages = [];
const listeners = new Set();

if (!process.env.DEBUG_BRIDGE_PROFILE) {
  fs.rmSync(profile, { recursive: true, force: true });
}

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

function recordMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  messages.push(msg);
  for (const listener of listeners) listener(msg);
}

function waitFor(predicate, name, timeout = timeoutMs, sinceIndex = 0) {
  const found = messages.slice(sinceIndex).find(predicate);
  if (found) return Promise.resolve(found);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${name}`));
    }, timeout);

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

async function sendCommand(ws, payload, responseType = 'browser_result') {
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
    (msg) => msg.type === responseType && msg.requestId === requestId,
    `${payload.type}:${requestId}`
  );
}

async function connectAgent() {
  const ws = new WebSocket(wsUrl);
  ws.on('message', recordMessage);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  pass('agent-websocket-connected', wsUrl);
  return ws;
}

async function startSidecar() {
  const sidecar = createBrowserSidecar({
    host,
    port,
    sessionId,
    profile,
    mode: 'managed',
    headless: true,
  });
  await sidecar.start();
  return sidecar;
}

async function loginThroughComposedSession(ws) {
  const navigate = await sendCommand(ws, { type: 'browser_navigate', url: appUrl });
  assert(navigate.success === true, 'browser-navigate-success', appUrl);

  const appHello = await waitFor((msg) => msg.type === 'hello' && msg.appName === 'Sample React App', 'app hello');
  assert(appHello.url.includes(sessionId), 'app-provider-connected-after-cdp-navigation', appHello.url);

  const beforeLoginClick = messages.length;
  const clickLogin = await sendCommand(ws, { type: 'click', target: { stableId: 'login-link' } }, 'command_result');
  assert(clickLogin.success === true, 'app-click-login-success');
  await waitFor(
    (msg) => msg.type === 'navigation' && msg.url.includes('/login'),
    'app navigation login',
    timeoutMs,
    beforeLoginClick
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  const loginTree = await sendCommand(ws, { type: 'request_ui_tree' }, 'ui_tree');
  const loginTreeIds = loginTree.items?.map((item) => item.stableId).join(',') ?? '';
  assert(
    loginTree.items?.some((item) => item.stableId === 'email-input'),
    'app-login-ui-tree-ready',
    loginTreeIds
  );
  const typeEmail = await sendCommand(
    ws,
    { type: 'type', target: { stableId: 'email-input' }, text: 'sidecar@example.com', options: { clear: true } },
    'command_result'
  );
  assert(typeEmail.success === true, 'app-type-email-success');
  const typePassword = await sendCommand(
    ws,
    { type: 'type', target: { stableId: 'password-input' }, text: 'persist-me', options: { clear: true } },
    'command_result'
  );
  assert(typePassword.success === true, 'app-type-password-success');
  const beforeSubmit = messages.length;
  const submit = await sendCommand(
    ws,
    { type: 'evaluate', code: `document.querySelector('[data-testid="submit-btn"]').click(); 'submitted'` },
    'command_result'
  );
  assert(submit.success === true, 'app-submit-login-success');
  const auth = await waitFor(
    (msg) => msg.type === 'state_update' && msg.scope === 'auth' && msg.state?.email === 'sidecar@example.com',
    'auth state after sidecar login',
    timeoutMs,
    beforeSubmit
  );
  assert(auth.state.isLoggedIn === true, 'composed-app-command-routing-login');
}

async function validateBrowserCommands(ws) {
  const targets = await sendCommand(ws, { type: 'browser_get_targets' });
  assert(targets.success === true && targets.result?.targets?.length >= 1, 'browser-targets-returned');
  const selected = targets.result.targets.find((target) => target.selected) ?? targets.result.targets[0];

  const select = await sendCommand(ws, { type: 'browser_select_target', targetId: selected.targetId });
  assert(select.success === true, 'browser-select-target-success', selected.targetId);

  const storage = await sendCommand(ws, { type: 'browser_get_storage' });
  assert(storage.success === true, 'browser-storage-returned');
  assert(
    JSON.stringify(storage.result?.localStorage ?? {}).includes('sidecar@example.com'),
    'browser-storage-has-persisted-auth'
  );

  const cookie = await sendCommand(ws, {
    type: 'browser_set_cookie',
    cookie: {
      name: 'agent_bridge_validation',
      value: 'secret-cookie-value',
      domain: '127.0.0.1',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  });
  assert(cookie.success === true, 'browser-set-cookie-success');

  const cookies = await sendCommand(ws, { type: 'browser_get_cookies' });
  const validationCookie = cookies.result?.cookies?.find((item) => item.name === 'agent_bridge_validation');
  assert(Boolean(validationCookie), 'browser-cookie-metadata-returned');
  assert(!('value' in validationCookie) || validationCookie.value === undefined, 'browser-cookie-value-redacted');

  const screenshot = await sendCommand(ws, { type: 'browser_screenshot' });
  assert(screenshot.success === true, 'browser-screenshot-success');
  assert(String(screenshot.result?.data ?? '').startsWith('data:image/png;base64,'), 'browser-screenshot-data-url');

  const response = await waitFor(
    (msg) => msg.type === 'browser_network_response' && msg.status === 200 && msg.url.includes(`:${appPort}/`),
    'cdp network response'
  );
  assert(Boolean(response.requestId), 'browser-network-response-captured', response.url);

  const body = await sendCommand(ws, {
    type: 'browser_network_get_response_body',
    networkRequestId: response.requestId,
  });
  assert(body.success === true, 'browser-network-response-body-success');
  assert(typeof body.result?.body === 'string', 'browser-network-response-body-string');
}

async function main() {
  const server = startServer(
    { port, host, session: sessionId, json: true, cdp: true, browser: 'managed', profile, headless: true },
    {
      onAppConnected: () => {},
      onAppDisconnected: () => {},
      onTelemetry: () => {},
      onCommandResult: () => {},
    }
  );

  const ws = await connectAgent();
  let sidecar = await startSidecar();

  const provider = await waitFor((msg) => msg.type === 'provider_hello' && msg.providerType === 'cdp', 'provider hello');
  assert(provider.capabilities.includes('browser_network'), 'provider-capability-browser-network');
  assert(provider.capabilities.includes('browser_cookies'), 'provider-capability-browser-cookies');
  await waitFor((msg) => msg.type === 'provider_lifecycle' && msg.state === 'connected', 'provider connected');
  pass('provider-lifecycle-connected');

  await loginThroughComposedSession(ws);
  await validateBrowserCommands(ws);

  await sidecar.stop();
  await waitFor((msg) => msg.type === 'connection_event' && msg.event === 'provider_disconnected', 'provider disconnected');
  pass('provider-stopped-for-profile-restart');

  messages.length = 0;
  sidecar = await startSidecar();
  await waitFor((msg) => msg.type === 'provider_hello' && msg.providerType === 'cdp', 'provider hello after restart');
  await sendCommand(ws, { type: 'browser_navigate', url: appUrl });
  const restoredAuth = await waitFor(
    (msg) => msg.type === 'state_update' && msg.scope === 'auth' && msg.state?.email === 'sidecar@example.com',
    'restored auth after sidecar restart'
  );
  assert(restoredAuth.state.isLoggedIn === true, 'persistent-profile-restored-login-after-restart');

  await sidecar.stop();
  ws.close();
  server.close();

  if (!process.env.DEBUG_BRIDGE_PROFILE) {
    fs.rmSync(profile, { recursive: true, force: true });
  }

  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, checks: results.length, failed }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  fail('cdp-sidecar-validation', error instanceof Error ? error.stack ?? error.message : String(error));
  console.log(JSON.stringify({ ok: false, checks: results.length, failed: results.filter((result) => !result.ok) }, null, 2));
  process.exit(1);
});
