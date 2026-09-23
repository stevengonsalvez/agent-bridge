import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type TmuxInjectionOptions = {
  target?: string;
  autoEnter?: boolean;
  preferCmux?: boolean;
};

export type TmuxInjectionResult = {
  success: boolean;
  method: 'tmux' | 'cmux' | 'none';
  target?: string;
  error?: string;
};

type TmuxPaneInfo = {
  sessionName: string;
  paneId: string;
  active: boolean;
  command: string;
};

/**
 * Discovers and validates target tmux pane.
 */
export async function resolveTmuxTarget(preferredTarget?: string): Promise<{ target?: string; error?: string }> {
  const explicit = preferredTarget && preferredTarget !== 'auto' ? preferredTarget : process.env.AGENT_BRIDGE_TMUX_TARGET;

  if (explicit && explicit !== 'auto') {
    try {
      const { stdout } = await execFileAsync('tmux', ['display-message', '-p', '-t', explicit, '#{pane_id}']);
      const paneId = stdout.trim();
      if (paneId) {
        return { target: paneId };
      }
    } catch {
      return { error: `Target tmux pane '${explicit}' does not exist` };
    }
  }

  // Inspect existing tmux panes safely
  try {
    const { stdout } = await execFileAsync('tmux', [
      'list-panes',
      '-a',
      '-F',
      '#{session_name}\t#{pane_id}\t#{pane_active}\t#{pane_current_command}',
    ]);

    const lines = stdout.trim().split('\n').filter(Boolean);
    const panes: TmuxPaneInfo[] = lines.map((line) => {
      const [sessionName, paneId, activeStr, command] = line.split('\t');
      return {
        sessionName: sessionName || '',
        paneId: paneId || '',
        active: activeStr === '1',
        command: (command || '').toLowerCase(),
      };
    });

    const ownPaneId = process.env.TMUX_PANE;

    // 1. If inside tmux session, look for sibling panes in same session (not own sidecar pane)
    if (ownPaneId) {
      const ownPane = panes.find((p) => p.paneId === ownPaneId);
      if (ownPane) {
        const siblings = panes.filter((p) => p.sessionName === ownPane.sessionName && p.paneId !== ownPaneId);
        // Look for agent first
        const agentSibling = siblings.find((p) => isAgentCommand(p.command));
        if (agentSibling) {
          return { target: agentSibling.paneId };
        }
        // Then active or first sibling
        const activeSibling = siblings.find((p) => p.active) || siblings[0];
        if (activeSibling) {
          return { target: activeSibling.paneId };
        }
      }
    }

    // 2. Global search for panes running AI coding agents (claude, agy, antigravity)
    const agentPanes = panes.filter((p) => isAgentCommand(p.command) && p.paneId !== ownPaneId);
    if (agentPanes.length === 1) {
      return { target: agentPanes[0].paneId };
    }

    if (agentPanes.length > 1) {
      const activeAgent = agentPanes.find((p) => p.active);
      if (activeAgent) {
        return { target: activeAgent.paneId };
      }
      return { target: agentPanes[0].paneId };
    }

    return { error: 'No unambiguous tmux agent pane detected. Pass --tmux <target> or set AGENT_BRIDGE_TMUX_TARGET.' };
  } catch (err) {
    return { error: `Failed to inspect tmux sessions: ${(err as Error).message}` };
  }
}

function isAgentCommand(command: string): boolean {
  return (
    command.includes('claude') ||
    command.includes('agy') ||
    command.includes('antigravity') ||
    command.includes('codex')
  );
}

/**
 * Injects prompt into terminal via cmux or tmux bracketed paste.
 */
export async function injectPromptToTerminal(
  prompt: string,
  options: TmuxInjectionOptions = {}
): Promise<TmuxInjectionResult> {
  const text = prompt.trim();
  if (!text) {
    return { success: false, method: 'none', error: 'Prompt is empty' };
  }

  const autoEnter = options.autoEnter !== false;

  // 1. Try cmux if inside cmux workspace
  if (options.preferCmux !== false && (process.env.CMUX_WORKSPACE_ID || process.env.CMUX_SURFACE_ID)) {
    try {
      await execFileAsync('cmux', ['send', text]);
      if (autoEnter) {
        await execFileAsync('cmux', ['send-key', 'Enter']);
      }
      return {
        success: true,
        method: 'cmux',
        target: process.env.CMUX_WORKSPACE_ID || 'current',
      };
    } catch {
      // Fall through to tmux if cmux fails
    }
  }

  // 2. Resolve tmux target
  const { target, error } = await resolveTmuxTarget(options.target);
  if (!target) {
    return {
      success: false,
      method: 'none',
      error: error || 'No valid tmux target found',
    };
  }

  // 3. Inject safely using tmux bracketed paste mode (set-buffer + paste-buffer -p -r -d)
  const bufferName = `agent-bridge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await execFileAsync('tmux', ['set-buffer', '-b', bufferName, '--', text]);
    await execFileAsync('tmux', ['paste-buffer', '-p', '-r', '-d', '-b', bufferName, '-t', target]);
    if (autoEnter) {
      await execFileAsync('tmux', ['send-keys', '-t', target, 'C-m']);
    }
    return {
      success: true,
      method: 'tmux',
      target,
    };
  } catch (err) {
    // Attempt cleanup if buffer remained
    try {
      await execFileAsync('tmux', ['delete-buffer', '-b', bufferName]);
    } catch {}
    return {
      success: false,
      method: 'none',
      target,
      error: `Tmux injection failed: ${(err as Error).message}`,
    };
  }
}
