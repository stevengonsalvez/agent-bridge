import * as readline from 'readline';
import type { CommandMessage } from '@debug-bridge/types';
import { PROTOCOL_VERSION } from '@debug-bridge/types';

export function setupStdinHandler(
  jsonMode: boolean,
  onCommand: (cmd: CommandMessage) => void
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
        const cmd = parseSimpleCommand(trimmed);
        if (cmd) {
          onCommand(cmd);
        } else {
          console.log(
            'Invalid command. Use JSON format or: click <stableId>, type <stableId> <text>, ui, state'
          );
        }
      }
    }

    if (!jsonMode) rl.prompt();
  });
}

function parseSimpleCommand(input: string): CommandMessage | null {
  const parts = input.split(/\s+/);
  const command = parts[0]?.toLowerCase();

  const base = {
    protocolVersion: PROTOCOL_VERSION as 1,
    sessionId: 'default',
    timestamp: Date.now(),
    requestId: `cmd-${Date.now()}`,
  };

  switch (command) {
    case 'click':
      if (parts[1]) {
        return { ...base, type: 'click', target: { stableId: parts[1] } };
      }
      break;
    case 'type':
      if (parts[1] && parts[2]) {
        return {
          ...base,
          type: 'type',
          target: { stableId: parts[1] },
          text: parts.slice(2).join(' '),
        };
      }
      break;
    case 'ui':
      return { ...base, type: 'request_ui_tree' };
    case 'state':
      return { ...base, type: 'request_state', scope: parts[1] };
    case 'navigate':
      if (parts[1]) {
        return { ...base, type: 'navigate', url: parts[1] };
      }
      break;
  }

  return null;
}
