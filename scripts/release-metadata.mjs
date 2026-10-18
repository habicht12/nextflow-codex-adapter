import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const pkg = JSON.parse(await fs.readFile('runner/package.json', 'utf8'));
const version = pkg.version;
if ((await fs.readFile('VERSION', 'utf8')).trim() !== version) throw new Error('VERSION and runner/package.json disagree');
const name = `nf-agent-codex-${version}`;
const archive = await fs.readFile(`build/distributions/${name}.zip`);
const sha512sum = createHash('sha512').update(archive).digest('hex');
const metadata = { version, date: new Date().toISOString(),
  url: `https://github.com/habicht12/nextflow-codex-adapter/releases/download/v${version}/${name}.zip`,
  requires: '>=26.10.0', sha512sum };
await fs.writeFile(`build/distributions/${name}-meta.json`, JSON.stringify(metadata, null, 2) + '\n');
const checksums = [];
for (const file of (await fs.readdir('build/distributions')).sort()) {
  if (!file.endsWith('.zip') && !file.endsWith('.tar.gz')) continue;
  const hash = createHash('sha512').update(await fs.readFile(`build/distributions/${file}`)).digest('hex');
  checksums.push(`${hash}  ${file}`);
}
await fs.writeFile('build/distributions/SHA512SUMS', checksums.join('\n') + '\n');
