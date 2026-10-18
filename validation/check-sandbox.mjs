// Run inside the runner image; no login or model request is needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const runtime = process.env.RUNNER_ROOT || '/opt/nf-agent-codex';
const moduleAt = (name) => pathToFileURL(path.join(runtime, name)).href;
const { CodexClient } = await import(moduleAt('client.mjs'));
const { TaskFiles, shellPermissions } = await import(moduleAt('files.mjs'));
const { toml, clientConfig } = await import(moduleAt('session.mjs'));

const login = process.env.TEST_LOGIN_HOME || '/tmp/login';
const task = process.env.TEST_WORK_DIR || '/tmp/task';
await fs.mkdir(task, { recursive: true });
await fs.mkdir(login, { recursive: true });
await fs.writeFile(login + '/private', 'fixture-secret');
await fs.mkdir('/tmp/control', { recursive: true });
const files = await new TaskFiles(task, [login]).init();
const policy = shellPermissions(files, login);
policy.filesystem['/tmp/control'] = 'read';
policy.filesystem[runtime] = 'read';
if (process.env.CODEX_RUNTIME_ROOT) policy.filesystem[process.env.CODEX_RUNTIME_ROOT] = 'read';
const c = new CodexClient('codex', [...Object.entries(clientConfig(policy)).flatMap(([k,v]) => ['-c', `${k}=${toml(v)}`]), 'app-server'], {
  env: { ...process.env, CODEX_HOME: login }, cwd: task,
});
c.on('failure', () => { if (c.stderr) console.error(c.stderr); });
try {
  await c.call('initialize', { clientInfo: { name: 'sandbox_test', version: '0.1.0' }, capabilities: { experimentalApi: true } });
  c.send({ method: 'initialized', params: {} });
  const run = (command) => c.call('command/exec', { command: ['/bin/bash', '-c', command], cwd: task, permissionProfile: 'nf_task', timeoutMs: 10000,
    env: { HOME: null, BASH_ENV: null, ENV: null } });
  const calculation = await run('python3 -c "print(6*7)" > result.txt; cat result.txt');
  assert.equal(calculation.exitCode, 0, JSON.stringify(calculation));
  assert.equal(calculation.stdout.trim(), '42');
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
  await fs.writeFile('/tmp/control/request.json', JSON.stringify({ name: 'write', args: { path: 'worker.txt', content: 'safe' }, root: task, denied: [login], inputs: [] }));
  const worker = await run(`node '${runtime}/fs-worker.mjs' /tmp/control/request.json`);
  assert.equal(worker.exitCode, 0, JSON.stringify(worker));
  assert.equal(await fs.readFile('/tmp/task/worker.txt', 'utf8'), 'safe');
  // Even a bypass of the worker's path checks cannot bypass the OS filesystem policy.
  await fs.writeFile('/tmp/control/request.json', JSON.stringify({ name: 'read', args: { path: 'private' }, root: login, denied: [], inputs: [] }));
  const workerDenied = await run(`node '${runtime}/fs-worker.mjs' /tmp/control/request.json`);
  assert.notEqual(workerDenied.exitCode, 0);
  assert.ok(!workerDenied.stdout.includes('fixture-secret'));
  console.log('Sandbox: calculation, task writes, credential denial and outside-write denial passed');
} finally { await c.close(); }
