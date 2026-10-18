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
contents before publishing. Tags and published runtime versions are immutable;
use a new version for a changed release.

The release metadata is consumed by `bin/install` through Nextflow's
`NXF_PLUGINS_TEST_REPOSITORY` mechanism. Central registry publication is a separate
maintainer registration step and is not needed for GitHub-release installation.
