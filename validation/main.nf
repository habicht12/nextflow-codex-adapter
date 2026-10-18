nextflow.enable.types = true

params {
    model: String = 'openai/gpt-6-luna'
    word: String = 'hello'
}

record Answer {
    answer: String
}

process uppercase {
    container 'ghcr.io/habicht12/nf-agent-codex:0.1.1'
    input:
    text: String
    output:
    stdout()
    script:
    """
    printf '%s' '${text.replace("'", "'\\''")}' | tr '[:lower:]' '[:upper:]'
    """
}

agent demonstrate {
    instruction 'Call uppercase with the requested word. Return its exact output as answer.'
    tools 'nf:module_run:uppercase'
    input:
    word: String
    output:
    result: Answer
    prompt:
    "Convert this word to uppercase using the provided tool: ${word}"
}

workflow {
    demonstrate(params.word).view { value -> "ANSWER=${value.answer}" }
}
