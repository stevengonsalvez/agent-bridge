import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSkillContent } from './skill-content';

export type AgentId = 'claude' | 'gemini' | 'cursor' | 'codex' | 'agents' | 'copilot';

export interface AgentTarget {
  id: AgentId;
  name: string;
  dir: string;
  filePath: string;
  scope: 'global' | 'project';
  agentDirExists: boolean;
}

export interface InstallOptions {
  global?: boolean;
  project?: boolean;
  agents?: string[];
  cwd?: string;
  homedir?: string;
  symlink?: boolean;
  force?: boolean;
}

export interface InstallResult {
  agent: AgentId;
  scope: 'global' | 'project';
  path: string;
  status: 'installed' | 'updated' | 'already-up-to-date' | 'failed';
  error?: string;
}

export interface UninstallOptions {
  global?: boolean;
  project?: boolean;
  agents?: string[];
  cwd?: string;
  homedir?: string;
}

export interface UninstallResult {
  agent: AgentId;
  scope: 'global' | 'project';
  path: string;
  status: 'removed' | 'not-found' | 'failed';
  error?: string;
}

export interface SkillStatusResult {
  agent: AgentId;
  name: string;
  scope: 'global' | 'project';
  path: string;
  installed: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
}

const GLOBAL_AGENTS: Array<{ id: AgentId; name: string; baseDir: string }> = [
  { id: 'claude', name: 'Claude Code', baseDir: '.claude' },
  { id: 'gemini', name: 'Google Antigravity / Gemini', baseDir: '.gemini' },
  { id: 'cursor', name: 'Cursor', baseDir: '.cursor' },
  { id: 'codex', name: 'Codex', baseDir: '.codex' },
  { id: 'agents', name: 'Agents SDK / OpenCode', baseDir: '.agents' },
];

const PROJECT_AGENTS: Array<{ id: AgentId; name: string; baseDir: string }> = [
  { id: 'claude', name: 'Claude Code (Project)', baseDir: '.claude' },
  { id: 'cursor', name: 'Cursor (Project)', baseDir: '.cursor' },
  { id: 'gemini', name: 'Antigravity (Project)', baseDir: '.gemini' },
  { id: 'copilot', name: 'GitHub Copilot (Project)', baseDir: '.github' },
  { id: 'agents', name: 'Agents (Project)', baseDir: '.agents' },
];

export function resolveTargets(options: InstallOptions = {}): AgentTarget[] {
  const home = options.homedir ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();
  const isProject = options.project === true;
  const isGlobal = options.global !== false && !isProject;

  const requestedAgents = options.agents
    ? options.agents
        .flatMap((a) => a.split(','))
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
    : null;

  const targets: AgentTarget[] = [];

  if (isGlobal) {
    for (const item of GLOBAL_AGENTS) {
      if (requestedAgents && !requestedAgents.includes(item.id) && !requestedAgents.includes('all')) {
        continue;
      }

      const agentHome = path.join(home, item.baseDir);
      const agentDirExists = fs.existsSync(agentHome);

      // If specific agents requested, include regardless of existence.
      // If auto-detecting, include only if agent base dir exists, or default to claude & gemini if nothing detected.
      const skillDir = path.join(agentHome, 'skills', 'debug-bridge');
      targets.push({
        id: item.id,
        name: item.name,
        dir: skillDir,
        filePath: path.join(skillDir, 'SKILL.md'),
        scope: 'global',
        agentDirExists,
      });
    }

    // If auto-detecting with no agent directories existing, fallback to claude and gemini
    if (!requestedAgents && !targets.some((t) => t.agentDirExists)) {
      return targets.filter((t) => t.id === 'claude' || t.id === 'gemini');
    }

    // In auto-detect mode, filter to only those agent configs that exist on user machine
    if (!requestedAgents) {
      const existing = targets.filter((t) => t.agentDirExists);
      if (existing.length > 0) return existing;
    }
  }

  if (isProject) {
    for (const item of PROJECT_AGENTS) {
      if (requestedAgents && !requestedAgents.includes(item.id) && !requestedAgents.includes('all')) {
        continue;
      }

      const agentDir = path.join(cwd, item.baseDir);
      const agentDirExists = fs.existsSync(agentDir);
      const skillDir = path.join(agentDir, 'skills', 'debug-bridge');

      targets.push({
        id: item.id,
        name: item.name,
        dir: skillDir,
        filePath: path.join(skillDir, 'SKILL.md'),
        scope: 'project',
        agentDirExists,
      });
    }

    if (!requestedAgents) {
      const existing = targets.filter((t) => t.agentDirExists);
      if (existing.length > 0) return existing;
      return targets.filter((t) => t.id === 'claude' || t.id === 'cursor');
    }
  }

  return targets;
}

