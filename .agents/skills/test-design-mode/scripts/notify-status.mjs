#!/usr/bin/env node
import WebSocket from 'ws';

// Parse CLI arguments
// e.g. --status working|done|idle|error --msg "Applied styling" --port 4000
const args = process.argv.slice(2);
let status = 'done';
let message = '';
let port = Number(process.env.DEBUG_BRIDGE_PORT || 4000);

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--status' && args[i + 1]) {
    status = args[++i];
  } else if ((args[i] === '--msg' || args[i] === '--message') && args[i + 1]) {
    message = args[++i];
  } else if (args[i] === '--port' && args[i + 1]) {
    port = Number(args[++i]);
  }
}

if (!message) {
  if (status === 'working') message = 'Agent working on changes...';
  else if (status === 'done') message = 'Changes applied by Agent';
  else if (status === 'error') message = 'Agent encountered an error';
  else message = 'Agent ready';
}

const payload = {
  type: 'agent_status_update',
  status,
  message,
  timestamp: Date.now(),
};

const ws = new WebSocket(`ws://localhost:${port}/debug?sessionId=default&role=agent`);

const timeout = setTimeout(() => {
  console.log(`[notify-status] Timeout connecting to ws://localhost:${port}/ws`);
  try { ws.close(); } catch {}
  process.exit(0);
}, 2000);

ws.on('open', () => {
  ws.send(JSON.stringify(payload), (err) => {
    clearTimeout(timeout);
    if (err) {
      console.error('[notify-status] Failed to send message:', err.message);
    } else {
      console.log(`[notify-status] Broadcast status="${status}" msg="${message}" to app`);
    }
    setTimeout(() => {
      try { ws.close(); } catch {}
      process.exit(0);
    }, 60);
  });
});

ws.on('error', (err) => {
  clearTimeout(timeout);
  console.log(`[notify-status] WebSocket error (offline?): ${err.message}`);
  process.exit(0);
});
