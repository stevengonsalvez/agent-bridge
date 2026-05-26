#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
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
const feedbackRoot = path.resolve(process.env.DEBUG_BRIDGE_FEEDBACK_DIR ?? '.debug-bridge/feedback');
const timeoutMs = 15000;
const results = [];
const messages = [];
const listeners = new Set();

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
}

function assert(condition, name, detail = '') {
  if (!condition) {
    results.push({ name, ok: false, detail });
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

function waitForMessage(predicate, name, sinceIndex = 0) {
  const found = messages.slice(sinceIndex).find(predicate);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listeners.delete(onMessage);
      reject(new Error(`Timed out waiting for ${name}`));
    }, timeoutMs);
    const onMessage = (msg) => {
      if (!predicate(msg)) return;
      clearTimeout(timer);
      listeners.delete(onMessage);
      resolve(msg);
    };
    listeners.add(onMessage);
  });
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

async function clickTool(page, tool) {
  await page.locator(`[data-tool="${tool}"]`).click();
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  fs.rmSync(feedbackRoot, { recursive: true, force: true });

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
  await waitForMessage((msg) => msg.type === 'hello', 'hello');
  const caps = await waitForMessage((msg) => msg.type === 'capabilities', 'capabilities');
  assert(caps.capabilities.includes('ui_feedback'), 'capability-ui-feedback');

  send(ws, { type: 'ui_feedback_enable' });
  await page.locator('[data-feedback-toolbar]').waitFor();
  await page.locator('[data-feedback-panel]').waitFor();
  assert(await page.locator('[data-tab="Batch"]').isVisible(), 'overlay-open');
  await page.locator('[data-action="collapse"]').click();
  assert(await page.locator('[data-feedback-pill]').isVisible(), 'active-batch-pill');
  await page.locator('[data-feedback-pill]').click();

  await page.evaluate(() => console.warn('feedback telemetry validation'));

  await clickTool(page, 'rect');
  await drag(page, { x: 140, y: 170 }, { x: 430, y: 260 });
  pass('drawing-rect');
  await clickTool(page, 'highlight');
  await drag(page, { x: 150, y: 280 }, { x: 520, y: 335 });
  pass('drawing-highlight');
  await clickTool(page, 'arrow');
  await drag(page, { x: 540, y: 190 }, { x: 680, y: 250 });
  pass('drawing-arrow');
  await clickTool(page, 'pen');
  await drag(page, { x: 220, y: 360 }, { x: 360, y: 390 });
  pass('drawing-pen');
  page.once('dialog', (dialog) => dialog.accept('Move this block up'));
  await clickTool(page, 'text');
  await page.mouse.click(450, 380);
  pass('drawing-text');
  await page.locator('[data-comment]').fill('Home page visual correction.');

  await clickTool(page, 'interact');
  await page.locator('[data-testid="nav-products"]').click();
  await page.waitForURL(/\/products/);
  pass('interact-navigation-products');

  await clickTool(page, 'select');
  const productBox = await page.locator('[data-testid="product-p1"]').boundingBox();
  assert(Boolean(productBox), 'product-card-visible');
  await page.mouse.click(productBox.x + 30, productBox.y + 30);
  pass('source-hinted-component-selected');
  await page.locator('[data-comment]').fill('Product card needs stronger hierarchy.');
  await clickTool(page, 'rect');
  await drag(page, { x: productBox.x + 10, y: productBox.y + 10 }, { x: productBox.x + 260, y: productBox.y + 150 });

  const beforeSubmit = messages.length;
  await page.locator('[data-action="submit"]').click();
  const created = await waitForMessage((msg) => msg.type === 'ui_feedback_batch_created', 'feedback batch created', beforeSubmit);
  pass('compact-event', created.batchId);

  const batchPath = path.resolve(created.batchPath);
  const summaryPath = path.resolve(created.summaryPath);
  assert(fs.existsSync(batchPath), 'artifact-batch-json', batchPath);
  assert(fs.existsSync(summaryPath), 'artifact-summary-md', summaryPath);
  const batch = readJson(batchPath);
  assert(batch.items.length === 2, 'batch-two-routes');
  assert(new Set(batch.items.map((item) => item.route.pathname)).size >= 2, 'batch-distinct-routes');
  assert(batch.git && typeof batch.git.dirty === 'boolean', 'git-metadata-captured');

  const markTypes = new Set(batch.items.flatMap((item) => item.marks.map((mark) => mark.type)));
  for (const type of ['rect', 'highlight', 'arrow', 'pen', 'text']) {
    assert(markTypes.has(type), `mark-${type}-persisted`);
  }
  assert(batch.items.some((item) => item.comment.includes('visual correction')), 'comments-stored');
  assert(batch.items.some((item) => item.sourceHints?.component === 'ProductCard'), 'source-hints-captured');
  assert(batch.items.some((item) => item.telemetry?.console?.length > 0), 'telemetry-captured');

  for (const item of batch.items) {
    const itemPath = path.resolve(created.artifactRoot, 'items', item.id, 'item.json');
    assert(fs.existsSync(itemPath), 'artifact-item-json', item.id);
    assert(fs.existsSync(path.resolve(item.screenshot.path)), 'artifact-screenshot', item.screenshot.path);
    assert(fs.existsSync(path.resolve(item.annotated.path)), 'artifact-annotated', item.annotated.path);
  }

  const suggestionId = `sug_${Date.now()}`;
  const itemId = batch.items[0].id;
  send(ws, {
    type: 'ui_feedback_suggestion_added',
    batchId: batch.id,
    itemId,
    suggestion: {
      id: suggestionId,
      itemId,
      batchId: batch.id,
      createdAt: new Date().toISOString(),
      status: 'proposed',
      comment: 'Align this section with the product grid.',
      patchHint: 'Use the same left edge and vertical rhythm as product cards.',
      marks: [
        {
          id: `agent_mark_${Date.now()}`,
          type: 'arrow',
          author: 'agent',
          createdAt: new Date().toISOString(),
          color: '#16a34a',
          strokeWidth: 3,
          points: [
            { x: 300, y: 240 },
            { x: 420, y: 270 },
          ],
        },
      ],
    },
  });
  await page.locator(`[data-suggestion-card="${suggestionId}"]`).waitFor();
  pass('agent-suggestion-rendered');

  const beforeAccept = messages.length;
  page.once('dialog', (dialog) => dialog.accept('Accepted, align it.'));
  await page.locator(`[data-suggestion-id="${suggestionId}"][data-action="accept-suggestion"]`).click();
  await waitForMessage(
    (msg) => msg.type === 'ui_feedback_suggestion_decision' && msg.suggestionId === suggestionId && msg.status === 'accepted',
    'accepted suggestion event',
    beforeAccept
  );
  pass('suggestion-accepted');

  const rejectId = `sug_${Date.now()}_reject`;
  send(ws, {
    type: 'ui_feedback_suggestion_added',
    batchId: batch.id,
    itemId,
    suggestion: {
      id: rejectId,
      itemId,
      batchId: batch.id,
      createdAt: new Date().toISOString(),
      status: 'proposed',
      comment: 'Make it red.',
      marks: [],
    },
  });
  await page.locator(`[data-suggestion-card="${rejectId}"]`).waitFor();
  const beforeReject = messages.length;
  page.once('dialog', (dialog) => dialog.accept('Rejecting color-only change.'));
  await page.locator(`[data-suggestion-id="${rejectId}"][data-action="reject-suggestion"]`).click();
  await waitForMessage(
    (msg) => msg.type === 'ui_feedback_suggestion_decision' && msg.suggestionId === rejectId && msg.status === 'rejected',
    'rejected suggestion event',
    beforeReject
  );
  const persistedAfterDecision = readJson(batchPath);
  assert(
    persistedAfterDecision.items.some((item) =>
      item.suggestions.some((suggestion) => suggestion.id === suggestionId && suggestion.status === 'accepted')
    ),
    'suggestion-accepted-persisted'
  );
  assert(
    persistedAfterDecision.items.some((item) =>
      item.suggestions.some((suggestion) => suggestion.id === rejectId && suggestion.status === 'rejected')
    ),
    'suggestion-rejected'
  );

  await browser.close();
  ws.close();
  fs.rmSync(feedbackRoot, { recursive: true, force: true });

  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, checks: results.length, failed }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  console.log(JSON.stringify({ ok: false, checks: results.length, failed: results.filter((result) => !result.ok) }, null, 2));
  process.exit(1);
});
