#!/usr/bin/env node
import { runFeedbackMcpServer } from '../server';

type CliOptions = {
  bridgeHost: string;
  bridgePort: number;
  sessionId: string;
  feedbackDir: string;
  wsUrl?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    bridgeHost: process.env.DEBUG_BRIDGE_HOST ?? 'localhost',
    bridgePort: Number(process.env.DEBUG_BRIDGE_PORT ?? 4000),
    sessionId: process.env.DEBUG_BRIDGE_SESSION ?? 'default',
    feedbackDir: process.env.DEBUG_BRIDGE_FEEDBACK_DIR ?? '.debug-bridge/feedback',
    wsUrl: process.env.DEBUG_BRIDGE_WS_URL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--bridge-host' && next) {
      options.bridgeHost = next;
      index += 1;
    } else if (arg === '--bridge-port' && next) {
      options.bridgePort = Number(next);
      index += 1;
    } else if (arg === '--session' && next) {
      options.sessionId = next;
      index += 1;
    } else if (arg === '--feedback-dir' && next) {
      options.feedbackDir = next;
      index += 1;
    } else if (arg === '--ws-url' && next) {
      options.wsUrl = next;
      index += 1;
    }
  }

  return options;
}

function printHelp(): void {
  console.error(`debug-bridge-feedback-mcp

Start the Agent Bridge UI feedback MCP server over stdio.

Options:
  --bridge-host <host>     Debug bridge host (default: localhost)
  --bridge-port <port>     Debug bridge port (default: 4000)
  --session <id>           Debug bridge session id (default: default)
  --feedback-dir <path>    Feedback artifact directory (default: .debug-bridge/feedback)
  --ws-url <url>           Full bridge WebSocket URL

Environment variables:
  DEBUG_BRIDGE_HOST
  DEBUG_BRIDGE_PORT
  DEBUG_BRIDGE_SESSION
  DEBUG_BRIDGE_FEEDBACK_DIR
  DEBUG_BRIDGE_WS_URL
`);
}

const options = parseArgs(process.argv.slice(2));

runFeedbackMcpServer(options).catch((error) => {
  console.error(error);
  process.exit(1);
});
