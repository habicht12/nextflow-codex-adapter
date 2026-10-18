import fs from 'node:fs/promises';
import { TaskFiles } from './files.mjs';
import { ToolSet } from './tools.mjs';

try {
  const request = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
  if (request.name === 'bash') throw new Error('This worker only serves filesystem operations');
  const files = new TaskFiles(request.root, request.denied);
  files.inputs = new Set(request.inputs);
  const tools = new ToolSet({ nativeToolNames: [request.name] }, files, null, null);
  console.log(JSON.stringify(await tools.call(request.name, request.args, 'filesystem')));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
