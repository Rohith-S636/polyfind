# POLYFIND Uploaded Snapshot Audit — 2026-11-16

**Scope:** Uploaded `polyfind-audit.zip` (245 files), including the local uncommitted source snapshot.
**Method:** Source inspection, runtime-entrypoint comparison, workflow review, documentation review, secret-pattern screening, and local Markdown-link validation.
**Status:** Source-level review and patch prepared. Full test/build acceptance is **not certified** because dependencies could not be installed in this execution environment.

## Executive assessment

The repository has a coherent implementation of the approved modular-monolith architecture: MySQL remains authoritative, with Redis, Neo4j, and LanceDB used as derived/cache/retrieval stores. The uploaded source contains real adapters and integration-test coverage; the remaining risk is not that these stores are all in-memory simulations, but that the runtime and CI paths must be made consistent and the complete acceptance suite must be rerun after the latest local changes.

Three implementation/CI corrections were applied in this reviewed copy:

1. `scripts/dev.ts` now follows the same service wiring as `scripts/start.ts`, while retaining the development-mode default and launching `next dev`.
2. Intentionally unconfigured optional outbox targets are marked `skipped`; configured-but-unavailable targets remain retryable. This avoids creating permanent dead-letter failures simply because an optional store was intentionally disabled.
3. The Docker browser-acceptance job uses `ubuntu-24.04` for Playwright 1.57.0 compatibility, and cleanup checks that the disposable `.env` file exists before invoking Compose teardown.

Documentation that described Redis, LanceDB, and synchronization as deferred was updated. Earlier planning/audit/schema notes were retained but explicitly labelled historical rather than deleted.

## Files changed in this reviewed copy

| File | Change |
|---|---|
| `scripts/dev.ts` | Aligned Redis connection/degraded handling, cache-aside reader, vector startup ingestion, SQL keyword provider, graph provider, outbox, auth, and MySQL-pool cleanup with the production runtime path; keeps demo default and Next.js dev server |
| `scripts/start.ts` | Marks intentionally unconfigured Redis/Neo4j/LanceDB outbox deliveries as skipped |
| `scripts/api.ts` | Same optional outbox-target behavior as the other entrypoints |
| `.github/workflows/verify.yml` | Pins browser job to Ubuntu 24.04; guards Compose cleanup when `.env` was never created |
| `docs/REDIS_PHASE5.md` | Removes obsolete “Neo4j/LanceDB/outbox deferred” status; documents current Redis and outbox behavior |
| `docs/LANCEDB_PHASE7.md` | Documents local feature hashing, initial backfill, versioned outbox synchronization, tombstones, and CI integration |
| `docs/INDEX.md` | Reorganized canonical implementation, evaluation, historical, and traceability references |
| `docs/13_PHASE_MASTER_ACCEPTANCE.md` | Adds dated snapshot audit and records test/CI limitations without marking gates passed |
| `docs/IMPLEMENTATION.md` | Labels the original implementation guide as historical |
| `nosql-schema.md`, `diagram.md` | Labels early conceptual material as historical and points to current executable documentation |
| `package.json` | Removes trailing whitespace only; dependency declarations already matched the lockfile |

## Review of the six local worktree changes

- `.gitignore`: secret handling is appropriate (`.env.*` ignored, `.env.example` retained); `data/` is ignored. There is a redundant `data/generated/` entry before the broader `data/` entry, which is harmless and can be simplified later.
- `package.json` / `package-lock.json`: package and lockfile root dependency declarations match exactly. The package file had trailing whitespace, now removed. Do not regenerate the lockfile unnecessarily.
- `scripts/dev.ts`: the substantive defect was incomplete parity with the other entrypoints; corrected in this copy as described above.
- `src/retrieval/lancedb-store.ts`: default model identity `polyfind-feature-hash-v1` matches the deterministic local embedding fallback. This is a lexical feature-hashing baseline, not a pretrained transformer.
- `web/next-env.d.ts`: contains generated Next.js route-type references and the generated-file warning. Do not hand-edit it; allow the installed Next.js version to regenerate it when appropriate.

## CI finding

