import assert from "node:assert/strict";
import test from "node:test";
import {
  RepeatedBenchmarkRunner,
  summarizeFreshnessViolations,
  summarizeSamples,
  type BenchmarkExecutionTarget,
} from "../src/index.js";

test("summarizeSamples computes known mean, quantiles, IQR, variance, and CI", () => {
  const summary = summarizeSamples([1, 2, 3, 4, 5]);

  assert.equal(summary.count, 5);
  assert.equal(summary.mean, 3);
  assert.equal(summary.median, 3);
  assert.equal(summary.p50, 3);
  assert.equal(summary.p95, 4.8);
  assert.equal(summary.p99, 4.96);
  assert.equal(summary.q1, 2);
  assert.equal(summary.q3, 4);
  assert.equal(summary.iqr, 2);
  assert.equal(summary.variance, 2.5);
  assert.equal(summary.stdDev, 1.581139);
  assert.equal(summary.min, 1);
  assert.equal(summary.max, 5);
  assert.equal(summary.confidenceInterval95.lower, 1.614071);
  assert.equal(summary.confidenceInterval95.upper, 4.385929);
});

test("empty and singleton samples produce defined summaries", () => {
  assert.equal(summarizeSamples([]).count, 0);
  const singleton = summarizeSamples([7]);
  assert.equal(singleton.variance, 0);
  assert.equal(singleton.stdDev, 0);
  assert.deepEqual(singleton.confidenceInterval95, {
    level: 0.95,
    lower: 7,
    upper: 7,
    marginOfError: 0,
  });
});

test("freshness violation rates are bounded and reproducible", () => {
  assert.deepEqual(summarizeFreshnessViolations(3, 10), {
    violations: 3,
    observations: 10,
    rate: 0.3,
  });
  assert.deepEqual(summarizeFreshnessViolations(20, 10), {
    violations: 10,
    observations: 10,
    rate: 1,
  });
  assert.deepEqual(summarizeFreshnessViolations(1, 0), {
    violations: 0,
    observations: 0,
    rate: 0,
  });
});

test("repeated runner excludes warmups and preserves raw run metadata", async () => {
  let calls = 0;
  const target: BenchmarkExecutionTarget = {
    name: "fixed-mysql",
    async executeQuery() {
      calls += 1;
      return {
        elapsedMs: 10 + calls,
        freshnessViolation: calls % 2 === 0,
        storeTimings: { mysqlMs: 10 + calls },
      };
    },
  };
  const runner = new RepeatedBenchmarkRunner();
  const artifact = await runner.run(
    {
      runCount: 3,
      warmupRuns: 2,
      seed: 42,
      workloadId: "fixture-statistics",
      datasetSize: 1,
      totalOperations: 2,
    },
    [
      {
        target,
        createWorkload: () => [
          {
            type: "query",
            opId: "query-1",
            queryCategory: "keyword",
            request: {
              query: "pack",
              filters: {},
              freshnessMode: "strict",
              page: 1,
              limit: 1,
            },
          },
          {
            type: "query",
            opId: "query-2",
            queryCategory: "keyword",
            request: {
              query: "tent",
              filters: {},
              freshnessMode: "strict",
              page: 1,
              limit: 1,
            },
          },
        ],
      },
    ],
    {
      platform: "fixture",
      architecture: "fixture",
      cpuModel: "fixture",
      cpuCores: 1,
      totalMemoryMb: 1,
      nodeVersion: "fixture",
    },
  );

  assert.equal(calls, 10);
  assert.equal(artifact.runCount, 3);
  assert.equal(artifact.warmupRuns, 2);
  assert.equal(artifact.strategies[0]?.rawRuns.length, 3);
  assert.equal(artifact.strategies[0]?.latencyMs.count, 3);
  assert.equal(artifact.strategies[0]?.freshnessViolationRate.observations, 6);
  assert.equal(artifact.environment.platform, "fixture");
});
