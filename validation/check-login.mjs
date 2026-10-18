// Explicit live authentication check. Never run this in public CI.
// Credentials stay in CODEX_HOME; only pass/fail information is printed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const runtime = process.env.RUNNER_ROOT || '/opt/nf-agent-codex';
const { CodexClient } = await import(pathToFileURL(path.join(runtime, 'client.mjs')).href);
if (!process.env.CODEX_HOME) throw new Error('Set CODEX_HOME to the dedicated login directory');
const auth = path.join(process.env.CODEX_HOME, 'auth.json');
const fingerprint = async () => createHash('sha256').update(await fs.readFile(auth)).digest('hex');

async function account(refreshToken) {
  const client = new CodexClient('codex', ['-c', 'cli_auth_credentials_store="file"', 'app-server']);
  client.on('failure', () => {});
  try {
    await client.call('initialize', { clientInfo: { name: 'nf_codex_auth_check', version: '0.1.1' } });
    client.send({ method: 'initialized', params: {} });
    const result = await client.call('account/read', { refreshToken });
    assert.equal(result.account?.type, 'chatgpt', 'A ChatGPT login is required');
  } finally { await client.close(); }
}

await account(false);
const before = await fingerprint();
await account(true);
assert.notEqual(await fingerprint(), before, 'Forced refresh did not persist updated authentication state');
await account(false);
console.log('ChatGPT login, forced token refresh and persisted login after restart verified');
