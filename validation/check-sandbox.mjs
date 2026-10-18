// Run inside the runner image; no login or model request is needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { CodexClient } = await import('/opt/nf-agent-codex/client.mjs');
const { TaskFiles, shellPermissions } = await import('/opt/nf-agent-codex/files.mjs');
const { toml } = await import('/opt/nf-agent-codex/session.mjs');

await fs.mkdir('/tmp/task', { recursive: true });
await fs.mkdir('/tmp/login', { recursive: true });
await fs.writeFile('/tmp/login/private', 'fixture-secret');
const files = await new TaskFiles('/tmp/task', ['/tmp/login']).init();
const c = new CodexClient('codex', ['-c', 'default_permissions="nf_task"', '-c', `permissions.nf_task=${toml(shellPermissions(files, '/tmp/login'))}`, 'app-server'], {
  env: { ...process.env, CODEX_HOME: '/tmp/login' }, cwd: '/tmp/task',
});
c.on('failure', () => { if (c.stderr) console.error(c.stderr); });
try {
  await c.call('initialize', { clientInfo: { name: 'sandbox_test', version: '0.1.0' }, capabilities: { experimentalApi: true } });
  c.send({ method: 'initialized', params: {} });
  const run = (command) => c.call('command/exec', { command: ['/bin/bash', '-c', command], cwd: '/tmp/task', permissionProfile: 'nf_task', timeoutMs: 10000 });
  const calculation = await run('python3 -c "print(6*7)" > result.txt; cat result.txt');
  assert.equal(calculation.exitCode, 0, JSON.stringify(calculation));
  assert.equal(calculation.stdout.trim(), '42');
  const denied = await run('cat /tmp/login/private');
  assert.notEqual(denied.exitCode, 0);
  assert.ok(!denied.stdout.includes('fixture-secret'));
  const escape = await run('touch /etc/nf-codex-escape');
  assert.notEqual(escape.exitCode, 0);
  console.log('Sandbox: calculation, task writes, credential denial and outside-write denial passed');
} finally { await c.close(); }
