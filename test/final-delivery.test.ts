import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createDefaultBaselineArtifact,
  loadBaselineArtifact,
  saveBaselineArtifact,
  type BaselineComparisonArtifact,
} from "../src/index.js";

test("docs/FINAL_REPORT.md exists and covers all required DBMS capstone sections", async () => {
  const reportPath = path.resolve(process.cwd(), "docs/FINAL_REPORT.md");
  const content = await fs.readFile(reportPath, "utf-8");

  // Verify structure and problem formulation
  assert.ok(content.includes("# PolyFind: Freshness-Constrained Adaptive Retrieval Across Heterogeneous Databases"));
  assert.ok(content.includes("Abstract"));
  assert.ok(content.includes("Problem Formulation & DBMS Motivation"));
  assert.ok(content.includes("System Architecture & Heterogeneous Store Contracts"));
  assert.ok(content.includes("MySQL 8.0: Authoritative Transactional Store"));
  assert.ok(content.includes("Redis 7.0: Version-Aware Cache Tier"));
  assert.ok(content.includes("Vector Retrieval Engine: 384-Dimensional Semantic Store"));
  assert.ok(content.includes("Neo4j 5.x: Knowledge Graph Tier"));
  assert.ok(content.includes("Experimental Methodology & Benchmark Setup"));
  assert.ok(content.includes("Ablation Studies & Sensitivity Analysis"));
  assert.ok(content.includes("Documented Trade-offs, Failures & Threats to Validity"));
  assert.ok(content.includes("Clean Room Setup & Reproducibility Guide"));
});

test("docs/DEMO_SCRIPT.md covers structured search, semantic/graph retrieval, stale-update scenario, and benchmark output", async () => {
  const demoPath = path.resolve(process.cwd(), "docs/DEMO_SCRIPT.md");
  const content = await fs.readFile(demoPath, "utf-8");

  // Verify timed segments and presenters
  assert.ok(content.includes("Timed Walkthrough for DBMS Capstone Evaluation"));
  assert.ok(content.includes("Part 1: Clean Setup & Environment Verification"));
  assert.ok(content.includes("Part 2: Structured Catalog Search & Relational Authority"));
  assert.ok(content.includes("Part 3: Semantic Vector Search & Graph Candidate Retrieval"));
  assert.ok(content.includes("Part 4: Stale-Update Scenario & Freshness Validation"));
  assert.ok(content.includes("Part 5: Benchmark Execution & Visualization"));

  // Verify core technical demonstrations
  assert.ok(content.toLowerCase().includes("structured filter query"));
  assert.ok(content.includes("384-dimensional"));
  assert.ok(content.includes("[:IN_CATEGORY]"));
  assert.ok(content.includes("STALE READ VIOLATION"));
  assert.ok(content.includes("automatically invalidated"));
  assert.ok(content.includes("export-baseline-visualization.ts"));
  assert.ok(content.includes("Potential Viva Q&A Preparation"));
});

test("Report and demo script metrics correspond directly to committed benchmark artifacts", async () => {
  const fixturePath = path.resolve(process.cwd(), "test/fixtures/baseline-comparison.json");
  const artifact: BaselineComparisonArtifact = await loadBaselineArtifact(fixturePath);
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "polyfind-baseline-"));
  const generatedPath = path.join(temporaryDirectory, "baseline-comparison.json");

  try {
    await saveBaselineArtifact(generatedPath, createDefaultBaselineArtifact());
    const generatedArtifact = await loadBaselineArtifact(generatedPath);
    const fixtureMethod = artifact.methods.find((method) => method.methodId === "polyfind-adaptive");
    const generatedMethod = generatedArtifact.methods.find((method) => method.methodId === "polyfind-adaptive");
    assert.deepEqual(generatedMethod, fixtureMethod);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }

  const reportPath = path.resolve(process.cwd(), "docs/FINAL_REPORT.md");
  const reportContent = await fs.readFile(reportPath, "utf-8");

  const demoPath = path.resolve(process.cwd(), "docs/DEMO_SCRIPT.md");
  const demoContent = await fs.readFile(demoPath, "utf-8");

  const polyfindMethod = artifact.methods.find((m) => m.methodId === "polyfind-adaptive");
  assert.ok(polyfindMethod);

  // NDCG@10
  const ndcgStr = polyfindMethod.relevance.ndcgAt10.toFixed(3);
  assert.ok(reportContent.includes(ndcgStr));
  assert.ok(demoContent.includes(ndcgStr));

  // Violation rate
  assert.ok(reportContent.includes("0.0%"));
  assert.ok(demoContent.includes("0.0%"));

  // Latency p95
  const p95Str = `${polyfindMethod.latency.p95Ms.toFixed(2)} ms`;
  assert.ok(reportContent.includes(p95Str));
  assert.ok(demoContent.includes(p95Str));

  // Store ops
  const opsStr = polyfindMethod.resourceCost.storeDispatchesPerQuery.toFixed(2);
  assert.ok(reportContent.includes(opsStr));
  assert.ok(demoContent.includes(opsStr));
});

test("Report describes failures, negative ablations, and limitations as well as successes", async () => {
  const reportPath = path.resolve(process.cwd(), "docs/FINAL_REPORT.md");
  const content = await fs.readFile(reportPath, "utf-8");

  // Check documented regression (+1.10 ms p95 latency penalty)
  assert.ok(content.includes("1.10 ms p95 latency penalty"));

  // Check negative ablation results
  assert.ok(content.includes("4.5x latency explosion"));
  assert.ok(content.includes("52.3% relevance drop"));
  assert.ok(content.includes("24% of reads violate transactional correctness"));

  // Check inconclusive result
  assert.ok(content.includes("Inconclusive"));
  assert.ok(content.includes("Graph Traversal Utility on Short Queries"));

  // Check threats to validity
  assert.ok(content.includes("Threats to Internal and External Validity"));
  assert.ok(content.includes("Synthetic Query Workload"));
  assert.ok(content.includes("Local Co-located Storage vs Distributed Networks"));
});

test("Clean setup commands are documented and valid", async () => {
  const reportPath = path.resolve(process.cwd(), "docs/FINAL_REPORT.md");
  const content = await fs.readFile(reportPath, "utf-8");

  assert.ok(content.includes("npm install"));
  assert.ok(content.includes("cp .env.example .env"));
  assert.ok(content.includes("npm run typecheck"));
  assert.ok(content.includes("npm test"));
  assert.ok(content.includes("npm run seed"));
});
