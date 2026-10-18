import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { TaskFiles } from '../files.mjs';
import { ToolSet, validateOutput } from '../tools.mjs';

test('filesystem permits staged reads and refuses escapes and input writes', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-codex-files-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'task'));
  await fs.mkdir(path.join(root, 'private'));
  await fs.writeFile(path.join(root, 'input'), 'reads');
  await fs.writeFile(path.join(root, 'private/auth.json'), 'secret fixture');
  await fs.symlink('../input', path.join(root, 'task/input'));
  const files = await new TaskFiles(path.join(root, 'task'), [path.join(root, 'private')]).init();
  assert.equal(await files.read('input'), 'reads');
  await assert.rejects(files.write('input', 'changed'), /outside|read-only/);
  await assert.rejects(files.read('../private/auth.json'), /denied/);
  await files.write('report.txt', 'result');
  assert.equal(await files.read('report.txt'), 'result');
  await fs.symlink('../private', path.join(root, 'task/escape'));
  await assert.rejects(files.write('escape/stolen', 'x'), /denied/);
});

test('tool declarations, arguments and call budgets are enforced', async () => {
  const set = new ToolSet({ maxIterations: 1, toolSpecs: [{ name: 'count', inputSchema: { type: 'object' } }] }, null, null, async () => '7');
  await assert.rejects(set.call('bash', {}, '1'), /not declared/);
  assert.equal(await set.call('count', {}, '2'), '7');
  await assert.rejects(set.call('count', {}, '3'), /maxIterations/);
  const invalid = new ToolSet({ nativeToolNames: ['write'] }, {}, null, null);
  await assert.rejects(invalid.call('write', { path: 'a' }, '4'), /Invalid arguments/);
});

test('skills expose only declared resources after activation', async () => {
  const set = new ToolSet({ skills: [{ name: 'qc', content: 'Check counts', resources: [{ relativePath: 'guide.txt', content: 'Threshold 7' }] }] }, null, null, null);
  await assert.rejects(set.call('read_skill_resource', { skill: 'qc', path: 'guide.txt' }, '1'), /Activate/);
  assert.equal(await set.call('activate_skill', { name: 'qc' }, '2'), 'Check counts');
  assert.equal(await set.call('read_skill_resource', { skill: 'qc', path: 'guide.txt' }, '3'), 'Threshold 7');
  await assert.rejects(set.call('read_skill_resource', { skill: 'qc', path: '../auth.json' }, '4'), /Unknown/);
});

test('schema validation refuses plausible but wrong results', () => {
  assert.throws(() => validateOutput({ type: 'integer' }, '"7"'), /schema/);
  assert.throws(() => validateOutput(null, ''), /no final/);
  assert.equal(validateOutput({ type: 'integer' }, '7'), '7');
});
