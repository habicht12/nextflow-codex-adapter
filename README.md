# Nextflow Codex adapter

A native `codex` runner for Nextflow agents, authenticated with your own Codex
ChatGPT login. Under development; installation instructions follow the validated
runtime. Requires Nextflow 26.10.0 or later within the tested compatibility range.

The plugin preserves Nextflow's agent syntax and task lifecycle. The runner
connects declared tools to Codex and returns results to Nextflow.
