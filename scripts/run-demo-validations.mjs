#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const appPort = Number(process.env.DEBUG_BRIDGE_APP_PORT ?? randomPort(8300, 8999));
const bridgePort = Number(process.env.DEBUG_BRIDGE_PORT ?? randomPort(4300, 4999));
const cdpPort = Number(process.env.DEBUG_BRIDGE_CDP_PORT ?? randomPort(5300, 5999));
const sessionId = process.env.DEBUG_BRIDGE_SESSION ?? 'test';

const children = new Set();

function randomPort(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function spawnManaged(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });
  child.on('exit', () => {
    children.delete(child);
  });

  return child;
}

async function waitForHttp(url, name, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server not ready yet.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${name}: ${url}`);
}

async function waitForOutput(child, predicate, name, timeoutMs = 15000) {
  let buffer = '';

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${name}`));
    }, timeoutMs);

    const onData = (chunk) => {
      buffer += chunk.toString();
      if (!predicate(buffer)) return;
      cleanup();
      resolve();
    };

    const onExit = (code) => {
      cleanup();
      reject(new Error(`${name} exited before ready with code ${code}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', onExit);
  });
}

async function run(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });

  const code = await new Promise((resolve) => {
    child.on('exit', resolve);
  });

  if (code !== 0) throw new Error(`${name} failed with exit code ${code}`);
}

async function main() {
  const app = spawnManaged('sample-react-app', 'pnpm', [
    '--filter',
    'sample-react-app',
    'dev',
    '--host',
    '127.0.0.1',
    '--port',
    String(appPort),
  ]);
  await waitForHttp(`http://127.0.0.1:${appPort}/`, 'sample React app');

  const bridge = spawnManaged('debug-bridge', 'node', [
    'packages/cli/dist/bin/cli.js',
    'connect',
    '--port',
    String(bridgePort),
    '--session',
    sessionId,
    '--host',
    'localhost',
    '--json',
  ]);
  await waitForOutput(bridge, (output) => output.includes('"event":"server_started"'), 'debug bridge server');

  await run('validate-debug-bridge-demo', 'node', ['scripts/validate-debug-bridge-demo.mjs'], {
    DEBUG_BRIDGE_SESSION: sessionId,
    DEBUG_BRIDGE_PORT: String(bridgePort),
    DEBUG_BRIDGE_WS_URL: `ws://localhost:${bridgePort}/debug?role=agent&sessionId=${encodeURIComponent(sessionId)}`,
    DEBUG_BRIDGE_APP_URL: `http://127.0.0.1:${appPort}/?session=${encodeURIComponent(sessionId)}&port=${bridgePort}`,
  });

  bridge.kill('SIGTERM');
  await delay(500);

  await run('validate-cdp-sidecar-demo', 'node', ['scripts/validate-cdp-sidecar-demo.mjs'], {
    DEBUG_BRIDGE_HOST: 'localhost',
    DEBUG_BRIDGE_APP_PORT: String(appPort),
    DEBUG_BRIDGE_PORT: String(cdpPort),
  });

  app.kill('SIGTERM');
  console.log(JSON.stringify({ ok: true, appPort, bridgePort, cdpPort }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
    await delay(500);
  });
