# POLYFIND — Phase 10 and Phase 11 Acceptance Audit

**Audit date:** 2026-11-11  
**Repository:** `Rohith-S636/polyfind`  
**Branch:** `main`  
**Implementation commit under audit:** `5031d938755bf653334c04453f2991008eba2eb7`  
**CI evidence:** [GitHub Actions run 42948355524](https://github.com/Rohith-S636/polyfind/actions/runs/42948355524)

## Executive result

| Stage | Gate | Result |
|---|---|---|
| 1 — Stabilization/runtime | Typecheck, tests, build; request-scoped freshness telemetry | **PASS** |
| 2 — Phase 10 API | Catalogue, brand, seller, variant, offer, and price-history routes | **PASS — non-destructive API scope** |
| 3 — MySQL integration | Disposable MySQL 8.0 service, migrations, CRUD, transactions, locking, history, outbox | **PASS** |
| 4 — Independent Phase 10 audit | Route, persistence, parameterization, history-preservation review | **PASS** |
| 5 — Phase 11 auth/RBAC | Password hashing, sessions, roles, admin-only writes, audit actor attribution | **PASS** |
| 6 — Independent Phase 11 audit | Authentication, authorization, session lifecycle, spoofing, and persistence review | **PASS** |

The verified workflow completed `npm ci`, `npm run typecheck`, `npm run typecheck:scripts`, `npm test`, and `npm run build` successfully. The test summary was **235 tests, 224 passed, 0 failed, 11 skipped**. The MySQL integration test ran (not skipped) against the workflow's disposable MySQL service.

## Stage 1 — Stabilization/runtime

- Production startup and API-only startup now inject the persistent MySQL catalogue repository and mutation callbacks.
- Product listing uses the SQL-side paginated path rather than fetching a capped first page and filtering it in memory.
- The Phase 10 availability fixture uses the valid `unavailable` value.
- Request responses now receive request-local freshness telemetry. The legacy cumulative telemetry accessor remains available for compatibility.
- Missing-version and authority-unavailable branches update the legacy aggregate consistently.
- The final verification run includes both source and script type-checking plus the production build.

## Stage 2 — Phase 10 API completion

The HTTP API now exposes:
- Products: public list/detail and authenticated create/update.
- Brands: authenticated create and public list/detail.
- Sellers: authenticated create and public list/detail.
- Product variants: authenticated create and public list/detail-by-product plus variant detail.
- Offers: authenticated create/update and public list/detail.
- Price history: public filtered and product/offer-specific reads.

All catalogue write routes require an authenticated principal with the `admin` role. SQL values are parameterized, and repository write operations retain their transaction/outbox behavior. Product, brand, seller, variant, and offer writes record the authenticated actor in `audit_logs`.

**History-preservation boundary:** HTTP hard-delete operations are intentionally not exposed. The current relational schema includes cascading foreign keys from products/offers into version and price-history records; a naïve DELETE endpoint could erase evidence. Deactivation/archive semantics should be added before any destructive lifecycle API is introduced. Brand, seller, and variant currently have create/read management routes; product and offer have update routes.

## Stage 3 — MySQL integration

The GitHub Actions workflow provisions a fresh MySQL 8.0 service with disposable CI-only credentials. The integration test runs the committed migrations against that service and exercises:
- Product creation/update and optimistic-version conflict rejection.
- Brand and seller creation/read.
- Variant creation/read and product association.
- Offer creation/update and optimistic-version conflict rejection.
- Price-history append/read behavior.
- Outbox event persistence.
- Transaction rollback.
- Admin bootstrap, login, session lookup, logout/revocation, and one-time bootstrap closure.
- Scrypt password-hash storage and SHA-256 session-token-hash storage.
- A real authenticated HTTP write where a client-supplied actor field is ignored and the session user is recorded instead.

Migrations in this stage run only against the disposable GitHub Actions database. No local, deployed, or pre-existing database was migrated.

## Stage 4 — Independent Phase 10 audit

Reviewed `src/api/server.ts`, `src/catalog/repository.ts`, `src/catalog/relational-repository.ts`, migration definitions, runtime wiring, and `test/mysql-integration.test.ts`.

Audit checks:
- Live mode requires the explicit relational repository.
- Product create/update callbacks are wired in both production entry points.
- Brand/seller/variant and offer writes go through the relational store.
- Query values use placeholders rather than interpolated user input.
- Optimistic locking is exercised for products and offers.
- Outbox and audit writes occur within repository transactions.
- Price-history reads are exposed.
- Hard deletes are not exposed where cascading history loss is possible.

**Result: PASS**, with the non-destructive API boundary documented above.

## Stage 5 — Phase 11 authentication and RBAC

- Passwords are hashed with Node.js `scrypt` using a random salt and fixed, bounded parameters.
- Session tokens are generated from 32 cryptographically random bytes.
- Only SHA-256 token hashes are stored in MySQL; raw session tokens are returned only at session creation.
- Sessions expire after 12 hours and can be revoked through logout.
- Authentication checks session expiry, revocation, active user status, and assigned roles.
- The first administrator is created through a one-time bootstrap endpoint protected by `AUTH_BOOTSTRAP_TOKEN`; bootstrap closes once a user exists.
- Catalogue mutation routes require the `admin` role. Public browsing and search remain available without an admin session.
- Product, brand, seller, variant, and offer audit records derive actor identity from the authenticated principal, not request-body fields.
- The shared `AUTH_SECRET`/API-key mechanism has been removed from runtime configuration and Docker Compose.
- Bearer-token authentication is used rather than ambient cookies, avoiding cookie-based CSRF exposure. The client should keep the token in memory or an appropriate secure secret store and send it in the Authorization header.
- The bootstrap token should be removed from the deployment environment after the first administrator is created.

## Stage 6 — Independent Phase 11 security audit

Reviewed `src/auth/session-auth.ts`, all mutation guards in `src/api/server.ts`, both runtime entry points, the existing users/roles/sessions/audit schema, and the unit/MySQL integration tests.

| Security boundary | Evidence | Result |
|---|---|---|
| Password storage | Scrypt hash with random salt; integration assertion checks stored format | PASS |
| Session entropy | 32 random bytes per session | PASS |
| Raw-token storage | Integration assertion verifies raw token is absent and hash is present | PASS |
| Session expiry/revocation | 12-hour expiry; logout sets `revoked_at`; integration test authenticates then rejects revoked token | PASS |
| One-time bootstrap | Requires configured 32+ character token and zero existing users; integration test verifies second bootstrap is rejected | PASS |
| Role enforcement | Mutation guard requires `admin`; API test verifies customer role receives 401 | PASS |
| Actor spoofing | Live API integration sends a client-supplied actor value and verifies the audit row uses the authenticated user ID | PASS |
| Shared-secret removal | No runtime `AUTH_SECRET`/X-API-Key fallback; startup uses `SessionAuthService` | PASS |

**Result: PASS.**

### Explicit limitations

- Initial admin bootstrap is the only user-provisioning path; there is no public signup or role-management endpoint.
- There is no refresh-token flow. Sessions expire after 12 hours and users must log in again.
- The bearer token is a credential; clients must protect it and avoid writing it to logs or URLs.
- Hard-delete lifecycle endpoints remain intentionally absent until a history-preserving archive policy is implemented.
- This is an academic application security boundary, not a claim of third-party penetration testing or production certification.

## Commit evidence

### Stage 1
- `a4c7eac4db69fca6b9d0d4a778de525300ea6e04` — persistent production API/runtime wiring.
- `727eb2f40f414c73464646292a5c0d2fc412d4cc` — SQL-side product listing pagination/sorting.
- `4522daa5f2a0dcf8594fc205b23f44a66a29ee07` — exact optional query typing.
- `ecd5c805616a1f2b8b0910b692422bd8d146cd7d`, `2c9d8e377a56e22882293f80fd5e4e28c33b9d41`, `9dda61a14654a6d392a5a2d970ba5a154d605fe7` — request-local freshness telemetry and compatibility corrections.

### Stages 2–4
- `46aa600692f02e35189613b34bcded5a3c004ec9`, `41a1697241cab74e0ef5c184582aba078386cda6`, `e38f16d11a68d5be4f871ea457778ecc913dd100` — authenticated product API and runtime wiring.
- `6bce635e3c21d3da658e832d49748b29063c6878`, `71efac4e57fac8243947c9a042930198c88da973`, `4aa9e2285c3e0b3e4079f3b7b9d846d8a5107eee` — seller creation contract, route, and test.
- `eab5674459b231bd480a984a37c55fd1ce25f298`, `1ae53ddc4055607fbec7fef47272ed97ceeee74e`, `08ee260d5058ce2f0c788affc31525ee6ef89730`, `63e1b245907a4cc155083ed666a0092ed8eed6af`, `a9993ad47c19f4a7452300db8cf7a4230dad0d2f`, `c457f70f92afc4cd8f2a9ca9f0e6128d679c88da` — brand/variant creation, read operations, and route tests.
- `22e2f4ca3a5ec9e5c3756d422e67adc024ea2981`, `d7fc1a9f8b54b4189677c89ce91b4edb528d603a`, `ee15c9e9356a27f4ff601e4129d3e98bc56439b0`, `395c6ae305ea42d2a0a9434875fbc6aba3228381` — disposable MySQL integration suite, CI service, relational read fixes, and product-write tests.

### Stages 5–6
- `1408ee8ae2552a6b285d1ac37a21b69d41544d27`, `fcfbb03d72082fcec19e4b518f6f9259b176b867`, `2c244826698a8c8d24279f1b53806bcb173021b7` — scrypt/session service, exports, and admin-only HTTP guards.
- `cce89fd7206051e3e0b6322e28d828087e9e14b1`, `98cdbbf08bcd68fa63824583a5de7365622ce154`, `f1f2d11d6ab5cfecc0a12e1a29cbe4acd3be8764`, `c7d89d3030ff0b681627f0bb736b5ffc39bb8ab8`, `4e0719f1a0e8cfe89dc9df51f2a6199e001915fd` — production wiring, API tests, scrypt typing, and bootstrap locking.
- `b091b19a5ceb6bc6e2b0a51765b7e770a875698f`, `acb03ab3534704c5e1f601c4903b61b4e745e67a`, `190c1dae512fbd83375fd63fecb3884ccb1c0dac`, `240896d9cc6884129d330728bee6fd3a82d44eac`, `2a318fd438b5df1bf334e85616e37ff91bae5f68`, `85e901294e62984eaae8617a212221f17ccd8952`, `bf9fc08bc181a0f6f5bce7f79c28a1b52efb42ae` — bootstrap/session integration, actor audit persistence, role-boundary tests, and bearer-token test migration.
- `0e9822013a0061467c03d6ee5f339c469d06e99d`, `15f18a5534f6fc409db15373cfeaaf0a1f8edb30`, `07d3e410a90a2ea1382e49c45c0ed54a1008d888`, `12c2833cd72d072e23f3984c38ae042b3abece78`, `909aa3c3083f6e5fb59bf0af899debf12623e7e6`, `75edeff0259393266facb5fa8b0c5b20d13ea78e`, `5031d938755bf653334c04453f2991008eba2eb7` — bootstrap configuration/docs, removal of shared-secret configuration, bounded scrypt verification, live actor-spoofing integration, and hash-storage assertions.

## Data-safety statement

No existing local database, deployed database, or Docker volume was migrated, dropped, reset, or modified. The only real database integration evidence comes from the disposable MySQL 8.0 service created and destroyed by GitHub Actions for the test job.
