# Architecture

`CodexRunner` implements Nextflow's native `AgentRunner` extension point. Nextflow
owns task staging, scheduling, retries, caching and lineage. The container-side
runner translates the Nextflow agent protocol to the Codex App Server protocol.

The RPC transport is imported from Nextflow 26.10.0. It remains separate from
the Codex integration so that a shared upstream transport can replace it later.
See UPSTREAM.md for the imported files and their origin.
