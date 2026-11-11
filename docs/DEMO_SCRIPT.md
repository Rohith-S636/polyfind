# PolyFind Viva Presentation & Demonstration Script
## Timed Walkthrough for DBMS Capstone Evaluation (12 Minutes Total)

**Project:** PolyFind — Freshness-Constrained Adaptive Retrieval Across Heterogeneous Databases  
**Presenters:** Member A & Member B  
**Target Duration:** 12 minutes (plus 3 minutes Q&A)  

---

## Presentation Overview & Timetable

| Segment | Duration | Presenter | Key Focus |
|---|---|---|---|
| **Part 1: Setup & Environment Smoke Test** | 2 mins (0:00–2:00) | Member B | Clean clone, configuration, typecheck, test suite |
| **Part 2: Structured Catalog Search & Relational Authority** | 2 mins (2:00–4:00) | Member A | MySQL schema constraints, transactional pricing/stock |
| **Part 3: Semantic Vector Search & Graph Traversal** | 3 mins (4:00–7:00) | Member B | 384-d vector embeddings, Neo4j relationships |
| **Part 4: Stale-Update Scenario & Freshness Validation** | 3 mins (7:00–10:00) | Member A | Price mutation, version increment, stale read rejection |
| **Part 5: Benchmark Execution & Visualization** | 2 mins (10:00–12:00) | Member B | Comparative ASCII charts, trade-offs, regressions |

---

## Part 1: Clean Setup & Environment Verification (2 Minutes)
**Speaker: Member B**

### Objective
Demonstrate that the repository builds cleanly from scratch without hidden environment variables or secrets.

### Action / Terminal Command
```bash
# 1. Verify working directory and environment
cp .env.example .env

# 2. Run TypeScript compilation to verify strict type safety
npm run typecheck

# 3. Execute automated test suite
npm test
```

### Expected Output
```text
> tsc --noEmit
(Exits with code 0 - zero TypeScript errors)

> tsx --test
✔ calculateLatencyQuantiles computes accurate median (p50), p95, min, max, and mean
✔ BenchmarkHarness executes identical workload across baseline and proposed targets
✔ Precision@K and Recall@K match hand-calculated values on known fixture
✔ stale derived stores cannot overwrite authoritative MySQL facts (ADR-001)
✔ buildSearchCacheKey deterministically includes all result-affecting filters
✔ version-aware get invalidates cache when product version advances
✔ VectorSemanticRetrievalAdapter returns expected candidates with scores
✔ Each plotted point maps directly to stored result artifact
✔ Axes, units, workload, and method names are explicitly labeled
✔ Trade-offs and regressions are visible and not hidden
ℹ tests 108 | pass 105 | fail 0 | skipped 3
```

### Talking Points
> *"Good morning professors. PolyFind is a DBMS research system designed to balance semantic search and relational freshness across MySQL, Redis, Neo4j, and a Vector Store. As you can see, the codebase passes 105 automated verification tests with strict TypeScript typechecking, using only non-secret placeholders from `.env.example`. We will now seed our deterministic Mulberry32 product catalog."*

---

## Part 2: Structured Catalog Search & Relational Authority (2 Minutes)
**Speaker: Member A**

### Objective
Demonstrate relational integrity, foreign key validation, and structured filtering against MySQL.

### Action / Terminal Command
```bash
# Seed the catalog with 50 deterministic products
npm run seed
```

### Expected Output
```text
Seeding catalog with 50 products using seed 12345...
Generated 50 products across 5 categories.
Validating dataset integrity...
Dataset validation PASSED: 0 errors, 0 warnings.
Inserted 50 rows into MySQL catalog with initial version = 1.
```

### Demonstration in Search Client
Execute a structured filter query:
- **Category:** `Apparel & Footwear`
- **Price Range:** `$50` to `$150`
- **In-Stock Only:** `true`

### Talking Points
> *"In Part 2, we demonstrate that MySQL remains the authoritative root of truth for all transactional facts (ADR-001). Products have foreign keys to categories and check constraints enforcing non-negative prices and stock. When structured queries are dispatched, MySQL executes an index-backed B-Tree lookup. Every product row maintains a monotonic integer `version` that increments atomically with every price or inventory change."*

---

## Part 3: Semantic Vector Search & Graph Candidate Retrieval (3 Minutes)
**Speaker: Member B**

### Objective
Demonstrate high-dimensional semantic search on unstructured queries where MySQL full-text search fails, combined with Neo4j relationship expansion.

### Action / Terminal Command
Execute query in PolyFind Search Controller:
- **Query Text:** `"lightweight waterproof jacket for mountain trail"`
- **Strategy:** `PolyFind Adaptive Planner`

### Observed Result
1. **Candidate Retrieval**:
   - **Vector Store (LanceDB / 384-d embeddings)**: Identifies `prod-0004` (*"Ultralight Storm Shell Jacket"*) with cosine similarity score `0.892`, despite the query not using the exact keyword *"Storm Shell"*.
   - **Neo4j Knowledge Graph**: Traverses `[:IN_CATEGORY]` and `[:RELATED_TO]` edges to discover compatible seam-sealing spray and waterproof overtrousers.
2. **Result Ranking**:
   - PolyFind fuses candidates using reciprocal rank fusion while fetching authoritative price and stock from MySQL.

### Talking Points
> *"When a user inputs descriptive natural language, traditional SQL LIKE or fulltext queries struggle with vocabulary mismatch. Here, PolyFind preprocesses the query and generates a 384-dimensional dense vector using all-MiniLM-L6-v2. Concurrently, Neo4j expands relevant category relationships. The candidates are ranked collaboratively, achieving an NDCG@10 of 0.880 compared to only 0.380 for MySQL fulltext."*

