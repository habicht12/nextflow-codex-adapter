# Nextflow Codex adapter

[![CI](https://github.com/habicht12/nextflow-codex-adapter/actions/workflows/ci.yml/badge.svg)](https://github.com/habicht12/nextflow-codex-adapter/actions/workflows/ci.yml)

Run native Nextflow `agent` tasks with your **Codex ChatGPT login**, without a
separate OpenAI API key. Write ordinary Nextflow agents, select the `codex` runner,
and let Nextflow manage tasks, modules, files and resume.

The plugin is `nf-agent-codex`. It supports structured answers, declared Nextflow
tools, task files and skills. This is an independent community project. Native
Nextflow agents and Codex dynamic tools are preview interfaces; use the tested
versions below.

## Quick start

Requires **Linux/WSL2, Java 21, Nextflow 26.10.0 or 26.10.2, Docker**, and a
ChatGPT account with Codex access. Codex and the analysis runtime are included in
the container. You do not need host Node.js, Python or Codex.

```bash
git clone https://github.com/habicht12/nextflow-codex-adapter.git
cd nextflow-codex-adapter
./bin/install
./bin/login
nextflow run examples/qc
```

`bin/install` uses Nextflow's supported release-metadata mechanism to install
the prebuilt plugin from GitHub and downloads the runtime. If GHCR does not allow
anonymous access, it loads the identical image from the public release after
checksum verification. No GitHub or registry login is required. The plugin is
not yet listed in the central Nextflow registry. To build it yourself instead,
run `./gradlew install` and the image build command in CONTRIBUTING.md.

Login displays a URL and one-time code. Enable device-code login in your account
if required. Credentials remain in `~/.local/state/nf-agent-codex`, outside this
repository. Each user signs in with their own account. For a different directory,
set `NXF_CODEX_HOME` when logging in and pass `--codex_home /absolute/path` when
running the examples. See [authentication](docs/usage.md#authentication) if
device-code login is unavailable.

The example measures a small synthetic FASTA using a Nextflow process, then asks
Codex to explain the results in **`results/qc/report.md`**. Expected measurements:
2 sequences, 14 bases, 2 ambiguous bases, and 66.67% GC among A/C/G/T bases. The
explanation can vary; the measurements come from the analysis tool.

```bash
# Reuse completed agent and analysis tasks
nextflow run examples/qc -resume

# Choose a model available in your Codex account
nextflow run examples/qc --model openai/gpt-6-luna
```

## Use in your pipeline

Install the plugin once with `bin/install`, then add it to your Nextflow config:

```groovy
plugins { id 'nf-agent-codex@0.1.1' }
docker.enabled = true
agent {
    runner = 'codex'
    model = 'openai/gpt-6-luna'
    maxForks = 2
    containerOptions = "-v '${env('HOME')}/.local/state/nf-agent-codex:/opt/codex-home' --user \$(id -u):\$(id -g)"
}
```

Define your agents using Nextflow's existing `input`, `output`, `instruction`,
`prompt`, `tools` and `skills` syntax. See the [QC example](examples/qc/main.nf)
for a complete workflow, or [usage](docs/usage.md) for configuration and shell
execution. No samplesheet-specific logic is built into the runner.

## Upgrade from 0.1.0

Version 0.1.1 fixes staged-input write protection. In 0.1.0, copied and hard-linked
inputs were not identified as read-only; writing a hardlink could modify its source.
Upgrade before using those staging modes with agent write or shell tools.

```bash
git pull --ff-only
./bin/install
```

In your own pipelines, update the plugin pin to `nf-agent-codex@0.1.1` and update
any explicitly selected runner image. Existing login directories can be reused.

## What is tested

| Component | Tested baseline |
| --- | --- |
| Nextflow | 26.10.0 and 26.10.2 |
| Codex CLI / App Server | 0.163.0, bundled and checked at startup |
| Execution | Local Docker on Linux/WSL2, Linux amd64 |
| Automated checks | Plugin/RPC tests, runner tests, real Nextflow container workflows, sandbox checks |
| Live checks | ChatGPT login, native module calls and example outputs; separate from offline CI |

See [compatibility](docs/compatibility.md) for precise limits. A cache hit reuses
a recorded answer; a fresh model call is not guaranteed to produce identical text.

## Data and access

Codex uses your account's access and usage limits. It sends prompts, inputs and
tool results to OpenAI. Only pass data you intend to send. File and shell tools
are restricted to the task's allowed filesystem; credentials are denied to them.
Network access for shell commands is disabled. The model service itself requires
network access.

The runtime accepts a dedicated login directory and rejects personal config files.
It disables inherited plugins, hooks, external skills and unrelated Codex tools.
Workflows and container images remain trusted executable code, as in ordinary
Nextflow use.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/architecture.md), and
[upstream provenance](docs/UPSTREAM.md). Licensed under Apache-2.0.
