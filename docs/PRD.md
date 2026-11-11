# PRD — PolyFind

> Status: draft for team review. Confirm open questions before treating scope as locked.

## Goal
Build a working search application and research prototype that coordinates relational, cache, graph, and vector retrieval while investigating whether freshness-aware adaptive decisions improve relevance, freshness correctness, latency, and resource use.

## Users
- End users searching a product/catalog dataset using filters, natural language, or related entities.
- Project evaluators assessing DBMS concepts, architecture, and experimental methodology.
- Developers/researchers inspecting benchmark results and trade-offs.

## Core features
- Search a seeded catalogue using text queries and structured filters.
- Store authoritative product facts in MySQL with constraints and transactional updates.
- Use Redis for selected cacheable results or query signals, with documented invalidation/version behavior.
- Use Neo4j to represent selected entity/product relationships and retrieve related candidates.
- Use one vector database for semantic retrieval through a replaceable adapter.
- Combine candidates from enabled retrieval paths and rank results using a documented baseline/fusion method.
- Track versions/freshness metadata for derived representations.
- Apply freshness rules to sensitive fields such as price and stock.
- Provide a reproducible benchmark mode and export machine-readable results.
- Present a simple Next.js interface for search and result inspection.
- Document SQL features, data model, architecture, test evidence, and research limitations.

## Out of scope
- Production-scale commercial marketplace or payment processing.
- Live inventory or pricing integrations with third-party retailers.
- Guaranteeing global strong consistency across all stores; the project will define explicit freshness contracts instead.
- Training a new foundation model or claiming a novel embedding model.
- Supporting multiple vector databases simultaneously in the first version; select one and keep the adapter boundary narrow.
- Cloud deployment, paid APIs, or production SSO unless explicitly approved in a later decision.

## Success criteria
- A new developer can start the local app using the README and `.env.example`, with no undocumented secret.
- MySQL schema, constraints, and transactional update tests pass.
- Search supports structured filtering and at least one semantic retrieval path.
- Derived-store version/freshness behavior is observable and covered by automated tests.
- Tests demonstrate that stale cache/index data cannot silently replace authoritative price/stock values.
- The benchmark harness can replay a fixed query/update workload and emit results with configuration metadata.
- Baselines and the proposed policy are compared under the same dataset and workload.
- Report includes search-quality metrics, freshness violations, latency percentiles, resource/work counts, ablations, limitations, and repeatability details.
- No novelty or performance claim is made without direct evidence.

## Open questions and decision tracking

| # | Question | Owner | Decision Target / Date | Current Working Status |
|---|---|---|---|---|
| 1 | Which vector database and embedding model/provider will be selected? | Member B | Sprint 1 (`S1-05`) | Candidate spike evaluating local options; documented in ADR-003. |
| 2 | Will authentication be required for the demo, or will it remain a single-user local prototype? | Member A | Sprint 1 (`S1-02`) | Confirmed: Single-user local prototype. Authentication is explicitly out of scope for v1. |
| 3 | What is the final dataset and source/license? | Member B | Sprint 2 (`S2-02`) | Deterministic seed dataset and validation report with explicit provenance. |
| 4 | What is the project deadline and expected sprint duration? | Member A | Sprint 1 milestone review | 6 sprints following the parallel plan in `docs/PARALLEL_WORK_PLAN.md`. |
| 5 | What freshness SLA applies to each field class? | Member A | Sprint 1 (`S1-04` / ADR-002) | Zero staleness for transactional facts (price/stock); bounded eventual consistency for descriptive metadata. |
| 6 | Which baselines are feasible after the literature audit? | Member A | Sprint 1 (`S1-02` / `docs/research.md`) | Feasible baselines identified: MySQL-only, Fixed multi-store, Fixed hybrid, and TTL-only cache. |



---

## Approved scope and implementation baseline (2026-11-11)

This addendum supersedes earlier draft statements that conflict with the decisions approved during implementation.

### Locked decisions
- Academic/personal project; commercial deployment is not the objective.
- Target operating budget: ₹0. Use local Docker for the complete demonstration; do not assume a free hosting tier supplies persistent MySQL, Redis, Neo4j, and vector storage.
- Modular monolith using Next.js, Node.js, and TypeScript.
- MySQL is the authoritative source of truth.
- Redis is the cache; Neo4j is the relationship store; LanceDB is the embedded vector store. Qdrant is excluded.
- Synthetic deterministic catalogue data is acceptable for the academic demonstration, provided it is clearly labelled synthetic and includes categories, brands, sellers, variants, offers, and price history.
- Public browsing/search is available without an account. Customer accounts may register/login. Only administrators may mutate the shared catalogue.
- Search combines MySQL, vector, and graph candidates, applies weighted fusion, then hydrates and freshness-checks against MySQL.
- Benchmarking must be reproducible and honest. Fixture values, mock measurements, and provisional relevance judgments must never be described as empirical deployment results.

### Completion evidence
The phase-by-phase acceptance criteria and current verified status are maintained in [13-phase master acceptance](13_PHASE_MASTER_ACCEPTANCE.md). A phase is complete only when its code, tests, documentation, and applicable integration evidence all pass. A green TypeScript build alone is insufficient.