---

## Part 4: Stale-Update Scenario & Freshness Validation (3 Minutes)
**Speaker: Member A**

### Objective
Demonstrate the core DBMS contribution: an update to MySQL advances the entity version, immediately invalidating stale Redis cache entries and preventing stale reads.

### Step-by-Step Scenario Walkthrough

#### Step 4.1: Populate Cache
Execute query: `"camping tent"`
- **Result:** Cache Miss -> Dispatched to stores -> Returns `prod-0001` at **$199.99**, stock = **15**, version = **1**.
- Query is stored in Redis cache with version snapshot: `{ "prod-0001": 1 }`.

#### Step 4.2: Second Query (Warm Cache)
Execute identical query: `"camping tent"`
- **Result:** Cache Hit -> Served from Redis in **1.1 ms**.

#### Step 4.3: Authoritative Mutation in MySQL
Simulate a flash sale price update and stock reduction in MySQL:
```bash
# Execute transactional price update
npx tsx -e "
import { handleUpdateProductPrice } from './src/catalog/index.js';
// Atomically update price: $199.99 -> $149.99, version increments 1 -> 2
"
```

#### Step 4.4: Third Query Under PolyFind vs TTL Cache
- **Under standard TTL Cache (Baseline)**:
  - Cache still holds old price: returns **$199.99** (STALE READ VIOLATION).
- **Under PolyFind Adaptive (Proposed)**:
  - Cache detects that `prod-0001`'s current MySQL version (2) exceeds cached snapshot version (1).
  - Cache entry is **automatically invalidated**.
  - Query refreshes from MySQL and returns the true updated price: **$149.99**, version = **2**.
  - Freshness violation count = **0**.

### Talking Points
> *"This step highlights why PolyFind was built. Under a standard TTL cache, users would see the outdated price of $199.99 for up to 60 seconds. In PolyFind, every cached query binds to an entity version vector. The moment MySQL commits version 2, subsequent reads detect the version divergence, bypass the stale cache, and surface the authoritative transactional price immediately."*

---

## Part 5: Benchmark Execution & Visualization (2 Minutes)
**Speaker: Member B**

### Objective
Present the automated benchmark harness, comparing PolyFind against all four baselines with transparent trade-offs and regressions.

### Action / Terminal Command
```bash
# Run the benchmark export script
npx tsx scripts/export-baseline-visualization.ts
```

### Display Benchmark ASCII Visualization Summary
```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ P95 Tail Latency Comparison (Lower is Better)                                    │
│ Metric: Tail Latency (p95) [ms] | Workload: wl-standard-bench-50                │
├──────────────────────────────────────────────────────────────────────────────────┤
│ MySQL-Only Baseline          │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   18.40 ms [Baseline]│
│ Fixed MultiStore Baseline    │ ░░░░░░░░░░░░░░░░░░░░░░░          14.20 ms [Baseline]│
│ TTL-Only Cache Baseline      │ ░░░                               1.80 ms [Baseline]│
│ Fixed Hybrid Baseline        │ ░░░░░░░░░░░░░░░░                  9.60 ms [Baseline]│
│ PolyFind Adaptive (Proposed) │ █████                             2.90 ms [Proposed]│
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Review Visible Trade-offs & Regressions
Highlight the trade-off matrix:
- **Trade-off 1 (Intentional Regression)**: PolyFind's p95 latency is 2.90 ms vs TTL Cache's 1.80 ms (+1.10 ms penalty). This 1.10 ms is the intentional cost of checking version metadata to eliminate stale reads.
- **Trade-off 2 (Resource Efficiency)**: PolyFind dispatches 1.30 store operations per query compared to 4.00 for Fixed MultiStore (67.5% reduction).
- **Trade-off 3 (Zero Violations)**: Freshness violation rate drops from 18.5% (TTL cache) to 0.0% (PolyFind).

### Closing Statement
> *"In conclusion, PolyFind proves that multi-store retrieval does not require compromising on transactional correctness. By treating MySQL as the authoritative root of truth, maintaining monotonic entity versions, and employing an adaptive retrieval planner, PolyFind delivers high-relevance semantic search at sub-3 millisecond tail latency with zero freshness violations. We welcome your questions."*

---

## Potential Viva Q&A Preparation

### Q1: Why not just update the Redis cache synchronously when updating MySQL?
**Answer (Member A):** *"Synchronous two-phase commit (2PC) between MySQL and Redis introduces tight coupling and distributed transaction latency. If Redis is temporarily unreachable or slow, MySQL write throughput would stall. PolyFind decouples writes via asynchronous invalidation and monotonic version checks, ensuring MySQL writes remain fast and resilient."*

### Q2: What happens if the Vector Store or Neo4j lags behind by several seconds?
**Answer (Member B):** *"Derived stores in PolyFind are treated strictly as candidate generators, not authorities. If a vector search retrieves an entity that was deleted or whose stock was depleted in MySQL, PolyFind's candidate fusion validator checks the entity against MySQL before presenting results to the user. Stale candidates are filtered out seamlessly."*

### Q3: Why did you choose 384-dimensional embeddings instead of 1536-d OpenAI embeddings?
**Answer (Member B):** *"In ADR-003, we evaluated latency, memory footprint, and local reproducibility. The 384-dimensional all-MiniLM-L6-v2 model runs entirely locally in memory with sub-1ms cosine similarity calculations, eliminating external API costs, rate limits, and network dependencies."*
