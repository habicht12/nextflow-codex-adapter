nextflow.enable.types = true

agent calculate {
    tools 'shell:bash'
    input:
    question: String
    output:
    file('result.txt')
    prompt:
    "Use Python through bash to calculate ${question} and write the number to result.txt."
}

workflow {
    calculate('the sum of integers from 1 to 100').view { result -> "Result: ${result.text.trim()}" }
}
