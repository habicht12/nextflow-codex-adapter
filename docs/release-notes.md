Fix staged-input write protection for copies, hardlinks, directories and both
symlink modes. Version 0.1.0 identified only symbolic links as protected inputs;
a write to a hard-linked input could therefore modify its source. Upgrade to
0.1.1 before using non-default staging with agent write or shell tools.

The runner now protects all pre-existing task entries without changing their
permissions, and checks an opened inode before overwriting it. New task outputs
remain writable. Regression tests cover native Nextflow 26.10.0 and 26.10.2,
filesystem tools and the kernel sandbox. Codex remains pinned to 0.163.0.

Also fix the examples' Linux Docker connection by using container options that
Nextflow can extend with its host-gateway mapping. Fresh device-code login and persisted token
renewal were verified through Codex's managed authentication interface.

Install from a clone with `bin/install`, authenticate with `bin/login`, and run
`nextflow run examples/qc`. See README.md for requirements and
docs/compatibility.md for the tested scope and preview-interface limits.

The plugin ZIP, release metadata and checksums are attached. The Linux amd64
runtime is `ghcr.io/habicht12/nf-agent-codex:0.1.1`. The attached image archive is
the same image and lets `bin/install` work without registry authentication.
