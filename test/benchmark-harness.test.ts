import assert from "node:assert/strict";
import test from "node:test";
import {
  BenchmarkHarness,
  calculateLatencyQuantiles,
  captureEnvironmentSnapshot,
  generateWorkload,
  type BenchmarkExecutionTarget,
} from "../src/index.js";

test("calculateLatencyQuantiles computes accurate median (p50), p95, min, max, and mean", () => {
  // Test sample with 10 values from 10 to 100
  const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const quantiles = calculateLatencyQuantiles(samples);

  assert.strictEqual(quantiles.minMs, 10);
  assert.strictEqual(quantiles.maxMs, 100);
  assert.strictEqual(quantiles.medianMs, 60); // 50th percentile (idx 5)
  assert.strictEqual(quantiles.p95Ms, 100); // 95th percentile (idx 9)
  assert.strictEqual(quantiles.meanMs, 55);
});

test("captureEnvironmentSnapshot records hardware specs and runtime versions", () => {
  const env = captureEnvironmentSnapshot();
  assert.ok(env.platform.length > 0);
  assert.ok(env.architecture.length > 0);
  assert.ok(env.cpuCores > 0);
  assert.ok(env.totalMemoryMb > 0);
  assert.ok(env.nodeVersion.startsWith("v"));
});

test("BenchmarkHarness executes identical workload across baseline and proposed targets", async () => {
  const harness = new BenchmarkHarness();

  // Generate standardized deterministic workload
  const workload = generateWorkload({
    workloadId: "wl-standard-50",
    datasetSize: 50,
    seed: 1234,
    totalOperations: 20,
    regime: "medium",
    queryMix: { keyword: 0.4, filtered: 0.3, semantic: 0.2, relationship: 0.1 },
  });

  // Strategy 1: MySQL-Only Baseline Target
  const mysqlBaseline: BenchmarkExecutionTarget = {
    name: "mysql-only-baseline",
    async executeQuery() {
      return {
        elapsedMs: 8.5,
        storeTimings: { mysqlMs: 8.5 },
        cacheHit: false,
        freshnessViolation: false,
      };
    },
  };

  // Strategy 2: Proposed PolyFind Adaptive Target
  const polyfindAdaptive: BenchmarkExecutionTarget = {
    name: "polyfind-adaptive",
    async executeQuery() {
      return {
        elapsedMs: 2.1,
        storeTimings: { mysqlMs: 0.5, redisMs: 0.8, vectorMs: 0.8 },
        cacheHit: true,
        freshnessViolation: false,
      };
    },
  };

  const metricsBaseline = await harness.runWorkload(mysqlBaseline, workload.operations, { cacheState: "cold" });
  const metricsAdaptive = await harness.runWorkload(polyfindAdaptive, workload.operations, { cacheState: "warm" });

  const queryOpsCount = workload.operations.filter((op) => op.type === "query").length;
  assert.strictEqual(metricsBaseline.strategyName, "mysql-only-baseline");
  assert.strictEqual(metricsBaseline.cacheState, "cold");
  assert.strictEqual(metricsBaseline.totalQueries, queryOpsCount);
  assert.strictEqual(metricsBaseline.cacheStats.hits, 0);

  assert.strictEqual(metricsAdaptive.strategyName, "polyfind-adaptive");
  assert.strictEqual(metricsAdaptive.cacheState, "warm");
  assert.strictEqual(metricsAdaptive.totalQueries, queryOpsCount);
  assert.strictEqual(metricsAdaptive.cacheStats.hits, queryOpsCount);
  assert.ok(metricsAdaptive.latencyQuantiles.medianMs < metricsBaseline.latencyQuantiles.medianMs);
});

test("BenchmarkHarness exports machine-readable result artifact", async () => {
  const harness = new BenchmarkHarness();
  const mockTarget: BenchmarkExecutionTarget = {
    name: "test-target",
    async executeQuery() {
      return { elapsedMs: 5.0, cacheHit: false };
    },
  };

  const workload = generateWorkload({
    workloadId: "wl-export-test",
    datasetSize: 10,
    seed: 42,
    totalOperations: 5,
    regime: "low",
    queryMix: { keyword: 1.0, filtered: 0, semantic: 0, relationship: 0 },
  });

  const metrics = await harness.runWorkload(mockTarget, workload.operations);
  const resultReport = harness.buildRunResult(
    "run-101",
    { workloadId: workload.config.workloadId, totalOperations: workload.config.totalOperations, seed: workload.config.seed },
    [metrics],
  );

  assert.strictEqual(resultReport.runId, "run-101");
  assert.strictEqual(resultReport.benchmarkSchemaVersion, "1.0.0");
  assert.ok(resultReport.environment.cpuCores > 0);
  assert.strictEqual(resultReport.results.length, 1);
  assert.strictEqual(resultReport.results[0]?.strategyName, "test-target");
  assert.strictEqual(resultReport.results[0]?.totalQueries, 5);

  // Machine-readable roundtrip test
  const serialized = JSON.stringify(resultReport);
  const parsed = JSON.parse(serialized);
  assert.strictEqual(parsed.runId, "run-101");
});
