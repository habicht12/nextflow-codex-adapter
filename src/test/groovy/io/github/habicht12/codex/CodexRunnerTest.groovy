package io.github.habicht12.codex

import nextflow.agent.AgentRunnerRequest
import spock.lang.Specification

class CodexRunnerTest extends Specification {
    def 'rejects API credentials before opening a broker'() {
        when:
        new CodexRunner().register(new AgentRunnerRequest(apiKey: 'fixture'), true)
        then:
        thrown(IllegalArgumentException)
    }

    def 'declares canonical container execution'() {
        given:
        def runner = new CodexRunner()
        expect:
        runner.name == 'codex'
        runner.defaultContainer == 'ghcr.io/habicht12/nf-agent-codex:0.1.0'
        runner.launchSpec.containerHarnessCommand == ['node', '/opt/nf-agent-codex/main.mjs']
        when:
        runner.run(new AgentRunnerRequest())
        then:
        thrown(UnsupportedOperationException)
    }
}
