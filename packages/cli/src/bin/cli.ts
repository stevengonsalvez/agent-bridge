#!/usr/bin/env node
import { Command } from 'commander';
import { startServer } from '../server/websocket-server';
import { createOutputFormatter } from '../output/formatter';
import { setupStdinHandler } from '../input/stdin-handler';
import type { CliConfig } from '@debug-bridge/types';

const program = new Command();

program
  .name('debug-bridge')
  .description('Debug bridge CLI for connecting to web applications')
  .version('0.1.0');

program
  .command('connect')
  .description('Start server and connect to an app')
  .option('-p, --port <number>', 'Port to listen on', '4000')
  .option('-s, --session <string>', 'Session ID', 'default')
  .option('--json', 'Output JSON (for Claude Code)', false)
  .option('--host <string>', 'Host to bind to', 'localhost')
  .action(async (options) => {
    const config: CliConfig = {
      port: parseInt(options.port, 10),
      host: options.host,
      session: options.session,
      json: options.json,
    };

    const formatter = createOutputFormatter(config.json);

    formatter.serverStarted(config);

    const server = startServer(config, {
      onAppConnected: (hello) => {
        formatter.appConnected(hello);
      },
      onAppDisconnected: () => {
        formatter.appDisconnected();
      },
      onTelemetry: (msg) => {
        formatter.telemetry(msg);
      },
      onCommandResult: (msg) => {
        formatter.commandResult(msg);
      },
    });

    setupStdinHandler(config.json, (cmd) => {
      server.sendCommand(cmd);
      formatter.commandSent(cmd);
    });

    process.on('SIGINT', () => {
      formatter.info('Shutting down...');
      server.close();
      process.exit(0);
    });
  });

program.parse();
