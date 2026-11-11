# AGENTS.md

> Read this before starting any PolyFind slice.

## What this project is
PolyFind investigates freshness-constrained adaptive retrieval across MySQL, Redis, Neo4j, and one vector database. `docs/PRD.md` defines product scope; `docs/ARCHITECTURE.md` defines module boundaries and contracts.

## Work rules
- Work only on the requested slice ID. Do not silently expand scope.
- Read the slice, its sprint, PRD, Architecture, and relevant ADRs before editing.
- Acceptance criteria are the test contract. Add tests that prove them.
- If a requirement conflicts with the architecture or is ambiguous, stop and ask instead of guessing.
- Do not claim novelty, performance gains, or freshness guarantees without evidence.
- MySQL is authoritative for transactional facts such as price and stock. Derived stores must not silently override those facts.
- Keep secrets out of source control, logs, screenshots, and test fixtures.

## Commit and PR convention
- Branch: `feature/S1-01-repository-baseline` or `fix/S3-02-version-metadata`.
- Commit: `[S1-01] Establish repository baseline`.
- PR title: `[S1-01] Establish repository baseline`.
- PR description must include slice ID, acceptance criteria checked, tests run, and any limitations.

## Human review required
Do not merge without explicit human review for:
- Authentication/authorization changes
- Destructive migrations or data deletion
- Infrastructure, CI/CD, deployment, or secrets configuration
- Changes to source-of-truth semantics or freshness guarantees
- Changes to benchmark methodology that could affect reported research results

## Environment and secrets
- Use `.env.example` as the variable-name reference.
- Never print actual secret values or commit real `.env` files.
- Fail with a clear message when a required environment variable is missing.

## Testing
- Prefer deterministic fixtures and seeded benchmark datasets.
- Separate unit, integration, and benchmark tests.
- Never compare performance runs unless hardware, dataset, workload, warm/cold cache conditions, and repetition count are recorded.
- Benchmark results are evidence, not acceptance criteria that can be tuned after seeing the results.

## Infrastructure scope
Do not add CI, Docker, deployment pipelines, cloud services, or paid services unless the relevant slice explicitly authorizes them.

## Decisions log
Record non-obvious architectural choices in `docs/decisions/`. Do not create an ADR for every routine implementation detail.

## Parallel execution and ownership

- Check `docs/PARALLEL_WORK_PLAN.md` and the assigned slice before starting.
- Every slice has one owner. Do not create "Shared", "Both", or joint-owner assignments.
- The non-owner may review but the slice owner remains accountable for implementation, tests, and evidence.
- Do not wait for an upstream implementation when an agreed contract, mock, fixture, or stub adapter is sufficient to proceed.
- Keep contracts stable for product IDs, versions, API payloads, candidate records, freshness behavior, and benchmark outputs.
- Integrate incrementally through reviewed, slice-labelled PRs. Preserve all existing slice IDs.
