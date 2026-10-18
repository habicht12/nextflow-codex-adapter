nextflow.enable.types = true

params {
    test_input: Path
}

agent protect_input {
    tools 'fs:write'
    input:
    source: Path
    output:
    stdout()
    prompt:
    "Try to overwrite ${source}. This is a synthetic input-protection regression test."
}

workflow {
    protect_input(params.test_input).view()
}
