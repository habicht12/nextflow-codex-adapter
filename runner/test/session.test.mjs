import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from '../session.mjs';

const fake = fileURLToPath(new URL('./fake-codex.mjs', import.meta.url));
const schema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-codex-test-'));
  const cwd = process.cwd();
  const env = { ...process.env };
  await fs.mkdir(path.join(root, 'home'));
  await fs.mkdir(path.join(root, 'task'));
  process.chdir(path.join(root, 'task'));
  process.env.CODEX_HOME = path.join(root, 'home');
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'CODEX_ACCESS_TOKEN', 'TEST_CODEX_FAULT']) delete process.env[key];
  t.after(async () => {
    process.chdir(cwd);
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    await fs.rm(root, { recursive: true, force: true });
  });
  return { model: 'openai/test-model', prompt: 'uppercase hello', outputSchema: schema, requestTimeoutSeconds: 5 };
}
const options = { command: process.execPath, extraArgs: [fake] };

test('bridges a declared Nextflow tool and validates the final record', async (t) => {
  const spec = await fixture(t);
  spec.toolSpecs = [{ name: 'uppercase', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }];
  const calls = [];
  const result = await runAgent(spec, { ...options, broker: async (name, id, args) => { calls.push([name, id, args]); return 'HELLO\n'; } });
  assert.deepEqual(calls, [['uppercase', 'call-1', { text: 'hello' }]]);
  assert.deepEqual(JSON.parse(result.output), { answer: 'HELLO' });
  assert.equal(result.resolvedModel, 'openai/test-model');
});

for (const fault of ['login', 'model', 'json', 'failed', 'malformed', 'exit', 'interactive', 'timeout']) {
  test(`fails clearly for ${fault}`, async (t) => {
    const spec = await fixture(t);
    process.env.TEST_CODEX_FAULT = fault;
    if (fault === 'timeout') spec.requestTimeoutSeconds = 0.15;
    await assert.rejects(runAgent(spec, options));
  });
}

test('a Nextflow tool failure fails the entire agent', async (t) => {
  const spec = await fixture(t);
  spec.toolSpecs = [{ name: 'uppercase', inputSchema: { type: 'object' } }];
  await assert.rejects(runAgent(spec, { ...options, broker: async () => { throw new Error('Task failed'); } }), /Task failed/);
});

test('external cancellation stops an active turn', async (t) => {
  const spec = await fixture(t);
  process.env.TEST_CODEX_FAULT = 'timeout';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  t.after(() => clearTimeout(timer));
  await assert.rejects(runAgent(spec, { ...options, signal: controller.signal }), /cancelled/);
});

test('rejects inherited user configuration and API credentials', async (t) => {
  const spec = await fixture(t);
  process.env.OPENAI_API_KEY = 'fixture';
  await assert.rejects(runAgent(spec, options), /API overrides/);
  delete process.env.OPENAI_API_KEY;
  await fs.writeFile(path.join(process.env.CODEX_HOME, 'config.toml'), '');
  await assert.rejects(runAgent(spec, options), /dedicated login/);
});
