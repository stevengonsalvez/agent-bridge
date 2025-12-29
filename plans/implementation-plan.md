# Debug Bridge Implementation Plan

## Overview

Build a debug bridge system with **3 packages** (simplified from original 4):

1. **@debug-bridge/types** - Shared TypeScript types
2. **@debug-bridge/cli** - CLI with embedded server + agent interface
3. **@debug-bridge/browser** - Browser client SDK
4. **apps/sample-react-app** - Test application

## Key Simplification

Instead of a separate server package, the **CLI bundles everything**:
- Embedded WebSocket server
- Agent interface (receives telemetry)
- REPL for humans, JSON mode for Claude Code
- Single `npx @debug-bridge/cli connect` command

## Current State

- Empty repository with `prd.md` and `spec.md`
- Architecture defined in `docs/architecture.md`

## Desired End State

```bash
# Terminal 1: Start CLI
$ npx @debug-bridge/cli connect --session dev --json
{"event":"server_started","url":"ws://localhost:4000/debug","session":"dev"}
{"event":"app_connected","appName":"sample-react-app"}
{"event":"telemetry","type":"ui_tree","itemCount":47}

# Claude sends command via stdin:
> {"type":"click","requestId":"1","target":{"stableId":"login-button"}}
{"event":"command_result","requestId":"1","success":true,"duration":12}
```

## What We're NOT Doing

- Publishing to npm (yet)
- MCP server integration (future enhancement)
- Production deployment configuration
- E2E test suite with Playwright

---

## Phase 1: Monorepo Foundation

### Overview
Set up pnpm monorepo with Turborepo and shared TypeScript configuration.

### Files to Create:

**File**: `package.json`
```json
{
  "name": "debug-bridge",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "type-check": "turbo run type-check",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\""
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "prettier": "^3.4.2",
    "turbo": "^2.3.3",
    "typescript": "^5.7.2"
  }
}
```

**File**: `pnpm-workspace.yaml`
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

**File**: `turbo.json`
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

**File**: `tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

**File**: `.gitignore`
```
node_modules/
dist/
.turbo/
*.log
.DS_Store
coverage/
.env
.env.local
*.tsbuildinfo
```

**File**: `.prettierrc`
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### Success Criteria:
- [ ] `pnpm install` completes without errors
- [ ] Directory structure created

---

## Phase 2: @debug-bridge/types Package

### Overview
Shared TypeScript types for the protocol.

### Files to Create:

**File**: `packages/types/package.json`
```json
{
  "name": "@debug-bridge/types",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "tsup": "^8.3.5",
    "typescript": "^5.7.2"
  }
}
```

**File**: `packages/types/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**File**: `packages/types/tsup.config.ts`
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
});
```

**File**: `packages/types/src/index.ts`
```typescript
export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 4000;

export * from './messages';
export * from './config';
export * from './utils';
```

**File**: `packages/types/src/messages/index.ts`
```typescript
export * from './base';
export * from './connection';
export * from './telemetry';
export * from './commands';
export * from './results';

import type { HelloMessage, CapabilitiesMessage } from './connection';
import type {
  DomSnapshotMessage,
  DomMutationsMessage,
  UiTreeMessage,
  ConsoleMessage,
  ErrorMessage,
  StateUpdateMessage,
} from './telemetry';
import type { CommandMessage } from './commands';
import type { CommandResultMessage } from './results';

export type BridgeMessage =
  | HelloMessage
  | CapabilitiesMessage
  | DomSnapshotMessage
  | DomMutationsMessage
  | UiTreeMessage
  | ConsoleMessage
  | ErrorMessage
  | StateUpdateMessage
  | CommandMessage
  | CommandResultMessage;
```

**File**: `packages/types/src/messages/base.ts`
```typescript
import { PROTOCOL_VERSION } from '../index';

export type BaseMessage = {
  protocolVersion: typeof PROTOCOL_VERSION;
  sessionId: string;
  timestamp: number;
  type: string;
};

export function createBaseMessage(sessionId: string, type: string): BaseMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    sessionId,
    timestamp: Date.now(),
    type,
  };
}
```

**File**: `packages/types/src/messages/connection.ts`
```typescript
import type { BaseMessage } from './base';
import type { Capability } from '../utils';

export type HelloMessage = BaseMessage & {
  type: 'hello';
  appName?: string;
  appVersion?: string;
  url: string;
  userAgent: string;
  viewport: { width: number; height: number };
};

export type CapabilitiesMessage = BaseMessage & {
  type: 'capabilities';
  capabilities: Capability[];
};
```

**File**: `packages/types/src/messages/telemetry.ts`
```typescript
import type { BaseMessage } from './base';
import type { UiTreeItem, DomMutation } from '../utils';

export type DomSnapshotMessage = BaseMessage & {
  type: 'dom_snapshot';
  html: string;
  requestId?: string;
};

export type DomMutationsMessage = BaseMessage & {
  type: 'dom_mutations';
  batchId: string;
  mutations: DomMutation[];
};

export type UiTreeMessage = BaseMessage & {
  type: 'ui_tree';
  requestId?: string;
  items: UiTreeItem[];
};

export type ConsoleMessage = BaseMessage & {
  type: 'console';
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: string[];
};

export type ErrorMessage = BaseMessage & {
  type: 'error';
  errorType: 'runtime' | 'unhandledrejection';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
};

export type StateUpdateMessage = BaseMessage & {
  type: 'state_update';
  scope: string;
  state: unknown;
};
```

**File**: `packages/types/src/messages/commands.ts`
```typescript
import type { BaseMessage } from './base';
import type { ElementTarget } from '../utils';

