# debug-bridge-skill

Installer package for the Debug Bridge AI agent skill (not yet published). Compatible with Claude Code, Google Antigravity / Gemini CLI, Cursor, Codex, and OpenCode.

## Status: not published to npm

`npm view debug-bridge-skill` returns 404, so `npx debug-bridge-skill` and `npm install -g debug-bridge-skill` do not work today. The commands in the sections below describe this package's CLI and apply only after it is published, or when you run it from a repo build (`node packages/skill/dist/bin/cli.js`).

## Quick Start (works today)

Install the skill from the repo with the [`skills`](https://www.npmjs.com/package/skills) CLI:

```bash
# Global: installs into ~/.agents/skills/debug-bridge and links agents as needed
npx skills add stevengonsalvez/agent-bridge --skill debug-bridge -g -y

# Current project only
npx skills add stevengonsalvez/agent-bridge --skill debug-bridge -y
```

This installs `skills/debug-bridge/SKILL.md` from `master`. Re-run to update.

## What the skill does

It teaches the agent to run the Debug Bridge sidecar and, on every run, arm the agent inbox (`debug-bridge browser wait`) so Design Mode requests from the dock wake the agent. See [docs/agent-loop.md](../../docs/agent-loop.md).

> The installer reads `packages/skill/SKILL.md`, which is a separate copy that currently lags the source of truth, `skills/debug-bridge/SKILL.md` (it lacks the "arm the agent inbox" section). The `skills` CLI command above installs the source of truth.

## Supported AI Agent Environments

| Agent | Global Path | Project Path |
|---|---|---|
| **Claude Code** | `~/.claude/skills/debug-bridge/SKILL.md` | `.claude/skills/debug-bridge/SKILL.md` |
| **Antigravity / Gemini** | `~/.gemini/skills/debug-bridge/SKILL.md` | `.gemini/skills/debug-bridge/SKILL.md` |
| **Cursor** | `~/.cursor/skills/debug-bridge/SKILL.md` | `.cursor/skills/debug-bridge/SKILL.md` |
| **Codex** | `~/.codex/skills/debug-bridge/SKILL.md` | - |
| **Agents SDK** | `~/.agents/skills/debug-bridge/SKILL.md` | `.agents/skills/debug-bridge/SKILL.md` |
| **GitHub Copilot** | - | `.github/skills/debug-bridge/SKILL.md` |

## Installer CLI options (after publish)

### Install Commands

```bash
# Auto-detect installed agents and install globally (default)
npx debug-bridge-skill

# Install to current project repository
npx debug-bridge-skill install --project

# Install to specific agents only
npx debug-bridge-skill install --agent claude,gemini

# Force overwrite existing skill file
npx debug-bridge-skill install --force

# Symlink skill file instead of copying
npx debug-bridge-skill install --symlink

# Output JSON result (for automation scripts)
npx debug-bridge-skill install --json
```

### Check Installation Status

```bash
# Check status across global agent directories
npx debug-bridge-skill status

# Check status in current project
npx debug-bridge-skill status --project
```

### Print Skill to Stdout

```bash
# Pipe skill instructions directly into an agent or tool
npx debug-bridge-skill print | claude
```

### Uninstall

```bash
# Remove skill from global agent directories
npx debug-bridge-skill uninstall

# Remove from current project
npx debug-bridge-skill uninstall --project
```

## Programmatic API

```typescript
import {
  installSkill,
  uninstallSkill,
  getSkillStatus,
  getSkillContent,
  getSkillMetadata,
  resolveTargets,
} from 'debug-bridge-skill';

// Install skill programmatically
const results = installSkill({
  global: true,
  agents: ['claude', 'gemini'],
});

console.log(results);
```

## License

MIT
