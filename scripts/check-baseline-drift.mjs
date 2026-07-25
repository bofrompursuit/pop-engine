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

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(repoRoot, "docs/BASELINE.md");

/**
 * Expand a manifest glob (`specs/F-*.md`) to the files it actually covers.
 *
 * Globs used to be skipped, which is exactly how "APPROVED except F-101/F-102/F-201" sat stale in
 * the specs row from the day the file was created until someone read it this week: the row claimed
 * a status for twelve files and the check looked at none of them. Only the one shape the manifest
 * uses is supported — a `*` in the filename, not a path — so an unexpected pattern is reported
 * rather than silently matching nothing.
 */
function expandGlob(token) {
  const slash = token.lastIndexOf("/");
  const directory = slash === -1 ? "" : token.slice(0, slash);
  const pattern = token.slice(slash + 1);
  if (directory.includes("*") || (pattern.match(/\*/g) ?? []).length !== 1) return null;
  const [prefix, suffix] = pattern.split("*");
  const absoluteDirectory = join(repoRoot, directory);
  if (!existsSync(absoluteDirectory)) return [];
  return readdirSync(absoluteDirectory)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .map((name) => (directory === "" ? name : `${directory}/${name}`))
    .sort();
}

/** Pull backticked local .md/.json paths out of a manifest table row, expanding globs. */
function filePathsInRow(row) {
  const paths = [];
  for (const match of row.matchAll(/`([^`]+)`/g)) {
    const token = match[1].trim().replace(/^\//, ""); // `/AGENTS.md` -> AGENTS.md
    if (token.includes("*")) {
      const expanded = expandGlob(token);
      if (expanded === null) {
        unsupportedGlobs.push(token);
        continue;
      }
      // A glob matching nothing means the row claims APPROVED for a set of artifacts and the
      // check then inspects none of them. A guard that silently stops guarding is the failure
      // this whole file exists to prevent, so an empty expansion is drift, not a pass.
      if (expanded.length === 0) {
        emptyGlobs.push(token);
        continue;
      }
      paths.push(...expanded);
      continue;
    }
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
const unsupportedGlobs = [];
const emptyGlobs = [];
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
const headerless = [];

for (const rel of [...approvedFiles].sort()) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) continue; // manifest may reference not-yet-created files
  const status = declaredStatus(abs);
  if (status === null) {
    // Warn, do not fail. A file that declares nothing cannot contradict the manifest, and failing
    // here would break the build until someone writes approval dates for nine spec files that
    // nobody can date honestly. A file that declares the WRONG status still fails below: a
    // contradiction is drift, silence is a gap. Governance §7 wants the headers; this counts them
    // until they exist.
    headerless.push(rel);
    continue;
  }
  checked.push(rel);
  if (!/^APPROVED\b/i.test(status)) {
    failures.push(
      `${rel}: manifest says APPROVED, header says "${status.slice(0, 80)}"` +
        (bannedLeadWords.test(status) ? "  (governance §3: not a valid status)" : ""),
    );
  }
}

if (emptyGlobs.length > 0) {
  console.error("Baseline manifest marks a glob APPROVED that matches no file:\n");
  for (const glob of emptyGlobs) console.error("  ✗ " + glob);
  console.error(
    "\nThe row claims a status for artifacts that are not there. Either the files moved and the " +
      "manifest must follow, or the row is stale — the check will not pass by inspecting nothing.",
  );
  process.exit(1);
}

if (unsupportedGlobs.length > 0) {
  console.error("Baseline manifest uses a glob shape this check cannot expand:\n");
  for (const glob of unsupportedGlobs) console.error("  ✗ " + glob);
  console.error("\nSupported: a single * in the filename, e.g. specs/F-*.md.");
  process.exit(1);
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

if (headerless.length > 0) {
  console.warn(
    `\n${headerless.length} file(s) the manifest marks APPROVED declare no status header of ` +
      `their own, so the manifest row is their only approval record (governance §7):`,
  );
  for (const rel of headerless) console.warn("  ! " + rel);
}
