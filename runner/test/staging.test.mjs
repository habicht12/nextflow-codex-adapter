import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { TaskFiles, shellPermissions } from '../files.mjs';
import { ToolSet } from '../tools.mjs';

const content = 'original input\n';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-codex-staging-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const task = path.join(root, 'task');
  const source = path.join(root, 'source.txt');
  await fs.mkdir(task);
  await fs.writeFile(source, content);
  return { root, task, source };
}

for (const mode of ['copy', 'link', 'symlink', 'rellink']) {
  test(`${mode}: write and edit cannot alter a staged input or its source`, async (t) => {
    const { task, source } = await fixture(t);
    const input = path.join(task, 'input.txt');
    if (mode === 'copy') await fs.copyFile(source, input);
    else if (mode === 'link') await fs.link(source, input);
    else await fs.symlink(mode === 'symlink' ? source : path.relative(task, source), input);
    const files = await new TaskFiles(task).init();
    const tools = new ToolSet({ nativeToolNames: ['read', 'write', 'edit'] }, files, null, null);
    assert.equal(await tools.call('read', { path: 'input.txt' }, 'read'), content);
    await assert.rejects(tools.call('write', { path: 'input.txt', content: 'modified' }, 'write'), /read-only|outside/);
    await assert.rejects(tools.call('edit', { path: 'input.txt', oldText: 'original', newText: 'modified' }, 'edit'), /read-only|outside/);
    assert.equal(await fs.readFile(input, 'utf8'), content);
    assert.equal(await fs.readFile(source, 'utf8'), content);
    const policy = shellPermissions(files, path.join(task, 'unused-login'));
    if (mode === 'copy' || mode === 'link') assert.equal(policy.filesystem[input], 'read');
    assert.equal(policy.filesystem[await fs.realpath(input)], 'read');
    await tools.call('write', { path: 'report.txt', content: 'first result' }, 'output');
    await tools.call('edit', { path: 'report.txt', oldText: 'first', newText: 'final' }, 'update');
    assert.equal(await fs.readFile(path.join(task, 'report.txt'), 'utf8'), 'final result');
  });
}

test('copied input directories are read-only, including new files inside them', async (t) => {
  const { task } = await fixture(t);
  await fs.mkdir(path.join(task, 'dataset/nested'), { recursive: true });
  await fs.writeFile(path.join(task, 'dataset/nested/.metadata'), content);
  const files = await new TaskFiles(task).init();
  assert.equal(await files.read('dataset/nested/.metadata'), content);
  await assert.rejects(files.write('dataset/nested/.metadata', 'modified'), /read-only/);
  await assert.rejects(files.write('dataset/new.txt', 'modified'), /read-only/);
  await fs.mkdir(path.join(task, 'output'));
  await files.write('output/result.txt', 'result');
});

test('a new hardlink alias cannot be used to modify a shared inode', async (t) => {
  const { task, source } = await fixture(t);
  const files = await new TaskFiles(task).init();
  await fs.link(source, path.join(task, 'alias.txt'));
  await assert.rejects(files.write('alias.txt', 'modified'), /hard.link|read-only/i);
  assert.equal(await fs.readFile(source, 'utf8'), content);
});
