#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  getSkillContent,
  getSkillMetadata,
  installSkill,
  uninstallSkill,
  getSkillStatus,
} from '../packages/skill/dist/index.js';

console.log('=== Validating debug-bridge-skill npm package ===\n');

// 1. Validate content and metadata
console.log('1. Checking skill content and metadata...');
const content = getSkillContent();
assert(content.length > 500, 'Skill content should be non-empty and >500 chars');
assert(content.includes('name: debug-bridge'), 'Skill content should contain frontmatter name');
assert(content.includes('browser_sidecar'), 'Skill content should contain browser_sidecar capability');
assert(content.includes('design_mode'), 'Skill content should contain design_mode capability');

const meta = getSkillMetadata();
assert.equal(meta.name, 'debug-bridge');
assert.equal(meta.version, '0.2.0');
console.log('   ✓ Content and metadata verified');

// 2. Test installation in isolated sandbox directory
console.log('2. Testing install into sandbox directory...');
const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-'));

try {
  const installResults = installSkill({
    project: true,
    cwd: sandboxDir,
    agents: ['claude', 'cursor'],
  });

  assert.equal(installResults.length, 2, 'Should return 2 install results');
  for (const res of installResults) {
    assert.equal(res.status, 'installed', `Status should be installed for ${res.agent}`);
    assert(fs.existsSync(res.path), `File should exist at ${res.path}`);
    const fileText = fs.readFileSync(res.path, 'utf8');
    assert.equal(fileText, content, 'Installed content must match source skill');
  }
  console.log('   ✓ Installed successfully to sandbox');

  // 3. Test idempotency (already up to date)
  console.log('3. Testing idempotency...');
  const secondResults = installSkill({
    project: true,
    cwd: sandboxDir,
    agents: ['claude', 'cursor'],
  });
  for (const res of secondResults) {
    assert.equal(res.status, 'already-up-to-date', `Status should be already-up-to-date for ${res.agent}`);
  }
  console.log('   ✓ Idempotency verified');

  // 4. Test force overwrite
  console.log('4. Testing force overwrite...');
  const forceResults = installSkill({
    project: true,
    cwd: sandboxDir,
    agents: ['claude', 'cursor'],
    force: true,
  });
  for (const res of forceResults) {
    assert.equal(res.status, 'updated', `Status should be updated when forced for ${res.agent}`);
  }
  console.log('   ✓ Force overwrite verified');

  // 5. Test status query
  console.log('5. Testing getSkillStatus...');
  const statusResults = getSkillStatus({
    project: true,
    cwd: sandboxDir,
  });
  const claudeStatus = statusResults.find((s) => s.agent === 'claude');
  assert(claudeStatus?.installed, 'Claude skill should report installed');
  assert((claudeStatus?.sizeBytes ?? 0) > 0, 'Claude skill sizeBytes should be positive');
  console.log('   ✓ Status reporting verified');

  // 6. Test uninstall
  console.log('6. Testing uninstall...');
  const uninstallResults = uninstallSkill({
    project: true,
    cwd: sandboxDir,
    agents: ['claude', 'cursor'],
  });
  for (const res of uninstallResults) {
    assert.equal(res.status, 'removed', `Status should be removed for ${res.agent}`);
    assert(!fs.existsSync(res.path), `File should no longer exist at ${res.path}`);
  }
  console.log('   ✓ Uninstall verified');

  // 7. Test CLI execution
  console.log('7. Testing CLI binary execution via child_process...');
  const cliPath = path.resolve('packages/skill/dist/bin/cli.js');
  const cliOutput = execFileSync(process.execPath, [cliPath, 'install', '--project', '--agent', 'claude', '--json'], {
    cwd: sandboxDir,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(cliOutput);
  assert.equal(parsed[0].agent, 'claude');
  assert.equal(parsed[0].status, 'installed');
  console.log('   ✓ CLI binary execution verified');
} finally {
  fs.rmSync(sandboxDir, { recursive: true, force: true });
}

console.log('\n=== All debug-bridge-skill validations passed 100% ===\n');
