#!/usr/bin/env node
// Baseline status-drift check (governance §3; regression guard for issue #70).
//
// Invariant: any artifact the manifest (docs/BASELINE.md) marks APPROVED must
// self-declare APPROVED in its own status header. Ratifying via the manifest
// while leaving a file's header at PROPOSED/DRAFT/"Canonical" is the exact drift
// that blocked issue #2. Governance §3 also bans "Canonical"/"current"/"single
// source of truth" as statuses, so an APPROVED row whose header uses one of those
// words fails too.
//
// Scope is deliberately narrow: it only enforces APPROVED rows. PROPOSED/ARCHIVED
// rows and glob rows (e.g. specs/F-*.md) are not checked here.
//
// Run: node scripts/check-baseline-drift.mjs   (wired into CI as `pnpm check:baseline`)

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(repoRoot, "docs/BASELINE.md");

/** Pull backticked local .md/.json paths out of a manifest table row (skip globs). */
function filePathsInRow(row) {
  const paths = [];
  for (const match of row.matchAll(/`([^`]+)`/g)) {
    const token = match[1].trim().replace(/^\//, ""); // `/AGENTS.md` -> AGENTS.md
    if (token.includes("*")) continue; // glob rows like specs/F-*.md
    if (/^[\w./-]+\.(md|json)$/.test(token)) paths.push(token);
  }
  return paths;
}

/** Extract a file's self-declared status token, or null if it declares none. */
function declaredStatus(absPath) {
  const text = readFileSync(absPath, "utf8");
  if (absPath.endsWith(".json")) {
    const status = JSON.parse(text).status;
    return typeof status === "string" ? status : null;
  }
  const line = text.split(/\r?\n/).find((l) => /^\*\*Status:\*\*/i.test(l));
  return line ? line.replace(/^\*\*Status:\*\*/i, "").trim() : null;
}

const baseline = readFileSync(baselinePath, "utf8");
const approvedFiles = new Set();
for (const row of baseline.split(/\r?\n/)) {
  if (!row.startsWith("|")) continue;
  const cells = row.split("|").map((c) => c.trim());
  // cells[0] is empty (leading pipe); status is the 3rd content column.
  const statusCell = cells[3] ?? "";
  if (!/APPROVED/i.test(statusCell)) continue;
  for (const p of filePathsInRow(row)) approvedFiles.add(p);
}

const bannedLeadWords = /^(PROPOSED|DRAFT|Canonical|Current|Single)\b/i;
const failures = [];
const checked = [];

for (const rel of [...approvedFiles].sort()) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) continue; // manifest may reference not-yet-created files
  const status = declaredStatus(abs);
  if (status === null) continue; // no self-declared status to drift (e.g. AGENTS.md)
  checked.push(rel);
  if (!/^APPROVED\b/i.test(status)) {
    failures.push(
      `${rel}: manifest says APPROVED, header says "${status.slice(0, 80)}"` +
        (bannedLeadWords.test(status) ? "  (governance §3: not a valid status)" : ""),
    );
  }
}

if (failures.length > 0) {
  console.error("Baseline status drift detected (docs/BASELINE.md vs file headers):\n");
  for (const f of failures) console.error("  ✗ " + f);
  console.error(
    "\nReconcile the file header to APPROVED (or fix the manifest) in one PR. See issue #70.",
  );
  process.exit(1);
}

console.log(`Baseline status check passed: ${checked.length} APPROVED artifacts consistent.`);
for (const c of checked) console.log("  ✓ " + c);
