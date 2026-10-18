import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('public runtime fallback verifies its checksum before loading and cleans temporary files', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-install-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'bin'));
  await fs.mkdir(path.join(root, 'scratch'));
  const stub = async (name, body) => fs.writeFile(path.join(root, 'bin', name), '#!/bin/sh\nset -eu\n' + body, { mode: 0o755 });
  await stub('nextflow', 'test "$1" = plugin\n');
  await stub('docker', 'if [ "$1" = pull ]; then exit 1; fi\ntest "$1" = load\ntest -s "$3"\necho loaded >> "$INSTALL_FIXTURE/loaded"\n');
  await stub('curl', `url=''; output=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output=$2; shift 2 ;;
    https:*) url=$1; shift ;;
    *) shift ;;
  esac
done
case "$url" in
  */SHA512SUMS) cp "$INSTALL_FIXTURE/SHA512SUMS" "$output" ;;
  *) cp "$INSTALL_FIXTURE/image" "$output" ;;
esac
`);
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const version = (await fs.readFile(path.join(repo, 'VERSION'), 'utf8')).trim();
  const fixture = 'synthetic image fixture';
  const hash = createHash('sha512').update(fixture).digest('hex');
  await fs.writeFile(path.join(root, 'image'), fixture);
  await fs.writeFile(path.join(root, 'SHA512SUMS'), `${hash}  nf-agent-codex-${version}-image-linux-amd64.tar.gz\n`);
  const run = () => spawnSync('bash', [path.join(repo, 'bin/install')], { encoding: 'utf8',
    env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, INSTALL_FIXTURE: root, TMPDIR: `${root}/scratch` } });
  const good = run();
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.equal(await fs.readFile(path.join(root, 'loaded'), 'utf8'), 'loaded\n');
  assert.deepEqual(await fs.readdir(path.join(root, 'scratch')), []);
  await fs.rm(path.join(root, 'loaded'));
  await fs.writeFile(path.join(root, 'image'), 'corrupted');
  assert.notEqual(run().status, 0);
  await assert.rejects(fs.access(path.join(root, 'loaded')));
  assert.deepEqual(await fs.readdir(path.join(root, 'scratch')), []);
});
