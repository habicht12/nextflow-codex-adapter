#!/usr/bin/env node
import readline from 'node:readline';

const send = (x) => process.stdout.write(JSON.stringify(x) + '\n');
const reply = (id, result) => send({ id, result });
const fault = process.env.TEST_CODEX_FAULT;
let model;
let tools;
let schema;
let queue = [];
let answer;
function next() {
  if (queue.length) {
    const [tool, args] = queue.shift();
    return send({ id: 50, method: 'item/tool/call', params: { tool, arguments: args, callId: `call-${++next.id}` } });
  }
  complete(schema ? JSON.stringify({ answer: answer || 'HELLO' }) : answer || 'HELLO');
}
next.id = 0;
function complete(text) {
  send({ method: 'item/completed', params: { item: { type: 'agentMessage', phase: 'final_answer', text } } });
  send({ method: 'turn/completed', params: { turn: { id: 'turn', status: fault === 'failed' ? 'failed' : 'completed' } } });
}
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (fault === 'malformed') return process.stdout.write('not json\n');
  if (fault === 'exit') return process.exit(3);
  if (m.method === 'initialize') return reply(m.id, { userAgent: 'codex/0.163.0' });
  if (m.method === 'account/read') return reply(m.id, { account: fault === 'login' ? null : { type: 'chatgpt' } });
  if (m.method === 'thread/start') {
    model = m.params.model;
    tools = m.params.dynamicTools;
    if (tools.some((t) => t.type !== 'function') || m.params.approvalPolicy !== 'never') process.exit(9);
    return reply(m.id, { thread: { id: 'thread' }, model: fault === 'model' ? 'other' : model });
  }
  if (m.method === 'turn/start') {
    schema = m.params.outputSchema;
    reply(m.id, { turn: { id: 'turn' } });
    if (fault === 'timeout') return;
    if (fault === 'interactive') return send({ id: 50, method: 'item/commandExecution/requestApproval', params: {} });
    if (fault === 'write_input') {
      queue = [['write', { path: 'input.txt', content: 'modified input' }]];
      return next();
    }
    if (tools.some((t) => t.name === 'uppercase')) {
      const word = m.params.input[0].text.match(/provided tool: (\w+)/)?.[1] || 'hello';
      queue = [['uppercase', { text: word }]];
      return next();
    }
    if (tools.some((t) => t.name === 'write')) {
      queue = [['read', { path: 'input.txt' }], ['write', { path: 'report.txt', content: 'fixture report\n' }]];
      return next();
    }
    if (tools.some((t) => t.name === 'activate_skill')) {
      queue = [['activate_skill', { name: 'qc' }], ['read_skill_resource', { skill: 'qc', path: 'guide.txt' }]];
      return next();
    }
    if (schema?.properties?.value) return complete(JSON.stringify({ value: 42 }));
    if (schema?.properties?.answer?.type === 'integer') return complete(JSON.stringify({ answer: 42 }));
    if (schema?.properties?.note) return complete(JSON.stringify({ answer: 'HELLO', note: null }));
    complete(fault === 'json' ? '{invalid' : schema ? JSON.stringify({ answer: 'HELLO' }) : 'HELLO');
  }
  if (m.id === 50 && m.result) {
    if (m.result.success) {
      let text = m.result.contentItems[0].text.trim();
      try { text = JSON.parse(text).result ?? text; } catch {}
      answer = text;
      next();
    }
  }
  if (m.method === 'turn/interrupt') { reply(m.id, {}); process.exit(0); }
});
