import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { sendBrowserCommand } from './browser-client';
import { startServer } from '../server/websocket-server';
import { createBrowserSidecar } from 'debug-bridge-browser-sidecar';
import type { CliConfig } from 'debug-bridge-types';

export function registerBrowserCommands(program: Command): void {
  const browserCmd = program
    .command('browser')
    .description('Automate and inspect browser surfaces without stealing focus');

  browserCmd
    .command('open <url>')
    .description('Open a URL in the browser sidecar')
    .option('-p, --port <number>', 'Bridge port', '4000')
    .option('-s, --session <string>', 'Session ID', 'default')
    .option('--profile <string>', 'Browser profile', 'agent-bridge-default')
    .option('--headed', 'Launch browser with visible window', true)
    .option('--headless', 'Launch headless browser', false)
    .option('--json', 'Output result as JSON', false)
    .action(async (url: string, opts) => {
      const port = parseInt(opts.port, 10);
      const session = opts.session;
      const isHeadless = opts.headless || !opts.headed;

      // Try navigating first if server is already running
      try {
        const res = await sendBrowserCommand(
          { type: 'browser_navigate', url },
          { port, session, timeoutMs: 3000 }
        );
        try {
          await sendBrowserCommand(
            { type: 'browser_design_mode', action: 'enable' },
            { port, session, timeoutMs: 3000 }
          );
        } catch {}
        if (opts.json) {
          console.log(JSON.stringify(res, null, 2));
        } else {
          console.log(`Navigated to ${url} (Design Mode active)`);
        }
        return;
      } catch {
        // Server not running yet; spin up server + sidecar
      }

      const config: CliConfig = {
        port,
        host: 'localhost',
        session,
        json: opts.json,
        cdp: true,
        browser: 'managed',
        profile: opts.profile,
        headless: isHeadless,
      };

      const server = startServer(config, {
        onAppConnected: () => {},
        onAppDisconnected: () => {},
        onTelemetry: () => {},
        onCommandResult: () => {},
      });

      const sidecar = createBrowserSidecar({
        host: config.host,
        port: config.port,
        sessionId: config.session,
        profile: config.profile,
        mode: 'managed',
        headless: isHeadless,
      });

      await sidecar.start();

      // Wait a moment and navigate
      await new Promise((resolve) => setTimeout(resolve, 500));
      const res = await sendBrowserCommand({ type: 'browser_navigate', url }, { port, session });
      try {
        await sendBrowserCommand({ type: 'browser_design_mode', action: 'enable' }, { port, session });
      } catch {}

      if (opts.json) {
        console.log(JSON.stringify({ status: 'open', url, port, session, result: res }, null, 2));
      } else {
        console.log(`Browser opened on port ${port} and navigated to: ${url} (Design Mode active)`);
        console.log(`Keep running in background. Press Ctrl+C to close.`);
      }

      process.on('SIGINT', () => {
        void sidecar.stop().finally(() => {
          server.close();
          process.exit(0);
        });
      });
    });

  browserCmd
    .command('snapshot')
    .description('Capture interactive elements tree or page snapshot')
    .option('-i, --interactive', 'Return numbered interactive element handles (@e1, @e2)', true)
    .option('-p, --port <number>', 'Bridge port', '4000')
    .option('-s, --session <string>', 'Session ID', 'default')
    .option('--json', 'Output result as JSON', false)
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      const res = await sendBrowserCommand(
        { type: 'browser_interactive_snapshot' },
        { port, session: opts.session }
      ) as { elements: Array<{ ref: string; role: string; text: string; bounds: { x: number; y: number; width: number; height: number }; selector: string }> };

      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`Interactive Elements (${res.elements.length}):`);
        for (const el of res.elements) {
          console.log(`  ${el.ref} <${el.role}> "${el.text}" [${el.selector}] {x:${el.bounds.x}, y:${el.bounds.y}}`);
        }
      }
    });

  browserCmd
    .command('click <target>')
    .description('Click an element by handle (@e1) or CSS selector')
    .option('--snapshot-after', 'Take interactive snapshot after clicking', false)
    .option('-p, --port <number>', 'Bridge port', '4000')
    .option('-s, --session <string>', 'Session ID', 'default')
    .option('--json', 'Output result as JSON', false)
    .action(async (target: string, opts) => {
      const port = parseInt(opts.port, 10);
      const isRef = target.startsWith('@e');
      const res = await sendBrowserCommand(
        {
          type: 'browser_click',
          ref: isRef ? target : undefined,
          selector: isRef ? undefined : target,
          snapshotAfter: opts.snapshotAfter,
        },
        { port, session: opts.session }
      );

      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`Clicked: ${target}`);
      }
    });

  browserCmd
    .command('fill <target> <text>')
    .description('Fill text into input element by handle (@e1) or CSS selector')
    .option('--snapshot-after', 'Take interactive snapshot after filling', false)
    .option('-p, --port <number>', 'Bridge port', '4000')
    .option('-s, --session <string>', 'Session ID', 'default')
    .option('--json', 'Output result as JSON', false)
    .action(async (target: string, text: string, opts) => {
      const port = parseInt(opts.port, 10);
      const isRef = target.startsWith('@e');
      const res = await sendBrowserCommand(
        {
          type: 'browser_fill',
          ref: isRef ? target : undefined,
          selector: isRef ? undefined : target,
          text,
          snapshotAfter: opts.snapshotAfter,
        },
        { port, session: opts.session }
      );

      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`Filled ${target} with: "${text}"`);
      }
    });

  browserCmd
    .command('screenshot')
    .description('Capture native CDP viewport or element screenshot')
    .option('--selector <css>', 'CSS selector of element to screenshot')
    .option('--out <path>', 'Path to save PNG file', '')
    .option('-p, --port <number>', 'Bridge port', '4000')
    .option('-s, --session <string>', 'Session ID', 'default')
    .option('--json', 'Output base64 JSON', false)
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      const res = await sendBrowserCommand(
        { type: 'browser_screenshot', selector: opts.selector },
        { port, session: opts.session }
      ) as { data: string; width: number; height: number };

      if (opts.out) {
        const base64Data = res.data.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const outPath = path.resolve(process.cwd(), opts.out);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buffer);
        if (!opts.json) {
          console.log(`Saved screenshot to: ${outPath} (${res.width}x${res.height})`);
          return;
        }
      }

      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
      } else if (!opts.out) {
        console.log(`Screenshot captured: ${res.width}x${res.height} (use --out <path> to save)`);
      }
    });

  browserCmd
    .command('design-mode [action]')
    .description('Control in-browser Design Mode (enable, disable, status, handoff, quick-render, copy-prompt, clear)')
    .option('-r, --request <text>', 'Requested change description for handoff or prompt', '')
    .option('-t, --tool <tool>', 'Active tool (select, pen, rect, arrow, region)')
    .option('--css <string>', 'Optional custom CSS patch for quick-render')
    .option('-c, --copy', 'Copy prompt to clipboard', false)
    .option('-p, --port <number>', 'Bridge port', '4000')
    .option('-s, --session <string>', 'Session ID', 'default')
    .option('--json', 'Output result as JSON', false)
    .action(async (action = 'status', opts) => {
      const port = parseInt(opts.port, 10);
      let act:
        | 'enable'
        | 'disable'
        | 'status'
        | 'get_handoff'
        | 'quick_render'
        | 'copy_prompt'
        | 'clear_preview'
        | 'clear_selections'
        | 'set_tool'
        | 'clear_marks' = 'status';

      if (action === 'enable') act = 'enable';
      else if (action === 'disable') act = 'disable';
      else if (action === 'status') act = 'status';
      else if (action === 'handoff' || action === 'get_handoff') act = 'get_handoff';
      else if (action === 'quick-render' || action === 'quick_render') act = 'quick_render';
      else if (action === 'copy-prompt' || action === 'copy_prompt' || opts.copy) act = 'copy_prompt';
      else if (action === 'clear' || action === 'clear-selections') act = 'clear_selections';
      else if (action === 'clear-marks') act = 'clear_marks';
      else if (action === 'clear-preview') act = 'clear_preview';
      else if (action === 'tool' || action === 'set-tool' || opts.tool) act = 'set_tool';

      const res = await sendBrowserCommand(
        {
          type: 'browser_design_mode',
          action: act,
          tool: opts.tool,
          requestedChange: opts.request,
          cssPatch: opts.css,
        },
        { port, session: opts.session }
      );

      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
      } else if (act === 'copy_prompt') {
        const payload = res as {
          copied?: boolean;
          prompt?: string;
          artifacts?: {
            screenshot_path?: string;
            live_context_path?: string;
            context_json_path?: string;
          };
        };
        console.log(payload.copied ? 'Prompt copied to clipboard:' : 'Generated prompt:');
        console.log(payload.prompt || JSON.stringify(res, null, 2));
        if (payload.artifacts?.screenshot_path) {
          console.log('\nArtifacts:');
          console.log(`  Screenshot:   ${payload.artifacts.screenshot_path}`);
          console.log(`  Live Context: ${payload.artifacts.live_context_path}`);
          console.log(`  Context JSON: ${payload.artifacts.context_json_path}`);
        }
      } else {
        console.log(`Design mode (${act}):`, JSON.stringify(res, null, 2));
      }
    });

  browserCmd
    .command('preview-patch')
    .description('Inject live temporary CSS override into browser for instant visual review')
    .option('--css <string>', 'CSS rules to inject')
    .option('--clear', 'Remove temporary live preview override', false)
    .option('-p, --port <number>', 'Bridge port', '4000')
    .option('-s, --session <string>', 'Session ID', 'default')
    .option('--json', 'Output result as JSON', false)
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      const res = await sendBrowserCommand(
        {
          type: 'browser_preview_patch',
          cssPatch: opts.css,
          clear: opts.clear,
        },
        { port, session: opts.session }
      );

      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        if (opts.clear) console.log('Cleared live preview patch.');
        else console.log(`Injected live preview CSS (${opts.css?.length ?? 0} bytes) into browser.`);
      }
    });
}
