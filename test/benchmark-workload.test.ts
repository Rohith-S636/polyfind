import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_QUERY_MIX,
  REGIME_DEFAULTS,
  generateWorkload,
  type WorkloadConfiguration,
} from "../src/index.js";

test("workload configuration requires dataset size, seed, operations, and query mix", () => {
  const baseConfig: WorkloadConfiguration = {
    workloadId: "wl-001",
    datasetSize: 100,
    seed: 42,
    totalOperations: 50,
    regime: "medium",
    queryMix: DEFAULT_QUERY_MIX,
  };

  const workload = generateWorkload(baseConfig);
  assert.equal(workload.config.workloadId, "wl-001");
  assert.equal(workload.config.datasetSize, 100);
  assert.equal(workload.config.seed, 42);
  assert.equal(workload.operations.length, 50);

  // Rejection of invalid config
  assert.throws(
    () => generateWorkload({ ...baseConfig, datasetSize: 0 }),
    /datasetSize must be greater than 0/i,
  );
  assert.throws(
    () => generateWorkload({ ...baseConfig, totalOperations: 0 }),
    /totalOperations must be greater than 0/i,
  );
});

test("same configuration and seed produces identical logical workload", () => {
  const config: WorkloadConfiguration = {
    workloadId: "wl-reproducible",
    datasetSize: 500,
    seed: 12345,
    totalOperations: 100,
    regime: "low",
    queryMix: DEFAULT_QUERY_MIX,
  };

  const run1 = generateWorkload(config);
  const run2 = generateWorkload(config);

  assert.deepEqual(
    run1.operations,
    run2.operations,
    "Expected identical operations array across two runs with same seed",
  );
  assert.deepEqual(
    run1.metadata.counts,
    run2.metadata.counts,
    "Expected identical metadata counts across two runs",
  );
});

test("at least low, medium, and high update regimes are explicitly defined", () => {
  assert.ok(REGIME_DEFAULTS["low"], "Expected 'low' regime definition");
  assert.ok(REGIME_DEFAULTS["medium"], "Expected 'medium' regime definition");
  assert.ok(REGIME_DEFAULTS["high"], "Expected 'high' regime definition");

  assert.ok(REGIME_DEFAULTS.low.updateRate < REGIME_DEFAULTS.medium.updateRate);
  assert.ok(REGIME_DEFAULTS.medium.updateRate < REGIME_DEFAULTS.high.updateRate);

  assert.ok(REGIME_DEFAULTS.low.delayMs < REGIME_DEFAULTS.medium.delayMs);
  assert.ok(REGIME_DEFAULTS.medium.delayMs < REGIME_DEFAULTS.high.delayMs);

  // Generate workload for each regime and verify update proportions
  const lowWl = generateWorkload({
    workloadId: "wl-low",
    datasetSize: 200,
    seed: 1,
    totalOperations: 200,
    regime: "low",
    queryMix: DEFAULT_QUERY_MIX,
  });

  const highWl = generateWorkload({
    workloadId: "wl-high",
    datasetSize: 200,
    seed: 1,
    totalOperations: 200,
    regime: "high",
    queryMix: DEFAULT_QUERY_MIX,
  });

  assert.ok(
    highWl.metadata.counts.updates > lowWl.metadata.counts.updates,
    "High regime must generate more updates than low regime",
  );
  assert.equal(lowWl.metadata.delayMs, REGIME_DEFAULTS.low.delayMs);
  assert.equal(highWl.metadata.delayMs, REGIME_DEFAULTS.high.delayMs);
});

test("workload metadata is saved with results", () => {
  const config: WorkloadConfiguration = {
    workloadId: "wl-meta-check",
    datasetSize: 300,
    seed: 999,
    totalOperations: 80,
    regime: "medium",
    queryMix: DEFAULT_QUERY_MIX,
  };

  const workload = generateWorkload(config);
  const metadata = workload.metadata;

  assert.equal(metadata.workloadId, "wl-meta-check");
  assert.equal(metadata.seed, 999);
  assert.equal(metadata.datasetSize, 300);
  assert.equal(metadata.totalOperations, 80);
  assert.equal(metadata.regime, "medium");
  assert.equal(metadata.updateRate, 0.2);
  assert.equal(metadata.delayMs, 250);
  assert.equal(metadata.counts.queries + metadata.counts.updates, 80);
  assert.ok(metadata.counts.byCategory.keyword >= 0);
  assert.ok(metadata.counts.byCategory.filtered >= 0);
});
