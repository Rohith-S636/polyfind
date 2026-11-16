# POLYFIND — Academic Implementation and Evaluation Report

**Project title:** Freshness-Constrained Adaptive Retrieval Across Heterogeneous Databases  
**Application:** PolyFind — Academic Product Discovery and Comparison System  
**Technology:** Next.js, React, Node.js, TypeScript, MySQL 8, Redis, Neo4j 5, LanceDB  
**Repository:** [Rohith-S636/polyfind](https://github.com/Rohith-S636/polyfind)  
**Report baseline:** main revision reviewed on 2026-11-16; see the evidence register for the exact SHA and historical benchmark provenance.

> **Submission editing note:** Replace only the bracketed institutional placeholders using the institution's approved report template. Do not invent student, guide, department, certificate, or evaluation details. Figures and screenshots must be captured from the final rehearsed local demonstration.

---

## Title page

**[INSTITUTION NAME]**  
**[DEPARTMENT / SCHOOL]**

### POLYFIND: FRESHNESS-CONSTRAINED ADAPTIVE RETRIEVAL ACROSS HETEROGENEOUS DATABASES

A project report submitted in partial fulfilment of the requirements for  
**[PROGRAMME / COURSE / SEMESTER]**

Submitted by:

- **[STUDENT 1 NAME] — [SRN / REGISTER NUMBER]**
- **[STUDENT 2 NAME] — [SRN / REGISTER NUMBER]**

Under the guidance of:

**[GUIDE NAME AND DESIGNATION]**

**[ACADEMIC YEAR]**

---

## Certificate

> This page must be replaced with the institution's prescribed certificate wording and signed/approved by the authorized guide and department. The template below is not a claim that approval has already been granted.

This is to certify that the project titled **“PolyFind: Freshness-Constrained Adaptive Retrieval Across Heterogeneous Databases”** has been carried out by **[STUDENT 1]** and **[STUDENT 2]** under the guidance of **[GUIDE]**, in partial fulfilment of the requirements of **[PROGRAMME / COURSE]** during **[ACADEMIC YEAR]**.

Guide signature: ____________________  
Head of Department: ____________________  
Date: ____________________

## Declaration

We, **[STUDENT 1]** and **[STUDENT 2]**, declare that this report describes the work carried out for the PolyFind academic project. We have identified synthetic data, external references, measured benchmark evidence, limitations, and work not independently verified. The report does not claim that historical CI measurements were produced by the current repository revision.

Student 1 signature: ____________________  
Student 2 signature: ____________________  
Date: ____________________

## Acknowledgement

We thank **[GUIDE NAME]**, **[DEPARTMENT / INSTITUTION]**, and the individuals who provided academic feedback and review support. This acknowledgement should be finalized by the project team and must not imply endorsement by a person or institution that has not approved it.

## Abstract

PolyFind is an academic product-discovery application designed to demonstrate how a relational database can remain authoritative while cache, graph, and vector stores contribute to search and retrieval. The application uses a Next.js frontend and a Node.js/TypeScript modular monolith. MySQL is the system of record for products, categories, brands, sellers, variants, offers, price history, user roles, sessions, audit records, and synchronization events. Redis provides cache-aside reads and invalidation; Neo4j stores derived entity relationships; LanceDB stores persistent vector representations.

Search combines keyword, graph, and vector candidate sources using weighted reciprocal-rank fusion. Final product records are rehydrated and freshness-checked against MySQL so derived stores do not become authoritative for product identity, price, or stock. Customer registration and login are supported, while shared catalogue mutation is restricted to authenticated administrators.

The catalogue is deterministic synthetic data. The default vectorizer is local feature hashing over word, bigram, and character-trigram features; it is a lexical vector baseline, not a pretrained transformer. A historical disposable-CI benchmark on 50 products and 100 operations measured higher operation latency for hybrid strategies than for MySQL-only, while provisional NDCG@10 was 0.887 for hybrid and 0.867 for MySQL-only. The hybrid run also recorded a 43.18% non-verified derived-candidate freshness signal. These results are limited to one small synthetic workload and provisional manually checked relevance judgments. They do not establish production performance, statistical superiority, or novelty.

**Keywords:** DBMS, MySQL, Redis, Neo4j, LanceDB, hybrid retrieval, cache invalidation, transactional outbox, freshness validation, reciprocal-rank fusion.

## Table of contents

1. Introduction  
2. Problem Definition, Objectives and Related Work  
3. Requirements and System Architecture  
4. Entity-Relationship Design  
5. Relational Mapping and Data Dictionary  
6. DDL, Constraints and Indexing  
7. DML and SQL Query Demonstrations  
8. Advanced DBMS Concepts and Synchronization  
9. Application Design and Implementation  
10. Testing, Experiments and Results  
11. Conclusion and Future Work  
Team contribution and evidence matrix  
References  
Appendices

## List of figures

- Figure 3.1 — PolyFind runtime architecture
- Figure 4.1 — Canonical relational ER diagram
- Figure 5.1 — Relational mapping and key relationships
- Figure 8.1 — Transactional outbox delivery state machine
- Figure 9.1 — Public search and product comparison screen
- Figure 9.2 — Customer registration/login screen
- Figure 9.3 — Administrator catalogue workspace
- Figure 10.1 — GitHub Actions verification evidence
- Figure 10.2 — Benchmark strategy comparison

## Team contribution and evidence matrix

The repository's [Parallel Work Plan](PARALLEL_WORK_PLAN.md) assigns each implementation slice to one directly responsible owner. The table below summarizes the planned ownership split across database and application work. It is an assignment record, not proof that a person completed a slice. Before submission, replace Member A/Member B with the approved names and attach each person's actual commits, pull requests, test outputs, and screenshots. The final contribution statement must reflect actual work, not only planned ownership.

| Team member | Database contribution assigned | Application contribution assigned | Evidence to attach |
|---|---|---|---|
| Member A | MySQL schema/migrations, catalogue CRUD, constraints/indexes/transaction tests, version metadata and database-facing retrieval contracts | Backend API, retrieval/fusion, freshness validation and adaptive planner | Slice PRs/commits, migration/test outputs, API screenshots and review record |
| Member B | Synthetic dataset/validation, vector ingestion/adapter, Neo4j graph schema/sync, Redis invalidation | Catalogue UI and search UI/API integration | Slice PRs/commits, integration-test outputs, search/admin screenshots and review record |

Both members therefore have planned work in database and application areas. Actual individual completion must be substantiated with repository history and test evidence before the report is signed.

## List of tables

- Table 2.1 — Related-work comparison
- Table 3.1 — Functional and quality requirements
- Table 3.2 — Technology and data ownership
- Table 5.1 — Relational entity mapping
- Table 6.1 — Migration and database object summary
- Table 8.1 — Advanced DBMS concepts
- Table 10.1 — Historical measured benchmark results
- Table 10.2 — Threats to validity and limitations

---

# Chapter 1 — Introduction

## 1.1 Background

Product discovery combines structured constraints such as category, price, and stock with text relevance and relationships among products, brands, sellers, and variants. A single relational database can preserve transactional integrity, while cache, graph, and vector technologies can provide additional retrieval capabilities. Once information is copied into derived stores, however, the copies may lag behind the authoritative records.

## 1.2 Project overview

PolyFind is a local-first academic application that demonstrates a MySQL-authoritative catalogue with derived Redis, Neo4j, and LanceDB components. It includes public product search, product details, seller offer comparison, price history, customer registration/login, and an administrator workspace for shared catalogue changes.

## 1.3 Objectives

1. Design a normalized relational catalogue and supporting identity/audit tables.
2. Demonstrate SQL DDL, DML, joins, aggregates, subqueries, CTEs, window functions, procedures, functions, and triggers.
3. Integrate Redis, Neo4j, and LanceDB as derived stores.
4. Use weighted hybrid retrieval while retaining MySQL as the final authority.
5. Demonstrate version checks, transactional outbox delivery, invalidation, and stale-candidate handling.
6. Provide a usable frontend and authenticated administrator workflow.
7. Evaluate correctness and retrieval trade-offs with reproducible test and benchmark artifacts.

## 1.4 Scope and non-goals

The project is academic/personal, with a target spend of ₹0. The dataset is synthetic and deterministic. The application is not a commercial marketplace: payments, orders, checkout, live retailer scraping, live retailer pricing, and real inventory feeds are excluded. The project does not train a foundation model or claim that feature hashing has transformer-level semantic understanding. Qdrant is excluded; LanceDB is the approved vector store.

## 1.5 Organization of the report

Chapters 2–3 define the problem, related work, requirements, and architecture. Chapters 4–8 document the database model and DBMS concepts. Chapter 9 describes the application. Chapter 10 reports tests and measured evidence. Chapter 11 summarizes conclusions and limitations.

# Chapter 2 — Problem Definition, Objectives and Related Work

## 2.1 Problem statement

A search application that combines relational, cache, graph, and vector retrieval must coordinate data copied across stores. A cache or index may contain an older product version after a price, stock, or catalogue update. If the derived store is treated as authoritative, a stale result can be presented as current.

PolyFind addresses this engineering problem by separating candidate discovery from transactional authority. MySQL remains authoritative. Derived stores contribute candidate identifiers and ranking signals; final product data is loaded from MySQL and checked against source versions.

## 2.2 Research questions

- Can version-aware validation reduce stale transactional-field presentation compared with relying on TTL alone?
- What relevance, latency, and store-work trade-offs appear between MySQL-only, cached, fixed-hybrid, and adaptive-hybrid strategies?
- How does update activity affect the freshness status of derived candidate sources?
- How should the application behave when a derived store is missing, unavailable, or behind?

These are evaluation questions, not pre-established claims of superiority.

## 2.3 Related work

| Work | Relevant idea | Relation to PolyFind |
|---|---|---|
| BigDAWG: A Polystore System for Big Data, SIGMOD 2016 | Middleware across heterogeneous data stores | Establishes the polystore context; PolyFind uses a narrower application-specific retrieval path |
| RHEEM project | Cross-platform query processing and cost-aware execution | Motivates considering execution costs across stores |
| Eddies: Continuously Adaptive Query Processing, SIGMOD 1996 | Runtime adaptation of query processing | Provides prior art for adaptive execution; PolyFind does not claim a new general optimizer |
| Elasticsearch hybrid-search documentation | Lexical and semantic retrieval combination | Provides practical context for hybrid retrieval and ranking |
| Azure Cache-Aside pattern | Lazy cache population, invalidation, expiry and stale-data trade-offs | Motivates explicit cache invalidation and authoritative reads |

The comparison is targeted, not a systematic literature review. The candidate research gap is the joint evaluation of retrieval decisions, derived-store freshness signals, and authoritative-field correctness. Novelty is not established.

## 2.4 Hypotheses

The project treats freshness, latency, and relevance improvements as hypotheses. A single small CI workload cannot confirm statistical significance or broad generalization. The evidence is discussed in Chapter 10 with its limitations.

# Chapter 3 — Requirements and System Architecture

## 3.1 Functional requirements

- Search products using text and structured filters.
- Browse categories, product details, seller offers, and price history.
- Register and authenticate customers.
- Bootstrap the first administrator using a one-time token.
- Restrict catalogue mutations to administrators.
- Record authoritative changes, audit attribution, versions, and outbox events.
- Use Redis, Neo4j, and LanceDB as optional derived components.
- Report health/readiness and dependency degradation.
- Generate deterministic synthetic data and repeatable benchmark workloads.

## 3.2 Quality requirements

Correctness requires transactional writes, optimistic version checks, idempotent projections, and MySQL hydration. Security requires password hashing, hashed session tokens, expiry/revocation, role enforcement, input validation, and throttling. Reliability requires explicit dependency status, cache fallback, and safe startup/shutdown. Reproducibility requires fixed seeds, environment metadata, repeated runs, and retained raw artifacts.

## 3.3 Technology and ownership

| Layer | Technology | Responsibility |
|---|---|---|
| UI | Next.js, React, TypeScript | Search, product detail, authentication and admin UI |
| Authoritative database | MySQL 8 / InnoDB | Transactional catalogue, offers, identity, audit and outbox |
| Cache | Redis | Cache-aside reads and invalidation |
| Graph | Neo4j 5 | Derived entity relationships and graph candidate retrieval |
| Vector | LanceDB | Embedded persistent vector candidate index |
| API/runtime | Node.js and TypeScript | Authentication, validation, search planning, fusion and synchronization |

## 3.4 Search flow

1. Validate query text, filters, pagination, and freshness mode.
2. Retrieve candidates from MySQL keyword search and available vector/graph providers.
3. Combine candidate lists using weighted reciprocal-rank fusion.
4. Hydrate product records from MySQL.
5. Compare candidate source versions with authoritative versions.
6. Reject stale/unverifiable candidates in strict mode; report degraded status where applicable.
7. Return product facts from MySQL only.

Default fusion contributions are MySQL 0.50, vector 0.35, and graph 0.15. They are engineering defaults, not empirically optimized weights.

### Figure 3.1 — Runtime topology

~~~mermaid
flowchart TD
    U[Browser] --> WEB[Next.js UI]
    WEB --> API[Node.js API]
    API --> AUTH[Auth and RBAC]
    API --> PLAN[Retrieval planner]
    PLAN --> SQL[(MySQL authority)]
    PLAN --> REDIS[(Redis cache)]
    PLAN --> NEO[(Neo4j graph candidates)]
    PLAN --> LANCE[(LanceDB vector candidates)]
    SQL --> FUSE[Weighted reciprocal-rank fusion]
    REDIS --> FUSE
    NEO --> FUSE
    LANCE --> FUSE
    FUSE --> VALIDATE[MySQL hydration and freshness validation]
    VALIDATE --> API
    API --> WEB
    SQL --> OUTBOX[Transactional outbox]
    OUTBOX --> REDIS
    OUTBOX --> NEO
    OUTBOX --> LANCE
~~~

## 3.5 Runtime modes

Demo mode uses an in-memory deterministic catalogue and is useful for UI development; it does not prove real database integration. Live local Docker mode uses MySQL, Redis, and Neo4j services, with LanceDB persisted in the application volume. CI uses disposable services and a temporary LanceDB path. Public hosting is not certified until its deployed SHA and persistent dependencies are independently checked.

# Chapter 4 — Entity-Relationship Design

## 4.1 Main entities

The relational model includes categories, products, brands, product_variants, sellers, offers, offer_history, users, roles, user_roles, sessions, audit_logs, outbox_events, and outbox_deliveries. Product price/stock version history is also retained in product_versions for compatibility with the catalogue repository.

## 4.2 Main relationships

- A category may have a parent category and many products.
- A brand may be associated with many products.
- A product has variants and offers.
- A seller provides offers.
- An offer may refer to a variant belonging to the same product.
- An offer has price-history records.
- A user may have multiple roles and sessions.
- An authenticated user may be attributed to audit records.
- An outbox event has independent delivery rows for Redis, Neo4j, and LanceDB.

## 4.3 ERD

Use the canonical Mermaid ER diagram in [RELATIONAL_SCHEMA_PHASE4.md](RELATIONAL_SCHEMA_PHASE4.md) as Figure 4.1. Export a rendered image from the current schema document for the institution's required report format. Do not substitute the historical root-level conceptual diagram for the executable schema.

# Chapter 5 — Relational Mapping and Data Dictionary

## 5.1 Mapping principles

Each entity maps to a MySQL table with a primary key. One-to-many relationships are represented by foreign keys on the many side. The user-role many-to-many relationship is represented by user_roles. Offer-to-variant integrity uses a composite foreign key that includes product_id to prevent cross-product variant references.

## 5.2 Entity mapping

| Entity | Table | Key fields / role |
|---|---|---|
| Category | categories | id, parent_id, name, slug |
| Product | products | id, category_id, brand_id, name, price, stock, version |
| Product version | product_versions | product_id, version, price, stock, change_reason |
| Brand | brands | id, name, slug |
| Variant | product_variants | id, product_id, sku, version |
| Seller | sellers | id, name, slug, status |
| Offer | offers | id, product_id, seller_id, variant_id, price, currency, availability, version |
| Offer history | offer_history | offer_id, price/stock/availability snapshot, version and timestamp |
| User and role | users, roles, user_roles | identity and role assignment |
| Session | sessions | hashed token, expiry and revocation metadata |
| Audit | audit_logs | actor, entity, operation and metadata |
| Outbox | outbox_events, outbox_deliveries | source event and per-target delivery state |

Refer to the migration files and [RELATIONAL_SCHEMA_PHASE4.md](RELATIONAL_SCHEMA_PHASE4.md) for the complete executable field definitions.

# Chapter 6 — DDL, Constraints and Indexing

## 6.1 Migration sequence

Migrations 001–005 establish the initial catalogue, query indexes, metadata compatibility, normalized relational foundation, and outbox delivery leases/retry support. The migration runner records applied migrations. MySQL DDL rollback is not assumed; schema changes are forward-only unless a separately reviewed migration is supplied.

## 6.2 Constraints

The schema enforces entity identity, foreign-key relationships, unique slugs/emails where applicable, non-negative prices and stock, positive versions, offer availability states, valid offer time windows, and delivery-target state. A composite FK ensures an offer's variant belongs to the same product.

## 6.3 Indexes

The schema includes primary and foreign-key indexes, category/price composite filtering, stock and update-time access, FULLTEXT product search, offer/history lookup, sessions, audit, and pending outbox delivery indexes. The exact names and columns must be taken from the current migrations and [EXPLAIN_PLANS_BASELINE.md](EXPLAIN_PLANS_BASELINE.md).

# Chapter 7 — DML and SQL Query Demonstrations

## 7.1 Basic DML

The project demonstrates reading product records, inserting and updating catalogue entities, and preserving version/history information. Catalogue writes are performed through repository methods so transactions and audit/outbox behavior are retained.

## 7.2 Advanced SQL queries

The SQL review includes:
- INNER JOIN and LEFT JOIN;
- COUNT, AVG, MIN, MAX and ROUND;
- GROUP BY and ORDER BY;
- nested and correlated subqueries;
- common table expressions;
- RANK window function;
- stored procedure GetProductsByCategory;
- deterministic function CalculateInventoryValue;
- an AFTER UPDATE trigger exercise for product price/stock history.

Full runnable examples and safety notes are in [SQL_OPERATIONS_CATALOGUE.md](SQL_OPERATIONS_CATALOGUE.md) and [POLYFIND_SQL_Review_Notes.md](POLYFIND_SQL_Review_Notes.md). Execute schema-changing examples only on a disposable database.

# Chapter 8 — Advanced DBMS Concepts and Synchronization

## 8.1 ACID transactions

MySQL repository mutations group authoritative writes in transactions. Offer create/update writes the offer, offer_history, audit record, outbox event, and independent target-delivery rows as one logical transaction.

## 8.2 Optimistic concurrency control

Product and offer updates use source versions and expected-version checks. A stale update is rejected rather than silently overwriting a newer record.

## 8.3 Transactional outbox

The outbox records synchronization intent in the same transaction as the source mutation. Workers claim deliveries using leases, retry transient failures with bounded backoff, and dead-letter exhausted/permanent failures. Redis, Neo4j, and LanceDB delivery states are independent.

## 8.4 Idempotent derived projections

Neo4j uses source identifiers and version-aware projection operations. LanceDB uses version-protected upserts and tombstones; records are marked with a PolyFind ownership field so reconciliation does not destroy unrelated rows. MySQL remains authoritative.

## 8.5 Cache invalidation

Redis caches selected product/listing reads and uses product reverse indexes for targeted invalidation. Cache failure must not make Redis authoritative; the application continues with MySQL-backed reads when possible. Short TTLs do not by themselves prove cross-store consistency.

## 8.6 Freshness validation

Derived candidates are checked against MySQL versions before presentation. Strict mode rejects stale or unverifiable candidates. Best-effort mode may retain a candidate for ranking only when the authoritative product can still be hydrated; response status signals degradation. Returned price and stock fields come from MySQL.

# Chapter 9 — Application Design and Implementation

## 9.1 Backend modules

The modular monolith separates catalogue repositories, API contracts/validation, authentication, cache adapters, retrieval providers, fusion, planner/freshness validation, synchronization/outbox, and benchmark code.

## 9.2 API surface

The application exposes health/readiness, product listing/detail, search, offer and price-history routes, seller/brand/variant reads, customer registration/login/logout, current-user lookup, and administrator-only product/offer/metadata mutations. Search is supported through GET query parameters and POST JSON request paths in the API server; see [API.md](API.md) for the route inventory.

## 9.3 Authentication and authorization

Public browsing is anonymous. Customers can register and log in but cannot mutate the shared catalogue. The first administrator is bootstrapped once using AUTH_BOOTSTRAP_TOKEN. Passwords use scrypt; random session tokens are stored as hashes with expiry/revocation. Browser sessions use HttpOnly and SameSite=Strict cookies; Secure is added in production. Login/registration/bootstrap throttling is process-local, so horizontal scaling requires a shared limiter.

## 9.4 Frontend

The Next.js UI provides search, structured filters, sorting, pagination, product detail, seller offer comparison, price history, login, registration, and administrator catalogue workflows. Capture final screenshots from the rehearsed local environment and add them to the institutional report.

# Chapter 10 — Testing, Experiments and Results

## 10.1 Automated verification

The repository includes unit/API tests, environment-gated real MySQL/Redis/Neo4j/LanceDB integration tests, a Playwright browser journey, typecheck scripts, and a production build. The CI workflow configures disposable MySQL, Redis, and Neo4j services and a temporary LanceDB path. Test-file presence and workflow configuration do not prove that a particular run passed.

The combined GitHub commit-status endpoint returned no status entries for baseline d72cc1f during this audit. Therefore this report does not claim that the current baseline's complete CI run is green. The final current-commit run must be attached before submission freeze.

## 10.2 Historical benchmark setup

A measured artifact from workflow run [42959976828](https://github.com/Rohith-S636/polyfind/actions/runs/42959976828) was downloaded and inspected. It was generated on 2026-11-11 for commit b90ec799ca083fede1817aaac80b985e2fe59cb1, not the current report baseline.

The workload used MySQL 8.0.46, database polyfind_test, Node.js 22.23.4, Linux x64, an AMD EPYC 9V74 processor with four allocated CPU cores and 15,983 MB memory, 50 deterministic seed-42 products, 100 operations per measured repetition (88 queries and 12 updates), one warm-up, and three repetitions. LanceDB indexed all 50 products. The local vectorizer was polyfind-feature-hash-v1. Fusion contributions were 0.50 MySQL, 0.35 vector, and 0.15 graph.

## 10.3 Measured results

| Strategy | Mean operation latency across run summaries (ms) | Per-run operation p95 range (ms) | NDCG@10 (provisional) | Non-verified freshness signals |
|---|---:|---:|---:|---:|
| MySQL only | 1.12 | 3.45–4.16 | 0.867 | 0 / 264 |
| MySQL + Redis cache | 2.79 | 3.55–4.28 | 0.867 | 0 / 264 |
| Fixed weighted hybrid | 8.42 | 11.82–14.97 | 0.887 | 114 / 264 (43.18%) |
| Adaptive weighted hybrid + cache | 9.42 | 10.73–21.55 | 0.887 | 114 / 264 (43.18%) |

The mean operation latency values are averages of the three raw-run mean latencies. The p95 column is the range of per-run operation p95 values. These are not the same statistic and must not be interchanged.

The benchmark does not show a latency advantage for hybrid retrieval on this small workload. The hybrid strategies show a 0.020 higher provisional NDCG@10 than MySQL-only, but the qrels are manually checked against the seed-42 catalogue and are not independently annotated. The difference is not a significance test. Redis had a low cache-hit rate (8.0–9.1% in its three raw runs), and one run included large update-latency outliers.

The freshness metric counted query responses whose freshness status was not verified. It recorded 114/264 observations for both hybrid strategies. It does not mean stale price or stock was presented: strict mode rejects stale/unverifiable candidates and final product fields are hydrated from MySQL. It does reveal that derived-candidate freshness was not consistently verified under this workload and must be discussed as a limitation.



### Figure 10.2 — Historical mean operation latency by strategy

The following chart is generated from the three raw-run mean operation latencies in the historical artifact. It is not a current-main measurement.

~~~mermaid
xychart-beta
    x-axis ["MySQL", "MySQL+Redis", "Fixed hybrid", "Adaptive hybrid"]
    y-axis "Mean operation latency (ms)" 0 --> 10
    bar [1.12, 2.79, 8.42, 9.42]
~~~

## 10.4 Threats to validity

- Synthetic data limits external validity.
- The dataset has only 50 products and the workload has 100 operations.
- Relevance judgments are provisional, manually checked and not independently annotated.
- Three repetitions provide limited statistical power.
- The measured environment is a containerized CI runner, not a controlled local hardware benchmark.
- The benchmark belongs to an earlier commit; current-revision behavior may differ.
- Default fusion weights are not optimized.
- The experiment does not establish production-scale behavior, general superiority, or universal strong consistency.

# Chapter 11 — Conclusion and Future Work

## 11.1 Conclusion

PolyFind demonstrates a modular-monolith product discovery application with MySQL as the transactional authority and Redis, Neo4j, and LanceDB as derived stores. It combines candidate retrieval with weighted reciprocal-rank fusion and uses MySQL hydration/version checks to protect authoritative product fields. The application also demonstrates authenticated role boundaries, seller offer comparison, price history, version-aware writes, and transactional outbox synchronization.

The historical benchmark shows that hybrid retrieval increased latency in the measured small CI workload, while its provisional NDCG@10 was modestly higher. It also exposed a 43.18% non-verified derived-candidate freshness signal. These results are useful engineering observations, not evidence of broad performance superiority.

## 11.2 Limitations

The catalogue is synthetic, the default feature-hashing vectorizer is lexical, relevance labels are provisional, the benchmark is small and historical, auth throttling is process-local, and deployment-specific Origin/CSRF/shared-rate-limiter hardening remains. Public hosting is not certified without deployed-SHA and dependency smoke tests.

## 11.3 Future work

1. Repeat the benchmark on the final commit with larger catalogues, more query/update repetitions, and a recorded local hardware environment.
2. Obtain independent relevance annotations and report agreement.
3. Investigate the observed derived-candidate freshness signal and improve synchronization/reconciliation coverage.
4. Measure cache policy under a workload with realistic repeated-query locality.
5. Add a shared rate limiter and deployment-specific CSRF/origin verification before any public exposure.
6. Expand relationship-level reconciliation and failure-injection tests.

---

## References

1. BigDAWG: A Polystore System for Big Data. ACM SIGMOD, 2016. https://doi.org/10.1145/2882903.2899395
2. RHEEM project and publications. https://rheem.apache.org/
3. Avnur, R. and Hellerstein, J. M. Eddies: Continuously Adaptive Query Processing. ACM SIGMOD, 1996. https://doi.org/10.1145/276305.276313
4. Elasticsearch, Semantic and Hybrid Search Documentation. https://www.elastic.co/guide/en/elasticsearch/reference/current/semantic-text-hybrid-search.html
5. Microsoft Azure Architecture Center, Cache-Aside Pattern. https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
6. MySQL 8.0 Reference Manual. https://dev.mysql.com/doc/refman/8.0/en/
7. Redis Documentation. https://redis.io/docs/
8. Neo4j Documentation. https://neo4j.com/docs/
9. LanceDB Documentation. https://lancedb.github.io/lancedb/
10. PolyFind source repository and implementation documents. https://github.com/Rohith-S636/polyfind

## Appendices

### Appendix A — Reproduction commands

~~~powershell
npm ci
npm run typecheck
npm run typecheck:scripts
npm test
npm run build
~~~

Run migrations and seeding only against an intentionally configured disposable/local database. The full local stack is described in [LOCAL_SETUP.md](LOCAL_SETUP.md).

### Appendix B — Database and API references

- [Relational schema and ERD](RELATIONAL_SCHEMA_PHASE4.md)
- [SQL operations catalogue](SQL_OPERATIONS_CATALOGUE.md)
- [SQL review notes](POLYFIND_SQL_Review_Notes.md)
- [Redis integration](REDIS_PHASE5.md)
- [Neo4j graph schema](GRAPH_SCHEMA.md)
- [LanceDB integration](LANCEDB_PHASE7.md)
- [Transactional outbox](OUTBOX_PHASE8.md)
- [HTTP API](API.md)

### Appendix C — Evidence attachments to add before submission

- Current-commit GitHub Actions summary and logs.
- Current browser acceptance screenshots.
- Rendered ERD and architecture diagram.
- SQL client screenshots for DDL, DML, procedure, function, trigger and EXPLAIN examples.
- Local Docker health/readiness and admin workflow screenshots.
- Final benchmark JSON and analysis output for the final commit.
- Institution-required signed certificate/declaration pages.