type CommandBase = BaseMessage & {
  requestId: string;
};

export type ClickCommand = CommandBase & {
  type: 'click';
  target: ElementTarget;
};

export type TypeCommand = CommandBase & {
  type: 'type';
  target: ElementTarget;
  text: string;
  options?: { clear?: boolean; delay?: number; pressEnter?: boolean };
};

export type NavigateCommand = CommandBase & {
  type: 'navigate';
  url: string;
};

export type EvaluateCommand = CommandBase & {
  type: 'evaluate';
  code: string;
};

export type ScrollCommand = CommandBase & {
  type: 'scroll';
  target?: ElementTarget;
  x?: number;
  y?: number;
};

export type HoverCommand = CommandBase & {
  type: 'hover';
  target: ElementTarget;
};

export type SelectCommand = CommandBase & {
  type: 'select';
  target: ElementTarget;
  value?: string;
  label?: string;
  index?: number;
};

export type FocusCommand = CommandBase & {
  type: 'focus';
  target: ElementTarget;
};

export type RequestUiTreeCommand = CommandBase & {
  type: 'request_ui_tree';
};

export type RequestDomSnapshotCommand = CommandBase & {
  type: 'request_dom_snapshot';
};

export type RequestStateCommand = CommandBase & {
  type: 'request_state';
  scope?: string;
};

export type CommandMessage =
  | ClickCommand
  | TypeCommand
  | NavigateCommand
  | EvaluateCommand
  | ScrollCommand
  | HoverCommand
  | SelectCommand
  | FocusCommand
  | RequestUiTreeCommand
  | RequestDomSnapshotCommand
  | RequestStateCommand;

export type CommandType = CommandMessage['type'];
```

**File**: `packages/types/src/messages/results.ts`
```typescript
import type { BaseMessage } from './base';
import type { CommandType } from './commands';

export type ErrorCode =
  | 'TARGET_NOT_FOUND'
  | 'TARGET_NOT_VISIBLE'
  | 'TARGET_DISABLED'
  | 'TIMEOUT'
  | 'EVAL_DISABLED'
  | 'EVAL_ERROR'
  | 'NAVIGATION_FAILED'
  | 'INVALID_COMMAND'
  | 'UNKNOWN_ERROR';

export type CommandResultMessage = BaseMessage & {
  type: 'command_result';
  requestId: string;
  requestType: CommandType;
  success: boolean;
  error?: { code: ErrorCode; message: string };
  result?: unknown;
  duration: number;
};
```

**File**: `packages/types/src/utils/index.ts`
```typescript
export type Capability =
  | 'dom_snapshot'
  | 'dom_mutations'
  | 'ui_tree'
  | 'console'
  | 'errors'
  | 'eval'
  | 'custom_state';

export type ElementTarget = {
  stableId?: string;
  selector?: string;
  text?: string;
  role?: string;
};

export type UiTreeItem = {
  stableId: string;
  selector: string;
  role: string;
  text?: string;
  label?: string;
  disabled: boolean;
  visible: boolean;
  checked?: boolean;
  value?: string;
  meta: {
    tagName: string;
    type?: string;
    name?: string;
    href?: string;
    placeholder?: string;
    [key: string]: unknown;
  };
};

export type DomMutation = {
  mutationType: 'childList' | 'attributes' | 'characterData';
  targetSelector: string;
  attributeName?: string;
  addedNodes?: { type: string; tagName?: string; html?: string }[];
  removedNodes?: { type: string; tagName?: string }[];
};
```

**File**: `packages/types/src/config/index.ts`
```typescript
import type { Capability, UiTreeItem } from '../utils';

export type CliConfig = {
  port: number;
  host: string;
  session: string;
  json: boolean;
};

export type DebugBridgeConfig = {
  url: string;
  sessionId: string;
  appName?: string;
  appVersion?: string;

  enableDomSnapshot?: boolean;
  enableDomMutations?: boolean;
  enableUiTree?: boolean;
  enableConsole?: boolean;
  enableErrors?: boolean;
  enableEval?: boolean;

  domMutationBatchMs?: number;
  maxConsoleArgs?: number;
  maxConsoleArgLength?: number;
  maxDomSnapshotSize?: number;

  getCustomState?: () => Record<string, unknown>;
  getStableId?: (el: Element) => string | null;

  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
};
```

### Success Criteria:
- [ ] `pnpm --filter @debug-bridge/types build` succeeds
- [ ] `dist/index.d.ts` generated with all exports

---

## Phase 3: @debug-bridge/cli Package

### Overview
CLI tool with embedded WebSocket server and agent interface.

### Files to Create:

**File**: `packages/cli/package.json`
```json
{
  "name": "@debug-bridge/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "debug-bridge": "./dist/bin/cli.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "start": "node dist/bin/cli.js",
    "clean": "rm -rf dist",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@debug-bridge/types": "workspace:*",
    "commander": "^12.1.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.13",
    "tsup": "^8.3.5",
    "typescript": "^5.7.2"
  }
}
```

**File**: `packages/cli/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

