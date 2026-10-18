# Compatibility

The supported baseline is Nextflow 26.10.0/26.10.2 and Codex 0.163.0, running in
local Docker on Linux/WSL2 amd64. Other executors and architectures have not been
validated. A remote executor also needs a reachable Nextflow RPC broker and a
private login store on its execution host; a local bind mount is not portable.

| Feature | Behavior |
| --- | --- |
| Native agent syntax and channels | Uses the existing Nextflow AgentRunner interface |
| Text / structured output | Final answer, validated against Nextflow's supplied JSON schema |
| File inputs / outputs | Nextflow staging and declared output collection |
| `nf:module_run` | Declared Nextflow tools execute through the native dispatcher |
| `fs:read/write/edit/ls/find/grep` | Task-local tools; staged input targets are read-only |
| `shell:bash` | Opt-in inner sandbox; see usage.md |
| Skills | Declared Nextflow skills and resources, loaded on demand |
| Resume / parallelism / retries | Managed by Nextflow; tested cache reuse and invalidation |
| Tracing / lineage | Native task/agent metadata plus tool-start/end events |
| Interactive approvals | Not supported inside batch tasks; fail with an explanation |

## Deliberate limits

- Codex models use `openai/<model>` identifiers. No provider proxy, API-key
  fallback or silent model substitution is provided.
- Codex and Nextflow preview features evolve. Unknown Codex versions are rejected
  rather than assumed compatible. Exact tool parameter schemas may differ from
  Pi's builtins, but Nextflow's tool declarations remain the same.
- Directly typed Nextflow processes with `Path` inputs cannot currently be exposed
  as tools in the tested upstream releases. The QC example passes small FASTA text
  to its typed tool. This is an upstream limitation, not a new file-input syntax.
- Filesystem tools limit individual reads/writes to 1 MiB. `grep` is a literal-text
  search; `find` uses a substring pattern and bounded recursion. Use analysis
  processes for large datasets.
- `requestTimeout` bounds an inference segment, excluding time spent waiting for
  declared tools. Nextflow's `time` bounds the whole task. `maxIterations` bounds
  tool calls, including skill and filesystem calls. Shell commands have a 60 s
  timeout and 32 KiB captured output; use a Nextflow process for longer work.
- External skills, hooks, plugins, browser tools and subagents are disabled.
  Dynamic downloading of new workflow modules during an agent run is not added.
- Account limits apply. Resuming a cached task does not call Codex; rerunning an
  uncached task does. Token refresh requires a writable private login directory.

Plain Docker containers run module/file agents. Shell agents additionally need
Linux user namespaces for Codex's inner sandbox. The supplied shell profile relaxes
Docker's outer seccomp filter to permit this; the inner Codex sandbox remains
mandatory. If the host prohibits user namespaces, shell calls fail rather than
falling back to unrestricted execution.
