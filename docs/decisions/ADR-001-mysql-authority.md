# ADR-001 — MySQL Is the Authoritative Store

## Status
Accepted for the project baseline.

## Context
PolyFind maintains relational, cache, graph, and vector representations. Transactional facts must not diverge silently across stores.

## Decision
MySQL is authoritative for product identity and transactional fields, including price and stock. Redis, Neo4j, and the vector database are derived or retrieval-supporting stores.

## Why
It gives the system a clear correctness boundary and makes stale-data behavior testable. Derived stores may improve retrieval but cannot overrule the authoritative record.

## Consequences
- Search results must validate freshness-sensitive fields against MySQL or a trustworthy version mechanism.
- Update propagation, retries, and lag must be observable.
- Benchmarks must report the cost of correctness checks.
