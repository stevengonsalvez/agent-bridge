#!/usr/bin/env node
import { spawn } from 'node:child_process';

const sessionId = process.env.DEBUG_BRIDGE_SESSION ?? 'test';
const port = Number(process.env.DEBUG_BRIDGE_PORT ?? 4000);
const feedbackDir = process.env.DEBUG_BRIDGE_FEEDBACK_DIR ?? '.debug-bridge/feedback';
const stdioCommand = 'node packages/feedback-mcp/dist/bin/feedback-mcp.js';
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

function runMcporter(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('mcporter', args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`mcporter exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function stdioArgs(extra = []) {
  return [
    '--stdio',
    stdioCommand,
    '--stdio-arg',
    '--bridge-port',
    '--stdio-arg',
    String(port),
    '--stdio-arg',
    '--session',
    '--stdio-arg',
    sessionId,
    '--stdio-arg',
    '--feedback-dir',
    '--stdio-arg',
    feedbackDir,
    '--cwd',
    process.cwd(),
    ...extra,
  ];
}

function parseMcporterToolJson(stdout) {
  const parsed = JSON.parse(stdout);
  const text = parsed.content?.find?.((item) => item.type === 'text')?.text;
  return text ? JSON.parse(text) : parsed;
}

async function main() {
  const listed = await runMcporter(['list', ...stdioArgs(['--schema', '--json'])]);
  const schema = JSON.parse(listed.stdout);
  const toolNames = new Set(schema.tools.map((tool) => tool.name));
  for (const tool of [
    'feedback_status',
    'list_feedback_batches',
    'read_feedback_batch',
    'wait_for_feedback_batch',
    'wait_for_feedback_decision',
    'set_feedback_overlay',
    'send_visual_suggestion',
  ]) {
    assert(toolNames.has(tool), `mcporter-tool-${tool}`);
  }

  const statusCall = await runMcporter([
    'call',
    ...stdioArgs(['--output', 'json']),
    'feedback_status',
  ]);
  const statusJson = parseMcporterToolJson(statusCall.stdout);
  assert(statusJson.connected === true, 'mcporter-feedback-status-connected', statusJson.wsUrl);

  const listCall = await runMcporter([
    'call',
    ...stdioArgs(['--output', 'json']),
    'list_feedback_batches',
    'limit:5',
  ]);
  const listJson = parseMcporterToolJson(listCall.stdout);
  assert(Array.isArray(listJson.batches), 'mcporter-list-feedback-batches', `${listJson.batches.length}`);

  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, checks: results.length, failed }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  console.log(JSON.stringify({ ok: false, checks: results.length, failed: results.filter((result) => !result.ok) }, null, 2));
  process.exit(1);
});
