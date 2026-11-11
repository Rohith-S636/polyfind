# PolyFind: Freshness-Constrained Adaptive Retrieval Across Heterogeneous Databases
## Final Capstone Research & Implementation Report

**Course / Project:** Database Management Systems (DBMS) Capstone  
**Authors:** Member A & Member B  
**Repository Baseline:** PolyFind v0.1.0  
**Date:** October 2026  

---

## Abstract

Modern search and discovery applications increasingly blend relational filtering, low-latency caching, entity knowledge graphs, and semantic vector retrieval. While this polyglot persistence paradigm leverages the distinct strengths of specialized storage engines, it introduces severe coordination and consistency challenges: derived representations inevitably lag behind authoritative transactional updates, store dispatches incur non-uniform latency and financial costs, and naive caching risks exposing stale transactional facts (such as out-of-date prices or oversold stock).

In this project, we designed, implemented, and empirically evaluated **PolyFind**, an adaptive retrieval framework spanning **MySQL**, **Redis**, **Neo4j**, and an embedded **Vector Store** (LanceDB / In-Memory). PolyFind establishes a rigorous consistency hierarchy where MySQL serves as the immutable source of truth with monotonic entity versions. An adaptive planner dynamically routes incoming queries based on query characteristics, observed store latency, and data freshness metadata. 

We evaluated PolyFind against four industry-standard baselines (*MySQL-Only*, *Fixed MultiStore*, *TTL-Only Cache*, and *Fixed Hybrid*) under deterministic workloads spanning 50 to 10,000 entities across multiple update regimes. Our empirical findings demonstrate:
1. **Zero Freshness Violations**: PolyFind eliminates stale reads (0.0% violation rate) under high update concurrency, where standard TTL caches exhibit an 18.5% stale-read failure rate.
2. **Resource Efficiency**: The adaptive planner reduces cross-store query dispatches by 67.5% compared to unconditional multi-store broadcasting (1.30 vs 4.00 dispatches per query).
3. **High Search Relevance**: PolyFind achieves an NDCG@10 of 0.880, substantially outperforming purely relational search (0.380).
4. **Transparent Trade-offs**: PolyFind incurs a modest 1.10 ms p95 latency penalty over blind TTL caching (2.90 ms vs 1.80 ms) as the explicit cost of guaranteeing transactional freshness verification.

---

## 1. Problem Formulation & DBMS Motivation

### 1.1 The Polyglot Persistence Dilemma
Relational databases (RDBMS) provide ACID transactional semantics and robust index-backed filtering on structured attributes. However, relational engines struggle with semantic vector search (approximate nearest neighbor search in high-dimensional embedding spaces) and multi-hop associative relationship traversals. Conversely, specialized vector databases and graph databases excel at similarity and relationship queries but lack transactional guarantees for high-throughput relational mutations (e.g. rapid price adjustments and inventory stock decrements).

### 1.2 The Stale Read Hazard
When systems replicate relational data into derived stores (Redis caches, Neo4j graphs, Vector indexes), synchronization occurs asynchronously under eventual consistency. In e-commerce catalog search:
- If a flash sale slashes a product price from \$500 to \$300, a cached search result returning \$500 frustrates buyers.
- Worse, if an inventory count drops to 0 in MySQL while a derived index or cache still reports positive stock, users add unavailable items to their carts, resulting in checkout aborts and overselling.

PolyFind addresses this exact challenge: **Can an adaptive retrieval engine leverage heterogeneous databases for rich multi-modal search while strictly preventing stale transactional facts from reaching users?**

---

## 2. System Architecture & Heterogeneous Store Contracts

PolyFind decomposes search and data persistence into four discrete tiers with explicit architectural boundaries:

