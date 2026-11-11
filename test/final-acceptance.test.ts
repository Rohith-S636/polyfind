import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

test("final acceptance checklist links resolve and covers every PRD success criterion", async () => {
  const checklist = await read("docs/ACCEPTANCE_CHECKLIST.md");
  const prd = await read("docs/PRD.md");

  const successCriteriaSection = prd.match(/## Success criteria([\s\S]*?)## Open questions/);
  assert.ok(successCriteriaSection, "PRD success criteria section is missing");
  const successCriteria = (successCriteriaSection[1] ?? "")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());

  for (const criterion of successCriteria) {
    assert.ok(checklist.includes(criterion), `criterion is not mapped: ${criterion}`);
  }

  const localLinks = [...checklist.matchAll(/\]\((\.\.?\/[^)#]+)\)/g)]
    .map((match) => match[1])
    .filter((link): link is string => link !== undefined);
  assert.ok(localLinks.length >= 20, "checklist should link to executable evidence");
  for (const link of localLinks) {
    await fs.access(path.resolve(path.dirname(path.join(root, "docs/ACCEPTANCE_CHECKLIST.md")), link));
  }
});

test("README, viva preparation, and acceptance documents describe an honest clean-room path", async () => {
  const [readme, viva, checklist, slice, sprint] = await Promise.all([
    read("README.md"),
    read("docs/VIVA_PREPARATION.md"),
    read("docs/ACCEPTANCE_CHECKLIST.md"),
    read("docs/slices/s6-05-final-acceptance,-clean-room-setup,-and-viva-preparation.md"),
    read("docs/sprints/sprint-06.md"),
  ]);

  for (const command of ["git clone", "npm install", "npm run typecheck", "npm test", "npm run migrate", "npm run seed", "export-baseline-visualization"]) {
    assert.ok(readme.includes(command), `README is missing clean-room step: ${command}`);
  }
  for (const heading of ["## One-minute project summary", "## Architecture decisions to explain", "## Freshness contract defense", "## Limitations to volunteer before being asked"]) {
    assert.ok(viva.includes(heading), `viva guide is missing: ${heading}`);
  }
  assert.match(checklist, /MySQL is authoritative/i);
  assert.match(checklist, /Known limitations and fallback behavior/i);
  assert.match(slice, /- \[x\] A team member who did not implement the setup follows the README successfully\./);
  assert.match(slice, /- \[x\] Acceptance checklist maps PRD criteria to test\/report evidence\./);
  assert.match(slice, /- \[x\] Known limitations and fallback behavior are documented\./);
  assert.match(slice, /- \[x\] Final demo and viva notes explain design, baselines, metrics, and research limits\./);
  assert.match(sprint, /\| \[x\] \| `S6-05` \|/);
});
