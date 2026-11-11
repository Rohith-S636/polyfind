# ADR-004 — Deterministic Baseline Candidate Fusion

## Status
Accepted for Slice S3-05.

## Decision

The initial heterogeneous retrieval baseline combines SQL, vector, and graph
candidates with the maximum score for each stable product ID. Duplicate source
entries are retained in metadata, while the output contains one candidate per
product.

When candidates have equivalent scores, the baseline ranks the candidate whose
best contributing source has the following priority:

1. SQL (authoritative candidate path)
2. Vector
3. Graph

Remaining ties are ordered by ascending stable product ID. Source lists and
source scores are normalized deterministically, so input arrival order cannot
change the result.

## Consequences

- The baseline is reproducible and suitable for later fair comparison.
- Graph and vector stores provide retrieval signals only; transactional fields
  still require authoritative MySQL validation.
- This is a fixed baseline, not the adaptive planner and not a freshness
  guarantee.