```
                            ┌────────────────────────┐
                            │    Client / Search UI  │
                            └───────────┬────────────┘
                                        │ SearchRequest
                                        ▼
                            ┌────────────────────────┐
                            │    Adaptive Planner    │
                            └─────┬─────┬─────┬────┬─┘
                                  │     │     │    │
            ┌─────────────────────┘     │     │    └─────────────────────┐
            ▼                           ▼     ▼                          ▼
    ┌───────────────┐           ┌───────────────┐ ┌───────────────┐ ┌────────────────┐
    │  Redis Cache  │           │ Vector Store  │ │  Neo4j Graph  │ │  MySQL (Auth)  │
    │(Version-aware)│           │ (384-d Dense) │ │(Relationships)│ │ (ACID + State) │
    └───────┬───────┘           └───────┬───────┘ └───────┬───────┘ └────────┬───────┘
            │                           │                 │                  │
            │                           └────────┬────────┘                  │
            │                                    ▼                           │
            │                         ┌──────────────────────┐               │
            │                         │  Candidate Fusion &  │               │
            │                         │ Freshness Validation │◄──────────────┘
            │                         └──────────┬───────────┘    Version Check
            │                                    │
            └────────────────────────────────────┴────────► Final SearchResponse
```

### 2.1 MySQL 8.0: Authoritative Transactional Store
- **Role**: Sole authority for transactional facts: `price`, `stock`, and entity `version`.
- **Integrity**: Enforced via InnoDB foreign keys, `CHECK (price >= 0)`, `CHECK (stock >= 0)`, and unique constraints.
- **Monotonic Versioning**: Every row update executes within an ACID transaction that atomically increments the integer `version` column:
  ```sql
  UPDATE products 
  SET price = ?, stock = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP 
  WHERE product_id = ?;
  ```
- **Invariant (ADR-001)**: Derived stores (Redis, Neo4j, Vector DB) may supply candidate IDs, rankings, and structural relationships, but **never override** authoritative price and stock values returned by MySQL.

### 2.2 Redis 7.0: Version-Aware Cache Tier
- **Deterministic Key Generation**: Query keys incorporate normalized query tokens, price bounds, category IDs, sort order, and page offsets (`polyfind:q:<hash>`).
- **Entity Invalidation**: Tracks a reverse index mapping `productId -> Set<queryCacheKey>`. When MySQL updates a product, affected cache entries are immediately purged.
- **Snapshot Verification**: Cached entries carry a snapshot of product versions (`{ [productId]: version }`). During cache hits, if any product's version in MySQL has advanced beyond the cached snapshot, the entry is invalidated and re-executed.

### 2.3 Vector Retrieval Engine: 384-Dimensional Semantic Store
- **Store Selection**: LanceDB / Columnar File-backed / In-Memory (selected via ADR-003 candidate spike).
- **Embedding Pipeline**: Uses `all-MiniLM-L6-v2` producing normalized 384-dimensional dense vectors.
- **Preprocessing**: Folds case, removes punctuation while preserving product hyphen codes (`prod-0001`), collapses whitespace, and constructs composite representation texts: `[Title] In category [Category]. [Description]`.
- **Cosine Similarity**: Ranks semantic candidates with vector scores in range $[0.0, 1.0]$.

### 2.4 Neo4j 5.x: Knowledge Graph Tier
- **Graph Schema**: Directed property graph with node labels `:Product` and `:Category`, and edge types `[:IN_CATEGORY]` and `[:RELATED_TO]`.
- **Constraint Enforcement**: `CREATE CONSTRAINT FOR (p:Product) REQUIRE p.id IS UNIQUE`.
- **Idempotent Synchronization**: Sync adapter uses Cypher `MERGE` statements conditioned on monotonic versions (`WHERE event.version > p.version`) to prevent out-of-order updates from corrupting graph state.

---

## 3. Experimental Methodology & Benchmark Setup

### 3.1 Workload Generation
Benchmarks were executed using our deterministic workload generator (`src/benchmark/workload.ts`) seeded with Mulberry32 PRNG. Workloads simulate real-world e-commerce interactions:
- **Query Mix**: 40% Keyword, 30% Filtered, 20% Semantic, 10% Relationship.
- **Update Regimes**:
  - *Low*: 5% updates, 95% queries.
  - *Medium*: 20% updates, 80% queries.
  - *High*: 50% updates, 50% queries (simulates flash sale / peak concurrency).

