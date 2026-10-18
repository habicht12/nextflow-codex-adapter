import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

// stdout belongs to the App Server JSONL protocol. Diagnostics never enter it.
export class CodexClient extends EventEmitter {
  constructor(command, args, options = {}) {
    super();
    this.pending = new Map();
    this.nextId = 0;
    this.buffer = '';
    this.closed = false;
    this.child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.receive(chunk));
    // Keep diagnostics bounded. Never echo raw subprocess output, which may include credentials.
    this.stderr = '';
    this.child.stderr.on('data', (chunk) => { this.stderr = (this.stderr + chunk).slice(-8192); });
    this.child.on('error', (error) => this.fail(new Error(`Cannot start Codex: ${error.code}`)));
    this.child.on('exit', (code, signal) => {
      const detail = this.stderr.split('\n').find((line) => line.startsWith('Error:'));
      const safe = detail?.replace(/(?:sk-[\w-]+|eyJ[\w.-]+|Bearer\s+\S+)/g, '[REDACTED]').slice(0, 1000);
      this.fail(new Error(`Codex exited (${signal ?? code})${safe ? ': ' + safe : ''}`));
    });
    this.child.stdin.on('error', () => this.fail(new Error('Codex protocol input closed')));
  }

  receive(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 16 * 1024 * 1024) return this.fail(new Error('Codex frame exceeds 16 MiB'));
    let at;
    while ((at = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, at);
      this.buffer = this.buffer.slice(at + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); }
      catch { return this.fail(new Error('Invalid JSON from Codex App Server')); }
      if (message.method) this.emit('message', message);
      else if (this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`Codex RPC ${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
      }
    }
  }

  send(message) {
    if (this.closed) throw new Error('Codex connection is closed');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }

  call(method, params = {}, timeout = 30_000) {
    if (this.closed) return Promise.reject(new Error('Codex connection is closed'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex RPC timed out: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
      this.send({ id, method, params });
    });
  }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit('failure', error);
  }

  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise((resolve) => this.child.once('exit', resolve));
    const kill = (signal) => {
      try { process.kill(-this.child.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    kill('SIGTERM');
    const timer = setTimeout(() => kill('SIGKILL'), 2000);
    await exited;
    clearTimeout(timer);
  }
}