**File**: `packages/cli/tsup.config.ts`
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/cli.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: ['@debug-bridge/types'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

**File**: `packages/cli/src/index.ts`
```typescript
export { startServer, type DebugBridgeServer } from './server/websocket-server';
export type { CliConfig } from '@debug-bridge/types';
```

**File**: `packages/cli/src/bin/cli.ts`
```typescript
import { Command } from 'commander';
import { startServer } from '../server/websocket-server';
import { createOutputFormatter } from '../output/formatter';
import { setupStdinHandler } from '../input/stdin-handler';
import type { BridgeMessage } from '@debug-bridge/types';

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
    const config = {
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

    // Setup stdin for commands
    setupStdinHandler(config.json, (cmd) => {
      server.sendCommand(cmd);
      formatter.commandSent(cmd);
    });

    // Handle shutdown
    process.on('SIGINT', () => {
      formatter.info('Shutting down...');
      server.close();
      process.exit(0);
    });
  });

program.parse();
```

**File**: `packages/cli/src/server/websocket-server.ts`
```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type {
  BridgeMessage,
  HelloMessage,
  CommandMessage,
  CommandResultMessage,
  CliConfig
} from '@debug-bridge/types';

type ServerCallbacks = {
  onAppConnected: (hello: HelloMessage) => void;
  onAppDisconnected: () => void;
  onTelemetry: (msg: BridgeMessage) => void;
  onCommandResult: (msg: CommandResultMessage) => void;
};

export type DebugBridgeServer = {
  sendCommand: (cmd: CommandMessage) => void;
  close: () => void;
};

export function startServer(config: CliConfig, callbacks: ServerCallbacks): DebugBridgeServer {
  const wss = new WebSocketServer({
    port: config.port,
    host: config.host,
    path: '/debug',
  });

  let appConnection: WebSocket | null = null;

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${config.host}`);
    const sessionId = url.searchParams.get('sessionId');

    // Only accept connections for our session
    if (sessionId !== config.session) {
      ws.close(4000, 'Invalid session');
      return;
    }

    appConnection = ws;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeMessage;

        if (msg.type === 'hello') {
          callbacks.onAppConnected(msg as HelloMessage);
        } else if (msg.type === 'command_result') {
          callbacks.onCommandResult(msg as CommandResultMessage);
        } else {
          callbacks.onTelemetry(msg);
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on('close', () => {
      appConnection = null;
      callbacks.onAppDisconnected();
    });
  });

  return {
    sendCommand: (cmd: CommandMessage) => {
      if (appConnection?.readyState === WebSocket.OPEN) {
        appConnection.send(JSON.stringify(cmd));
      }
    },
    close: () => {
      wss.close();
    },
  };
}
```

**File**: `packages/cli/src/output/formatter.ts`
```typescript
import type {
  BridgeMessage,
  HelloMessage,
  CommandMessage,
  CommandResultMessage,
  UiTreeMessage,
  StateUpdateMessage,
  ConsoleMessage,
  ErrorMessage,
  CliConfig
} from '@debug-bridge/types';

export type OutputFormatter = {
  serverStarted: (config: CliConfig) => void;
  appConnected: (hello: HelloMessage) => void;
  appDisconnected: () => void;
  telemetry: (msg: BridgeMessage) => void;
  commandSent: (cmd: CommandMessage) => void;
  commandResult: (msg: CommandResultMessage) => void;
  info: (message: string) => void;
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
      out({ event: 'server_started', url: `ws://${config.host}:${config.port}/debug`, session: config.session });
    },
    appConnected: (hello) => {
      out({ event: 'app_connected', appName: hello.appName, appVersion: hello.appVersion, url: hello.url });
    },
    appDisconnected: () => {
      out({ event: 'app_disconnected' });
    },
    telemetry: (msg) => {
      if (msg.type === 'ui_tree') {
        const uitree = msg as UiTreeMessage;
        out({ event: 'telemetry', type: 'ui_tree', itemCount: uitree.items.length, items: uitree.items });
      } else if (msg.type === 'state_update') {
        const state = msg as StateUpdateMessage;
        out({ event: 'telemetry', type: 'state_update', scope: state.scope, state: state.state });
      } else if (msg.type === 'console') {
        const consoleMsg = msg as ConsoleMessage;
        out({ event: 'telemetry', type: 'console', level: consoleMsg.level, args: consoleMsg.args });
      } else if (msg.type === 'error') {
        const errorMsg = msg as ErrorMessage;
        out({ event: 'telemetry', type: 'error', message: errorMsg.message, stack: errorMsg.stack });
      } else if (msg.type === 'dom_snapshot') {
        out({ event: 'telemetry', type: 'dom_snapshot', length: (msg as any).html?.length ?? 0 });
      } else if (msg.type === 'capabilities') {
        out({ event: 'telemetry', type: 'capabilities', capabilities: (msg as any).capabilities });
      }
    },
    commandSent: (cmd) => {
      out({ event: 'command_sent', requestId: cmd.requestId, type: cmd.type });
    },
    commandResult: (msg) => {
      out({ event: 'command_result', requestId: msg.requestId, success: msg.success, duration: msg.duration, error: msg.error });
    },
    info: (message) => {
      out({ event: 'info', message });
    },
  };
}