The previously observed GitHub Actions run `42961973016` had its core verification job pass but the Docker browser job fail while installing Chromium on the then-current `ubuntu-latest` runner. The uploaded workflow still used `ubuntu-latest` for that browser job. Pinning to `ubuntu-24.04` addresses the observed Playwright 1.57.0 runner-compatibility failure mode. The new workflow must still run successfully before this gate is marked PASS.

The earlier CI evidence is not a substitute for rerunning against this uploaded snapshot. It also does not prove a successful browser acceptance journey because the failed job never reached the Playwright test step.

## Validation performed in this environment

| Check | Result |
|---|---|
| ZIP inspection | 245 files read |
| Credential-file name screening | No `.env` (other than `.env.example`), private-key, certificate, or credential-file names found |
| Token-pattern screening | No private-key, AWS access-key, or GitHub-token pattern found; generic assignment matches were in config/test fixture content and were not treated as proof of a secret |
| `package.json` parse | Passed |
| Package/lockfile dependency parity | Passed |
| Workflow YAML parse | Passed |
| Relative Markdown links | 78 Markdown files scanned; 0 broken relative links |
| `npm ci` | Timed out before dependencies were installed |
| Script typecheck | Blocked: global TypeScript 5.8.3 could not find `@types/node` because project dependencies were not installed |
| Unit/integration tests | Not run; `tsx` and project dependencies were unavailable |
| Next.js production build | Not run; project dependencies were unavailable |
| Docker/DB/browser E2E | Not run in this environment |

No test, build, or browser-E2E pass is claimed for the reviewed copy.

## Documentation disposition

**Keep as canonical/current:** `README.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/13_PHASE_MASTER_ACCEPTANCE.md`, `docs/LOCAL_SETUP.md`, `docs/API.md`, `docs/RELATIONAL_SCHEMA_PHASE4.md`, `docs/REDIS_PHASE5.md`, `docs/GRAPH_SCHEMA.md`, `docs/LANCEDB_PHASE7.md`, `docs/OUTBOX_PHASE8.md`, `docs/DATASET_PROVENANCE.md`, `docs/CATALOGUE_DATA_READINESS.md`, `docs/RELEVANCE_EVALUATION_METHODOLOGY.md`, `docs/RESEARCH_CLAIMS_AND_RELATED_WORK.md`, `docs/FINAL_REPORT.md`, `docs/DEMO_SCRIPT.md`, `docs/VIVA_PREPARATION.md`, and all eight ADRs.

**Keep for traceability:** the 30 implementation slices, six sprint records, `docs/PARALLEL_WORK_PLAN.md`, and `docs/POLYFIND_SQL_Review_Notes.md`. These explain project decisions and work history; they are not redundant merely because implementation has advanced.

**Historical only; do not use as current implementation truth:** `docs/END_TO_END_AUDIT.md` (2026-11-04 baseline), `docs/PHASE10_PHASE11_ACCEPTANCE_AUDIT.md` (dated acceptance snapshot), `docs/IMPLEMENTATION.md` (original plan), and the root `nosql-schema.md`, `relation-schema.md`, and `diagram.md` conceptual/legacy material. They are retained for traceability and labelled accordingly.

No files were deleted in this review.

## Remaining acceptance actions

Run these from the actual Windows repository after applying the reviewed patch:

```powershell
npm ci
npm run typecheck
npm run typecheck:scripts
npm test
npm run build
```

Then run the real-store integration tests against explicitly disposable services and rerun the GitHub Actions workflow. The Docker browser job must reach and pass both customer and administrator journeys.

Before final academic submission:
- retain the raw benchmark JSON and record the exact commit, environment, seed, and run count;
- expand the workload beyond the current 50-product/100-operation CI smoke benchmark;
- keep synthetic catalogue provenance explicit;
- describe the default feature-hashing vectorizer accurately;
- do not claim measured relevance or performance superiority without reviewed judgments and reproducible results;
- verify the public deployment's actual commit and persistent-store behavior separately, or use the local Docker demo as the authoritative demonstration.

## Safe application rule

This reviewed copy preserves the uploaded files and does not alter the user's Windows working directory, Git history, or databases. Review the patch, then apply it from the repository root. Do not reset the working tree, delete Docker volumes, or run migrations against any non-disposable database as part of this acceptance pass.
