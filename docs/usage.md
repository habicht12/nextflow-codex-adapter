# Usage

## Authentication

Use `bin/login` to initialize a private login directory outside the repository.
It runs the bundled Codex CLI with your user ID. Never commit `auth.json`, copy it
into an image, or pass it as a Nextflow input. Runtime tasks mount the directory
so Codex can refresh its credentials. Use `--user $(id -u):$(id -g)` for task
containers if your execution setup otherwise creates root-owned login files.

If your account does not allow device-code login, install Codex CLI 0.163.0 on
the host and use browser login:

```bash
CODEX_HOME="$HOME/.local/state/nf-agent-codex" \
  codex -c 'cli_auth_credentials_store="file"' login
```

Use a dedicated directory without `config.toml`, `AGENTS.md` or
`AGENTS.override.md`. Codex-generated state is allowed. Your normal interactive
Codex configuration and sessions remain separate.

## Configuration

Use normal Nextflow `agent` settings: `model`, `maxForks`, `time`, `requestTimeout`,
`maxIterations`, `container`, `containerOptions`, `withName` and `withLabel`.
No parallel adapter-specific task configuration language is needed.

Use a model your Codex account can access. Examples default to `openai/gpt-6-luna`.
The runner refuses API keys and endpoint overrides rather than changing billing
or providers silently. Remove `agent.apiKey`, `agent.baseUrl` and provider-key
environment variables when switching from an API runner.

## Shell execution

```bash
nextflow run examples/shell -profile shell
```

Expected result: `5050`. This enables the Linux namespaces needed for the inner
Codex sandbox through `--security-opt seccomp=unconfined`. No privileged container
or Docker socket is used. The sandbox permits task writes, read-only system tools
and staged inputs, denies the credential directory, and blocks shell networking.
The runner fails if it cannot enforce the sandbox.
This profile is tested on WSL2. Hosts with AppArmor policies that prohibit nested
mounts are not supported for shell tools; use Nextflow analysis modules there.
The project does not change or disable the host's AppArmor policy.

For reproducible analysis dependencies, build an image `FROM` the released runner
and install fixed package versions, then select it with `agent.container`. Keep
the runner command paths intact. Heavy tools belong in Nextflow processes with
their own containers.

## Troubleshooting

| Message | Action |
| --- | --- |
| Unknown plugin | Run `bin/install`, or build with `./gradlew install` |
| ChatGPT login required | Run `bin/login` and check the mounted directory |
| Dedicated login directory required | Use the documented separate directory |
| API overrides detected | Remove API credentials / endpoint overrides |
| Codex version mismatch | Use the runtime image matching the plugin release |
| Namespace / bubblewrap error | Use the shell profile and a host permitting user namespaces |
| Model unavailable / usage limit | Select an available model or wait for account limits to reset |
| Unsupported `Path` tool input | See the upstream limitation in compatibility.md |

Nextflow's `.command.err` and `.nextflow.log` identify the failed task. Use
`-with-agent-trace` for tool events. Do not publish logs containing private data.
