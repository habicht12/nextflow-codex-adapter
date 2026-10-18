import fs from 'node:fs/promises';
import path from 'node:path';

const within = (root, target) => target === root || target.startsWith(root + path.sep);

export class TaskFiles {
  constructor(root, denied = []) {
    this.root = root;
    this.denied = denied;
    this.inputs = new Set();
  }

  async init() {
    this.root = await fs.realpath(this.root);
    let visited = 0;
    const scan = async (dir) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (++visited > 10000) throw new Error('Task staging contains more than 10000 entries');
        const file = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) this.inputs.add(await fs.realpath(file));
        else if (entry.isDirectory()) await scan(file);
      }
    };
    await scan(this.root);
    return this;
  }

  async resolve(name = '.', write = false) {
    if (typeof name !== 'string' || name.includes('\0')) throw new Error('Invalid file path');
    const file = path.resolve(this.root, name);
    let real;
    try { real = await fs.realpath(file); }
    catch (error) {
      if (!write || error.code !== 'ENOENT') throw error;
      real = path.join(await fs.realpath(path.dirname(file)), path.basename(file));
    }
    if (this.denied.some((dir) => within(dir, real))) throw new Error('Access to runner credentials or configuration is denied');
    if (write ? !within(this.root, real) : !within(this.root, real) && ![...this.inputs].some((p) => within(p, real)))
      throw new Error('Path is outside the task and its staged inputs');
    // Staged symlinks are inputs, even if their targets happen to be inside this task.
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
    await fs.writeFile(file, content);
    return name;
  }

  async list(name = '.') {
    return (await fs.readdir(await this.resolve(name))).sort();
  }

  async find(name = '.', pattern = '') {
    const results = [];
    const visit = async (dir, depth) => {
      if (depth > 16 || results.length >= 1000) return;
      for (const entry of await fs.readdir(await this.resolve(dir), { withFileTypes: true })) {
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
  for (const input of files.inputs) filesystem[input] = 'read';
  filesystem[home] = 'deny';
  return { filesystem, network: { enabled: false } };
}
