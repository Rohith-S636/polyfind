# ADR-005 — Freshness Validation and Safe Fallback

## Status
Accepted for Slice S4-03.

## Decision

Derived vector and graph candidates are validated against the authoritative
catalog product version before they can be used as search results. Product
fields, especially price and stock, always come from the authoritative catalog
record rather than from a derived store.

Candidates with a lower source version are classified as `stale`. Candidates
with no source version, a source version ahead of the authoritative record, or
an unavailable authority are classified as `unverifiable`. Strict mode does
not present stale or unverifiable results. A stale or missing-version result
may retain its relevance score and use the authoritative product as an
explicit fallback, but it is never silently treated as fresh.

The validator records freshness violations and fallback counts through
`FreshnessTelemetry`; benchmark execution can map `freshnessViolations` to its
existing benchmark metric.
