#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';

const appPort = 8912;
const bridgePort = 4789;
const sessionId = 'sidecar-test-' + Date.now();
const children = new Set();

function spawnManaged(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  child.on('exit', () => children.delete(child));
  return child;
}

async function stopManaged(child) {
  if (!children.has(child) || child.killed) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((res) => child.once('exit', res)),
    delay(1000),
  ]);
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function waitForOutput(child, predicate, timeoutMs = 15000) {
  let buf = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup() && reject(new Error('Timeout waiting for output')), timeoutMs);
    const onData = (d) => {
      buf += d.toString();
      if (predicate(buf)) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
    };
    child.stdout.on('data', onData);
  });
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['packages/cli/dist/bin/cli.js', ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`CLI exit ${code}: ${stderr || stdout}`));
    });
  });
}

async function main() {
  console.log('Starting sample app on port', appPort);
  const app = spawnManaged('sample-app', 'pnpm', [
    '--filter',
    'sample-react-app',
    'dev',
    '--host',
    '127.0.0.1',
    '--port',
    String(appPort),
  ]);
  await waitForHttp(`http://127.0.0.1:${appPort}/`);

  console.log('Starting debug bridge on port', bridgePort);
  const bridge = spawnManaged('debug-bridge', 'node', [
    'packages/cli/dist/bin/cli.js',
    'connect',
    '--port',
    String(bridgePort),
    '--session',
    sessionId,
    '--host',
    'localhost',
    '--cdp',
    '--browser',
    'managed',
    '--headless',
    '--json',
  ]);
  await waitForOutput(bridge, (out) => out.includes('"event":"server_started"'));
  await delay(1000);

  const runBrowser = (subcmd, args = []) => {
    return runCli(['browser', subcmd, ...args, '--port', String(bridgePort), '--session', sessionId, '--json']);
  };

  // Test 1: browser open
  console.log('Testing: browser open');
  const openRes = await runBrowser('open', [`http://127.0.0.1:${appPort}/`]);
  const openJson = JSON.parse(openRes);
  if (!openJson.target || !openJson.target.url) throw new Error('Failed to open url: ' + openRes);
  console.log('PASS: browser open');

  // Test 2: browser snapshot -i
  console.log('Testing: browser snapshot -i');
  const snapRes = await runBrowser('snapshot', ['-i']);
  const snapJson = JSON.parse(snapRes);
  if (!Array.isArray(snapJson.elements) || snapJson.elements.length === 0) {
    throw new Error('Failed to get interactive snapshot: ' + snapRes);
  }
  console.log(`PASS: interactive snapshot returned ${snapJson.elements.length} elements`);
  const firstElem = snapJson.elements[0];
  console.log(`Element 0: ref=${firstElem.ref}, role=${firstElem.role}, text="${firstElem.text}"`);

  // Test 3: browser preview-patch (CSS injection)
  console.log('Testing: browser preview-patch CSS injection');
  const patchRes = await runBrowser('preview-patch', [
    '--css',
    'h1 { color: rgb(255, 0, 0) !important; font-size: 40px !important; }',
  ]);
  const patchJson = JSON.parse(patchRes);
  if (!patchJson.applied) throw new Error('Failed preview patch: ' + patchRes);
  console.log('PASS: preview patch applied');

  // Test 4: browser preview-patch clear
  console.log('Testing: browser preview-patch clear');
  const clearRes = await runBrowser('preview-patch', ['--clear']);
  const clearJson = JSON.parse(clearRes);
  if (!clearJson.cleared) throw new Error('Failed preview patch clear: ' + clearRes);
  console.log('PASS: preview patch cleared');

  // Test 5: browser design-mode enable
  console.log('Testing: browser design-mode enable');
  const dmEnableRes = await runBrowser('design-mode', ['enable']);
  const dmEnableJson = JSON.parse(dmEnableRes);
  if (!dmEnableJson.enabled || !dmEnableJson.snapshot) {
    throw new Error('Failed design mode enable: ' + dmEnableRes);
  }
  console.log('PASS: design mode enabled');

  // Test 6: browser design-mode disable
  console.log('Testing: browser design-mode disable');
  const dmDisableRes = await runBrowser('design-mode', ['disable']);
  const dmDisableJson = JSON.parse(dmDisableRes);
  if (dmDisableJson.enabled !== false) throw new Error('Failed design mode disable: ' + dmDisableRes);
  console.log('PASS: design mode disabled');

  // Test 7: browser click via @e handle
  console.log('Testing: browser click navigation');
  // Find a link or button in snapshot
  const linkElem = snapJson.elements.find((e) => e.role === 'a' && e.text.includes('Products'));
  if (linkElem) {
    console.log(`Clicking ${linkElem.ref} (${linkElem.text})`);
    const clickRes = await runBrowser('click', [linkElem.ref, '--snapshot-after']);
    const clickJson = JSON.parse(clickRes);
    if (!clickJson.clicked) throw new Error('Failed click: ' + clickRes);
    console.log('PASS: browser click with snapshot-after');
  }

  // Test 8: screenshot
  console.log('Testing: browser screenshot');
  const ssRes = await runBrowser('screenshot', ['--selector', 'header']);
  const ssJson = JSON.parse(ssRes);
  if (!ssJson.data || !ssJson.data.startsWith('data:image/')) {
    throw new Error('Failed screenshot: ' + ssRes);
  }
  console.log('PASS: browser element screenshot taken');

  console.log('\nAll browser sidecar tests passed cleanly!');
}

main()
  .catch((err) => {
    console.error('Test error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const child of children) {
      await stopManaged(child);
    }
    await delay(300);
    process.exit(process.exitCode ?? 0);
  });
