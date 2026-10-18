// Run inside the runner image; no login or model request is needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const runtime = process.env.RUNNER_ROOT || '/opt/nf-agent-codex';
const moduleAt = (name) => pathToFileURL(path.join(runtime, name)).href;
const { CodexClient } = await import(moduleAt('client.mjs'));
const { TaskFiles, shellPermissions } = await import(moduleAt('files.mjs'));
const { toml, clientConfig } = await import(moduleAt('session.mjs'));

const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-codex-sandbox-'));
const login = process.env.TEST_LOGIN_HOME || path.join(fixtureRoot, 'login');
const task = process.env.TEST_WORK_DIR || path.join(fixtureRoot, 'task');
const control = path.join(fixtureRoot, 'control');
await fs.mkdir(task, { recursive: true });
await fs.mkdir(login, { recursive: true });
await fs.writeFile(login + '/private', 'fixture-secret');
await fs.mkdir(control);
const source = path.join(fixtureRoot, 'source.txt');
const original = 'immutable source fixture\n';
await fs.writeFile(source, original);
await fs.copyFile(source, path.join(task, 'copy.txt'));
await fs.link(source, path.join(task, 'link.txt'));
await fs.symlink(source, path.join(task, 'symlink.txt'));
await fs.symlink(path.relative(task, source), path.join(task, 'rellink.txt'));
await fs.mkdir(path.join(task, 'copied-directory'));
await fs.copyFile(source, path.join(task, 'copied-directory/input.txt'));
const files = await new TaskFiles(task, [login]).init();
const policy = shellPermissions(files, login);
policy.filesystem[control] = 'read';
policy.filesystem[runtime] = 'read';
if (process.env.CODEX_RUNTIME_ROOT) policy.filesystem[process.env.CODEX_RUNTIME_ROOT] = 'read';
const c = new CodexClient('codex', [...Object.entries(clientConfig(policy)).flatMap(([k,v]) => ['-c', `${k}=${toml(v)}`]), 'app-server'], {
  env: { ...process.env, CODEX_HOME: login }, cwd: task,
});
c.on('failure', () => { if (c.stderr) console.error(c.stderr); });
try {
  await c.call('initialize', { clientInfo: { name: 'sandbox_test', version: '0.1.1' }, capabilities: { experimentalApi: true } });
  c.send({ method: 'initialized', params: {} });
  const run = (command) => c.call('command/exec', { command: ['/bin/bash', '-c', command], cwd: task, permissionProfile: 'nf_task', timeoutMs: 10000,
    env: { HOME: null, BASH_ENV: null, ENV: null } });
  const calculation = await run('python3 -c "print(6*7)" > result.txt; cat result.txt');
  assert.equal(calculation.exitCode, 0, JSON.stringify(calculation));
  assert.equal(calculation.stdout.trim(), '42');
  for (const name of ['copy.txt', 'link.txt', 'symlink.txt', 'rellink.txt', 'copied-directory/input.txt']) {
    const blocked = await run(`printf modified > '${name}'`);
    assert.notEqual(blocked.exitCode, 0, `${name} must be read-only`);
    assert.equal(await fs.readFile(path.join(task, name), 'utf8'), original);
    assert.equal(await fs.readFile(source, 'utf8'), original);
  }
  assert.notEqual((await run('printf modified > copied-directory/new.txt')).exitCode, 0);
  assert.notEqual((await run('ln link.txt alias.txt && printf modified > alias.txt')).exitCode, 0);
  assert.equal(await fs.readFile(source, 'utf8'), original);
  const denied = await run(`cat ${login}/private`);
  assert.notEqual(denied.exitCode, 0);
  assert.ok(!denied.stdout.includes('fixture-secret'));
  const symlink = await run(`ln -s ${login}/private secret-link; cat secret-link`);
  assert.notEqual(symlink.exitCode, 0);
  assert.ok(!symlink.stdout.includes('fixture-secret'));
  const network = await run("python3 -c 'import socket; socket.create_connection((\"1.1.1.1\", 443), 2)'");
  assert.notEqual(network.exitCode, 0);
  const escape = await run('touch /etc/nf-codex-escape');
  assert.notEqual(escape.exitCode, 0);
  const request = path.join(control, 'request.json');
  await fs.writeFile(request, JSON.stringify({ name: 'write', args: { path: 'worker.txt', content: 'safe' }, root: task, denied: [login], inputs: [...files.inputs] }));
  const worker = await run(`node '${runtime}/fs-worker.mjs' '${request}'`);
  assert.equal(worker.exitCode, 0, JSON.stringify(worker));
  assert.equal(await fs.readFile(path.join(task, 'worker.txt'), 'utf8'), 'safe');
  await fs.writeFile(request, JSON.stringify({ name: 'write', args: { path: 'link.txt', content: 'modified' }, root: task, denied: [login], inputs: [...files.inputs] }));
  assert.notEqual((await run(`node '${runtime}/fs-worker.mjs' '${request}'`)).exitCode, 0);
  assert.equal(await fs.readFile(source, 'utf8'), original);
  // Even a bypass of the worker's path checks cannot bypass the OS filesystem policy.
  await fs.writeFile(request, JSON.stringify({ name: 'read', args: { path: 'private' }, root: login, denied: [], inputs: [] }));
  const workerDenied = await run(`node '${runtime}/fs-worker.mjs' '${request}'`);
  assert.notEqual(workerDenied.exitCode, 0);
  assert.ok(!workerDenied.stdout.includes('fixture-secret'));
  console.log('Sandbox: all staging modes read-only; task outputs, credentials and network boundaries verified');
} finally {
  await c.close();
  await fs.rm(fixtureRoot, { recursive: true, force: true });
}
