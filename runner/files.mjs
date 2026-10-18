import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const within = (root, target) => target === root || target.startsWith(root + path.sep);

export class TaskFiles {
  constructor(root, denied = []) {
    this.root = root;
    this.denied = denied;
    this.inputs = new Set();
    this.inputTargets = new Set();
  }

  async init() {
    this.root = await fs.realpath(this.root);
    let visited = 0;
    const scan = async (dir) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (++visited > 10000) throw new Error('Task staging contains more than 10000 entries');
        const file = path.join(dir, entry.name);
        // Snapshot every pre-existing entry before Codex starts. Copies and hard
        // links look like ordinary files; symlink detection alone misses them.
        // Preserve both the staged name and its target, without chmod/chown (which
        // would also change the original inode for a hard-linked input).
        this.inputs.add(file);
        const target = await fs.realpath(file);
        this.inputs.add(target);
        this.inputTargets.add(target);
        if (entry.isDirectory()) await scan(file);
      }
    };
    await scan(this.root);
    return this;
  }

  async resolve(name = '.', write = false) {
    if (typeof name !== 'string' || name.includes('\0')) throw new Error('Invalid file path');
    const file = path.resolve(this.root, name);
    if (write && [...this.inputs].some((input) => within(input, file))) throw new Error('Staged inputs are read-only');
    let real;
    try { real = await fs.realpath(file); }
    catch (error) {
      if (!write || error.code !== 'ENOENT') throw error;
      real = path.join(await fs.realpath(path.dirname(file)), path.basename(file));
    }
    if (this.denied.some((dir) => within(dir, real))) throw new Error('Access to runner credentials or configuration is denied');
    if (write ? !within(this.root, real) : !within(this.root, real) && ![...this.inputs].some((p) => within(p, real)))
      throw new Error('Path is outside the task and its staged inputs');
    // An output symlink must not provide another route to a protected input.
    if (write && [...this.inputs].some((p) => within(p, real))) throw new Error('Staged inputs are read-only');
    return real;
  }

  async read(name) {
    const file = await this.resolve(name);
    if ((await fs.stat(file)).size > 1024 * 1024) throw new Error('File exceeds 1 MiB; use a declared analysis tool');
    return fs.readFile(file, 'utf8');
  }

  async write(name, content) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > 1024 * 1024) throw new Error('Invalid or oversized file content');
    const file = await this.resolve(name, true);
    // Check the opened inode before truncating. A new hardlink alias must not
    // turn an apparently new output path into a write to shared source data.
    const handle = await fs.open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o666);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink > 1) throw new Error('Cannot write a non-regular or hard-linked file');
      await handle.truncate(0);
      await handle.writeFile(content);
    } finally { await handle.close(); }
    return name;
  }

  async list(name = '.') {
    return (await fs.readdir(await this.resolve(name))).sort();
  }

  async find(name = '.', pattern = '') {
    const results = [];
    let visited = 0;
    const visit = async (dir, depth) => {
      if (depth > 16 || results.length >= 1000) return;
      for (const entry of await fs.readdir(await this.resolve(dir), { withFileTypes: true })) {
        if (++visited > 10000) throw new Error('Directory search exceeds 10000 entries');
        const child = path.join(dir, entry.name);
        if (child.includes(pattern)) results.push(child);
        if (entry.isDirectory()) await visit(child, depth + 1);
      }
    };
    await visit(name, 0);
    return results.slice(0, 1000);
  }
}

export function shellPermissions(files, home) {
  const filesystem = { ':minimal': 'read' };
  for (const dir of ['/usr', '/bin', '/lib', '/lib64', '/etc']) filesystem[dir] = 'read';
  filesystem[files.root] = 'write';
  // The kernel policy takes canonical targets. Codex rejects a read-only mount
  // on a symlink beneath a writable directory; lexical names remain protected
  // by TaskFiles.resolve, while the target mount prevents shell writes.
  for (const input of files.inputTargets) filesystem[input] = 'read';
  // Codex re-executes its sandbox helper from this directory. Expose only those
  // helpers; :minimal leaves the rest of the login directory inaccessible.
  filesystem[path.join(home, 'tmp', 'arg0-linux')] = 'read';
  filesystem[path.join(home, 'auth.json')] = 'deny';
  return { filesystem, network: { enabled: false } };
}