export function installSkill(options: InstallOptions = {}): InstallResult[] {
  const targets = resolveTargets(options);
  const content = getSkillContent();
  const results: InstallResult[] = [];

  for (const target of targets) {
    try {
      fs.mkdirSync(target.dir, { recursive: true });

      let currentContent: string | null = null;
      if (fs.existsSync(target.filePath)) {
        currentContent = fs.readFileSync(target.filePath, 'utf8');
      }

      if (currentContent !== null && currentContent === content && !options.force) {
        results.push({
          agent: target.id,
          scope: target.scope,
          path: target.filePath,
          status: 'already-up-to-date',
        });
        continue;
      }

      const status = currentContent === null ? 'installed' : 'updated';

      if (options.symlink) {
        // Try symlink if requested
        try {
          if (fs.existsSync(target.filePath)) {
            fs.unlinkSync(target.filePath);
          }
          const sourcePath = path.resolve(__dirname, '../SKILL.md');
          fs.symlinkSync(sourcePath, target.filePath);
        } catch {
          // Fall back to copy
          fs.writeFileSync(target.filePath, content, 'utf8');
        }
      } else {
        fs.writeFileSync(target.filePath, content, 'utf8');
      }

      results.push({
        agent: target.id,
        scope: target.scope,
        path: target.filePath,
        status,
      });
    } catch (err: unknown) {
      results.push({
        agent: target.id,
        scope: target.scope,
        path: target.filePath,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export function uninstallSkill(options: UninstallOptions = {}): UninstallResult[] {
  const targets = resolveTargets(options);
  const results: UninstallResult[] = [];

  for (const target of targets) {
    try {
      if (!fs.existsSync(target.filePath) && !fs.existsSync(target.dir)) {
        results.push({
          agent: target.id,
          scope: target.scope,
          path: target.filePath,
          status: 'not-found',
        });
        continue;
      }

      if (fs.existsSync(target.filePath)) {
        fs.unlinkSync(target.filePath);
      }

      // Remove directory if empty
      try {
        if (fs.existsSync(target.dir)) {
          const files = fs.readdirSync(target.dir);
          if (files.length === 0) {
            fs.rmdirSync(target.dir);
          }
        }
      } catch {
        // Ignore directory cleanup error
      }

      results.push({
        agent: target.id,
        scope: target.scope,
        path: target.filePath,
        status: 'removed',
      });
    } catch (err: unknown) {
      results.push({
        agent: target.id,
        scope: target.scope,
        path: target.filePath,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export function getSkillStatus(options: InstallOptions = {}): SkillStatusResult[] {
  const home = options.homedir ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();
  const isProject = options.project === true;

  const list = isProject ? PROJECT_AGENTS : GLOBAL_AGENTS;
  const baseDir = isProject ? cwd : home;
  const scope: 'global' | 'project' = isProject ? 'project' : 'global';

  return list.map((item) => {
    const skillPath = path.join(baseDir, item.baseDir, 'skills', 'debug-bridge', 'SKILL.md');
    const installed = fs.existsSync(skillPath);
    let sizeBytes: number | undefined;
    let modifiedAt: string | undefined;

    if (installed) {
      try {
        const stats = fs.statSync(skillPath);
        sizeBytes = stats.size;
        modifiedAt = stats.mtime.toISOString();
      } catch {
        // Ignore stat error
      }
    }

    return {
      agent: item.id,
      name: item.name,
      scope,
      path: skillPath,
      installed,
      sizeBytes,
      modifiedAt,
    };
  });
}
