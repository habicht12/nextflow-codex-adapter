nextflow.enable.types = true

include { demonstrate } from './main'

record OptionalAnswer {
    answer: String
    note: String?
}

agent scalar_answer {
    input:
    question: String
    output:
    answer: Integer
    prompt:
    "${question}"
}

agent optional_answer {
    input:
    question: String
    output:
    answer: OptionalAnswer
    prompt:
    "${question}"
}

agent file_report {
    tools 'fs:read', 'fs:write'
    input:
    input_file: Path
    output:
    file('report.txt')
    prompt:
    "Read ${input_file} and write a short report to report.txt."
}

agent skill_report {
    skills 'qc'
    input:
    request: String
    output:
    stdout()
    prompt:
    "Activate the qc skill, read guide.txt and answer: ${request}"
}

workflow {
    demonstrate(channel.of('hello', 'world')).view { value -> "ANSWER=${value.answer}" }
    file_report(file("${projectDir}/input.txt")).view { output -> "REPORT=${output.text.trim()}" }
    skill_report('What is the threshold?').view { output -> "SKILL=${output}" }
    scalar_answer('Return 42').view { output -> "SCALAR=${output}" }
    optional_answer('Return HELLO and omit the optional note').view { output -> "OPTIONAL=${output.answer}" }
}