function createHumanFormatter(): OutputFormatter {
  return {
    serverStarted: (config) => {
      console.log('\n Debug Bridge v0.1.0');
      console.log('━'.repeat(50));
      console.log(`Server: ws://${config.host}:${config.port}/debug`);
      console.log(`Session: ${config.session}`);
      console.log('━'.repeat(50));
      console.log('\nWaiting for app connection...\n');
    },
    appConnected: (hello) => {
      console.log(`✓ Connected: ${hello.appName ?? 'Unknown App'} ${hello.appVersion ?? ''}`);
      console.log(`  URL: ${hello.url}`);
      console.log(`  Viewport: ${hello.viewport.width}x${hello.viewport.height}\n`);
    },
    appDisconnected: () => {
      console.log('\n✗ App disconnected\n');
    },
    telemetry: (msg) => {
      if (msg.type === 'ui_tree') {
        const uitree = msg as UiTreeMessage;
        console.log(`[ui_tree] ${uitree.items.length} interactive elements`);
      } else if (msg.type === 'state_update') {
        const state = msg as StateUpdateMessage;
        console.log(`[state] ${state.scope}:`, JSON.stringify(state.state));
      } else if (msg.type === 'console') {
        const consoleMsg = msg as ConsoleMessage;
        console.log(`[console.${consoleMsg.level}]`, consoleMsg.args.join(' '));
      } else if (msg.type === 'error') {
        const errorMsg = msg as ErrorMessage;
        console.log(`[error] ${errorMsg.message}`);
      } else if (msg.type === 'capabilities') {
        console.log(`[capabilities]`, (msg as any).capabilities.join(', '));
      }
    },
    commandSent: (cmd) => {
      console.log(`> ${cmd.type} (${cmd.requestId})`);
    },
    commandResult: (msg) => {
      if (msg.success) {
        console.log(`✓ ${msg.requestType} completed (${msg.duration}ms)`);
      } else {
        console.log(`✗ ${msg.requestType} failed: ${msg.error?.message}`);
      }
    },
    info: (message) => {
      console.log(message);
    },
  };
}
```

**File**: `packages/cli/src/input/stdin-handler.ts`
```typescript
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
      // Try to parse as JSON command
      const parsed = JSON.parse(trimmed);

      // Ensure it has required fields
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
        // In human mode, try to parse simple commands
        const cmd = parseSimpleCommand(trimmed);
        if (cmd) {
          onCommand(cmd);
        } else {
          console.log('Invalid command. Use JSON format or: click <stableId>, type <stableId> <text>, ui, state');
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
        return { ...base, type: 'type', target: { stableId: parts[1] }, text: parts.slice(2).join(' ') };
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
```

### Success Criteria:
- [ ] `pnpm --filter @debug-bridge/cli build` succeeds
- [ ] `node packages/cli/dist/bin/cli.js connect --help` works
- [ ] Server starts and listens on specified port

---

## Phase 4: @debug-bridge/browser Package

### Overview
Browser SDK that embeds in web applications.

### Files to Create:

**File**: `packages/browser/package.json`
```json
{
  "name": "@debug-bridge/browser",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@debug-bridge/types": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.3.5",
    "typescript": "^5.7.2"
  }
}
```

**File**: `packages/browser/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

**File**: `packages/browser/tsup.config.ts`
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['@debug-bridge/types'],
});
```

**File**: `packages/browser/src/index.ts`
```typescript
export { createDebugBridge, type DebugBridge } from './bridge';
export type { DebugBridgeConfig } from '@debug-bridge/types';
```

**File**: `packages/browser/src/bridge.ts`
```typescript
import type {
  DebugBridgeConfig,
  BridgeMessage,
  CommandMessage,
  Capability,
} from '@debug-bridge/types';
import { PROTOCOL_VERSION } from '@debug-bridge/types';
import { DomObserver } from './telemetry/dom-observer';
import { UiTreeBuilder } from './telemetry/ui-tree';
import { ConsoleHook } from './telemetry/console-hook';
import { ErrorHook } from './telemetry/error-hook';
import { CommandExecutor } from './commands/executor';

export type DebugBridge = {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
  sendState: (scope: string, state: unknown) => void;
};

