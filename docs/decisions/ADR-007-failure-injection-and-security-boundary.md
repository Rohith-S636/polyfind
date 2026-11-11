# ADR-007 — Failure Injection and Safe Operational Errors

## Status
Accepted for Slice S5-05.

## Decision

Reliability tests use replaceable in-process retrieval providers wrapped by
`FailureInjectionHarness`. The harness can inject deterministic delays and
controlled unavailability for derived stores without contacting Redis, Neo4j,
or a vector service.

Derived-store failures return an unsuccessful, degraded adapter result with
empty candidates. Callers must use the authoritative MySQL path or the
freshness validator before presenting product fields. The harness and tests
do not alter shared or production data.

Provider and API error boundaries return stable generic operational messages.
Connection strings, passwords, tokens, authorization headers, stack traces,
and internal host details are not returned through these boundaries.
