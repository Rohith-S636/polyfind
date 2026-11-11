# S1-01 — Repository and contributor workflow

## Module
`foundation`

## What to build
Set up repository conventions, README navigation, branch/commit/PR format, and issue-to-slice traceability.

## Acceptance criteria
- [x] A new contributor can identify the active sprint and slice from the README.
- [x] Branch, commit, and PR naming conventions are documented.
- [x] No secrets or local generated datasets are committed.

## Dependencies
Use the prerequisite/interface contract below and review `docs/ARCHITECTURE.md` plus the relevant sprint plan. Do not wait for unrelated upstream implementation when fixtures or mocks are sufficient.

## Mockup / reference
Not applicable unless the implementation adds a UI surface.

## Out of scope for this slice
Do not add CI, Docker, deployment, or cloud configuration.

## Human review required?
Yes if the implementation touches secrets, infrastructure, authentication, destructive migrations, or changes a documented freshness guarantee; otherwise normal PR review.

## Ownership
The directly responsible owner listed below is accountable for implementation, tests, acceptance evidence, and the slice PR. The other member may review without becoming a co-owner.

## Evidence to attach to PR
- Acceptance criteria checked
- Tests and commands run
- Screenshots or raw benchmark artifacts when applicable
- Any changed assumptions, limitations, or follow-up issues

## Single-owner assignment and parallel execution

- **Directly responsible owner:** Member A.
- **Deliverable:** Contributor conventions, branch/PR workflow, and traceable slice workflow.
- **Prerequisite/interface contract:** Existing repository structure and contributor conventions.
- **Parallel-work rule:** Start with agreed contracts, fixtures, mocks, or stub adapters. Do not wait for another implementation if the interface can be agreed and tested independently.
- **Completion evidence:** Meet the original acceptance criteria, add/update tests, record commands and results, and note limitations in the PR.
- **Ownership rule:** This slice has one owner only. The other member may review but is not a co-owner. Preserve the existing slice ID.
 
## Completion evidence

- Updated `README.md` to display active sprint status (`Sprint 1`), active slices, and valid links to each slice file.
- Documented branch naming (`feature/<slice-id>-*`, `fix/<slice-id>-*`), commit syntax (`[<slice-id>] *`), and PR requirements.
- Documented single-owner issue-to-slice traceability and strict secrets/generated dataset exclusions.
- Added automated regression tests in `test/workflow.test.ts` verifying README navigation, link resolution, naming patterns, `.gitignore` rules, and asserting no secrets or generated datasets are tracked in git.
- Verification: `npm test` runs 12 passing tests, and `npm run typecheck` succeeds.

## Limitations

This slice establishes documentation, git conventions, and repository structure. Automated CI/CD pipelines, remote GitHub action workflows, and deployment tooling are explicitly out of scope for foundation slices.

