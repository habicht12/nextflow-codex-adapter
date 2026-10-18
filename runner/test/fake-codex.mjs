#!/usr/bin/env node
import readline from 'node:readline';

const send = (x) => process.stdout.write(JSON.stringify(x) + '\n');
const reply = (id, result) => send({ id, result });
const fault = process.env.TEST_CODEX_FAULT;
let model;
let tools;
let schema;
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
    if (tools.some((t) => t.name === 'uppercase'))
      return send({ id: 50, method: 'item/tool/call', params: { tool: 'uppercase', arguments: { text: 'hello' }, callId: 'call-1' } });
    complete(fault === 'json' ? '{invalid' : schema ? JSON.stringify({ answer: 'HELLO' }) : 'HELLO');
  }
  if (m.id === 50 && m.result) {
    if (m.result.success) {
      let text = m.result.contentItems[0].text.trim();
      try { text = JSON.parse(text).result ?? text; } catch {}
      complete(schema ? JSON.stringify({ answer: text }) : text);
    }
  }
  if (m.method === 'turn/interrupt') { reply(m.id, {}); process.exit(0); }
});
