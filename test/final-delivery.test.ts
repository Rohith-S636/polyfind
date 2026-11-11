import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadBaselineArtifact, type BaselineComparisonArtifact } from "../src/index.js";

test("final report describes the actual academic implementation and DBMS architecture", async () => {
  const content = await fs.readFile(path.resolve(process.cwd(), "docs/FINAL_REPORT.md"), "utf-8");
  for (const section of [
    "# PolyFind — Academic Implementation and Evaluation Report",
    "## Abstract",
    "## 1. Problem and objectives",
    "## 2. Approved architecture",
    "MySQL",
    "Redis",
    "Neo4j",
    "LanceDB",
    "## 3. Data and provenance",
    "## 4. Correctness and security design",
    "## 5. Test and integration evidence",
    "## 6. Benchmark methodology and reporting",
    "## 7. Limitations and threats to validity",
    "## 8. Reproducibility",
  ]) assert.ok(content.includes(section), `report missing: ${section}`);
});

test("15-minute demo covers public search, seller comparison, auth, freshness, and CI evidence", async () => {
  const content = await fs.readFile(path.resolve(process.cwd(), "docs/DEMO_SCRIPT.md"), "utf-8");
  for (const section of [
    "15-minute academic demonstration",
    "Public search experience",
    "Seller price comparison and history",
    "Customer and administrator access",
    "Multi-store retrieval and freshness",
    "Database and correctness evidence",
    "Extended viva backup",
  ]) assert.ok(content.includes(section), `demo missing: ${section}`);
  assert.match(content, /synthetic/i);
  assert.match(content, /feature-hashing/i);
  assert.match(content, /do not present it as passed/i);
});

test("benchmark fixture is explicitly treated as fixture data, not empirical evidence", async () => {
  const fixturePath = path.resolve(process.cwd(), "test/fixtures/baseline-comparison.json");
  const artifact: BaselineComparisonArtifact = await loadBaselineArtifact(fixturePath);
  const report = await fs.readFile(path.resolve(process.cwd(), "docs/FINAL_REPORT.md"), "utf-8");
  const demo = await fs.readFile(path.resolve(process.cwd(), "docs/DEMO_SCRIPT.md"), "utf-8");
  assert.ok(artifact.environment.cpuModel.length > 0);
  assert.match(report, /fixture.*not.*empirical|not.*empirical.*fixture/i);
  assert.match(report, /no performance superiority claim/i);
  assert.match(demo, /fixture benchmark numbers as measured results/i);
  assert.doesNotMatch(report, /NDCG@10 of 0\.880|p95.*2\.90 ms|18\.5%.*stale/i);
});

test("report includes limitations and no unsupported model/deployment claims", async () => {
  const content = await fs.readFile(path.resolve(process.cwd(), "docs/FINAL_REPORT.md"), "utf-8");
  assert.match(content, /synthetic/i);
  assert.match(content, /not a pretrained transformer/i);
  assert.match(content, /process-local throttling/i);
  assert.match(content, /HttpOnly/i);
  assert.match(content, /public hosting is not certified/i);
});

test("clean setup commands are documented and valid", async () => {
  const content = await fs.readFile(path.resolve(process.cwd(), "README.md"), "utf-8");
  for (const command of ["npm ci", "npm install", "npm run typecheck", "npm run typecheck:scripts", "npm test", "npm run build", "npm run migrate", "npm run seed"]) {
    assert.ok(content.includes(command), `README missing command: ${command}`);
  }
  assert.match(content, /Copy-Item \.env\.example \.env/);
});
