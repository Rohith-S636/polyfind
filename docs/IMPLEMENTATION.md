# PolyFind — Implementation Guide

## Project direction
**PolyFind: Freshness-Constrained Adaptive Retrieval Across Heterogeneous Databases**

PolyFind investigates whether a retrieval planner informed by query characteristics, source versions/freshness, and observed execution costs can improve the balance between relevance, freshness correctness, latency, and resource use. This is a hypothesis, not a proven novelty or performance claim.

## Planned stack

| Layer | Technology | Responsibility |
|---|---|---|
| UI/application | Next.js + TypeScript | Catalog/search UI and diagnostics |
| Authoritative store | MySQL | Product identity and transactional facts such as price and stock |
| Cache/signals | Redis | Derived cache/query signals with version-aware invalidation |
| Relationship retrieval | Neo4j | Derived relationships and candidates |
| Semantic retrieval | One vector database | Embedding-based candidate retrieval behind an adapter |
| Evaluation | Automated tests and reproducible harness | Workloads, baselines, metrics, raw results |

## Data authority
MySQL is authoritative for transactional facts. Redis, Neo4j, and the vector index are derived/retrieval-supporting stores and must not silently override authoritative values. Freshness policies must be explicit by field class. If a freshness-sensitive value cannot be verified, read MySQL or return a defined degraded/unavailable response. Record versions, sync failures, retries, and correctness-check costs.

## Independent parallel ownership
There are six sprints and 30 slices. Each slice has exactly one directly responsible owner; there are **no jointly owned slices**.

- **Member A (17):** S1-01, S1-02, S1-04, S2-01, S2-03, S2-04, S3-01, S3-05, S4-01, S4-03, S4-04, S5-01, S5-02, S5-05, S6-01, S6-03, S6-05.
- **Member B (13):** S1-03, S1-05, S2-02, S2-05, S3-02, S3-03, S3-04, S4-02, S4-05, S5-03, S5-04, S6-02, S6-04.

The owner is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member can review without becoming a co-owner.

### How to avoid waiting
1. Agree early on stable product IDs, catalog fields, version semantics, search request/response, candidate schema, error shapes, and benchmark output.
2. Member A can develop MySQL schema/API against fixtures while Member B builds UI components using mock products.
3. Vector and graph adapters use deterministic fixtures and stable IDs; they do not wait for a fully integrated catalog.
4. Cache/freshness/planner components use stub providers and tests for fresh, stale, missing, delayed, and unavailable cases.
5. Benchmark tooling and visualization use a documented result schema and sample results before full experiments finish.
6. Integrate incrementally through slice-labelled PRs. Dependencies are interface prerequisites, not a rule to finish every slice serially.

The canonical map is `docs/PARALLEL_WORK_PLAN.md`. Every slice file records its owner, output, prerequisite contract, and completion evidence. Every sprint file contains its owner table and parallel-execution rules.

## Sprint map

| Sprint | Focus | Parallel emphasis |
|---|---|---|
| 1 | Research and foundation | Publish contracts; evaluate vector options independently |
| 2 | Catalog and UI foundation | MySQL/catalog API and UI/mock data proceed in parallel |
| 3 | Retrieval paths | Vector and graph adapters proceed independently against candidate schema |
| 4 | Freshness and planning | Cache, validation, planner baselines, and UI/API connection use stable contracts |
| 5 | Evaluation | Workload, labels, harness, ablations, and failure tests proceed independently |
| 6 | Analysis and delivery | Statistics, visualization, research matrix, report, and acceptance use raw artifacts/contracts |

## Branch, commit, and PR conventions
- Branch: `feature/S2-01-relational-schema` or `fix/S4-02-cache-invalidation`.
- Commit/PR title: `[S2-01] Add relational schema and migrations`.
- Each PR identifies slice ID, acceptance criteria checked, tests run, evidence, and limitations.
- Require human review for destructive migrations, source-of-truth/freshness semantics, security-sensitive changes, and benchmark methodology changes.

## Research integrity
Compare MySQL-only structured retrieval, fixed multi-store retrieval, fixed hybrid retrieval, TTL-only caching, and the proposed freshness-constrained adaptive policy where feasible. Measure relevance, freshness violations/update visibility, median/p95 latency, throughput, database operations, and recovery behavior. Record workload, dataset, hardware, seeds, cache state, and repetitions. Preserve negative/inconclusive results. Do not claim novelty or gains without verified related work and reproducible evidence.

## Start here
1. Read `AGENTS.md`, `docs/PRD.md`, `docs/research.md`, `docs/ARCHITECTURE.md`, and relevant ADRs.
2. Read `docs/PARALLEL_WORK_PLAN.md`.
3. Read the assigned slice and its sprint plan.
4. Agree on interface contracts and start with fixtures/mocks if a provider is not ready.
5. Implement only the assigned slice; add tests/evidence and open a slice-labelled PR.

## S1-04 contract baseline

The initial typed contract layer is in `src/contracts/` and is intentionally
backend-independent. Run `npm test` for runtime validation tests and
`npm run typecheck` for TypeScript checks. See `docs/contracts.md` for the
request/response examples, defaults, validation errors, and interface
boundaries. S1-04 does not implement catalog persistence, retrieval, freshness
verification, or orchestration.
