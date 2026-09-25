#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import WebSocket from 'ws';

const port = Number(process.env.DEBUG_BRIDGE_PORT || 4000);
const feedbackDir = path.resolve(process.cwd(), process.env.DEBUG_BRIDGE_FEEDBACK_DIR || '.debug-bridge/feedback');
const processedFile = path.resolve(feedbackDir, '..', '.processed_batches.json');
const artifactDir = process.env.ARTIFACT_DIR || '/Users/stevengonsalvez/.gemini/antigravity-cli/brain/27b1b9ef-961c-474b-aa18-7c1fbe4a3d47';
const timeoutMs = Number(process.env.WATCH_TIMEOUT_MS || 1200000); // 20 minutes

// 1. Load already processed batches
let processedBatches = new Set();
if (fs.existsSync(processedFile)) {
  try {
    const raw = JSON.parse(fs.readFileSync(processedFile, 'utf8'));
    if (Array.isArray(raw)) {
      processedBatches = new Set(raw);
    }
  } catch {}
}

function saveProcessedBatch(batchId) {
  processedBatches.add(batchId);
  try {
    fs.writeFileSync(processedFile, JSON.stringify(Array.from(processedBatches), null, 2), 'utf8');
  } catch (err) {
    console.error(`[skill:watch-inbox] Failed to save ${processedFile}:`, err.message);
  }
}

let handled = false;

async function processBatch(batchId, sourceHint) {
  if (handled) return;
  handled = true;

  // Broadcast working status immediately so browser widget reflects agent is working
  try {
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const notifyScript = path.join(scriptDir, 'notify-status.mjs');
    execSync(`node "${notifyScript}" --status working --msg "Agent working on feedback..." --port ${port}`, { stdio: 'ignore' });
  } catch {}

  console.log(`\n================================================================================`);
  console.log(`🚨 DESIGN MODE FEEDBACK RECEIVED FOR AGENT PROCESSING! (${sourceHint})`);
  console.log(`================================================================================`);

  // Wait 350ms if newly written to ensure file flush
  await new Promise((resolve) => setTimeout(resolve, 350));

  const batchFolder = path.join(feedbackDir, batchId);
  const batchJsonPath = path.join(batchFolder, 'batch.json');
  const summaryPath = path.join(batchFolder, 'summary.md');

  let batchData = null;
  if (fs.existsSync(batchJsonPath)) {
    try {
      batchData = JSON.parse(fs.readFileSync(batchJsonPath, 'utf8'));
    } catch (e) {
      // ignore parse error
    }
  }

  let summaryContent = '';
  if (fs.existsSync(summaryPath)) {
    summaryContent = fs.readFileSync(summaryPath, 'utf8');
  }

  console.log(`Batch ID:   ${batchId}`);
  console.log(`App Name:   ${batchData?.appName || 'Web Application'}`);
  console.log(`Routes:     ${(batchData?.routes || ['unknown']).join(', ')}`);
  console.log(`Submitted:  ${batchData?.createdAt || new Date().toISOString()}`);

  const items = batchData?.items || [];
  if (items.length > 0) {
    console.log(`\nFeedback Items (${items.length}):`);
    items.forEach((item, index) => {
      console.log(`\n--- Item #${index + 1} (${item.id}) ---`);
      console.log(`  User Request:  "${item.comment || '(no comment)'}"`);
      console.log(`  Target Tag:    <${item.target?.tagName || 'unknown'}>`);
      console.log(`  CSS Selector:  ${item.target?.selector || '(none)'}`);
      console.log(`  XPath:         ${item.target?.xpath || '(none)'}`);
      console.log(`  Text Content:  "${(item.target?.textContent || '').trim()}"`);
      
      const sourceFile = item.sourceHints?.file || item.target?.sourceHints?.file;
      const sourceLine = item.sourceHints?.lineNumber || item.target?.sourceHints?.lineNumber;
      const comp = item.sourceHints?.component || item.target?.sourceHints?.component;
      if (comp || sourceFile) {
        console.log(`  Component:     ${comp || 'Unknown'} (${sourceFile || 'unknown'}:${sourceLine || '?'})`);
      }

      // Convert screenshot if webp
      const rawScreenshot = item.annotated?.path || item.screenshot?.path;
      if (rawScreenshot) {
        const absRaw = path.resolve(process.cwd(), rawScreenshot);
        if (fs.existsSync(absRaw)) {
          const destPng = path.join(artifactDir, `feedback-${batchId}-${item.id}.png`);
          try {
            execSync(`magick "${absRaw}" "${destPng}" 2>/dev/null || dwebp "${absRaw}" -o "${destPng}" 2>/dev/null`, { stdio: 'ignore' });
            const finalImg = fs.existsSync(destPng) ? destPng : absRaw;
            console.log(`  Screenshot:    file://${finalImg}`);
            console.log(`  Markdown link: [View Screenshot](file://${finalImg})`);
          } catch {
            console.log(`  Screenshot:    file://${absRaw}`);
            console.log(`  Markdown link: [View Screenshot](file://${absRaw})`);
          }
        }
      }
    });
  } else if (summaryContent) {
    console.log(`\nSummary:\n${summaryContent}`);
  }

  saveProcessedBatch(batchId);

  console.log(`\n================================================================================`);
  console.log(`[skill:watch-inbox] Feedback batch ${batchId} ready. Waking agent turn now.`);
  console.log(`================================================================================\n`);

  cleanup();
  process.exit(0);
}

