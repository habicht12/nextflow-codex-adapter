#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-codex-integration-'));
const nextflow = process.env.NEXTFLOW || 'nextflow';
let count = 0;
async function run(extra = [], workflow = 'features.nf', expectFailure = false, configs = `${root}/validation/nextflow.config,${root}/validation/fake.config`) {
  const trace = path.join(temporary, `trace-${++count}.tsv`);
  const result = spawnSync(nextflow, ['-log', path.join(temporary, 'nextflow.log'), '-C',
    configs, 'run', `${root}/validation/${workflow}`,
    '-w', `${temporary}/work`, '-ansi-log', 'false', '-with-trace', trace, ...extra],
    { cwd: temporary, encoding: 'utf8', timeout: 180000 });
  if (expectFailure) {
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    return { text: result.stdout + result.stderr };
  }
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const lines = (await fs.readFile(trace, 'utf8')).trim().split('\n').map((line) => line.split('\t'));
  const headers = lines.shift();
  return { text: result.stdout, rows: lines.map((line) => Object.fromEntries(headers.map((h, i) => [h, line[i]]))) };
}

async function stagedInputs() {
  const inputs = [];
  for (const shard of await fs.readdir(`${temporary}/work`)) {
    const directory = path.join(temporary, 'work', shard);
    if (!(await fs.stat(directory)).isDirectory()) continue;
    for (const task of await fs.readdir(directory)) {
      const input = path.join(directory, task, 'input.txt');
      try { await fs.lstat(input); inputs.push(input); }
      catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    }
  }
  return inputs;
}
try {
  const fresh = await run();
  for (const expected of ['ANSWER=HELLO', 'ANSWER=WORLD', 'REPORT=fixture report', 'SKILL=Threshold 7', 'SCALAR=42', 'OPTIONAL=HELLO'])
    assert.ok(fresh.text.includes(expected), fresh.text);
  assert.equal(fresh.rows.length, 8);
  assert.ok(fresh.rows.every((r) => r.status === 'COMPLETED'));
  const resumed = await run(['-resume']);
  assert.equal(resumed.rows.length, 6); // Cached agents do not invoke their nested tools again.
  assert.ok(resumed.rows.every((r) => r.status === 'CACHED'));
  const changed = await run(['-resume', '--word', 'changed'], 'main.nf');
  assert.ok(changed.text.includes('ANSWER=CHANGED'));
  assert.ok(changed.rows.every((r) => r.status === 'COMPLETED'));
  const changedModel = await run(['-resume', '--word', 'changed', '--model', 'openai/fixture-other'], 'main.nf');
  assert.ok(changedModel.rows.some((r) => r.name === 'demonstrate' && r.status === 'COMPLETED'));
  await fs.mkdir(path.join(temporary, 'source'));
  const source = path.join(temporary, 'source/input.txt');
  const original = 'immutable source fixture\n';
  await fs.writeFile(source, original);
  const sourceMode = (await fs.stat(source)).mode;
  for (const mode of ['copy', 'link', 'symlink', 'rellink']) {
    const before = new Set(await stagedInputs());
    const failed = await run(['--test_input', source, '--stage_mode', mode, '--fake_codex_fault', 'write_input'], 'staging.nf', true);
    assert.match(failed.text, /Staged inputs are read-only/);
    const inputs = (await stagedInputs()).filter((file) => !before.has(file));
    assert.equal(inputs.length, 1, `Expected one ${mode} input`);
    const staged = inputs[0];
    assert.equal(await fs.readFile(staged, 'utf8'), original);
    assert.equal(await fs.readFile(source, 'utf8'), original);
    assert.equal((await fs.stat(source)).mode, sourceMode);
    if (mode === 'copy' || mode === 'link') {
      assert.equal((await fs.lstat(staged)).isSymbolicLink(), false);
      assert.equal((await fs.stat(staged)).ino === (await fs.stat(source)).ino, mode === 'link');
    } else {
      assert.equal((await fs.lstat(staged)).isSymbolicLink(), true);
      assert.equal(path.isAbsolute(await fs.readlink(staged)), mode === 'symlink');
    }
  }
  // Exercise the public examples' containerOptions, without replacing
  // them with the simpler fixture options used by the other integration cases.
  const login = path.join(temporary, 'empty-login');
  await fs.mkdir(login);
  const onboarding = path.join(temporary, 'onboarding.config');
  await fs.writeFile(onboarding,
    `docker.runOptions = ${JSON.stringify(`-v '${root}/runner/test/fake-codex.mjs:/usr/local/bin/codex:ro'`)}\n`);
  const firstRun = await run(['--codex_home', login], 'main.nf', false, `${root}/examples/nextflow.config,${onboarding}`);
  assert.ok(firstRun.text.includes('ANSWER=HELLO'), firstRun.text);
  assert.equal(firstRun.rows.length, 2);
  assert.ok(firstRun.rows.every((row) => row.status === 'COMPLETED'));
  assert.ok(!firstRun.text.includes('containerOptions` is not a plain string'));
  console.log('Integration passed: staging protection, outputs, tools, resume and the documented example configuration');
} catch (error) {
  console.error(`Integration artifacts retained at ${temporary}`);
  throw error;
}
await fs.rm(temporary, { recursive: true, force: true });
