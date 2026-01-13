import type {
  BridgeMessage,
  HelloMessage,
  CommandMessage,
  CommandResultMessage,
  UiTreeMessage,
  StateUpdateMessage,
  ConsoleMessage,
  ErrorMessage,
  CliConfig,
  CapabilitiesMessage,
  DomSnapshotMessage,
  ScreenshotMessage,
  UiTreeItem,
} from 'debug-bridge-types';
import * as fs from 'fs';

export type OutputFormatter = {
  serverStarted: (config: CliConfig) => void;
  appConnected: (hello: HelloMessage) => void;
  appDisconnected: () => void;
  telemetry: (msg: BridgeMessage) => void;
  commandSent: (cmd: CommandMessage) => void;
  commandResult: (msg: CommandResultMessage) => void;
  info: (message: string) => void;
  uiTreeFormatted: (items: UiTreeItem[]) => void;
  findResults: (items: UiTreeItem[], query: string) => void;
};

export function createOutputFormatter(jsonMode: boolean): OutputFormatter {
  if (jsonMode) {
    return createJsonFormatter();
  }
  return createHumanFormatter();
}

function createJsonFormatter(): OutputFormatter {
  const out = (obj: object) => console.log(JSON.stringify(obj));

  return {
    serverStarted: (config) => {
      out({
        event: 'server_started',
        url: `ws://${config.host}:${config.port}/debug`,
        session: config.session,
      });
    },
    appConnected: (hello) => {
      out({
        event: 'app_connected',
        appName: hello.appName,
        appVersion: hello.appVersion,
        url: hello.url,
      });
    },
    appDisconnected: () => {
      out({ event: 'app_disconnected' });
    },
    telemetry: (msg) => {
      if (msg.type === 'ui_tree') {
        const uitree = msg as UiTreeMessage;
        out({
          event: 'telemetry',
          type: 'ui_tree',
          itemCount: uitree.items.length,
          items: uitree.items,
        });
      } else if (msg.type === 'state_update') {
        const state = msg as StateUpdateMessage;
        out({ event: 'telemetry', type: 'state_update', scope: state.scope, state: state.state });
      } else if (msg.type === 'console') {
        const consoleMsg = msg as ConsoleMessage;
        out({
          event: 'telemetry',
          type: 'console',
          level: consoleMsg.level,
          args: consoleMsg.args,
        });
      } else if (msg.type === 'error') {
        const errorMsg = msg as ErrorMessage;
        out({
          event: 'telemetry',
          type: 'error',
          message: errorMsg.message,
          stack: errorMsg.stack,
        });
      } else if (msg.type === 'dom_snapshot') {
        const snapshot = msg as DomSnapshotMessage;
        out({ event: 'telemetry', type: 'dom_snapshot', length: snapshot.html?.length ?? 0 });
      } else if (msg.type === 'screenshot') {
        const screenshot = msg as ScreenshotMessage;
        const filename = `screenshot-${Date.now()}.png`;
        if (screenshot.data) {
          const base64Data = screenshot.data.replace(/^data:image\/png;base64,/, '');
          fs.writeFileSync(filename, base64Data, 'base64');
        }
        out({
          event: 'telemetry',
          type: 'screenshot',
          width: screenshot.width,
          height: screenshot.height,
          file: screenshot.data ? filename : null,
        });
      } else if (msg.type === 'capabilities') {
        const caps = msg as CapabilitiesMessage;
        out({ event: 'telemetry', type: 'capabilities', capabilities: caps.capabilities });
      }
    },
    commandSent: (cmd) => {
      out({ event: 'command_sent', requestId: cmd.requestId, type: cmd.type });
    },
    commandResult: (msg) => {
      out({
        event: 'command_result',
        requestId: msg.requestId,
        success: msg.success,
        duration: msg.duration,
        ...(msg.result !== undefined && { result: msg.result }),
        ...(msg.error && { error: msg.error }),
      });
    },
    info: (message) => {
      out({ event: 'info', message });
    },
    uiTreeFormatted: (items) => {
      out({ event: 'ui_tree_formatted', items });
    },
    findResults: (items, query) => {
      out({ event: 'find_results', query, count: items.length, items });
    },
  };
}

