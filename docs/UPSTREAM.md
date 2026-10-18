# Upstream source

The RPC transport originates from `nextflow-io/nextflow`, tag `v26.10.0`, under
the Apache-2.0 license:
https://github.com/nextflow-io/nextflow/tree/v26.10.0/plugins/nf-agent-pi

Imported files:

- `src/main/groovy/io/github/habicht12/codex/rpc/*.groovy`: the three driver-side
  RPC classes, with package names changed.
- `runner/agent-rpc/`: the Go transport and its tests, unchanged.

These implement the runner-neutral Nextflow wire protocol, not the Pi model
runtime. Original copyright notices are retained. The Gradle wrapper originates
from the official Nextflow plugin template.
