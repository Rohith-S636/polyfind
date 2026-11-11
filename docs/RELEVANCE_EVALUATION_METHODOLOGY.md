# PolyFind — Search Relevance Evaluation Methodology

> Documented for Slice S5-02: Search relevance labels and metrics.

## 1. Evaluation Query Set

To ensure fair, repeatable, and comparable evaluation across all baseline and proposed retrieval policies, every method must be tested against the exact same 10 curated queries in `BENCHMARK_QUERY_SET` (defined in `src/benchmark/judgments.ts`).

The query set spans four query categories:
1. **Keyword Queries (`keyword`):** Exact and lexical token matches (e.g., `q-01: stainless water bottle`, `q-05: insulated thermal gloves winter`, `q-07: compact outdoor navigation compass`).
2. **Structured Filter Queries (`filtered`):** Queries constrained by relational predicates like category, price bounds, or in-stock availability (e.g., `q-02: backpack [cat-gear, $30-$150]`, `q-06: camping lantern led [inStock=true]`, `q-09: waterproof rain jacket [cat-apparel]`).
3. **Semantic Queries (`semantic`):** Natural language intent and descriptive queries (e.g., `q-03: lightweight hiking tent waterproof`, `q-04: trail running shoes breathable`, `q-10: hydration pack with bladder reservoir`).
4. **Relationship Queries (`relationship`):** Graph-oriented entity exploration (e.g., `q-08: frequently bought with hiking tent`).

---

## 2. Label Provenance and Judgment Method

The ten query descriptions and product IDs are stable, hand-authored fixtures
for the seeded catalog contract. The labels in `GROUND_TRUTH_LABELS` are
provisional test judgments written against those query descriptions and
stable product IDs; they are not labels collected from end users or
independent annotators. They exist to make metric calculations deterministic
and to test the benchmark pipeline.

Before using these labels for research claims, the team must validate each
query against the final seeded dataset, record the dataset/version used, and
conduct an independent review (ideally with at least two annotators and an
agreement measurement). Until then, results using these fixtures are
engineering/evaluation evidence only.

## 3. Graded Relevance Scale

Relevance is evaluated on an ordinal 4-point scale (0 to 3):

| Grade | Relevance Level | Description |
|---|---|---|
| **3** | Exact / Highly Relevant | Product directly satisfies the query intent, category, and specifications. |
| **2** | Relevant | Product is functionally suitable or closely related. |
| **1** | Marginally Relevant | Product shares broad category or partial characteristics. |
| **0** | Non-relevant | Irrelevant, out of scope, or unjudged document. |

---

## 4. Metric Formulations

### Precision@K
Measures the proportion of retrieved documents in the top $K$ that are relevant ($\text{grade} \ge 1$):
$$\text{Precision@K} = \frac{|\{d \in \text{TopK} : \text{grade}(d) > 0\}|}{K}$$

### Recall@K
Measures the coverage of all known relevant documents identified within the top $K$:
$$\text{Recall@K} = \frac{|\{d \in \text{TopK} : \text{grade}(d) > 0\}|}{\text{Total Known Relevant Documents}}$$

### Discounted Cumulative Gain (DCG@K) and NDCG@K
Uses the standard exponential gain formulation:
$$\text{DCG@K} = \sum_{i=1}^K \frac{2^{\text{grade}(d_i)} - 1}{\log_2(i + 1)}$$

Normalized by the Ideal DCG (IDCG@K), which sorts all known relevant judgments in descending order:
$$\text{NDCG@K} = \frac{\text{DCG@K}}{\text{IDCG@K}}$$

---

## 5. Policy for Missing Judgments

In accordance with standard Information Retrieval (TREC) pooling conventions:
- Any retrieved candidate that does not appear in `GROUND_TRUTH_LABELS` for that query is assigned a default relevance grade of **0** (non-relevant).
- This prevents fabricated scores, preserves reproducible ranking penalties for hallucinations/false positives, and ensures strictly comparable metric calculations.
- Retrieved result IDs are de-duplicated before ranking. The first occurrence
  determines the item's rank; repeated occurrences do not receive additional
  credit or penalty.
- `k` must be a finite positive integer. Unknown evaluation query IDs are
  rejected rather than silently evaluated against an empty judgment set.

## 6. Duplicate Result IDs

Retrieval methods are expected to return at most one candidate per product.
The metric layer defensively removes duplicate IDs while preserving their
first occurrence. This avoids inflating precision, recall, or discounted gain
when an adapter emits the same candidate more than once.

---

## 7. Limitations and Threats to Validity

1. **Pooling Completeness:** The ground truth labels reflect a finite assessed pool. Novel valid items outside the ground truth pool are treated as non-relevant until judged.
2. **Evaluation Scale:** The 10-query benchmark is designed for local automated verification and unit reproducibility; it does not replace broad user behavioral logging.
3. **Subjectivity:** Relevancy grades are assigned based on defined catalog domain semantics; cross-annotator agreement should be verified before publishing broader research claims.
