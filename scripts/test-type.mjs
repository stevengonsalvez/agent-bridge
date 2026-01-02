#!/usr/bin/env node
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:4000/debug?role=agent&sessionId=shot-debug');
let uiTree = [];

ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    protocolVersion: 1,
    sessionId: 'shot-debug',
    timestamp: Date.now(),
    origin: 'agent',
    type: 'request_ui_tree',
    requestId: 'req-1'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'ui_tree') {
    uiTree = msg.items || [];
    console.log('UI Tree:', uiTree.length, 'elements');

    const inputs = uiTree.filter(el => el.meta?.tagName === 'input');
    console.log('\nInputs:');
    inputs.forEach((inp, i) => {
      console.log(`  ${i+1}. name=${inp.meta?.name}, type=${inp.meta?.type}`);
      console.log(`     selector: ${inp.selector?.substring(0, 80)}...`);
    });

    if (inputs[0]) {
      console.log('\n→ Typing in email input...');
      ws.send(JSON.stringify({
        protocolVersion: 1,
        sessionId: 'shot-debug',
        timestamp: Date.now(),
        origin: 'agent',
        type: 'type',
        requestId: 'req-2',
        target: { selector: 'input[name="email"]' },
        text: 'agent@test.com',
        options: { clear: true }
      }));
    }
  }

  if (msg.type === 'command_result') {
    const status = msg.success ? '✓' : '✗';
    console.log(`← ${msg.requestType} ${status} (${msg.duration}ms)`);
    if (!msg.success) console.log(`  Error: ${msg.error?.message}`);

    if (msg.requestId === 'req-2' && msg.success) {
      console.log('\n→ Verifying value...');
      ws.send(JSON.stringify({
        protocolVersion: 1,
        sessionId: 'shot-debug',
        timestamp: Date.now(),
        origin: 'agent',
        type: 'evaluate',
        requestId: 'req-3',
        code: 'document.querySelector("input[name=email]")?.value'
      }));
    }

    if (msg.requestId === 'req-3') {
      console.log(`\n✓ Email input value: "${msg.result}"`);
      console.log('\nType command working correctly!');
      ws.close();
      process.exit(0);
    }
  }
});

ws.on('error', (e) => console.error('Error:', e.message));
setTimeout(() => { ws.close(); process.exit(1); }, 10000);
