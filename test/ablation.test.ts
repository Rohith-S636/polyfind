import assert from "node:assert/strict";
import test from "node:test";
import {
  computeStatisticalMetric,
  runAblationSuite,
  runDelayedUpdateSensitivity,
} from "../src/index.js";

test("computeStatisticalMetric calculates mean, sample variance/stdDev, min, max accurately", () => {
  const stats = computeStatisticalMetric([10, 20, 30, 40, 50]);
  assert.strictEqual(stats.mean, 30);
  assert.strictEqual(stats.min, 10);
  assert.strictEqual(stats.max, 50);
  assert.ok(stats.stdDev > 15 && stats.stdDev < 16); // sample stdDev ~ 15.811
  assert.strictEqual(stats.samples.length, 5);
});

test("runAblationSuite disables exactly one component at a time", async () => {
  const ablations = await runAblationSuite({ repetitions: 3 });

  const disabledComponents = ablations.map((a) => a.disabledComponent);
  assert.deepStrictEqual(disabledComponents, [
    "none",
    "cache",
    "vector",
    "graph",
    "freshness-validation",
  ]);

  for (const exp of ablations) {
    assert.strictEqual(exp.repetitions, 3);
    assert.strictEqual(exp.latencyMs.samples.length, 3);
    assert.strictEqual(exp.relevanceNdcg.samples.length, 3);
    assert.ok(exp.latencyMs.mean > 0);
    assert.ok(exp.relevanceNdcg.mean > 0 && exp.relevanceNdcg.mean <= 1.0);
  }
});

test("runAblationSuite preserves negative and inconclusive results alongside positive ones", async () => {
  const ablations = await runAblationSuite({ repetitions: 3 });

  const outcomes = ablations.map((a) => a.outcome);
  assert.ok(outcomes.includes("positive"), "Must include positive outcome");
  assert.ok(outcomes.includes("negative"), "Must retain negative outcome");
  assert.ok(outcomes.includes("inconclusive"), "Must retain inconclusive outcome");

  // Check that disabling freshness validation produces non-zero freshness violation rate
  const noFreshnessCheck = ablations.find((a) => a.disabledComponent === "freshness-validation");
  assert.ok(noFreshnessCheck);
  assert.ok(noFreshnessCheck.freshnessViolationRate.mean > 0.1);
  assert.ok(noFreshnessCheck.updateVisibilityDelayMs.mean > 50);

  // Check that full system has 0 freshness violations
  const fullSystem = ablations.find((a) => a.disabledComponent === "none");
  assert.ok(fullSystem);
  assert.strictEqual(fullSystem.freshnessViolationRate.mean, 0.0);
});

test("runDelayedUpdateSensitivity measures violation rates across increasing sync delays", () => {
  const steps = [0, 50, 500, 2000];
  const sensitivity = runDelayedUpdateSensitivity({
    delayStepsMs: steps,
    totalReadOps: 100,
    regime: "medium",
  });

  assert.strictEqual(sensitivity.length, 4);

  for (let i = 0; i < sensitivity.length; i++) {
    const s = sensitivity[i]!;
    assert.strictEqual(s.freshnessViolationsStrict, 0); // PolyFind strict mode always guarantees 0 stale reads

    // As delay increases, unchecked violation rate increases monotonically
    if (i > 0) {
      assert.ok(
        s.violationRateUnchecked >= sensitivity[i - 1]!.violationRateUnchecked,
        `Expected violation rate at delay ${s.delayMs}ms to be >= previous delay`,
      );
    }
  }
});