export function createDebugBridge(config: DebugBridgeConfig): DebugBridge {
  const resolvedConfig = {
    enableDomSnapshot: true,
    enableDomMutations: true,
    enableUiTree: true,
    enableConsole: true,
    enableErrors: true,
    enableEval: false,
    domMutationBatchMs: 100,
    maxConsoleArgs: 10,
    maxConsoleArgLength: 1000,
    maxDomSnapshotSize: 5 * 1024 * 1024,
    ...config,
  };

  let ws: WebSocket | null = null;
  let domObserver: DomObserver | null = null;
  let consoleHook: ConsoleHook | null = null;
  let errorHook: ErrorHook | null = null;
  let commandExecutor: CommandExecutor | null = null;

  const send = (msg: Partial<BridgeMessage> & { type: string }) => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      sessionId: resolvedConfig.sessionId,
      timestamp: Date.now(),
      ...msg,
    }));
  };

  const connect = () => {
    if (ws?.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(resolvedConfig.url);

    ws.onopen = () => {
      // Send hello
      send({
        type: 'hello',
        appName: resolvedConfig.appName,
        appVersion: resolvedConfig.appVersion,
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });

      // Send capabilities
      const capabilities: Capability[] = [];
      if (resolvedConfig.enableDomSnapshot) capabilities.push('dom_snapshot');
      if (resolvedConfig.enableDomMutations) capabilities.push('dom_mutations');
      if (resolvedConfig.enableUiTree) capabilities.push('ui_tree');
      if (resolvedConfig.enableConsole) capabilities.push('console');
      if (resolvedConfig.enableErrors) capabilities.push('errors');
      if (resolvedConfig.enableEval) capabilities.push('eval');
      if (resolvedConfig.getCustomState) capabilities.push('custom_state');
      send({ type: 'capabilities', capabilities });

      // Send initial telemetry
      if (resolvedConfig.enableDomSnapshot) {
        const html = document.documentElement.outerHTML;
        send({ type: 'dom_snapshot', html: html.substring(0, resolvedConfig.maxDomSnapshotSize) });
      }

      if (resolvedConfig.enableUiTree) {
        send({ type: 'ui_tree', items: UiTreeBuilder.build(resolvedConfig.getStableId) });
      }

      // Send custom state
      if (resolvedConfig.getCustomState) {
        const state = resolvedConfig.getCustomState();
        for (const [scope, value] of Object.entries(state)) {
          send({ type: 'state_update', scope, state: value });
        }
      }

      // Start observers
      if (resolvedConfig.enableDomMutations) {
        domObserver = new DomObserver((mutations) => {
          send({ type: 'dom_mutations', batchId: String(Date.now()), mutations });
        }, resolvedConfig.domMutationBatchMs);
        domObserver.start();
      }

      if (resolvedConfig.enableConsole) {
        consoleHook = new ConsoleHook((level, args) => {
          send({ type: 'console', level, args });
        }, resolvedConfig.maxConsoleArgs, resolvedConfig.maxConsoleArgLength);
        consoleHook.start();
      }

      if (resolvedConfig.enableErrors) {
        errorHook = new ErrorHook((errorMsg) => {
          send(errorMsg);
        });
        errorHook.start();
      }

      // Initialize command executor
      commandExecutor = new CommandExecutor(resolvedConfig, send);

      resolvedConfig.onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as CommandMessage;
        commandExecutor?.execute(msg);
      } catch {
        // Ignore
      }
    };

    ws.onclose = () => {
      cleanup();
      resolvedConfig.onDisconnect?.();
    };

    ws.onerror = () => {
      resolvedConfig.onError?.(new Error('WebSocket error'));
    };
  };

  const disconnect = () => {
    cleanup();
    ws?.close();
    ws = null;
  };

  const cleanup = () => {
    domObserver?.stop();
    domObserver = null;
    consoleHook?.stop();
    consoleHook = null;
    errorHook?.stop();
    errorHook = null;
  };

  return {
    connect,
    disconnect,
    isConnected: () => ws?.readyState === WebSocket.OPEN,
    sendState: (scope, state) => send({ type: 'state_update', scope, state }),
  };
}
```

**File**: `packages/browser/src/telemetry/ui-tree.ts`
```typescript
import type { UiTreeItem } from '@debug-bridge/types';

const INTERACTIVE_SELECTORS = [
  'a[href]', 'button', 'input', 'select', 'textarea',
  '[role="button"]', '[role="link"]', '[role="menuitem"]',
  '[role="tab"]', '[role="checkbox"]', '[role="radio"]',
  '[tabindex]', '[onclick]',
].join(', ');

export class UiTreeBuilder {
  static build(getStableId?: (el: Element) => string | null): UiTreeItem[] {
    const elements = document.querySelectorAll(INTERACTIVE_SELECTORS);
    const items: UiTreeItem[] = [];

    for (const el of elements) {
      const item = this.buildItem(el, getStableId);
      if (item) items.push(item);
    }

    return items;
  }

  private static buildItem(el: Element, getStableId?: (el: Element) => string | null): UiTreeItem | null {
    const htmlEl = el as HTMLElement;
    const style = window.getComputedStyle(el);
    const visible = style.display !== 'none' && style.visibility !== 'hidden';

    const stableId = getStableId?.(el) ?? this.generateStableId(el);
    const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
    const text = this.getVisibleText(el);

    return {
      stableId,
      selector: this.cssPath(el),
      role,
      text: text || undefined,
      label: el.getAttribute('aria-label') ?? el.getAttribute('title') ?? undefined,
      disabled: htmlEl.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      visible,
      checked: (el as HTMLInputElement).checked,
      value: (el as HTMLInputElement).value || undefined,
      meta: {
        tagName: el.tagName.toLowerCase(),
        type: (el as HTMLInputElement).type || undefined,
        name: (el as HTMLInputElement).name || undefined,
        href: (el as HTMLAnchorElement).href || undefined,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
      },
    };
  }

  private static getVisibleText(el: Element): string {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value || el.placeholder || '';
    }
    return (el.textContent ?? '').trim().substring(0, 100);
  }

  private static generateStableId(el: Element): string {
    const testId = el.getAttribute('data-testid');
    if (testId) return testId;

    const id = el.id;
    if (id && !id.startsWith(':')) return id;

    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().substring(0, 20);
    if (text) {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }
      return `${role}-${Math.abs(hash).toString(36)}`;
    }

    return this.cssPath(el).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
  }

  private static cssPath(el: Element): string {
    if (el.id) return `#${el.id}`;

    const path: string[] = [];
    let current: Element | null = el;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        path.unshift(`#${current.id}`);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      current = parent;
    }

    return path.join(' > ');
  }
}
```

**File**: `packages/browser/src/telemetry/dom-observer.ts`
```typescript
import type { DomMutation } from '@debug-bridge/types';

export class DomObserver {
  private observer: MutationObserver | null = null;
  private callback: (mutations: DomMutation[]) => void;
  private batchMs: number;
  private pending: DomMutation[] = [];
  private timeout: number | null = null;

  constructor(callback: (mutations: DomMutation[]) => void, batchMs: number = 100) {
    this.callback = callback;
    this.batchMs = batchMs;
  }

  start(): void {
    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        this.pending.push(this.serialize(record));
      }
      this.scheduleBatch();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  private scheduleBatch(): void {
    if (this.timeout) return;
    this.timeout = window.setTimeout(() => {
      if (this.pending.length > 0) {
        this.callback(this.pending);
        this.pending = [];
      }
      this.timeout = null;
    }, this.batchMs);
  }

