# ADR-008 — Repeated Benchmark Runs and Descriptive Summaries

## Status
Accepted for Slice S6-01.

## Decision

Benchmark strategies are measured over a configured number of warmup and
measured runs. Warmups are excluded from summaries. Each measured run stores
the existing `BenchmarkStrategyMetrics`, while the artifact also records the
seed, workload identity, dataset/operation sizes, environment snapshot, and
run counts so the summary can be reproduced.

Latency summaries include mean, median/p50, p95, p99, first/third quartiles,
IQR, sample variance, sample standard deviation, minimum, maximum, and a
95% normal-approximation confidence interval for the mean. Freshness rates
are computed as total violations divided by total query observations and are
bounded to `[0, 1]`.

These are descriptive summaries. The confidence interval is not a claim of
statistical significance, and no thresholds are tuned against held-out
evaluation data in this slice.
