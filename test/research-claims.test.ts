import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("research claims document has a traceable matrix and evidence boundaries", async () => {
  const document = await fs.readFile(
    path.resolve(process.cwd(), "docs/RESEARCH_CLAIMS_AND_RELATED_WORK.md"),
    "utf8",
  );

  for (const required of [
    "## Related-work comparison matrix",
    "| Verified work |",
    "BigDAWG: A Polystore System for Big Data",
    "RHEEM project and publications",
    "Eddies: Continuously Adaptive Query Processing",
    "Elasticsearch hybrid search documentation",
    "Azure Cache-Aside pattern",
    "## What is established knowledge",
    "## What PolyFind proposes",
    "## Findings supported by the committed fixture",
    "## Claims explicitly not supported",
    "## Threats to validity and limitations",
    "0.0%",
    "18.5%",
    "2.90 ms",
    "1.30",
    "52.3%",
  ]) {
    assert.ok(document.includes(required), `missing required research evidence: ${required}`);
  }

  for (const unsupportedClaim of ["first-of-its-kind", "universally faster", "optimal"]) {
    assert.ok(document.includes(unsupportedClaim), `expected caveat for ${unsupportedClaim}`);
  }

  assert.doesNotMatch(
    document,
    /\b(?:PolyFind is|PolyFind achieves|PolyFind guarantees) (?:the first|unique|optimal|universally)/i,
  );
});