  private serialize(record: MutationRecord): DomMutation {
    const target = record.target as Element;
    return {
      mutationType: record.type,
      targetSelector: target.nodeType === Node.ELEMENT_NODE ? (target.id ? `#${target.id}` : target.tagName.toLowerCase()) : '',
      attributeName: record.attributeName ?? undefined,
      addedNodes: Array.from(record.addedNodes).map(n => ({
        type: n.nodeType === Node.ELEMENT_NODE ? 'element' : 'text',
        tagName: (n as Element).tagName?.toLowerCase(),
        html: (n as Element).outerHTML?.substring(0, 500),
      })),
      removedNodes: Array.from(record.removedNodes).map(n => ({
        type: n.nodeType === Node.ELEMENT_NODE ? 'element' : 'text',
        tagName: (n as Element).tagName?.toLowerCase(),
      })),
    };
  }
}
```

**File**: `packages/browser/src/telemetry/console-hook.ts`
```typescript
type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export class ConsoleHook {
  private callback: (level: ConsoleLevel, args: string[]) => void;
  private maxArgs: number;
  private maxLength: number;
  private originals: Partial<Record<ConsoleLevel, typeof console.log>> = {};

  constructor(callback: (level: ConsoleLevel, args: string[]) => void, maxArgs = 10, maxLength = 1000) {
    this.callback = callback;
    this.maxArgs = maxArgs;
    this.maxLength = maxLength;
  }

  start(): void {
    const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

    for (const level of levels) {
      this.originals[level] = console[level];
      console[level] = (...args: unknown[]) => {
        this.originals[level]?.apply(console, args);
        const serialized = args.slice(0, this.maxArgs).map(a => this.stringify(a));
        this.callback(level, serialized);
      };
    }
  }

  stop(): void {
    for (const [level, original] of Object.entries(this.originals)) {
      if (original) (console as any)[level] = original;
    }
    this.originals = {};
  }

  private stringify(value: unknown): string {
    try {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      return str.length > this.maxLength ? str.substring(0, this.maxLength) + '...' : str;
    } catch {
      return String(value);
    }
  }
}
```

**File**: `packages/browser/src/telemetry/error-hook.ts`
```typescript
import type { ErrorMessage } from '@debug-bridge/types';

type ErrorCallback = (msg: Omit<ErrorMessage, 'protocolVersion' | 'sessionId' | 'timestamp'>) => void;

export class ErrorHook {
  private callback: ErrorCallback;
  private errorHandler: ((event: ErrorEvent) => void) | null = null;
  private rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  constructor(callback: ErrorCallback) {
    this.callback = callback;
  }

