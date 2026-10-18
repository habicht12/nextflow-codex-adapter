#!/usr/bin/env node
import readline from 'node:readline';
import { runAgent } from './session.mjs';

const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
const pending = new Map();
const controller = new AbortController();
let invocationId;
let terminal = false;

function finish(message) {
  if (terminal) return;
  terminal = true;
  send({ ...message, invocationId });
}

function fail(error) {
  finish({ type: 'error', code: 'codex_runner_error', message: error.message });
  controller.abort();
  for (const item of pending.values()) item.reject(error);
  pending.clear();
}

async function handle(message) {
  if (message.type === 'start') {
    if (invocationId || message.protocolVersion !== 2) throw new Error('Expected one Nextflow protocol-v2 invocation');
    invocationId = message.invocationId;
    if (message.apiKey) throw new Error('API credentials are not accepted by the Codex runner');
    const result = await runAgent(message.spec, {
      signal: controller.signal,
      broker: (name, callId, args) => new Promise((resolve, reject) => {
        if (pending.has(callId)) return reject(new Error('Duplicate tool call identity'));
        pending.set(callId, { resolve, reject });
        send({ type: 'tool_call', invocationId, name, callId, arguments: args });
      }),
      trace: (event, details) => { if (message.spec.trace) send({ type: 'trace', invocationId, event, ...details }); },
    });
    finish({ type: 'complete', ...result });
  } else if (message.type === 'tool_result') {
    if (message.invocationId !== invocationId || !pending.has(message.callId)) throw new Error('Unexpected Nextflow tool result');
    const item = pending.get(message.callId);
    pending.delete(message.callId);
    if (message.isError) item.reject(new Error(message.result));
    else item.resolve(message.result);
  } else if (message.type === 'cancel') fail(new Error('Nextflow cancelled the agent task'));
  else throw new Error('Unknown Nextflow protocol message');
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (terminal || !line.trim()) return;
  if (Buffer.byteLength(line) > 16 * 1024 * 1024) return fail(new Error('Nextflow frame exceeds 16 MiB'));
  try { handle(JSON.parse(line)).catch(fail); } catch (error) { fail(error); }
});
input.on('close', () => { if (!terminal) fail(new Error('Nextflow protocol input closed')); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { fail(new Error(`Runner received ${signal}`)); input.close(); });
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
send({ type: 'ready', protocolVersion: 2 });
