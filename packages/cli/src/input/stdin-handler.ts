// ABOUTME: Handles stdin input for CLI, parsing commands and resolving element targets
// ABOUTME: Supports index-based, text-based, and stableId-based element targeting

import * as readline from 'readline';
import type { CommandMessage, UiTreeItem, ElementTarget } from 'debug-bridge-types';
import { PROTOCOL_VERSION } from 'debug-bridge-types';

// Cached UI tree for local find command and element resolution
let cachedUiTree: UiTreeItem[] = [];

export function updateCachedUiTree(items: UiTreeItem[]): void {
  cachedUiTree = items;
}

export function getCachedUiTree(): UiTreeItem[] {
  return cachedUiTree;
}

/**
 * Resolves an element target from various input formats:
 * - Index (1-based): "3" -> look up element #3 in cached UI tree
 * - Quoted text: '"Sign In"' -> search for element with matching text
 * - StableId: "button-abc123" -> use as-is (current behavior)
 *
 * Returns the resolved ElementTarget or throws an error if not found.
 */
function resolveTarget(arg: string): ElementTarget | { error: string } {
  // Check if it's a number (1-based index into cached UI tree)
  const index = parseInt(arg, 10);
  if (!isNaN(index) && arg === String(index)) {
    if (cachedUiTree.length === 0) {
      return { error: 'No UI tree cached. Run "ui" first to get elements.' };
    }
    if (index < 1 || index > cachedUiTree.length) {
      return { error: `Index ${index} out of range. Valid range: 1-${cachedUiTree.length}` };
    }
    const item = cachedUiTree[index - 1];
    return { stableId: item.stableId };
  }

  // Check if it's a quoted string (text-based search)
  const isDoubleQuoted = arg.startsWith('"') && arg.endsWith('"');
  const isSingleQuoted = arg.startsWith("'") && arg.endsWith("'");
  if ((isDoubleQuoted || isSingleQuoted) && arg.length >= 2) {
    const searchText = arg.slice(1, -1).toLowerCase();
    if (!searchText) {
      return { error: 'Empty search text provided.' };
    }
    if (cachedUiTree.length === 0) {
      return { error: 'No UI tree cached. Run "ui" first to get elements.' };
    }

    // Search for matching element by text, label, or placeholder
    const match = cachedUiTree.find(
      (item) =>
        item.text?.toLowerCase().includes(searchText) ||
        item.label?.toLowerCase().includes(searchText) ||
        item.meta?.placeholder?.toLowerCase().includes(searchText) ||
        item.meta?.name?.toLowerCase().includes(searchText)
    );

    if (match) {
      return { stableId: match.stableId };
    }
    return { error: `No element found matching text: "${searchText}"` };
  }

  // Default: treat as stableId
  return { stableId: arg };
}

/**
 * Parses a command argument that may include quoted strings.
 * Returns the target argument and remaining text separately.
 * Handles: click "Sign In", type "email" "test@example.com"
 */
function parseTargetAndText(parts: string[]): { target: string; text?: string } | null {
  if (parts.length < 2) return null;

  const restOfLine = parts.slice(1).join(' ');

  // Check if first argument is quoted
  if (restOfLine.startsWith('"') || restOfLine.startsWith("'")) {
    const quoteChar = restOfLine[0];
    const endQuote = restOfLine.indexOf(quoteChar, 1);
    if (endQuote === -1) {
      // Unclosed quote - treat entire rest as target
      return { target: restOfLine };
    }
    const target = restOfLine.slice(0, endQuote + 1);
    const remaining = restOfLine.slice(endQuote + 1).trim();
    return { target, text: remaining || undefined };
  }

  // Not quoted - first space-separated part is target
  return { target: parts[1], text: parts.slice(2).join(' ') || undefined };
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

    case 'click': {
      const parsed = parseTargetAndText(parts);
      if (parsed) {
        const resolved = resolveTarget(parsed.target);
        if ('error' in resolved) {
          console.log(`Error: ${resolved.error}`);
          return { type: 'invalid' };
        }
        return {
          type: 'remote',
          cmd: { ...base, type: 'click', target: resolved },
        };
      }
      console.log('Usage: click <target>');
      console.log('  target can be: stableId, index (1-based), or "text"');
      console.log('  Examples: click btn-123, click 3, click "Sign In"');
      return { type: 'invalid' };
    }

    case 'type': {
      const parsed = parseTargetAndText(parts);
      if (parsed && parsed.text) {
        const resolved = resolveTarget(parsed.target);
        if ('error' in resolved) {
          console.log(`Error: ${resolved.error}`);
          return { type: 'invalid' };
        }
        // Handle quoted text (strip quotes if present)
        let text = parsed.text;
        if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
          text = text.slice(1, -1);
        }
        return {
          type: 'remote',
          cmd: {
            ...base,
            type: 'type',
            target: resolved,
            text,
          },
        };
      }
      console.log('Usage: type <target> <text>');
      console.log('  target can be: stableId, index (1-based), or "text"');
      console.log('  Examples: type input-123 hello, type 3 "my text", type "email" "test@example.com"');
      return { type: 'invalid' };
    }

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

    case 'focus': {
      const parsed = parseTargetAndText(parts);
      if (parsed) {
        const resolved = resolveTarget(parsed.target);
        if ('error' in resolved) {
          console.log(`Error: ${resolved.error}`);
          return { type: 'invalid' };
        }
        return {
          type: 'remote',
          cmd: { ...base, type: 'focus', target: resolved },
        };
      }
      console.log('Usage: focus <target>');
      console.log('  target can be: stableId, index (1-based), or "text"');
      console.log('  Examples: focus input-123, focus 3, focus "email"');
      return { type: 'invalid' };
    }

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
  ui                  Request UI tree (interactive elements)
  find <query>        Search cached UI tree for matching elements
  click <target>      Click element
  type <target> <txt> Type text into element
  eval <code>         Execute JavaScript in browser
  snapshot            Get full DOM HTML
  screenshot          Capture viewport screenshot
  state [scope]       Get application state (cookies, localStorage, etc)
  navigate <url>      Navigate to URL
  focus <target>      Focus an element
  scroll <x> <y>      Scroll to position
  clear               Clear console
  help                Show this help

Element Targeting:
  <target> can be specified in three ways:
    stableId    Direct element ID (e.g., click btn-abc123)
    index       Element number from last UI tree (e.g., click 3)
    "text"      Match by visible text/label (e.g., click "Sign In")

  Examples:
    click 5                         Click element #5 from UI tree
    click "Submit"                  Click button with text "Submit"
    type 3 hello world              Type into element #3
    type "email" test@example.com   Type into input with "email" label
    focus "password"                Focus password field

Aliases: tree=ui, js=eval, dom=snapshot, ss=screenshot, go=navigate, search=find, ?=help
`);
}
