#!/usr/bin/env node
import { Command } from 'commander';
import { startServer } from '../server/websocket-server';
import { createOutputFormatter } from '../output/formatter';
import { setupStdinHandler, updateCachedUiTree } from '../input/stdin-handler';
import type { CliConfig, UiTreeMessage, UiTreeItem } from '@debug-bridge/types';

function printHelp(): void {
  console.log(`
Commands:
  ui              Request UI tree (interactive elements)
  find <query>    Search cached UI tree for matching elements
  click <id>      Click element by stableId
  type <id> <txt> Type text into element
  eval <code>     Execute JavaScript in browser
  snapshot        Get full DOM HTML
  state [scope]   Get application state
  navigate <url>  Navigate to URL
  focus <id>      Focus an element
  scroll <x> <y>  Scroll to position
  clear           Clear console
  help            Show this help

Aliases: tree=ui, js=eval, dom=snapshot, go=navigate, search=find, ?=help
`);
}

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
        // Cache UI tree for local find command
        if (msg.type === 'ui_tree') {
          const uiTreeMsg = msg as UiTreeMessage;
          updateCachedUiTree(uiTreeMsg.items);
        }
        formatter.telemetry(msg);
      },
      onCommandResult: (msg) => {
        formatter.commandResult(msg);
      },
    });

    setupStdinHandler(
      config.json,
      (cmd) => {
        server.sendCommand(cmd);
        formatter.commandSent(cmd);
      },
      (local) => {
        // Handle local commands
        switch (local.type) {
          case 'help':
            printHelp();
            break;
          case 'clear':
            console.clear();
            break;
          case 'find':
            formatter.findResults(local.data as UiTreeItem[], local.query || '');
            break;
        }
      }
    );

    process.on('SIGINT', () => {
      formatter.info('\nShutting down...');
      server.close();
      process.exit(0);
    });
  });

program.parse();
