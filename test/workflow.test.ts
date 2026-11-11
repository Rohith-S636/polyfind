import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const readmePath = path.join(repoRoot, "README.md");
const gitignorePath = path.join(repoRoot, ".gitignore");

test("README identifies active sprint and slices with valid file links", () => {
  const readme = fs.readFileSync(readmePath, "utf-8");

  // Verify Active Sprint is documented
  assert.match(readme, /## Active sprint and slice status/i);
  assert.match(readme, /Active Sprint:.*?\[Sprint 1.*?\]\(docs\/sprints\/sprint-01\.md\)/i);
  assert.ok(fs.existsSync(path.join(repoRoot, "docs/sprints/sprint-01.md")));

  // Verify Sprint 1 slices are linked and files exist on disk
  const expectedSlices = ["S1-01", "S1-02", "S1-03", "S1-04", "S1-05"];
  for (const sliceId of expectedSlices) {
    const linkRegex = new RegExp(`\`${sliceId}\`\\s*—\\s*\\[([^\\]]+)\\]\\((docs\\/slices\\/[^\\)]+)\\)`);
    const match = readme.match(linkRegex);
    assert.ok(match && match[2], `README missing link for active slice ${sliceId}`);
    const linkedFile = path.join(repoRoot, match[2]);
    assert.ok(fs.existsSync(linkedFile), `Linked slice file does not exist: ${linkedFile}`);
  }
});

test("README documents branch, commit, and PR naming conventions", () => {
  const readme = fs.readFileSync(readmePath, "utf-8");

  // Branch naming
  assert.match(readme, /feature\/<slice-id>-/);
  assert.match(readme, /fix\/<slice-id>-/);

  // Commit message
  assert.match(readme, /\[<slice-id>\]/);

  // PR conventions
  assert.match(readme, /PR Title:.*?\[<slice-id>\]/i);
  assert.match(readme, /Acceptance criteria checked/i);
  assert.match(readme, /Issue-to-slice traceability/i);
});

test("git repository does not track secrets or generated datasets", () => {
  const gitFiles = execSync("git ls-files", { cwd: repoRoot, encoding: "utf-8" })
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter(Boolean);

  const secretPatterns = [
    /^\.env(\..+)?$/,
    /\.pem$/i,
    /\.key$/i,
    /id_rsa/i,
  ];

  const forbiddenDirs = [
    /^data\/generated\//,
    /^results\//,
    /^artifacts\//,
  ];

  for (const file of gitFiles) {
    // .env.example is allowed
    if (file === ".env.example") {
      continue;
    }

    for (const pattern of secretPatterns) {
      assert.strictEqual(
        pattern.test(file),
        false,
        `Tracked file matches secret pattern: ${file}`
      );
    }

    for (const dirPattern of forbiddenDirs) {
      assert.strictEqual(
        dirPattern.test(file),
        false,
        `Tracked file is inside forbidden generated data directory: ${file}`
      );
    }
  }
});

test(".gitignore excludes secrets, build artifacts, and generated datasets", () => {
  const gitignore = fs.readFileSync(gitignorePath, "utf-8");

  assert.match(gitignore, /\.env/);
  assert.match(gitignore, /data\/generated\//);
  assert.match(gitignore, /results\//);
  assert.match(gitignore, /artifacts\//);
});
