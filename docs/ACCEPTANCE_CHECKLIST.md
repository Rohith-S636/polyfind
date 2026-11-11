# PolyFind PRD Acceptance Checklist

This checklist maps each PRD success criterion to executable tests, implementation
evidence, and committed benchmark or documentation artifacts. Results are
descriptive evidence for this prototype; they are not production guarantees.

## Success-criteria mapping

| PRD success criterion | Test suites / verification | Code and contract evidence | Artifact or documentation evidence |
|---|---|---|---|
| A new developer can start the local app using the README and `.env.example`, with no undocumented secret. | `npm run typecheck`; `npm test`; `test/environment-config.test.ts`; `test/final-acceptance.test.ts` | [`src/config/environment.ts`](../src/config/environment.ts), [`.env.example`](../.env.example) | [`README.md`](../README.md), [`.env.example`](../.env.example); live MySQL steps are explicitly optional |
| MySQL schema, constraints, and transactional update tests pass. | `test/catalog-schema.test.ts`; `test/catalog-transactions-indexes.test.ts`; `test/catalog-crud.test.ts` | [`src/catalog/`](../src/catalog/), [`src/catalog/db.ts`](../src/catalog/db.ts) | [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md), [`docs/decisions/ADR-001-mysql-authority.md`](./decisions/ADR-001-mysql-authority.md) |
| Search supports structured filtering and at least one semantic retrieval path. | `test/catalog-ui.test.ts`; `test/vector-adapter.test.ts`; `test/benchmark-relevance.test.ts`; `test/search-ui.test.ts` | [`src/catalog/`](../src/catalog/), [`src/retrieval/vector-adapter.ts`](../src/retrieval/vector-adapter.ts), [`src/ui/search-client.ts`](../src/ui/search-client.ts) | [`docs/FINAL_REPORT.md`](./FINAL_REPORT.md), [`docs/DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) |
| Derived-store version/freshness behavior is observable and covered by automated tests. | `test/freshness-validation.test.ts`; `test/redis-cache.test.ts`; `test/sync-events.test.ts`; `test/neo4j-sync.test.ts` | [`src/planner/freshness.ts`](../src/planner/freshness.ts), [`src/cache/`](../src/cache/), [`src/sync/`](../src/sync/) | [`docs/decisions/ADR-002-freshness-contract.md`](./decisions/ADR-002-freshness-contract.md), [`docs/RESEARCH_CLAIMS_AND_RELATED_WORK.md`](./RESEARCH_CLAIMS_AND_RELATED_WORK.md) |
| Tests demonstrate that stale cache/index data cannot silently replace authoritative price/stock values. | `test/freshness-validation.test.ts`; `test/failure-injection.test.ts`; `test/security-review.test.ts` | [`src/planner/freshness.ts`](../src/planner/freshness.ts), [`src/catalog/`](../src/catalog/) | [`docs/decisions/ADR-001-mysql-authority.md`](./decisions/ADR-001-mysql-authority.md), [`docs/FINAL_REPORT.md`](./FINAL_REPORT.md) |
| The benchmark harness can replay a fixed query/update workload and emit results with configuration metadata. | `test/benchmark-harness.test.ts`; `test/benchmark-workload.test.ts`; `test/statistical-summaries.test.ts` | [`src/benchmark/`](../src/benchmark/), [`scripts/export-baseline-visualization.ts`](../scripts/export-baseline-visualization.ts) | [`test/fixtures/baseline-comparison.json`](../test/fixtures/baseline-comparison.json), [`docs/RELEVANCE_EVALUATION_METHODOLOGY.md`](./RELEVANCE_EVALUATION_METHODOLOGY.md) |
| Baselines and the proposed policy are compared under the same dataset and workload. | `test/visualization.test.ts`; `test/final-delivery.test.ts`; `test/statistical-summaries.test.ts` | [`src/benchmark/visualization.ts`](../src/benchmark/visualization.ts), [`src/benchmark/repeated-runs.ts`](../src/benchmark/repeated-runs.ts) | [`test/fixtures/baseline-comparison.json`](../test/fixtures/baseline-comparison.json), [`docs/FINAL_REPORT.md`](./FINAL_REPORT.md) |
| Report includes search-quality metrics, freshness violations, latency percentiles, resource/work counts, ablations, limitations, and repeatability details. | `test/final-delivery.test.ts`; `test/research-claims.test.ts` | [`src/benchmark/statistics.ts`](../src/benchmark/statistics.ts) | [`docs/FINAL_REPORT.md`](./FINAL_REPORT.md), [`docs/RESEARCH_CLAIMS_AND_RELATED_WORK.md`](./RESEARCH_CLAIMS_AND_RELATED_WORK.md) |
| No novelty or performance claim is made without direct evidence. | `test/research-claims.test.ts`; `test/final-acceptance.test.ts` | [`src/benchmark/`](../src/benchmark/) | [`docs/RESEARCH_CLAIMS_AND_RELATED_WORK.md`](./RESEARCH_CLAIMS_AND_RELATED_WORK.md), [`docs/FINAL_REPORT.md`](./FINAL_REPORT.md) |

## Clean-room verification record

From a fresh checkout, use the commands in [`README.md`](../README.md). The
offline path requires only Node.js, npm, and the committed repository files:

```text
npm install
npm run typecheck
npm test
npx tsx scripts/export-baseline-visualization.ts
```

The optional database path additionally requires a local MySQL instance and
values supplied through an uncommitted `.env` copied from [`.env.example`](../.env.example):

```text
copy .env.example .env
npm run migrate
npm run seed -- --seed=42 --count=50
```

`results/` is generated output and is intentionally ignored by Git. The
committed fixture under [`test/fixtures/`](../test/fixtures/) provides stable
verification evidence in environments without MySQL, Redis, Neo4j, or a
managed vector service.

## Known limitations and fallback behavior

- MySQL is authoritative for price, stock, identity, and versions. Derived
  stores provide candidates and relationships only.
- Missing or unverifiable derived versions trigger rejection or authoritative
  fallback; they are not silently treated as fresh.
- The benchmark uses seeded, small, local workloads and provisional relevance
  labels. It does not establish production-scale latency or universal
  freshness guarantees.
- The repository has no `dev` or production deployment script. The clean-room
  acceptance target is the TypeScript, deterministic benchmark, and optional
  database verification surface documented above.
