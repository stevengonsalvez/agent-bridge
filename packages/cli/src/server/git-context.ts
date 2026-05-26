import { execFileSync } from 'node:child_process';
import type { GitContext } from 'debug-bridge-types';

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

export function collectGitContext(): GitContext {
  const status = git(['status', '--short']) ?? '';
  const changedFiles = status
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^.. /, ''))
    .slice(0, 100);

  return {
    repoRoot: git(['rev-parse', '--show-toplevel']),
    branch: git(['branch', '--show-current']) || git(['rev-parse', '--abbrev-ref', 'HEAD']),
    headSha: git(['rev-parse', 'HEAD']),
    dirty: changedFiles.length > 0,
    changedFiles,
  };
}
