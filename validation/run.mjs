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
async function run(extra = [], workflow = 'features.nf') {
  const trace = path.join(temporary, `trace-${++count}.tsv`);
  const result = spawnSync(nextflow, ['-log', path.join(temporary, 'nextflow.log'), '-C',
    `${root}/validation/nextflow.config,${root}/validation/fake.config`, 'run', `${root}/validation/${workflow}`,
    '-w', `${temporary}/work`, '-ansi-log', 'false', '-with-trace', trace, ...extra],
    { cwd: temporary, encoding: 'utf8', timeout: 180000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const lines = (await fs.readFile(trace, 'utf8')).trim().split('\n').map((line) => line.split('\t'));
  const headers = lines.shift();
  return { text: result.stdout, rows: lines.map((line) => Object.fromEntries(headers.map((h, i) => [h, line[i]]))) };
}
try {
  const fresh = await run();
  for (const expected of ['ANSWER=HELLO', 'ANSWER=WORLD', 'REPORT=fixture report', 'SKILL=Threshold 7'])
    assert.ok(fresh.text.includes(expected), fresh.text);
  assert.equal(fresh.rows.length, 6);
  assert.ok(fresh.rows.every((r) => r.status === 'COMPLETED'));
  const resumed = await run(['-resume']);
  assert.equal(resumed.rows.length, 4); // Cached agents do not invoke their nested tools again.
  assert.ok(resumed.rows.every((r) => r.status === 'CACHED'));
  const changed = await run(['-resume', '--word', 'changed'], 'main.nf');
  assert.ok(changed.text.includes('ANSWER=CHANGED'));
  assert.ok(changed.rows.every((r) => r.status === 'COMPLETED'));
  const changedModel = await run(['-resume', '--word', 'changed', '--model', 'openai/fixture-other'], 'main.nf');
  assert.ok(changedModel.rows.some((r) => r.name === 'demonstrate' && r.status === 'COMPLETED'));
  console.log('Integration passed: module calls, records, parallel agents, files, skills, resume and cache invalidation');
} catch (error) {
  console.error(`Integration artifacts retained at ${temporary}`);
  throw error;
}
await fs.rm(temporary, { recursive: true, force: true });
