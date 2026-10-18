# Development

Requires Java 21, Node.js 22, Nextflow 26.10.x and Docker. The Gradle wrapper is
included. The native plugin is Groovy; the container harness is JavaScript.

```bash
npm ci --ignore-scripts --prefix runner
./gradlew check install
docker build -t ghcr.io/habicht12/nf-agent-codex:$(cat VERSION) runner
node validation/run.mjs
docker run --rm --security-opt seccomp=unconfined \
  -v "$PWD/validation/check-sandbox.mjs:/check-sandbox.mjs:ro" \
  ghcr.io/habicht12/nf-agent-codex:$(cat VERSION) node /check-sandbox.mjs
```

These tests use synthetic fixtures and do not authenticate or call a model.
`NEXTFLOW=/path/to/nextflow node validation/run.mjs` selects a particular binary.
Integration failures retain their temporary directory and print its location.

Live verification is separate: use `bin/login`, then run `examples/qc` and
`examples/shell -profile shell`. Verify measurements and declared files, not exact
model prose. These runs use your account quota; do not put account credentials in
public CI. A mocked response is not evidence of live-model compatibility.

For a fresh-login and token-refresh check, use a separate private login directory
with `NXF_CODEX_HOME=/absolute/path bin/login`. Then run the check below. It asks
Codex to refresh its managed ChatGPT tokens and verifies that the saved login
works after restarting App Server. It prints no credentials or account details.

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -v "/absolute/path:/opt/codex-home" \
  -v "$PWD/validation/check-login.mjs:/check-login.mjs:ro" \
  ghcr.io/habicht12/nf-agent-codex:$(cat VERSION) node /check-login.mjs
```

This is an explicit live account operation, not part of CI. Do not simulate a
refresh by editing token contents or expiry fields.

Keep changes focused. Include behavior tests and update the affected usage or
compatibility documentation. Prefer Nextflow's task lifecycle to new scheduling
or caching code. Preserve upstream notices. Use ordinary factual commit messages
and keep credentials, personal settings and development transcripts out of Git.

## Updating dependencies

- `VERSION` sets the plugin and image release. Keep `runner/package.json` and
  example plugin pins aligned when making a release.
- `runner/CODEX_VERSION` pins the App Server. Its experimental tool protocol must
  pass both offline and live tests before changing this pin.
- `build.gradle` pins the Nextflow API and RPC dependencies. Test the current
  Nextflow baseline plus the newest supported patch in `.github/workflows/ci.yml`.
- Imported transport code and its tests are listed in `docs/UPSTREAM.md`.

## Release

The manually triggered **Release artifacts** workflow runs checks, builds the
runtime, executes integration and sandbox tests, pushes the image and creates a
draft GitHub release with the plugin ZIP, metadata and checksum. Run it only from
a reviewed commit with successful CI. Verify public image access and the draft's
contents before publishing. The release includes a checksummed runtime archive
so installation also works when the container package's visibility is private.
Tags and published runtime versions are immutable;
use a new version for a changed release.

The release metadata is consumed by `bin/install` through Nextflow's
`NXF_PLUGINS_TEST_REPOSITORY` mechanism. Central registry publication is a separate
maintainer registration step and is not needed for GitHub-release installation.

### Nextflow registry

The separate **Publish to Nextflow registry** workflow promotes a published GitHub
release to the central registry. It requires the plugin ownership claim for
`nf-agent-codex`, provider `habicht12`, to be approved. Create a registry access
token and save it as the repository Actions secret `NPR_API_KEY`.
See the [registry instructions](https://docs.seqera.io/nextflow/plugins/plugin-registry).

Run the workflow from `main`, supplying the published release tag. Leave
`dry_run` enabled first: it checks the tag, the successful **Release artifacts**
run, the required README sections, and the downloaded ZIP checksum. It also
checks the Gradle task graph without contacting the registry or needing a token.
Versions 0.1.0 and 0.1.1 predate the required README structure; publish a new
GitHub release containing these changes before the first registry publication.
Do not move an existing tag or replace its artifacts.

After the dry run succeeds, run it again with `dry_run` disabled. The workflow
uploads the original GitHub ZIP and its embedded plugin spec using
`releasePlugin -x packagePlugin`, without rebuilding the archive. Only that step
receives the registry token. It then installs the plugin from the public registry
into an empty plugin directory and runs the offline integration tests.

An existing registry version is an error, not an overwrite. If upload succeeded
but the installation check failed, investigate and rerun the installation check
separately; do not republish that version. Keep the GitHub installation path in
the user documentation until the first registry installation has been verified.
