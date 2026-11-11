/**
 * Generates and saves the baseline comparison result artifact.
 */

import path from "node:path";
import {
  createDefaultBaselineArtifact,
  saveBaselineArtifact,
} from "../src/index.js";
import fs from "node:fs/promises";

async function main(): Promise<void> {
  const artifact = createDefaultBaselineArtifact();
  const resultsDir = path.resolve(process.cwd(), "results");
  await fs.mkdir(resultsDir, { recursive: true });

  const jsonPath = path.join(resultsDir, "baseline-comparison.json");
  await saveBaselineArtifact(jsonPath, artifact);
  console.log(`Saved baseline comparison artifact to: ${jsonPath}`);
}

main().catch((err) => {
  console.error("Failed to export baseline visualization:", err);
  process.exit(1);
});
