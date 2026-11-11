# Research — PolyFind

## Research direction
**PolyFind: Freshness-Constrained Adaptive Retrieval Across Heterogeneous Databases**

Status: candidate research direction; novelty is not yet established.

## The problem
Search applications increasingly combine relational filtering, cache-based acceleration, graph relationships, and semantic vector retrieval. Maintaining multiple representations creates a coordination problem: derived data may lag behind authoritative updates, retrieval paths have different costs, and results from separate stores must be combined without violating freshness or correctness requirements.

PolyFind will investigate whether a retrieval planner informed by query characteristics, data-version/freshness signals, and observed execution costs can improve the balance between relevance, freshness correctness, latency, and resource use.

## Who has this problem
- Developers building catalog, knowledge, or discovery applications that combine structured and semantic search.
- Data/platform engineers responsible for cache invalidation, derived indexes, and cross-store synchronization.
- Researchers evaluating hybrid retrieval and heterogeneous data systems.

These are target user groups for the project, not evidence of market demand.

## Why now / why this team
The project is suitable for a DBMS capstone because it provides hands-on work with relational transactions, caching, graph queries, vector retrieval, query planning, consistency, and measurable experiments.

## What exists already / related-work map

Adjacent research and engineering practice cover polystores, adaptive query
processing, hybrid retrieval, and cache invalidation. The verified, scoped
matrix is maintained in
[`RESEARCH_CLAIMS_AND_RELATED_WORK.md`](./RESEARCH_CLAIMS_AND_RELATED_WORK.md).
Earlier speculative paper leads were removed from this overview rather than
being treated as verified citations. The matrix is targeted, not a systematic
review, and does not establish novelty.

### Literature matrix template for ongoing review

Use this template when recording newly reviewed papers during Sprint 1–6:

| Field | Description / Instruction |
|---|---|
| **Citation / Reference** | Full bibliographic reference, publication venue, and DOI/arXiv identifier. |
| **Method** | Core algorithmic or architectural approach. |
| **Assumptions** | Stated or unstated operational assumptions (e.g. static data, unified engine, hardware). |
| **Metrics** | Quantitative evaluation measures (e.g. NDCG, latency percentiles, staleness rate). |
| **Limits** | Weaknesses, scale limits, failure modes, or unaddressed scenarios. |
| **Overlap & Distinction** | Precise intersection with PolyFind and what distinguishes PolyFind's investigation. |

## Candidate gap
The candidate gap is the joint evaluation of cross-store retrieval decisions under changing freshness of derived data, with explicit correctness constraints for authoritative fields and a measured trade-off among relevance, freshness violations, tail latency, and resource use.

This is a hypothesis, not a claim that no prior system does this. Before making a novelty claim, compare the proposed method against the closest freshness-aware cache, multistore optimizer, and hybrid retrieval systems.

## Rough shape of the solution
PolyFind will keep MySQL authoritative for transactional facts. Redis, Neo4j, and the vector index will be treated as derived or retrieval-supporting stores. A retrieval planner will choose and combine paths using query class, freshness requirements, version metadata, and measured execution costs; freshness-sensitive fields will be validated against MySQL or a trustworthy version mechanism.

## Research questions and formal hypotheses

All performance, freshness, and relevance advantages are working hypotheses subject to experimental verification in Sprint 5 and Sprint 6. No claim of novelty or superiority is accepted without empirical evidence.

### Research questions
1. Can version-aware validation reduce stale-result violations compared with TTL-only caching?
2. Can adaptive routing reduce latency or query work without unacceptable degradation in search relevance?
3. How do update frequency and synchronization delay change the quality/freshness/latency trade-off?
4. How does the design degrade when a derived store is unavailable or behind?

### Formal hypotheses (H1–H4)
- **Hypothesis 1 (H1 — Freshness Correctness):** Version-aware validation reduces stale-result violations for authoritative transactional fields (price, stock) to zero, significantly outperforming TTL-only caching under concurrent write workloads.
- **Hypothesis 2 (H2 — Tail Latency & Adaptive Routing):** Adaptive query routing conditioned on query features and store health reduces p95 tail latency and aggregate store operation counts relative to a fixed multi-store baseline, without statistically significant degradation in search relevance (NDCG@10).
- **Hypothesis 3 (H3 — Synchronization Delay Resilience):** Under increasing write arrival rates and artificial synchronization lag in derived stores, a freshness-constrained policy maintains consistent search accuracy while fixed hybrid baselines suffer escalating freshness violation rates.
- **Hypothesis 4 (H4 — Graceful Fallback & Availability):** When derived stores (Redis, Neo4j, or vector store) fail or lag beyond tolerable thresholds, automated fallback to authoritative MySQL maintains system availability and transactional correctness with documented latency degradation.

## Evaluation plan
Compare at least:
- MySQL-only structured baseline.
- Fixed multi-store retrieval.
- Fixed hybrid retrieval without freshness-aware decisions.
- TTL-only cache policy.
- Proposed freshness-constrained adaptive policy.

Measure Precision@K, Recall@K, NDCG@K, freshness violation rate, update visibility delay, median/p95 latency, throughput, database operations per query, and recovery behavior. Record hardware, dataset, workload, seeds, cache state, and run repetitions. Use ablation studies to isolate each signal/mechanism.

## Open questions and decision tracking

| # | Question | Owner | Target Slice / Date | Status |
|---|---|---|---|---|
| 1 | Which vector database and embedding provider best fit local reproducibility and project constraints? | Member B | Sprint 1 (`S1-05`) | Under evaluation in vector spike; documented in ADR-003. |
| 2 | What freshness contract applies to price/stock versus descriptive metadata? | Member A | Sprint 1 (`S1-04` / ADR-002) | Price/stock: zero stale tolerance. Descriptive fields: bounded staleness. |
| 3 | What dataset and query set will be used, and how will relevance labels be created? | Member A & B | Sprint 2 (`S2-02`) & Sprint 5 (`S5-02`) | Seed dataset in S2-02; relevance annotations in S5-02. |
| 4 | What baselines can be implemented fairly within the project timeline? | Member A | Sprint 1 (`S1-02`) | Feasible: MySQL-only, Fixed multi-store, Fixed hybrid, TTL cache. |
| 5 | Which exact prior works are closest to the combined problem and method? | Member A | Sprint 1 (`S1-02`) | Literature audit initialized in research matrix above. |
| 6 | What deadline and sprint duration apply? | Member A | Sprint 1 baseline | Six sprints aligned with parallel work plan. |

## Research exit check
Do not claim the gap is established until a reproducible literature matrix covers the closest work and documents method, assumptions, metrics, limitations, and differences from PolyFind.