// 2. Check for pending batches or start live listener
async function main() {
  if (fs.existsSync(feedbackDir)) {
    const dirs = fs.readdirSync(feedbackDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('fb_'))
      .map((d) => d.name)
      .sort();

    // Find latest pending batch
    for (let i = dirs.length - 1; i >= 0; i--) {
      const candidateId = dirs[i];
      if (!processedBatches.has(candidateId)) {
        const bJson = path.join(feedbackDir, candidateId, 'batch.json');
        if (fs.existsSync(bJson)) {
          try {
            const data = JSON.parse(fs.readFileSync(bJson, 'utf8'));
            if (data.status === 'submitted') {
              console.log(`[skill:watch-inbox] Found pending unprocessed batch: ${candidateId}`);
              await processBatch(candidateId, 'pending-queue');
              return;
            }
          } catch {}
        }
      }
    }
  }

  // If no pending batch found, start live listener
  startLiveWatcher();
}

// 3. Live Listener
function startLiveWatcher() {
  console.log(`[skill:watch-inbox] Monitoring ${feedbackDir} and ws://localhost:${port}/ws`);
  console.log(`[skill:watch-inbox] WAITING: submit feedback from browser to trigger reactive agent turn...`);

  // Watch directory
  if (fs.existsSync(feedbackDir)) {
    try {
      watcher = fs.watch(feedbackDir, (eventType, filename) => {
        if (filename && filename.startsWith('fb_') && !processedBatches.has(filename)) {
          processBatch(filename, 'fs.watch');
        }
      });
    } catch (err) {
      console.error(`[skill:watch-inbox] Failed to watch ${feedbackDir}:`, err.message);
    }
  }

  // Connect WebSocket client
  try {
    ws = new WebSocket(`ws://localhost:${port}/debug?sessionId=default&role=agent`);
    ws.on('error', (err) => {
      // ws connection error ignored, fs.watch is active
    });
    ws.on('open', () => {
      console.log(`[skill:watch-inbox] WebSocket connected to sidecar at ws://localhost:${port}/debug`);
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ui_feedback_batch_created' && msg.batchId) {
          if (!processedBatches.has(msg.batchId)) {
            processBatch(msg.batchId, 'WebSocket:ui_feedback_batch_created');
          }
        } else if (msg.type === 'browser_design_mode_submit') {
          if (!handled) {
            handled = true;
            console.log(`\n================================================================================`);
            console.log(`🚨 NEW CDP DESIGN MODE FEEDBACK RECEIVED FROM STEVIE!`);
            console.log(`================================================================================`);
            console.log(`Prompt:     "${msg.prompt}"`);
            console.log(`Target:     ${msg.targetId || 'active element'}`);
            console.log(`URL:        ${msg.url}`);
            if (msg.artifacts?.clean_screenshot_path) {
              console.log(`Screenshot: ${msg.artifacts.clean_screenshot_path}`);
            }
            console.log(`================================================================================\n`);
            cleanup();
            process.exit(0);
          }
        }
      } catch {}
    });
  } catch (err) {
    console.log(`[skill:watch-inbox] WebSocket init skipped: ${err.message}`);
  }

  // Timeout safety bound
  timer = setTimeout(() => {
    if (!handled) {
      console.log(`[skill:watch-inbox] Timeout reached (${timeoutMs}ms) with no submission.`);
      cleanup();
      process.exit(0);
    }
  }, timeoutMs);
}

let watcher = null;
let ws = null;
let timer = null;

main();

function cleanup() {
  clearTimeout(timer);
  if (watcher) {
    try { watcher.close(); } catch {}
  }
  if (ws) {
    try { ws.close(); } catch {}
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