function createHumanFormatter(): OutputFormatter {
  return {
    serverStarted: (config) => {
      console.log('\n🔌 Debug Bridge v0.1.0');
      console.log('━'.repeat(50));
      console.log(`Server: ws://${config.host}:${config.port}/debug`);
      console.log(`Session: ${config.session}`);
      console.log('━'.repeat(50));
      console.log('\nWaiting for app connection...');
      console.log('Type "help" for available commands.\n');
    },
    appConnected: (hello) => {
      console.log(`\n✓ Connected: ${hello.appName ?? 'Unknown App'} ${hello.appVersion ?? ''}`);
      console.log(`  URL: ${hello.url}`);
      console.log(`  Viewport: ${hello.viewport.width}x${hello.viewport.height}\n`);
    },
    appDisconnected: () => {
      console.log('\n✗ App disconnected\n');
    },
    telemetry: (msg) => {
      if (msg.type === 'ui_tree') {
        const uitree = msg as UiTreeMessage;
        console.log(`\n[ui_tree] ${uitree.items.length} elements`);
        formatUiTree(uitree.items);
      } else if (msg.type === 'state_update') {
        const state = msg as StateUpdateMessage;
        console.log(`[state] ${state.scope}:`, JSON.stringify(state.state).substring(0, 100));
      } else if (msg.type === 'console') {
        const consoleMsg = msg as ConsoleMessage;
        const level = consoleMsg.level;
        const prefix =
          level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'debug' ? '🔍' : '📝';
        console.log(`${prefix} [${level}]`, consoleMsg.args.slice(0, 2).join(' ').substring(0, 100));
      } else if (msg.type === 'error') {
        const errorMsg = msg as ErrorMessage;
        console.log(`❌ [error] ${errorMsg.message}`);
      } else if (msg.type === 'capabilities') {
        const caps = msg as CapabilitiesMessage;
        console.log(`[capabilities]`, caps.capabilities.join(', '));
      } else if (msg.type === 'dom_snapshot') {
        const snapshot = msg as DomSnapshotMessage;
        console.log(`[dom_snapshot] ${(snapshot.html?.length ?? 0).toLocaleString()} bytes`);
      } else if (msg.type === 'screenshot') {
        const screenshot = msg as ScreenshotMessage;
        if (screenshot.data) {
          const filename = `screenshot-${Date.now()}.png`;
          const base64Data = screenshot.data.replace(/^data:image\/png;base64,/, '');
          fs.writeFileSync(filename, base64Data, 'base64');
          console.log(`[screenshot] ${screenshot.width}x${screenshot.height} saved to ${filename}`);
        } else {
          console.log(`[screenshot] ${screenshot.width}x${screenshot.height} (capture failed)`);
        }
      }
    },
    commandSent: (cmd) => {
      const cmdType = cmd.type as string;
      // Don't log request commands, wait for response
      if (!cmdType.startsWith('request_')) {
        console.log(`→ ${cmdType}`);
      }
    },
    commandResult: (msg) => {
      if (msg.success) {
        console.log(`✓ ${msg.requestType} (${msg.duration}ms)`);
        // For evaluate commands, display the result on a separate line
        if (msg.requestType === 'evaluate' && msg.result !== undefined) {
          const resultStr =
            typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result, null, 2);
          console.log(`   → ${resultStr}`);
        } else if (msg.result !== undefined && msg.requestType !== 'evaluate') {
          // For other commands, show truncated result inline
          const resultStr =
            typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result);
          if (resultStr.length > 0) {
            console.log(`   → ${resultStr.substring(0, 100)}${resultStr.length > 100 ? '...' : ''}`);
          }
        }
      } else {
        console.log(`✗ ${msg.requestType} failed: ${msg.error?.message}`);
      }
    },
    info: (message) => {
      console.log(message);
    },
    uiTreeFormatted: (items) => {
      console.log(`\n[ui_tree] ${items.length} elements`);
      formatUiTree(items);
    },
    findResults: (items, query) => {
      if (items.length === 0) {
        console.log(`\nNo matches found for "${query}"`);
        console.log('Tip: Run "ui" first to refresh the element cache.');
        return;
      }
      console.log(`\nFound ${items.length} match${items.length === 1 ? '' : 'es'} for "${query}":`);
      formatUiTree(items);
    },
  };
}

function formatUiTree(items: UiTreeItem[]): void {
  if (items.length === 0) {
    console.log('  (no elements)');
    return;
  }

  items.forEach((item, i) => {
    const num = String(i + 1).padStart(2, ' ');
    const role = (item.role || 'element').padEnd(10);
    // Generate short alias from stableId for easier targeting
    const shortId = generateShortId(item.stableId, item.role);

    // Build description from available info
    let desc = '';
    if (item.text) {
      desc = `"${truncate(item.text, 30)}"`;
    } else if (item.label) {
      desc = `[${truncate(item.label, 30)}]`;
    } else if (item.meta?.placeholder) {
      desc = `placeholder: "${truncate(item.meta.placeholder, 25)}"`;
    } else if (item.meta?.type) {
      desc = `type: ${item.meta.type}`;
    } else if (item.meta?.href) {
      desc = `→ ${truncate(item.meta.href, 30)}`;
    }

    // Add visibility indicator
    const visibility = item.visible === false ? ' (hidden)' : '';

    console.log(`  ${num}. [${role}] ${shortId}  ${desc}${visibility}`);
  });
}

// Generate a short, usable ID alias from the full stableId
function generateShortId(stableId: string | undefined, role: string | undefined): string {
  if (!stableId) return '-';

  // Extract role prefix (first 3 chars of role, lowercase)
  const rolePrefix = (role || 'elm').substring(0, 3).toLowerCase();

  // Create hash from stableId for uniqueness
  const hash = simpleHash(stableId);

  return `${rolePrefix}-${hash}`;
}

// Simple hash function to create 6-char hex string from stableId
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex and take first 6 chars (ensure positive)
  return Math.abs(hash).toString(16).padStart(6, '0').substring(0, 6);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.substring(0, max - 1) + '…';
}
