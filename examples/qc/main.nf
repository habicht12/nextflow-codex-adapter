nextflow.enable.types = true

params {
    fasta: Path = "${projectDir}/tiny.fa"
}

process fasta_stats {
    container 'ghcr.io/habicht12/nf-agent-codex:0.1.1'
    input:
    sequence: String
    output:
    stdout()
    script:
    """
    printf '%s' '${sequence.replace("'", "'\\''")}' | fasta-stats.py
    """
}

agent quality_report {
    instruction 'Use measured statistics. Clearly distinguish observations from biological interpretation.'
    tools 'nf:module_run:fasta_stats', 'fs:read', 'fs:write'
    skills 'qc-report'
    input:
    fasta: Path
    output:
    file('report.md')
    prompt:
    """
    Activate qc-report. Read ${fasta}, pass its complete text as sequence to
    fasta_stats, then write report.md.
    Include all returned statistics and the limitations described by the skill.
    """
}

workflow {
    quality_report(params.fasta).view { report -> "Report: ${report}" }
}
