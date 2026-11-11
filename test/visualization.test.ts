import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createDefaultBaselineArtifact,
  loadBaselineArtifact,
  renderAllMetricCharts,
  renderAsciiBarChart,
  renderComparisonMarkdownTable,
  renderFullVisualizationReport,
  renderTradeoffsReport,
  saveBaselineArtifact,
  type BaselineComparisonArtifact,
} from "../src/index.js";

test("createDefaultBaselineArtifact returns valid baseline comparison artifact", () => {
  const artifact = createDefaultBaselineArtifact();
  assert.strictEqual(artifact.schemaVersion, "1.0.0");
  assert.ok(artifact.methods.length >= 4);
  assert.ok(artifact.methods.some((m) => m.isBaseline && m.methodId === "baseline-mysql-only"));
  assert.ok(artifact.methods.some((m) => m.isBaseline && m.methodId === "baseline-ttl-cache"));
  assert.ok(artifact.methods.some((m) => m.isBaseline && m.methodId === "baseline-fixed-multistore"));
  assert.ok(artifact.methods.some((m) => !m.isBaseline && m.methodId === "polyfind-adaptive"));
  assert.ok(artifact.tradeoffsAndRegressions.length > 0);
});

test("Each plotted point maps directly to stored result artifact", async () => {
  const artifact = createDefaultBaselineArtifact();

  // Test roundtrip persistence
  const tempPath = path.resolve(process.cwd(), "results/test-baseline-comparison.json");
  await saveBaselineArtifact(tempPath, artifact);
  const loaded = await loadBaselineArtifact(tempPath);
  await fs.unlink(tempPath).catch(() => {});

  assert.strictEqual(loaded.artifactId, artifact.artifactId);
  assert.strictEqual(loaded.methods.length, artifact.methods.length);

  // Validate every method's numeric points in the artifact match rendered output
  const renderedTable = renderComparisonMarkdownTable(loaded);

  for (const method of loaded.methods) {
    // Method name must appear
    assert.ok(renderedTable.includes(method.methodName));
    // NDCG must appear mapped from artifact
    assert.ok(renderedTable.includes(method.relevance.ndcgAt10.toFixed(3)));
    // Violation rate must appear mapped from artifact
    assert.ok(renderedTable.includes(`${method.freshness.violationRate.toFixed(1)}%`));
    // Latencies must appear mapped from artifact
    assert.ok(renderedTable.includes(`${method.latency.medianP50Ms.toFixed(2)} ms`));
    assert.ok(renderedTable.includes(`${method.latency.p95Ms.toFixed(2)} ms`));
    // Store ops must appear mapped from artifact
    assert.ok(renderedTable.includes(method.resourceCost.storeDispatchesPerQuery.toFixed(2)));
  }
});

test("Axes, units, workload, and method names are explicitly labeled in visualizations", () => {
  const artifact = createDefaultBaselineArtifact();
  const renderedCharts = renderAllMetricCharts(artifact);

  // Check axis labels
  assert.ok(renderedCharts.includes("X-Axis: P95 Latency (ms)"));
  assert.ok(renderedCharts.includes("Y-Axis: Retrieval Method"));
  assert.ok(renderedCharts.includes("X-Axis: NDCG@10 Score (score)"));
  assert.ok(renderedCharts.includes("X-Axis: Stale Read Rate (%)"));
  assert.ok(renderedCharts.includes("X-Axis: Dispatches per Query (ops)"));

  // Check workload identifier
  assert.ok(renderedCharts.includes(`Workload: ${artifact.workload.workloadId}`));

  // Check method labels
  for (const method of artifact.methods) {
    assert.ok(renderedCharts.includes(method.methodName));
  }

  // Check units are clearly visible
  assert.ok(renderedCharts.includes("ms"));
  assert.ok(renderedCharts.includes("score"));
  assert.ok(renderedCharts.includes("%"));
  assert.ok(renderedCharts.includes("ops"));
});

test("Trade-offs and regressions are visible and not hidden", () => {
  const artifact = createDefaultBaselineArtifact();
  const tradeoffs = renderTradeoffsReport(artifact);

  // Check that at least one regression is explicitly documented
  const regressions = artifact.tradeoffsAndRegressions.filter((t) => t.isRegression);
  assert.ok(regressions.length > 0, "Must contain at least one documented regression");

  // The latency regression of PolyFind compared to blind TTL cache must be visible
  const latencyRegression = regressions.find((t) => t.metricName === "Latency p95");
  assert.ok(latencyRegression, "Should document p95 latency regression vs TTL cache");
  assert.strictEqual(latencyRegression.baselineMethodId, "baseline-ttl-cache");
  assert.ok(latencyRegression.difference > 0);
  assert.ok(tradeoffs.includes("Regression"));
  assert.ok(tradeoffs.includes("1.10 ms"));
  assert.ok(tradeoffs.includes("validates version metadata"));

  // Check that fresh correctness improvement is also detailed
  const freshnessGain = artifact.tradeoffsAndRegressions.find(
    (t) => t.metricName === "Freshness Violation Rate",
  );
  assert.ok(freshnessGain);
  assert.strictEqual(freshnessGain.isRegression, false);
  assert.strictEqual(freshnessGain.comparedValue, 0.0);
  assert.strictEqual(freshnessGain.baselineValue, 18.5);
  assert.ok(tradeoffs.includes("Improvement"));
});

test("No performance claim lacks a baseline", () => {
  const artifact = createDefaultBaselineArtifact();

  // Every entry in tradeoffsAndRegressions must compare against an explicit baseline
  for (const item of artifact.tradeoffsAndRegressions) {
    assert.ok(item.claim.length > 0, "Claim must not be empty");
    assert.ok(item.baselineMethodId.length > 0, "Claim must specify baselineMethodId");
    assert.ok(item.baselineMethodName.length > 0, "Claim must specify baselineMethodName");
    assert.ok(item.baselineValue !== undefined, "Claim must specify numeric baselineValue");
    assert.ok(item.comparedValue !== undefined, "Claim must specify numeric comparedValue");
    assert.ok(item.unit.length > 0, "Claim must specify unit");

    // Ensure baseline method exists in the artifact
    const baselineExists = artifact.methods.some(
      (m) => m.methodId === item.baselineMethodId && m.isBaseline,
    );
    assert.ok(
      baselineExists,
      `Baseline ${item.baselineMethodId} referenced in claim must exist in methods list as isBaseline: true`,
    );

    // Difference must equal comparedValue - baselineValue
    const expectedDiff = Math.round((item.comparedValue - item.baselineValue) * 100) / 100;
    const actualDiff = Math.round(item.difference * 100) / 100;
    assert.strictEqual(actualDiff, expectedDiff);
  }
});

test("renderFullVisualizationReport compiles comprehensive report with all sections", () => {
  const artifact = createDefaultBaselineArtifact();
  const report = renderFullVisualizationReport(artifact);

  assert.ok(report.includes("# PolyFind Baseline Comparison and Evaluation Visualization"));
  assert.ok(report.includes("1. Summary Comparison Table"));
  assert.ok(report.includes("2. Metric Visualizations (Labeled ASCII Charts)"));
  assert.ok(report.includes("3. Trade-offs and Regressions Analysis"));
  assert.ok(report.includes("4. Provenance and Artifact Mapping"));
  assert.ok(report.includes(artifact.artifactId));
  assert.ok(report.includes(artifact.environment.cpuModel));
});
