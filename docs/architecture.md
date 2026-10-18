# Architecture

`CodexRunner` implements Nextflow's native `AgentRunner` extension point. Nextflow
owns task staging, scheduling, retries, caching and lineage. The container-side
runner translates the Nextflow agent protocol to the Codex App Server protocol.

The RPC transport is imported from Nextflow 26.10.0. It remains separate from
the Codex integration so that a shared upstream transport can replace it later.
See UPSTREAM.md for the imported files and their origin.

Codex is a per-task App Server subprocess over stdio. The runner supplies only
declared tools, validates their arguments and validates the final output. Nextflow
module calls return over the existing TLS/capability-protected RPC transport.
Skills use Nextflow's resolved content, not the user's Codex skill collection.

Filesystem tools enforce task and staged-input boundaries. When a task also has
shell access, filesystem tools run as workers under Codex's OS sandbox: a background
shell cannot race the unsandboxed runner into following a changed symlink. Worker
requests live in a separate directory that tools can read but cannot modify.
The private login directory is denied in the sandbox and in filesystem checks.

The model-request deadline pauses during tools. The whole-task deadline and retry
policy belong to Nextflow. A failed tool fails the agent; there is no automatic
model substitution or reinterpretation of a failed execution as a successful result.
