# debug-bridge-skill

CLI installer and npm package for the Debug Bridge AI agent skill. Compatible with Claude Code, Google Antigravity / Gemini CLI, Cursor, Codex, and OpenCode.

## Quick Start

Install the Debug Bridge skill to all detected AI agent environments on your system:

```bash
npx debug-bridge-skill
```

Or install globally:

```bash
npm install -g debug-bridge-skill
debug-bridge-skill
```

## Supported AI Agent Environments

| Agent | Global Path | Project Path |
|---|---|---|
| **Claude Code** | `~/.claude/skills/debug-bridge/SKILL.md` | `.claude/skills/debug-bridge/SKILL.md` |
| **Antigravity / Gemini** | `~/.gemini/skills/debug-bridge/SKILL.md` | `.gemini/skills/debug-bridge/SKILL.md` |
| **Cursor** | `~/.cursor/skills/debug-bridge/SKILL.md` | `.cursor/skills/debug-bridge/SKILL.md` |
| **Codex** | `~/.codex/skills/debug-bridge/SKILL.md` | `.codex/skills/debug-bridge/SKILL.md` |
| **Agents SDK** | `~/.agents/skills/debug-bridge/SKILL.md` | `.agents/skills/debug-bridge/SKILL.md` |
| **GitHub Copilot** | - | `.github/skills/debug-bridge/SKILL.md` |

## Usage & Options

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
