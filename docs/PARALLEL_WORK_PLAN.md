# PolyFind — Parallel Work Plan

## Rules

- Exactly one directly responsible owner per slice; no jointly owned slices.
- Both members start in parallel from Sprint 1.
- Use contracts, mocks, fixtures, and stub adapters to avoid waiting for unfinished implementations.
- Agree early on product IDs, versions, API payloads, retrieval-candidate shape, freshness semantics, and benchmark output schema.
- Integrate incrementally through slice-labelled PRs; keep all 30 slice IDs unchanged.

## Single-owner map

| Slice | Title | Owner | Deliverable |
|---|---|---|---|
| S1-01 | Repository and contributor workflow | Member A | Contributor conventions, branch/PR workflow, and traceable slice workflow. |
| S1-02 | Requirements and research-gap review | Member A | Requirements and candidate-gap review with explicit uncertainties. |
| S1-03 | Local development configuration | Member B | Safe local configuration guide and example environment variables. |
| S1-04 | Architecture contracts and module skeleton | Member A | Module boundaries, API/data contracts, and skeleton boundaries. |
| S1-05 | Vector-store and embedding spike | Member B | Evidence-based vector/embedding decision or documented unresolved decision. |
| S2-01 | Relational schema and migrations | Member A | Versioned MySQL schema and repeatable migrations. |
| S2-02 | Seed dataset and data validation | Member B | Deterministic seed fixture, validation report, and dataset provenance. |
| S2-03 | Catalog CRUD API | Member A | Tested catalog endpoints with request/response examples. |
| S2-04 | Constraints, indexes, and transaction tests | Member A | Constraint/index decisions and transaction/integrity tests. |
| S2-05 | Minimal catalog UI and structured filters | Member B | Catalog UI with filters, mock-data mode, and component tests. |
| S3-01 | Retrieval interfaces and candidate schema | Member A | Stable retrieval-provider and candidate contracts. |
| S3-02 | Embedding generation and vector ingestion | Member B | Repeatable embedding generation and vector ingestion. |
| S3-03 | Vector semantic search adapter | Member B | Tested semantic retrieval adapter. |
| S3-04 | Neo4j graph schema and synchronization | Member B | Neo4j schema and idempotent version-aware synchronization. |
| S3-05 | Graph candidate retrieval and baseline fusion | Member A | Graph retrieval and deterministic baseline candidate fusion. |
| S4-01 | Version metadata and update events | Member A | Version metadata and update-event contract. |
| S4-02 | Redis cache with version-aware invalidation | Member B | Redis cache adapter with version-aware invalidation tests. |
| S4-03 | Freshness validation and safe fallback | Member A | Freshness validation and safe fallback tests. |
| S4-04 | Fixed-routing and adaptive planner baselines | Member A | Comparable fixed-routing and adaptive-planner baselines. |
| S4-05 | Search API and UI integration | Member B | Search UI wired to the search API with loading/error/empty states. |
| S5-01 | Deterministic query and update workload | Member A | Seeded query/update workload and replay instructions. |
| S5-02 | Search relevance labels and metrics | Member A | Relevance labels, metric definitions, and evaluation fixtures. |
| S5-03 | Latency and resource benchmark harness | Member B | Reproducible benchmark harness and machine-readable output. |
| S5-04 | Ablation and delayed-update experiments | Member B | Ablation and delayed-update experiment configurations. |
| S5-05 | Failure injection, regression, and security review | Member A | Failure-injection, regression, and security test evidence. |
| S6-01 | Repeated runs and statistical summaries | Member A | Repeated-run summaries with uncertainty/statistical notes. |
| S6-02 | Baseline comparison and result visualization | Member B | Baseline comparison tables/plots generated from raw results. |
| S6-03 | Research claims, limitations, and related-work matrix | Member A | Traceable related-work matrix and evidence-aligned claims/limitations. |
| S6-04 | Final report, setup guide, and demo script | Member B | Reproducible report, setup guide, and timed demo script. |
| S6-05 | Final acceptance, clean-room setup, and viva preparation | Member A | Clean-room acceptance evidence and viva preparation checklist. |

## Workload totals

- Member A: 17 slices.
- Member B: 13 slices.
- This is an ownership split, not a claim that all slices require identical effort.

## Parallel interface strategy

| Interface | Rule |
|---|---|
| Catalog | Agree on stable IDs, fields, and version metadata; UI uses mock products while MySQL/API work proceeds. |
| Search API | Agree on request, response, errors, pagination, freshness metadata, and loading/empty states; UI uses mocks first. |
| Retrieval candidate | Define entity ID, source, score, source version, and diagnostics before adapters finish. |
| Derived-store sync | Define idempotency, versions, retries, delayed/out-of-order event behavior, and failure visibility. |
| Benchmarks | Version a machine-readable result schema early; harness and visualization use sample results before full runs. |

## Dependency rule

A dependency is an interface prerequisite, not a requirement to finish every upstream implementation. A slice can start against a contract plus fixtures/stubs; document real blockers narrowly and never mark mock-only integration as fully complete.
