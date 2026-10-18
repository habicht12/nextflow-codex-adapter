# Changelog

## 0.1.1

- Protect every pre-existing task entry, including copied inputs, hardlinks,
  input directories and absolute/relative symlinks, against agent writes.
- Reject writes through newly introduced hardlink aliases before truncating an
  inode. Do not change source-file permissions to enforce read-only access.
- Verify input and source preservation in unit tests, native Nextflow tasks and
  the actual Codex sandbox, while keeping new output files writable.
- Add an explicit live check for ChatGPT login, forced token refresh and reuse
  of persisted authentication after an App Server restart.
- Use plain-string example container options so Nextflow can add its Linux
  Docker host-gateway mapping; test that configuration without replacing it.

## 0.1.0

- Native `codex` AgentRunner for Nextflow 26.10 with ChatGPT authentication.
- Structured responses, native module callbacks, task files and declared skills.
- Optional sandboxed shell execution, cancellation and inference timeouts.
- Offline CI, upstream transport tests, container integration and live examples.