  start(): void {
    this.errorHandler = (event: ErrorEvent) => {
      this.callback({
        type: 'error',
        errorType: 'runtime',
        message: event.message,
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    this.rejectionHandler = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      this.callback({
        type: 'error',
        errorType: 'unhandledrejection',
        message: error?.message ?? String(error),
        stack: error?.stack,
      });
    };

    window.addEventListener('error', this.errorHandler);
    window.addEventListener('unhandledrejection', this.rejectionHandler);
  }

  stop(): void {
    if (this.errorHandler) window.removeEventListener('error', this.errorHandler);
    if (this.rejectionHandler) window.removeEventListener('unhandledrejection', this.rejectionHandler);
    this.errorHandler = null;
    this.rejectionHandler = null;
  }
}
```

**File**: `packages/browser/src/commands/executor.ts`
```typescript
import type { CommandMessage, DebugBridgeConfig, BridgeMessage } from '@debug-bridge/types';
import { UiTreeBuilder } from '../telemetry/ui-tree';

type Send = (msg: Partial<BridgeMessage> & { type: string }) => void;

export class CommandExecutor {
  private config: DebugBridgeConfig;
  private send: Send;

  constructor(config: DebugBridgeConfig, send: Send) {
    this.config = config;
    this.send = send;
  }

  async execute(cmd: CommandMessage): Promise<void> {
    const start = performance.now();
    let success = true;
    let result: unknown;
    let error: { code: string; message: string } | undefined;

    try {
      switch (cmd.type) {
        case 'click':
          this.click(cmd.target);
          break;
        case 'type':
          this.type(cmd.target, cmd.text, cmd.options);
          break;
        case 'navigate':
          window.location.href = cmd.url;
          break;
        case 'evaluate':
          if (!this.config.enableEval) throw { code: 'EVAL_DISABLED', message: 'Eval disabled' };
          result = new Function(cmd.code)();
          break;
        case 'scroll':
          window.scrollTo({ left: cmd.x, top: cmd.y, behavior: 'smooth' });
          break;
        case 'hover':
          this.hover(cmd.target);
          break;
        case 'select':
          this.select(cmd.target, cmd);
          break;
        case 'focus':
          this.focus(cmd.target);
          break;
        case 'request_ui_tree':
          this.send({ type: 'ui_tree', requestId: cmd.requestId, items: UiTreeBuilder.build(this.config.getStableId) });
          return;
        case 'request_dom_snapshot':
          this.send({ type: 'dom_snapshot', requestId: cmd.requestId, html: document.documentElement.outerHTML });
          return;
        case 'request_state':
          if (this.config.getCustomState) {
            const state = this.config.getCustomState();
            if (cmd.scope && state[cmd.scope]) {
              this.send({ type: 'state_update', scope: cmd.scope, state: state[cmd.scope] });
            } else {
              for (const [scope, value] of Object.entries(state)) {
                this.send({ type: 'state_update', scope, state: value });
              }
            }
          }
          return;
        default:
          throw { code: 'INVALID_COMMAND', message: `Unknown: ${(cmd as any).type}` };
      }
    } catch (e: any) {
      success = false;
      error = { code: e.code ?? 'UNKNOWN_ERROR', message: e.message ?? String(e) };
    }

    this.send({
      type: 'command_result',
      requestId: cmd.requestId,
      requestType: cmd.type,
      success,
      error,
      result,
      duration: Math.round(performance.now() - start),
    });
  }

  private resolveTarget(target: { stableId?: string; selector?: string; text?: string }): Element {
    let el: Element | null = null;

    if (target.stableId) {
      el = document.querySelector(`[data-testid="${target.stableId}"]`) ?? document.getElementById(target.stableId);
    }
    if (!el && target.selector) {
      el = document.querySelector(target.selector);
    }
    if (!el && target.text) {
      const all = document.querySelectorAll('button, a, [role="button"]');
      for (const candidate of all) {
        if (candidate.textContent?.includes(target.text)) {
          el = candidate;
          break;
        }
      }
    }

    if (!el) throw { code: 'TARGET_NOT_FOUND', message: `Not found: ${JSON.stringify(target)}` };
    return el;
  }

  private click(target: { stableId?: string; selector?: string; text?: string }): void {
    const el = this.resolveTarget(target);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  private type(target: { stableId?: string; selector?: string }, text: string, options?: { clear?: boolean; pressEnter?: boolean }): void {
    const el = this.resolveTarget(target) as HTMLInputElement;
    el.focus();
    if (options?.clear) el.value = '';
    el.value += text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (options?.pressEnter) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  }

  private hover(target: { stableId?: string; selector?: string }): void {
    const el = this.resolveTarget(target);
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  }

  private select(target: { stableId?: string; selector?: string }, options: { value?: string; label?: string; index?: number }): void {
    const el = this.resolveTarget(target) as HTMLSelectElement;
    if (options.value) el.value = options.value;
    else if (options.index !== undefined) el.selectedIndex = options.index;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private focus(target: { stableId?: string; selector?: string }): void {
    const el = this.resolveTarget(target) as HTMLElement;
    el.focus();
  }
}
```

### Success Criteria:
- [ ] `pnpm --filter @debug-bridge/browser build` succeeds
- [ ] Types are properly exported

---

## Phase 5: Sample React Application

### Overview
Test application for validating the debug bridge.

### Files to Create:

**File**: `apps/sample-react-app/package.json`
```json
{
  "name": "sample-react-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@debug-bridge/browser": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.1.1",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.5"
  }
}
```

**File**: `apps/sample-react-app/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"],
  "references": [{ "path": "../../packages/browser" }]
}
```

**File**: `apps/sample-react-app/vite.config.ts`
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
});
```

**File**: `apps/sample-react-app/index.html`
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Debug Bridge Sample</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**File**: `apps/sample-react-app/src/main.tsx`
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initDebugBridge } from './debug-bridge';
import './styles.css';

if (import.meta.env.DEV) {
  initDebugBridge();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

**File**: `apps/sample-react-app/src/debug-bridge.ts`
```typescript
import { createDebugBridge } from '@debug-bridge/browser';
import { useStore } from './store';

export function initDebugBridge() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session') ?? 'default';
  const port = params.get('port') ?? '4000';

  const bridge = createDebugBridge({
    url: `ws://localhost:${port}/debug?sessionId=${sessionId}`,
    sessionId,
    appName: 'Sample React App',
    appVersion: '0.1.0',
    enableEval: true,
    getCustomState: () => ({
      auth: useStore.getState().auth,
      cart: useStore.getState().cart,
      route: window.location.pathname,
    }),
    onConnect: () => console.log('[DebugBridge] Connected'),
    onDisconnect: () => console.log('[DebugBridge] Disconnected'),
  });

  bridge.connect();

  useStore.subscribe(() => {
    bridge.sendState('auth', useStore.getState().auth);
    bridge.sendState('cart', useStore.getState().cart);
  });

  (window as any).__debugBridge = bridge;
}
```

**File**: `apps/sample-react-app/src/store.ts`
```typescript
import { create } from 'zustand';

type CartItem = { id: string; name: string; price: number; qty: number };

type Store = {
  auth: { isLoggedIn: boolean; email: string | null };
  cart: { items: CartItem[] };
  login: (email: string) => void;
  logout: () => void;
  addToCart: (item: Omit<CartItem, 'qty'>) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
};

export const useStore = create<Store>((set) => ({
  auth: { isLoggedIn: false, email: null },
  cart: { items: [] },
  login: (email) => set({ auth: { isLoggedIn: true, email } }),
  logout: () => set({ auth: { isLoggedIn: false, email: null } }),
  addToCart: (item) =>
    set((s) => {
      const existing = s.cart.items.find((i) => i.id === item.id);
      if (existing) {
        return { cart: { items: s.cart.items.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i)) } };
      }
      return { cart: { items: [...s.cart.items, { ...item, qty: 1 }] } };
    }),
  removeFromCart: (id) => set((s) => ({ cart: { items: s.cart.items.filter((i) => i.id !== id) } })),
  clearCart: () => set({ cart: { items: [] } }),
}));
```

**File**: `apps/sample-react-app/src/App.tsx`
```tsx
import { Routes, Route, Link } from 'react-router-dom';
import { useStore } from './store';

