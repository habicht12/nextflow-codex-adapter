package io.github.habicht12.codex

import groovy.transform.CompileStatic
import nextflow.agent.AgentLaunchSpec
import nextflow.agent.AgentRunner
import nextflow.agent.AgentRunnerRequest
import nextflow.agent.rpc.AgentRpcRegistration
import io.github.habicht12.codex.rpc.AgentRpcBroker
import org.pf4j.Extension

@Extension
@CompileStatic
class CodexRunner implements AgentRunner {
    String getName() { 'codex' }

    String getDefaultContainer() {
        final props = new Properties()
        getClass().getResourceAsStream('/META-INF/codex-image.properties').withCloseable { props.load(it) }
        return props.getProperty('image')
    }

    AgentLaunchSpec getLaunchSpec() {
        new AgentLaunchSpec(
            containerProxyCommand: ['/usr/local/bin/agent-rpc'],
            containerHarnessCommand: ['node', '/opt/nf-agent-codex/main.mjs'])
    }

    AgentRpcRegistration register(AgentRunnerRequest request, boolean remote) {
        if (request.apiKey || request.baseUrl || request.credentialWithheld)
            throw new IllegalArgumentException('The codex runner uses ChatGPT login; remove agent API keys and endpoint overrides')
        return AgentRpcBroker.get().register(request, remote)
    }

    String run(AgentRunnerRequest request) {
        throw new UnsupportedOperationException('The codex runner requires a containerized Nextflow task')
    }
}
