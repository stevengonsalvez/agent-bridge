#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sessionId = process.env.DEBUG_BRIDGE_SESSION ?? 'test';
const port = Number(process.env.DEBUG_BRIDGE_PORT ?? 6925);
const appUrl =
  process.env.DEBUG_BRIDGE_APP_URL ??
  `http://127.0.0.1:9090/?session=${encodeURIComponent(sessionId)}&port=${port}`;
const feedbackRoot = path.resolve(process.env.DEBUG_BRIDGE_FEEDBACK_DIR ?? '.debug-bridge/feedback');
const timeoutMs = 15000;
const results = [];

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

function structured(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === 'text')?.text;
  return text ? JSON.parse(text) : {};
}

async function main() {
  fs.rmSync(feedbackRoot, { recursive: true, force: true });

  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      'packages/feedback-mcp/dist/bin/feedback-mcp.js',
      '--bridge-port',
      String(port),
      '--session',
      sessionId,
      '--feedback-dir',
      path.relative(process.cwd(), feedbackRoot),
    ],
  });
  const client = new Client({ name: 'feedback-mcp-validation', version: '0.1.0' });
  await client.connect(transport);

  const status = structured(await client.callTool({ name: 'feedback_status', arguments: {} }));
  assert(status.connected === true, 'mcp-connected-to-bridge', status.wsUrl);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__debugBridge?.feedback), null, { timeout: timeoutMs });
  pass('sdk-feedback-api-present');

  await client.callTool({ name: 'set_feedback_overlay', arguments: { enabled: true } });
  await page.locator('[data-feedback-toolbar]').waitFor({ timeout: timeoutMs });
  pass('mcp-enabled-overlay');

  const waitForBatch = client.callTool({
    name: 'wait_for_feedback_batch',
    arguments: { timeoutMs },
  });

  const submitted = await page.evaluate(async () => {
    const bridge = window.__debugBridge;
    const feedback = bridge.feedback;
    feedback.enable();
    const item = feedback.getCurrentItem();
    feedback.updateCurrentComment('MCP validation feedback');
    feedback.addMark({
      id: `mcp_rect_${Date.now()}`,
      type: 'rect',
      author: 'user',
      createdAt: new Date().toISOString(),
      color: '#2563eb',
      strokeWidth: 3,
      bounds: { x: 160, y: 140, width: 420, height: 160 },
    });
    await feedback.submitBatch();
    return { batchId: item.batchId, itemId: item.id };
  });
  pass('sdk-submitted-feedback', `${submitted.batchId}/${submitted.itemId}`);

  const watched = structured(await waitForBatch);
  assert(watched.event?.batchId === submitted.batchId, 'mcp-watched-feedback-batch', watched.event?.batchId);
  assert(fs.existsSync(path.join(feedbackRoot, submitted.batchId, 'batch.json')), 'mcp-feedback-artifact-written');

  const read = structured(
    await client.callTool({
      name: 'read_feedback_batch',
      arguments: { batchId: submitted.batchId },
    })
  );
  assert(read.batch?.items?.[0]?.comment === 'MCP validation feedback', 'mcp-read-feedback-batch');

  const suggestion = structured(
    await client.callTool({
      name: 'send_visual_suggestion',
      arguments: {
        batchId: submitted.batchId,
        itemId: submitted.itemId,
        comment: 'MCP validation suggestion',
        patchHint: 'This suggestion came through the MCP watcher.',
      },
    })
  );
  assert(Boolean(suggestion.suggestion?.id), 'mcp-sent-visual-suggestion', suggestion.suggestion?.id);
  await page.locator(`[data-suggestion-card="${suggestion.suggestion.id}"]`).waitFor({ timeout: timeoutMs });
  pass('mcp-suggestion-rendered-in-overlay');

  page.once('dialog', (dialog) => dialog.accept('Accepted from MCP validation.'));
  await page.locator(`[data-suggestion-id="${suggestion.suggestion.id}"][data-action="accept-suggestion"]`).click();
  await page.waitForTimeout(500);
  const persisted = JSON.parse(fs.readFileSync(path.join(feedbackRoot, submitted.batchId, 'batch.json'), 'utf8'));
  assert(
    persisted.items.some((item) =>
      item.suggestions.some(
        (candidate) => candidate.id === suggestion.suggestion.id && candidate.status === 'accepted'
      )
    ),
    'mcp-suggestion-decision-persisted'
  );

  await browser.close();
  await client.close();
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