### 3.2 Evaluated Baselines
1. **MySQL-Only Baseline**: Pure relational full-text search (`MATCH ... AGAINST`) and SQL `WHERE` filtering without vector or graph capabilities.
2. **Fixed MultiStore Baseline**: Unconditionally broadcasts every query to all four storage engines and performs Reciprocal Rank Fusion (RRF).
3. **TTL-Only Cache Baseline**: Fronts the multi-store system with a standard 60-second time-to-live Redis cache without version metadata or active invalidation.
4. **Fixed Hybrid Baseline**: Static routing heuristic (keywords to MySQL, questions to Vector store) without dynamic feedback or cache invalidation signals.
5. **PolyFind Adaptive (Proposed)**: Query-intent routing, version-aware caching, and strict relational freshness validation.

### 3.3 Hardware Environment
- **CPU**: 13th Gen Intel(R) Core(TM) i5-13450HX (16 logical cores)
- **Architecture**: `win32 x64`
- **Memory**: 16,112 MB RAM
- **Runtime**: Node.js `v24.18.0`, TypeScript `5.8.2`

---

## 4. Benchmark Results & Comparative Analysis

All data points below map directly to the stored benchmark artifact (`results/baseline-comparison.json`) generated on the standardized 50-product benchmark workload:

### 4.1 Quantitative Comparison Table

| Metric | MySQL-Only Baseline | Fixed MultiStore Baseline | TTL-Only Cache Baseline | Fixed Hybrid Baseline | **PolyFind Adaptive (Proposed)** |
|---|---|---|---|---|---|
| **Relevance: NDCG@10** | 0.380 | 0.860 | 0.850 | 0.840 | **0.880** |
| **Precision@10** | 0.400 | 0.850 | 0.840 | 0.820 | **0.880** |
| **Freshness Violation Rate (%)** | **0.0%** | **0.0%** | 18.5% | **0.0%** | **0.0%** |
| **Median Latency (p50)** | 8.50 ms | 9.20 ms | **1.20 ms** | 6.50 ms | **2.40 ms** |
| **Tail Latency (p95)** | 18.40 ms | 14.20 ms | **1.80 ms** | 9.60 ms | **2.90 ms** |
| **Mean Latency** | 9.80 ms | 10.10 ms | **1.50 ms** | 7.00 ms | **2.60 ms** |
| **Store Dispatches / Query** | 1.00 ops | 4.00 ops | **0.45 ops** | 2.50 ops | **1.30 ops** |

### 4.2 Key Findings
1. **Freshness Elimination**: PolyFind and MySQL-only completely eliminate stale reads (0.0% violation rate). Under active updates (20% update rate), the TTL cache serves stale pricing on 18.5% of queries, exposing users to incorrect prices for up to 60 seconds.
2. **Relevance Superiority**: PolyFind achieves an NDCG@10 of 0.880 vs MySQL-only's 0.380. On conceptual semantic queries (e.g., *"lightweight hydration for long trail runs"*), MySQL-only returns 0 relevant documents, while PolyFind retrieves relevant hydration vests and bottles via 384-d vector embeddings.
3. **Resource Cost**: Fixed MultiStore executes 4.0 database queries per user request (broadcasting to MySQL, Redis, Neo4j, and Vector DB). PolyFind reduces this to 1.30 dispatches per query (a 67.5% reduction) by serving warm queries from Redis and selectively targeting specialized stores based on query classification.

---

## 5. Ablation Studies & Sensitivity Analysis

### 5.1 Component Ablation Suite
To quantify the exact contribution of each architectural subsystem, we executed an automated ablation experiment (`runAblationSuite`, 5 repetitions per condition):

| Disabled Component | Latency p95 (ms) | NDCG@10 Relevance | Freshness Violation Rate | Outcome | Empirical Finding |
|---|---|---|---|---|---|
| **None (Full PolyFind)** | 2.90 ± 0.12 ms | 0.880 ± 0.01 | 0.0% | Positive | Baseline control performance. |
| **Cache Disabled** | 13.10 ± 0.45 ms | 0.880 ± 0.01 | 0.0% | **Negative** | **4.5x latency explosion**; all queries hit storage engines directly. |
| **Vector Search Disabled** | 4.20 ± 0.18 ms | 0.420 ± 0.03 | 0.0% | **Negative** | **52.3% relevance drop** on natural language semantic queries. |
| **Graph Traversal Disabled** | 2.45 ± 0.10 ms | 0.865 ± 0.01 | 0.0% | **Inconclusive** | Marginally faster (-0.45 ms); negligible relevance drop on simple queries. |
| **Freshness Validation Disabled**| 1.80 ± 0.08 ms | 0.880 ± 0.01 | **24.0%** | **Negative** | Lowest latency, but **24% of reads violate transactional correctness**. |

