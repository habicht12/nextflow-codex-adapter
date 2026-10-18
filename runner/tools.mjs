import Ajv from 'ajv';

const ajv = new Ajv({ strict: false, allErrors: true });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' };

export class ToolSet {
  constructor(spec, files, client, broker, trace = () => {}, sandboxFilesystem = null) {
    this.tools = new Map();
    this.calls = 0;
    this.limit = spec.maxIterations ?? 20;
    this.trace = trace;
    const add = (name, description, schema, run) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(name) || this.tools.has(name)) throw new Error(`Invalid or duplicate tool name: ${name}`);
      this.tools.set(name, { definition: { type: 'function', name, description, inputSchema: schema }, validate: ajv.compile(schema), run });
    };
    for (const tool of spec.toolSpecs ?? [])
      add(tool.name, tool.description || `Run Nextflow module ${tool.name}`, tool.inputSchema, (args, id) => broker(tool.name, id, args));

    const native = {
      read: [object({ path: string }), async ({ path }) => files.read(path)],
      write: [object({ path: string, content: string }), async ({ path, content }) => files.write(path, content)],
      edit: [object({ path: string, oldText: string, newText: string }), async ({ path, oldText, newText }) => {
        if (!oldText) throw new Error('oldText must not be empty');
        const text = await files.read(path);
        if (text.split(oldText).length !== 2) throw new Error('oldText must match exactly once');
        return files.write(path, text.replace(oldText, newText));
      }],
      ls: [object({ path: string }, []), async ({ path }) => files.list(path)],
      find: [object({ path: string, pattern: string }, []), async ({ path, pattern }) => files.find(path, pattern)],
      grep: [object({ path: string, pattern: string }), async ({ path, pattern }) =>
        (await files.read(path)).split('\n').flatMap((line, i) => line.includes(pattern) ? [`${i + 1}:${line}`] : []).slice(0, 1000)],
      bash: [object({ command: string }), async ({ command }) => {
        const result = await client.call('command/exec', {
          command: ['/bin/bash', '--noprofile', '--norc', '-c', command], cwd: files.root,
          permissionProfile: 'nf_task', timeoutMs: 60000, outputBytesCap: 32768,
          env: { HOME: null, BASH_ENV: null, ENV: null },
        }, 65000);
        if (result.exitCode !== 0) throw new Error(`Shell exited ${result.exitCode}: ${result.stderr.slice(0,2048)}`);
        return JSON.stringify(result);
      }],
    };
    for (const name of spec.nativeToolNames ?? []) {
      if (!native[name]) throw new Error(`Unsupported native tool: ${name}`);
      const [schema, run] = native[name];
      const execute = name !== 'bash' && sandboxFilesystem ? (args) => sandboxFilesystem(name, args) : run;
      add(name, name === 'grep' ? 'Find literal text in a task file' : `Task-local ${name}`, schema, execute);
    }

    if (spec.skills?.length) {
      const skills = new Map(spec.skills.map((s) => [s.name, s]));
      const active = new Set();
      add('activate_skill', 'Read a declared skill', object({ name: string }), ({ name }) => {
        if (!skills.has(name)) throw new Error('Unknown skill');
        active.add(name);
        return skills.get(name).content;
      });
      add('read_skill_resource', 'Read a resource from an activated skill', object({ skill: string, path: string }), ({ skill, path }) => {
        if (!active.has(skill)) throw new Error('Activate the skill first');
        const resource = skills.get(skill).resources?.find((r) => r.relativePath === path);
        if (!resource) throw new Error('Unknown skill resource');
        return resource.content;
      });
    }
  }

  get definitions() { return [...this.tools.values()].map((t) => t.definition); }

  async call(name, args, id) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool is not declared: ${name}`);
    if (++this.calls > this.limit) throw new Error('Agent exceeded maxIterations');
    if (!tool.validate(args)) throw new Error(`Invalid arguments for ${name}: ${ajv.errorsText(tool.validate.errors)}`);
    this.trace('tool_start', { name, callId: id });
    const result = await tool.run(args, id);
    this.trace('tool_end', { name, callId: id });
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Tool result exceeds 1 MiB');
    return text;
  }
}

export function validateOutput(schema, text) {
  if (!text?.trim()) throw new Error('Codex returned no final answer');
  if (!schema) return text;
  let output;
  try { output = JSON.parse(text); } catch { throw new Error('Codex returned invalid JSON'); }
  const validate = ajv.compile(schema);
  if (!validate(output)) throw new Error(`Output does not match schema: ${ajv.errorsText(validate.errors)}`);
  return JSON.stringify(output);
}

// Codex structured output requires an object root and all object fields required.
// Nextflow also supports scalar/list roots and optional record fields.
export function outputContract(schema) {
  if (!schema) return { schema: null, decode: (text) => validateOutput(null, text) };
  const strict = (source) => {
    const result = structuredClone(source);
    if (result.type === 'object' && result.properties) {
      const required = new Set(result.required || []);
      result.properties = Object.fromEntries(Object.entries(result.properties).map(([key, child]) => [key,
        required.has(key) ? strict(child) : { anyOf: [strict(child), { type: 'null' }] }]));
      result.required = Object.keys(result.properties);
      result.additionalProperties = false;
    }
    if (result.items) result.items = strict(result.items);
    if (result.anyOf) result.anyOf = result.anyOf.map(strict);
    return result;
  };
  const restore = (source, value) => {
    if (Array.isArray(value) && source.items) return value.map((item) => restore(source.items, item));
    if (value && typeof value === 'object' && source.properties) {
      const result = { ...value };
      for (const [key, child] of Object.entries(source.properties)) {
        if (result[key] === null && !(source.required || []).includes(key) && !ajv.compile(child)(null)) delete result[key];
        else if (key in result) result[key] = restore(child, result[key]);
      }
      return result;
    }
    return value;
  };
  const wrapped = schema.type !== 'object';
  const wireSchema = strict(wrapped ? object({ value: schema }) : schema);
  return {
    schema: wireSchema,
    decode: (text) => {
      const wire = JSON.parse(validateOutput(wireSchema, text));
      return validateOutput(schema, JSON.stringify(restore(schema, wrapped ? wire.value : wire)));
    },
  };
}