export function App() {
  const { auth, logout, cart } = useStore();

  return (
    <div className="app">
      <header>
        <nav>
          <Link to="/" data-testid="nav-home">Home</Link>
          <Link to="/products" data-testid="nav-products">Products</Link>
          <Link to="/cart" data-testid="nav-cart">Cart ({cart.items.reduce((s, i) => s + i.qty, 0)})</Link>
        </nav>
        <div>
          {auth.isLoggedIn ? (
            <>
              <span data-testid="user-email">{auth.email}</span>
              <button onClick={logout} data-testid="logout-btn">Logout</button>
            </>
          ) : (
            <Link to="/login" data-testid="login-link">Login</Link>
          )}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/products" element={<Products />} />
          <Route path="/cart" element={<Cart />} />
        </Routes>
      </main>
    </div>
  );
}

function Home() {
  return (
    <div data-testid="home-page">
      <h1>Welcome to Debug Bridge Demo</h1>
      <p>Use the navigation to explore the app.</p>
    </div>
  );
}

function Login() {
  const login = useStore((s) => s.login);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    console.log('Login:', email);
    login(email);
  };

  return (
    <div data-testid="login-page">
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <input name="email" type="email" placeholder="Email" data-testid="email-input" required />
        <input name="password" type="password" placeholder="Password" data-testid="password-input" required />
        <button type="submit" data-testid="submit-btn">Sign In</button>
      </form>
    </div>
  );
}

const PRODUCTS = [
  { id: 'p1', name: 'Widget A', price: 19.99 },
  { id: 'p2', name: 'Widget B', price: 29.99 },
  { id: 'p3', name: 'Gadget X', price: 49.99 },
];

function Products() {
  const addToCart = useStore((s) => s.addToCart);

  return (
    <div data-testid="products-page">
      <h1>Products</h1>
      <div className="products">
        {PRODUCTS.map((p) => (
          <div key={p.id} className="product" data-testid={`product-${p.id}`}>
            <h3>{p.name}</h3>
            <p>${p.price}</p>
            <button onClick={() => addToCart(p)} data-testid={`add-${p.id}`}>Add to Cart</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Cart() {
  const { cart, removeFromCart, clearCart } = useStore();
  const total = cart.items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <div data-testid="cart-page">
      <h1>Cart</h1>
      {cart.items.length === 0 ? (
        <p data-testid="empty-cart">Your cart is empty.</p>
      ) : (
        <>
          <ul>
            {cart.items.map((item) => (
              <li key={item.id} data-testid={`cart-item-${item.id}`}>
                {item.name} x{item.qty} - ${(item.price * item.qty).toFixed(2)}
                <button onClick={() => removeFromCart(item.id)} data-testid={`remove-${item.id}`}>Remove</button>
              </li>
            ))}
          </ul>
          <p data-testid="cart-total">Total: ${total.toFixed(2)}</p>
          <button onClick={clearCart} data-testid="clear-cart">Clear Cart</button>
        </>
      )}
    </div>
  );
}
```

**File**: `apps/sample-react-app/src/styles.css`
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; line-height: 1.5; }
.app { min-height: 100vh; }
header { display: flex; justify-content: space-between; padding: 1rem 2rem; background: #f5f5f5; }
nav { display: flex; gap: 1rem; }
nav a { color: #333; text-decoration: none; }
nav a:hover { text-decoration: underline; }
main { padding: 2rem; max-width: 800px; margin: 0 auto; }
h1 { margin-bottom: 1rem; }
form { display: flex; flex-direction: column; gap: 1rem; max-width: 300px; }
input { padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
button { padding: 0.5rem 1rem; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
button:hover { background: #0056b3; }
.products { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
.product { padding: 1rem; background: #f9f9f9; border-radius: 8px; text-align: center; }
ul { list-style: none; }
li { padding: 0.5rem 0; display: flex; justify-content: space-between; align-items: center; }
```

### Success Criteria:
- [ ] `pnpm --filter sample-react-app dev` starts the app
- [ ] App connects to debug bridge CLI
- [ ] UI tree and state updates are received by CLI

---

## Phase 6: Integration Testing

### Test Scenarios

1. **Start CLI and App**
   ```bash
   # Terminal 1
   pnpm --filter @debug-bridge/cli start -- connect --session test --json

   # Terminal 2
   pnpm --filter sample-react-app dev
   # Open http://localhost:3000?session=test
   ```

2. **Verify Connection**
   - CLI shows `app_connected` event
   - CLI shows `ui_tree` telemetry
   - CLI shows `state_update` for auth/cart

3. **Test Click Command**
   ```json
   {"type":"click","requestId":"1","target":{"stableId":"nav-products"}}
   ```
   - Verify navigation to Products page

4. **Test Type Command**
   ```json
   {"type":"type","requestId":"2","target":{"stableId":"email-input"},"text":"test@example.com"}
   ```
   - Verify text appears in input

5. **Test State Updates**
   - Add item to cart
   - Verify `state_update` with cart scope

### Success Criteria:
- [ ] All packages build: `pnpm build`
- [ ] CLI receives telemetry from app
- [ ] Commands execute successfully
- [ ] State updates are captured

---

## Implementation Order

| Phase | Package | Est. Files | Dependencies |
|-------|---------|------------|--------------|
| 1 | Monorepo setup | 6 | None |
| 2 | @debug-bridge/types | 10 | Phase 1 |
| 3 | @debug-bridge/cli | 6 | Phase 2 |
| 4 | @debug-bridge/browser | 8 | Phase 2 |
| 5 | sample-react-app | 8 | Phase 3, 4 |
| 6 | Integration testing | - | Phase 5 |

**Total: ~38 files, ~2000 lines of code**
