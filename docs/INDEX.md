# PolyFind Documentation Index

## Start here

| File | Purpose |
|---|---|
| [`README.md`](../README.md) | Project overview, setup, and main workflows |
| [`PRD.md`](PRD.md) | Approved academic scope, requirements, and exclusions |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Current modular-monolith architecture and data authority |
| [`13_PHASE_MASTER_ACCEPTANCE.md`](13_PHASE_MASTER_ACCEPTANCE.md) | Living acceptance gates and evidence status |
| [`UPLOAD_SNAPSHOT_AUDIT_2026-11-16.md`](UPLOAD_SNAPSHOT_AUDIT_2026-11-16.md) | Independent audit of the uploaded local snapshot and remaining gates |
| [`LOCAL_SETUP.md`](LOCAL_SETUP.md) | Local environment and run instructions |
| [`API.md`](API.md) | HTTP API contracts and routes |

## Implementation and data stores

| Area | File | Purpose |
|---|---|---|
| MySQL schema | [`RELATIONAL_SCHEMA_PHASE4.md`](RELATIONAL_SCHEMA_PHASE4.md) | Relational schema, constraints, and indexes |
| SQL review | [`POLYFIND_SQL_Review_Notes.md`](POLYFIND_SQL_Review_Notes.md) | SQL review and demonstration notes |
| Redis | [`REDIS_PHASE5.md`](REDIS_PHASE5.md) | Cache-aside, invalidation, degraded mode, and outbox behavior |
| Neo4j | [`GRAPH_SCHEMA.md`](GRAPH_SCHEMA.md) | Graph schema, projection ownership, and synchronization |
| LanceDB | [`LANCEDB_PHASE7.md`](LANCEDB_PHASE7.md) | Persistent vectors, local feature hashing, and versioned sync |
| Outbox | [`OUTBOX_PHASE8.md`](OUTBOX_PHASE8.md) | Transactional outbox, delivery, retries, and recovery |
| Contracts | [`contracts.md`](contracts.md) | Typed boundaries and validation |
| API | [`API.md`](API.md) | Public and administrator API surface |

## Evaluation and submission

| File | Purpose |
|---|---|
| [`DATASET_PROVENANCE.md`](DATASET_PROVENANCE.md) | Synthetic dataset provenance and limitations |
| [`CATALOGUE_DATA_READINESS.md`](CATALOGUE_DATA_READINESS.md) | Catalogue completeness and demo readiness |
| [`RELEVANCE_EVALUATION_METHODOLOGY.md`](RELEVANCE_EVALUATION_METHODOLOGY.md) | Relevance metrics, query set, and judgments |
| [`EXPLAIN_PLANS_BASELINE.md`](EXPLAIN_PLANS_BASELINE.md) | SQL query-plan baseline |
| [`RESEARCH_CLAIMS_AND_RELATED_WORK.md`](RESEARCH_CLAIMS_AND_RELATED_WORK.md) | Literature claims and research-gap boundaries |
| [`FINAL_REPORT.md`](FINAL_REPORT.md) | Evidence-aligned academic report draft |
| [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) | 15-minute demonstration sequence |
| [`VIVA_PREPARATION.md`](VIVA_PREPARATION.md) | Extended viva questions and answers |

## Decisions and traceability

- [`decisions/`](decisions/) — eight architecture decision records; retain these as rationale and decision history.
- [`sprints/`](sprints/) — six planning/implementation sprint records.
- [`slices/`](slices/) — thirty implementation slice records and acceptance traceability.
- [`PARALLEL_WORK_PLAN.md`](PARALLEL_WORK_PLAN.md) — original ownership and parallel-work plan.
- [`.env.example`](../.env.example) — environment variable names and safe local defaults; contains no production credentials.

## Historical audit documents

- [`END_TO_END_AUDIT.md`](END_TO_END_AUDIT.md) — 2026-11-04 pre-remediation baseline; historical only.
- [`PHASE10_PHASE11_ACCEPTANCE_AUDIT.md`](PHASE10_PHASE11_ACCEPTANCE_AUDIT.md) — dated Phase 10/11 acceptance snapshot; superseded by later changes and the living master acceptance record.
- [`IMPLEMENTATION.md`](IMPLEMENTATION.md) — original implementation plan; not the current source of architecture or status.
- [`../nosql-schema.md`](../nosql-schema.md), [`../relation-schema.md`](../relation-schema.md), and [`../diagram.md`](../diagram.md) — early schema/diagram references retained for history; current executable schema is documented under “Implementation and data stores”.

## Research and claim discipline

The research gap remains a candidate hypothesis until supported by a verified
literature comparison. Benchmark fixture values are not empirical measurements.
Do not claim that PolyFind is novel, production-ready, or superior to a baseline
unless the report includes reproducible evidence for that claim.