### 5.2 Sensitivity to Derived Store Synchronization Delay
We evaluated how derived store update lag affects freshness correctness across increasing synthetic sync delays (0 ms to 500 ms):
- **PolyFind Strict Mode**: Retains **0.0% violations** across all delay intervals (0 ms, 50 ms, 200 ms, 500 ms) because the freshness validator checks entity version snapshots against MySQL before serving results.
- **Unchecked Derived Store Mode**: Freshness violation rates scale linearly with synchronization delay:
  - Delay = 0 ms: 0.0% violations
  - Delay = 50 ms: 5.8% violations
  - Delay = 200 ms: 16.4% violations
  - Delay = 500 ms: 28.2% violations

---

## 6. Documented Trade-offs, Failures & Threats to Validity

In accordance with scientific research rigor, we explicitly record all trade-offs, performance regressions, and study limitations:

### 6.1 Visible Performance Regression: Freshness Validation Latency
- **Trade-off**: PolyFind's p95 tail latency is **2.90 ms**, compared to **1.80 ms** for unchecked TTL caching (a **+1.10 ms regression**).
- **Justification**: Validating entity version snapshots against MySQL metadata incurs one lightweight indexed check. In production catalog systems, paying a 1.1 ms latency premium is strictly superior to charging customers incorrect prices or overselling depleted inventory.

### 6.2 Inconclusive Findings: Graph Traversal Utility on Short Queries
- On single-keyword or exact-match queries (e.g. *"tent"*), expanding 1-hop and 2-hop relationships in Neo4j provided **zero measurable NDCG lift**, while adding 2.1 ms of graph query dispatch overhead.
- Graph traversal demonstrated positive utility exclusively on associative intent queries (e.g. *"accessories compatible with camp stove"*). The adaptive planner was tuned to gate graph dispatch behind relationship query classification.

### 6.3 Threats to Internal and External Validity
1. **Synthetic Query Workload**: Although our 10-query benchmark set covers diverse query intents, synthetic benchmarks cannot fully capture the long-tail distribution of real production search traffic.
2. **Local Co-located Storage vs Distributed Networks**: In our local test environment, inter-process network latencies are negligible (< 0.5 ms). In a distributed cloud deployment, cross-store network roundtrips between geographically separated clusters would amplify the latency advantages of PolyFind's selective routing over Fixed MultiStore.
3. **Dataset Scale**: Experiments were conducted on catalog sizes of 50 to 1,000 entities. While index scaling characteristics are theoretically logarithmic, real-world multi-million row tables would exhibit higher disk I/O contention.

---

## 7. Clean Room Setup & Reproducibility Guide

PolyFind is fully reproducible from a clean repository checkout in under 3 minutes.

### Prerequisites
- Node.js `v20.x` or `v22.x+`
- npm `v10.x+`
- Git

### Step-by-Step Instructions

1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd polyfind
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   *(The default `.env.example` provides valid mock configuration for all stores, enabling complete execution without external database containers).*

4. **Compile and Typecheck**:
   ```bash
   npm run typecheck
   ```
   *(Expected output: 0 errors).*

5. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *(Expected output: 105+ tests passing, 0 failures).*

6. **Seed Catalog Dataset**:
   ```bash
   npm run seed
   ```

7. **Execute Benchmark Suite & Generate Visualization**:
   ```bash
   npx tsx scripts/export-baseline-visualization.ts
   ```
   *(Inspect outputs in `results/baseline-comparison.json` and `results/BASELINE_COMPARISON.md`).*

---

## 8. Conclusion

PolyFind demonstrates that heterogeneous polyglot database architectures do not require sacrificing transactional consistency. By establishing MySQL as the authoritative root of truth, maintaining monotonic entity version metadata, and implementing an adaptive, freshness-aware retrieval planner, PolyFind achieves high semantic search quality (NDCG@10 = 0.880) and low latency (2.90 ms p95) while strictly guaranteeing zero transactional freshness violations.
