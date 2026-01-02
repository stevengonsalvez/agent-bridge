#!/usr/bin/env node
/**
 * Quick test for Shadow DOM traversal in UI tree
 */

import { chromium } from 'playwright';
import WebSocket from 'ws';

const APP_URL = 'http://localhost:5173/login?session=shot-debug';
const DEBUG_BRIDGE_URL = 'ws://localhost:4000/debug?role=agent&sessionId=shot-debug';

let ws = null;
let browser = null;
let page = null;
let uiTree = [];

function log(msg, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  if (data) {
    console.log(`[${timestamp}] ${msg}`, typeof data === 'string' ? data : JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] ${msg}`);
  }
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

        if (msg.type === 'ui_tree') {
          uiTree = msg.items || [];
          log(`← UI Tree: ${uiTree.length} elements`);
        } else if (msg.type === 'hello') {
          log('← App connected:', msg.appName);
        } else if (msg.type === 'connection_event') {
          log(`← ${msg.event}`);
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      log('WebSocket error:', err.message);
      reject(err);
    });
  });
}

async function sendCommand(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = `req-${Date.now()}`;
    const cmd = {
      protocolVersion: 1,
      sessionId: 'shot-debug',
      timestamp: Date.now(),
      origin: 'agent',
      type,
      requestId,
      ...payload
    };

    // Listen for response
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.requestId === requestId || msg.type === 'ui_tree') {
          ws.off('message', handler);
          resolve(msg);
        }
      } catch (e) {}
    };
    ws.on('message', handler);

    // Timeout after 10 seconds
    setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Command ${type} timed out`));
    }, 10000);

    log(`→ ${type}`);
    ws.send(JSON.stringify(cmd));
  });
}

async function main() {
  try {
    // Connect agent first
    await connectAgent();

    // Launch browser
    log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    // Navigate to login page
    log(`Navigating to ${APP_URL}`);
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);

    // Request UI tree
    log('\n=== Requesting UI Tree ===');
    await sendCommand('request_ui_tree');
    await new Promise(r => setTimeout(r, 2000));

    // Print UI tree focusing on inputs
    console.log('\n=== UI TREE (looking for inputs) ===');
    const inputs = uiTree.filter(item =>
      item.role === 'input' ||
      item.meta?.tagName === 'input' ||
      item.meta?.type === 'email' ||
      item.meta?.type === 'password'
    );

    if (inputs.length > 0) {
      console.log(`✓ FOUND ${inputs.length} INPUT ELEMENTS:`);
      inputs.forEach((input, i) => {
        console.log(`  ${i+1}. [${input.role}] stableId="${input.stableId}"`);
        console.log(`     type=${input.meta?.type}, name=${input.meta?.name}, placeholder="${input.meta?.placeholder}"`);
      });
    } else {
      console.log('✗ NO INPUT ELEMENTS FOUND');
      console.log('\nAll elements in UI tree:');
      uiTree.slice(0, 20).forEach((item, i) => {
        console.log(`  ${i}: [${item.role}] ${item.stableId} "${item.text?.substring(0, 30) || ''}"`);
      });
    }

    // Also try using evaluate to compare
    log('\n=== Comparing with evaluate ===');
    const evalResult = await sendCommand('evaluate', {
      code: `
        const inputs = document.querySelectorAll('input');
        JSON.stringify({
          documentInputCount: inputs.length,
          inputs: Array.from(inputs).map(i => ({
            type: i.type,
            name: i.name,
            placeholder: i.placeholder
          }))
        })
      `
    });

    if (evalResult.result) {
      const parsed = JSON.parse(evalResult.result);
      console.log(`Document.querySelectorAll found: ${parsed.documentInputCount} inputs`);
      if (parsed.documentInputCount > 0) {
        parsed.inputs.forEach((inp, i) => {
          console.log(`  ${i+1}. type=${inp.type}, name=${inp.name}, placeholder="${inp.placeholder}"`);
        });
      }
    }

    console.log('\n=== TEST COMPLETE ===');
    if (inputs.length > 0) {
      console.log('✓ Shadow DOM traversal is working! Inputs are captured in UI tree.');
    } else {
      console.log('✗ Inputs still not captured - further investigation needed.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (ws) ws.close();
    if (browser) await browser.close();
  }
}

main();
