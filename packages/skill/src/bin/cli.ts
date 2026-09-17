#!/usr/bin/env node
import { Command } from 'commander';
import {
  installSkill,
  uninstallSkill,
  getSkillStatus,
  type InstallOptions,
} from '../installer';
import { getSkillContent, getSkillMetadata } from '../skill-content';

const program = new Command();
const meta = getSkillMetadata();

program
  .name('debug-bridge-skill')
  .description('Install and manage Debug Bridge AI agent skills across coding assistants')
  .version(meta.version);

program
  .command('install', { isDefault: true })
  .description('Install Debug Bridge skill to AI agent environments (Claude Code, Gemini, Cursor, Codex)')
  .option('-g, --global', 'Install globally to user agent directories (default: true)', true)
  .option('-p, --project', 'Install to current project directory (.claude, .cursor, .github)', false)
  .option('-a, --agent <agents>', 'Specific comma-separated agents: claude, gemini, cursor, codex, agents, all')
  .option('-s, --symlink', 'Create symlink to skill instead of copying', false)
  .option('-f, --force', 'Force overwrite existing skill file', false)
  .option('--json', 'Output results as JSON', false)
  .action((opts) => {
    const options: InstallOptions = {
      global: opts.project ? false : true,
      project: Boolean(opts.project),
      agents: opts.agent ? [opts.agent] : undefined,
      symlink: Boolean(opts.symlink),
      force: Boolean(opts.force),
    };

    const results = installSkill(options);

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    console.log('\n📦 Debug Bridge AI Agent Skill Installer');
    console.log('━'.repeat(50));

    let successCount = 0;
    for (const res of results) {
      if (res.status === 'installed') {
        console.log(`✓ [${res.agent}] Installed: ${res.path}`);
        successCount++;
      } else if (res.status === 'updated') {
        console.log(`✓ [${res.agent}] Updated: ${res.path}`);
        successCount++;
      } else if (res.status === 'already-up-to-date') {
        console.log(`• [${res.agent}] Up to date: ${res.path}`);
        successCount++;
      } else {
        console.error(`✗ [${res.agent}] Failed: ${res.error ?? 'Unknown error'}`);
      }
    }

    console.log('━'.repeat(50));
    if (successCount > 0) {
      console.log('✨ Skill ready! Ask your agent:');
      console.log('   "debug the app" or "launch browser sidecar" or "design mode"');
    }
    console.log('');
  });

program
  .command('uninstall')
  .description('Remove Debug Bridge skill from AI agent environments')
  .option('-g, --global', 'Uninstall from global directories (default: true)', true)
  .option('-p, --project', 'Uninstall from current project directory', false)
  .option('-a, --agent <agents>', 'Specific comma-separated agents')
  .option('--json', 'Output results as JSON', false)
  .action((opts) => {
    const results = uninstallSkill({
      global: opts.project ? false : true,
      project: Boolean(opts.project),
      agents: opts.agent ? [opts.agent] : undefined,
    });

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    console.log('\n🗑️ Debug Bridge Skill Uninstaller');
    console.log('━'.repeat(50));
    for (const res of results) {
      if (res.status === 'removed') {
        console.log(`✓ [${res.agent}] Removed: ${res.path}`);
      } else if (res.status === 'not-found') {
        console.log(`• [${res.agent}] Not installed: ${res.path}`);
      } else {
        console.error(`✗ [${res.agent}] Error: ${res.error}`);
      }
    }
    console.log('');
  });

program
  .command('status')
  .alias('ls')
  .alias('list')
  .description('Check installation status of Debug Bridge skill across assistants')
  .option('-g, --global', 'Check global directories', true)
  .option('-p, --project', 'Check project directory', false)
  .option('--json', 'Output as JSON', false)
  .action((opts) => {
    const status = getSkillStatus({
      global: opts.project ? false : true,
      project: Boolean(opts.project),
    });

    if (opts.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    console.log('\n🔍 Debug Bridge Skill Status');
    console.log('━'.repeat(50));
    for (const s of status) {
      const mark = s.installed ? '✓' : '✗';
      const state = s.installed ? `Installed (${s.sizeBytes} bytes)` : 'Not installed';
      console.log(`${mark} ${s.name} (${s.scope}):`);
      console.log(`   Path: ${s.path}`);
      console.log(`   Status: ${state}`);
      if (s.modifiedAt) {
        console.log(`   Modified: ${s.modifiedAt}`);
      }
      console.log('');
    }
  });

program
  .command('print')
  .alias('cat')
  .description('Print raw SKILL.md content to stdout')
  .action(() => {
    process.stdout.write(getSkillContent());
  });

program.parse(process.argv);
