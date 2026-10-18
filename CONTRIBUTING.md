# Development

Requires Java 21, Node.js 22, and Docker for integration tests.

Run `./gradlew check assemble` to test and package the plugin. Runner tests use
fixtures and do not contact a model provider. Integration and live validation
commands will be documented alongside their implementations.

Keep changes focused and include behavioral tests. Commit messages describe the
resulting behavior. Preserve upstream notices when changing imported code.
