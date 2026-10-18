#!/usr/bin/env python3
"""Measure a small FASTA stream for the agent example."""
import json
import sys

records = 0
counts = dict.fromkeys('ACGT', 0)
total = 0
for line in sys.stdin:
    if line.startswith('>'):
        records += 1
    else:
        sequence = line.strip().upper()
        if sequence and not records:
            raise SystemExit('Expected a FASTA header before sequence data')
        total += len(sequence)
        for base in counts:
            counts[base] += sequence.count(base)
if not records:
    raise SystemExit('No FASTA records')
known = sum(counts.values())
print(json.dumps({
    'sequences': records,
    'bases': total,
    'ambiguous_bases': total - known,
    'gc_percent': 100 * (counts['G'] + counts['C']) / known if known else None,
}))
