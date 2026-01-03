import * as readline from 'readline';
import type { CommandMessage, UiTreeItem } from '@debug-bridge/types';
import { PROTOCOL_VERSION } from '@debug-bridge/types';

// Cached UI tree for local find command
let cachedUiTree: UiTreeItem[] = [];

export function updateCachedUiTree(items: UiTreeItem[]): void {
  cachedUiTree = items;
}

export function getCachedUiTree(): UiTreeItem[] {
  return cachedUiTree;
}

type LocalCommandResult = {
  type: 'help' | 'find' | 'clear';
  data?: unknown;
  query?: string;
};

export function setupStdinHandler(
  jsonMode: boolean,
  onCommand: (cmd: CommandMessage) => void,
  onLocalCommand?: (result: LocalCommandResult) => void
): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !jsonMode,
    prompt: jsonMode ? '' : 'debug> ',
  });

  if (!jsonMode) {
    rl.prompt();
  }

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (!jsonMode) rl.prompt();
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);

      const cmd: CommandMessage = {
        protocolVersion: PROTOCOL_VERSION,
        sessionId: 'default',
        timestamp: Date.now(),
        requestId: parsed.requestId || `cmd-${Date.now()}`,
        ...parsed,
      };

      onCommand(cmd);
    } catch {
      if (!jsonMode) {
        const result = parseCommand(trimmed);
        if (result.type === 'remote' && result.cmd) {
          onCommand(result.cmd);
        } else if (result.type === 'local' && result.local) {
          onLocalCommand?.(result.local);
        } else {
          printHelp();
        }
      }
    }

    if (!jsonMode) rl.prompt();
  });
}

type ParseResult =
  | { type: 'remote'; cmd: CommandMessage }
  | { type: 'local'; local: LocalCommandResult }
  | { type: 'invalid' };

function parseCommand(input: string): ParseResult {
  const parts = input.split(/\s+/);
  const command = parts[0]?.toLowerCase();

  const base = {
    protocolVersion: PROTOCOL_VERSION as 1,
    sessionId: 'default',
    timestamp: Date.now(),
    requestId: `cmd-${Date.now()}`,
  };

  switch (command) {
    // Local commands (handled in CLI, not sent to app)
    case 'help':
    case '?':
      return { type: 'local', local: { type: 'help' } };

    case 'clear':
    case 'cls':
      return { type: 'local', local: { type: 'clear' } };

    case 'find':
    case 'search': {
      const query = parts.slice(1).join(' ').toLowerCase();
      if (!query) {
        console.log('Usage: find <query>');
        return { type: 'invalid' };
      }
      const matches = cachedUiTree.filter(
        (item) =>
          item.stableId?.toLowerCase().includes(query) ||
          item.text?.toLowerCase().includes(query) ||
          item.label?.toLowerCase().includes(query) ||
          item.meta?.placeholder?.toLowerCase().includes(query) ||
          item.meta?.name?.toLowerCase().includes(query) ||
          item.role?.toLowerCase().includes(query)
      );
      return { type: 'local', local: { type: 'find', data: matches, query } };
    }

    // Remote commands (sent to app)
    case 'ui':
    case 'tree':
      return { type: 'remote', cmd: { ...base, type: 'request_ui_tree' } };

    case 'click':
      if (parts[1]) {
        return {
          type: 'remote',
          cmd: { ...base, type: 'click', target: { stableId: parts[1] } },
        };
      }
      console.log('Usage: click <stableId>');
      return { type: 'invalid' };

    case 'type':
      if (parts[1] && parts[2]) {
        return {
          type: 'remote',
          cmd: {
            ...base,
            type: 'type',
            target: { stableId: parts[1] },
            text: parts.slice(2).join(' '),
          },
        };
      }
      console.log('Usage: type <stableId> <text>');
      return { type: 'invalid' };

    case 'eval':
    case 'js': {
      const code = parts.slice(1).join(' ');
      if (code) {
        return {
          type: 'remote',
          cmd: { ...base, type: 'evaluate', code },
        };
      }
      console.log('Usage: eval <javascript code>');
      return { type: 'invalid' };
    }

    case 'snapshot':
    case 'dom':
      return { type: 'remote', cmd: { ...base, type: 'request_dom_snapshot' } };

    case 'screenshot':
    case 'ss':
      return { type: 'remote', cmd: { ...base, type: 'request_screenshot' } };

    case 'state':
      return { type: 'remote', cmd: { ...base, type: 'request_state', scope: parts[1] } };

    case 'navigate':
    case 'goto':
    case 'go':
      if (parts[1]) {
        return { type: 'remote', cmd: { ...base, type: 'navigate', url: parts[1] } };
      }
      console.log('Usage: navigate <url>');
      return { type: 'invalid' };

    case 'focus':
      if (parts[1]) {
        return {
          type: 'remote',
          cmd: { ...base, type: 'focus', target: { stableId: parts[1] } },
        };
      }
      console.log('Usage: focus <stableId>');
      return { type: 'invalid' };

    case 'scroll':
      return {
        type: 'remote',
        cmd: {
          ...base,
          type: 'scroll',
          x: parseInt(parts[1] || '0', 10),
          y: parseInt(parts[2] || '0', 10),
        },
      };

    default:
      return { type: 'invalid' };
  }
}

function printHelp(): void {
  console.log(`
Commands:
  ui              Request UI tree (interactive elements)
  find <query>    Search cached UI tree for matching elements
  click <id>      Click element by stableId
  type <id> <txt> Type text into element
  eval <code>     Execute JavaScript in browser
  snapshot        Get full DOM HTML
  screenshot      Capture viewport screenshot
  state [scope]   Get application state (cookies, localStorage, etc)
  navigate <url>  Navigate to URL
  focus <id>      Focus an element
  scroll <x> <y>  Scroll to position
  clear           Clear console
  help            Show this help

Aliases: tree=ui, js=eval, dom=snapshot, ss=screenshot, go=navigate, search=find, ?=help
`);
}
