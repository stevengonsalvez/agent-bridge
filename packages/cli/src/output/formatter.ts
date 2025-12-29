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
        const caps = msg as CapabilitiesMessage;
        console.log(`[capabilities]`, caps.capabilities.join(', '));
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
