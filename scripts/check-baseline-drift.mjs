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
// It also recomputes any `sha256 \`<digest>\`` a row publishes beside its artifact path
// (ARCHITECTURE-FUTURE §14 step 5: an artifact is published with a checksum before this
// manifest is updated). A digest nobody recomputes is a claim rather than a check, so an
// artifact edited without republishing, or a row left on a stale digest, fails here.
//
// Run: node scripts/check-baseline-drift.mjs   (wired into CI as `pnpm check:baseline`)

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
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

// The row loop below skips every line that is not a table row, so a merge that commits conflict
// markers leaves the manifest malformed and this check green — which is how `<<<<<<< HEAD` reached
// main in 370be18. A marker means two versions of an approved row are both present and neither is
// authoritative, so the manifest cannot be read at all: fail before inspecting anything.
const conflictMarkers = baseline
  .split(/\r?\n/)
  .map((line, index) => ({ line, number: index + 1 }))
  .filter(({ line }) => /^(<{7}|={7}|>{7})(\s|$)/.test(line));
if (conflictMarkers.length > 0) {
  for (const { line, number } of conflictMarkers) {
    console.error(`docs/BASELINE.md:${number} unresolved merge conflict marker: ${line}`);
  }
  console.error("The baseline manifest is malformed; resolve the conflict before it can be read.");
  process.exit(1);
}

const approvedFiles = new Set();
const unsupportedGlobs = [];
const emptyGlobs = [];
/** Rows publishing a digest: `{ file, expected, row, malformed? }`. */
const checksumClaims = [];
for (const row of baseline.split(/\r?\n/)) {
  if (!row.startsWith("|")) continue;
  const cells = row.split("|").map((c) => c.trim());
  // cells[0] is empty (leading pipe); status is the 3rd content column.
  const statusCell = cells[3] ?? "";
  if (!/APPROVED/i.test(statusCell)) continue;
  const paths = filePathsInRow(row);
  for (const p of paths) approvedFiles.add(p);

  // A digest belongs to the artifact named in the same row, so the pairing is positional
  // rather than guessed: one path and one digest, or the row is ambiguous and says so.
  // Presence and validity are found SEPARATELY, on purpose. Matching only well-formed digests
  // meant a row whose digest lost a character matched nothing, read as "publishes no checksum",
  // and passed — a guard that stops guarding when its input is malformed, which is the same shape
  // as the empty-glob case above and the reason that one fails rather than inspecting nothing. So
  // `\bsha256\b` finds the CLAIM (it does not match "sha256sum" in prose) and the length and
  // alphabet are checked afterwards, where a bad value fails distinctly from an absent one.
  const claimed = [...row.matchAll(/\bsha256\b\s*`?([^`|\s]*)`?/gi)].map((m) => m[1] ?? "");
  if (claimed.length === 0) continue;
  const malformed = claimed.filter((value) => !/^[0-9a-fA-F]{64}$/.test(value));
  if (malformed.length > 0) {
    checksumClaims.push({
      file: null,
      expected: null,
      row: cells[1] ?? row.slice(0, 60),
      malformed: malformed.map((value) => `"${value}" (${value.length} chars)`).join(", "),
    });
    continue;
  }
  const digests = claimed.map((value) => value.toLowerCase());
  if (digests.length !== 1 || paths.length !== 1) {
    checksumClaims.push({ file: null, expected: null, row: cells[1] ?? row.slice(0, 60) });
    continue;
  }
  checksumClaims.push({ file: paths[0], expected: digests[0], row: cells[1] ?? "" });
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

const checksumFailures = [];
for (const claim of checksumClaims) {
  if (claim.malformed !== undefined) {
    checksumFailures.push(
      `${claim.row}: sha256 claim is not 64 hex characters: ${claim.malformed}` +
        "  (a malformed digest fails; it never reads as no digest)",
    );
    continue;
  }
  if (claim.file === null) {
    checksumFailures.push(
      `${claim.row}: row publishes a sha256 but does not name exactly one artifact, so the digest ` +
        `cannot be attributed to a file`,
    );
    continue;
  }
  const abs = join(repoRoot, claim.file);
  if (!existsSync(abs)) {
    checksumFailures.push(`${claim.file}: row publishes a sha256 for a file that is not there`);
    continue;
  }
  // Over the exact bytes on disk. Nothing is parsed, normalised or reserialised: the digest has to
  // describe the artifact a deployment loads, not a reformatting of it.
  const actual = createHash("sha256").update(readFileSync(abs)).digest("hex");
  if (actual !== claim.expected) {
    checksumFailures.push(
      `${claim.file}: manifest says sha256 ${claim.expected}, file is ${actual}` +
        "  (edited without republishing, or the row is stale)",
    );
  }
}

if (checksumFailures.length > 0) {
  console.error("Baseline manifest publishes a checksum that does not match its artifact:\n");
  for (const failure of checksumFailures) console.error("  ✗ " + failure);
  console.error(
    "\nA published artifact is immutable (ARCHITECTURE-FUTURE §14): a changed ruleset is a new " +
      "version with a new row, never an edit in place. Recompute with `sha256sum <path>`.",
  );
  process.exit(1);
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

// ── Ruleset references in executable code ───────────────────────────────────────────────────────
//
// Invariant: every ruleset artifact that executable code names must exist, and the one constant
// allowed to pin a version must pin the published one.
//
// This is a regression guard for the day main went red. `apps/web/app/checklist/checklist-fixtures.ts`
// defaulted to `rules/nyc-rules.v2.7.json`; publishing v2.8 deleted that file; the read is at module
// scope, so two suites failed to IMPORT rather than failing a test. Neither PR could have caught it
// — each was green against a main that did not contain the other, and a version bump structurally
// cannot grep for references that land after it runs. Only a check on the merged tree can.
//
// WHY THIS RULE AND NOT "flag any unpublished version string". A version string in code is very
// often legitimate and cannot break on a bump: `compareToPinned("nyc.v2.3", "nyc.v2.1")` is test
// data, and `packages/engine/src/ruleset.ts` deliberately keeps a table of the pre-v2.4 versions it
// supplies defaults for, because old plans must still replay. Flagging those would be unsound and
// would bury the real thing in noise. A PATH is different in kind: it is a claim about the
// filesystem, and a publication can invalidate it silently. So paths are checked, and the sole
// version constant is checked against the artifact rather than forbidden.
//
// Scope is executable code only. `docs/` and `specs/` cite superseded versions in prose everywhere,
// and BASELINE's lineage rows cite them WITH their commits on purpose — that is the recovery trail,
// and a check that broke it would be removing a feature to add a guard.

const CODE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", ".git", "dist", "coverage", "build"]);

/** Every executable source file in the repo, which is what this rule is scoped to. */
function sourceFiles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) sourceFiles(join(directory, entry.name), found);
    } else if (CODE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

/** What the repo actually publishes, so the message can say so rather than only what is wrong. */
const publishedRulesets = readdirSync(join(repoRoot, "rules")).filter((entry) =>
  /^nyc-rules\..+\.json$/.test(entry),
);

/**
 * Every ruleset artifact that exists anywhere in the repo, by filename.
 *
 * Matched on the FILENAME rather than by resolving the path, and that is a deliberate weakening.
 * The same artifact is named relative to three different bases here: to the source file
 * (`new URL("../../../rules/…", import.meta.url)`), to the repo root (vitest's working directory),
 * and to an app directory (`intake-page-props.ts` resolves against the Next app's cwd). Picking one
 * base flags the other two, and enumerating every base a file might run under is guesswork. The
 * filename is unambiguous, and it is what a publication changes.
 *
 * What this therefore does NOT catch is a correct filename under a wrong directory. That is worth
 * stating rather than implying: this guards the class that broke main — a name a publication
 * deleted — not every possible bad path.
 */
const existingRulesets = new Set([
  ...publishedRulesets,
  ...(existsSync(join(repoRoot, "packages/engine/src/__fixtures__"))
    ? readdirSync(join(repoRoot, "packages/engine/src/__fixtures__"))
    : []),
]);

// Ruleset artifacts named inside a STRING, which is the only place a name is load-bearing.
//
// CODE ONLY. COMMENTS ARE OUT OF SCOPE, DELIBERATELY AND AFTER CONSIDERING THE ALTERNATIVE — said
// here so the next person knows it was decided rather than missed, because a stale comment naming
// a deleted artifact is a real defect and a reader is entitled to ask why this does not catch it.
//
// The case for scanning prose is that stale documentation is the same dangling-reference class the
// repo hit three times in one night. The case against, which won:
//
//   1. A comment cannot break a build. This check was built for a path that is READ, and the break
//      it exists to prevent was an import-time `readFileSync` of a file a publication had deleted.
//      Prose has no such failure mode, so including it widens the rule past its evidence.
//   2. The comments it would flag are CORRECT AND USEFUL. The most valuable ones are precisely the
//      ones that name an old path in order to explain why the code no longer does — this file's own
//      `withoutComments` note, and the migration away from hard-coded paths, both do exactly that.
//      A check that flags the record of a fix punishes the fix.
//   3. A check that flags prose accumulates exemptions until someone switches it off. Three false
//      positives were already designed out of this rule to keep it credible; adding a category that
//      generates them by design would undo that.
//
// So comments are blanked first, preserving line numbers, and only what is left is scanned. The
// boundary is exact and worth stating both ways: `const p = "rules/nyc-rules.v1.json"` fails, and
// the same text in a comment does not.
//
// What this leaves uncovered, stated rather than implied: prose naming a superseded artifact goes
// stale silently. Nothing else catches that today. If it ever matters enough, it is a documentation
// lint and a different tool — not a widening of this one.
const STRING_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;
const RULESET_FILENAME = /nyc-rules\.[\w.-]+\.json/g;

/**
 * The file with its comments replaced by spaces, so offsets and line numbers still line up.
 *
 * Quote state is tracked while scanning, so a `//` inside a string — a URL, most often — is not
 * mistaken for the start of a comment. It is a scanner rather than a parser, which is proportionate
 * to the job, but it is also the one place in this check where a bug of MINE would degrade to
 * silence: over-blanking makes the scan see less, and seeing less looks exactly like passing.
 *
 * So the one invariant a correct blanking must hold is asserted by the caller — every comment
 * character becomes a space and every newline is kept, so the output is the same length as the
 * input. A scanner that loses or gains a character has a bug, and this fails on it rather than
 * quietly scanning a corrupted copy.
 */
function withoutComments(source) {
  let out = "";
  let inBlock = false;
  let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    const pair = source.slice(i, i + 2);
    if (inBlock) {
      if (pair === "*/") {
        out += "  ";
        i += 1;
        inBlock = false;
      } else {
        out += character === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (quote === null && pair === "/*") {
      out += "  ";
      i += 1;
      inBlock = true;
      continue;
    }
    if (quote === null && pair === "//") {
      const lineEnd = source.indexOf("\n", i);
      const stop = lineEnd === -1 ? source.length : lineEnd;
      out += " ".repeat(stop - i);
      i = stop - 1;
      continue;
    }
    if (quote === null && (character === '"' || character === "'" || character === "`")) {
      quote = character;
    } else if (quote === character && source[i - 1] !== "\\") {
      quote = null;
    }
    out += character;
  }
  return out;
}

const scanned = sourceFiles(repoRoot);
const danglingReferences = [];

for (const file of scanned) {
  const relative = file.slice(repoRoot.length + 1);
  const source = readFileSync(file, "utf8");
  const scannable = withoutComments(source);
  if (scannable.length !== source.length) {
    console.error(
      `The comment scanner corrupted ${relative}: ${source.length} characters in, ` +
        `${scannable.length} out. That is a bug in this check, not in the file — and left ` +
        "unreported it would make the scan see less than the file contains, which is " +
        "indistinguishable from passing.",
    );
    process.exit(1);
  }
  const lines = scannable.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const literal of line.match(STRING_LITERAL) ?? []) {
      for (const named of literal.match(RULESET_FILENAME) ?? []) {
        if (!existingRulesets.has(named)) {
          danglingReferences.push({ file: relative, line: index + 1, named });
        }
      }
    }
  });
}

if (danglingReferences.length > 0) {
  console.error("Executable code names a ruleset artifact that is not in the repo:\n");
  for (const reference of danglingReferences) {
    console.error(`  ✗ ${reference.file}:${reference.line} names ${reference.named}`);
  }
  console.error(
    `\nThe repo publishes: ${publishedRulesets.join(", ") || "(nothing under rules/)"}.\n` +
      "If you are mid version bump, this file was written after the last one and its grep could " +
      "not have found it. Point it at the published artifact — or better, stop naming a version: " +
      "read the rules directory, or take the path from apps/api/src/ruleset.ts, which is the one " +
      "place that is supposed to know.",
  );
  process.exit(1);
}

// The single constant allowed to name a version, checked against the artifact rather than banned.
// If the file bumps and the pin does not, the api refuses to boot; this fails first and says why.
// Read before the count is validated, so a repo holding two rulesets can be told which to keep.
const pinFile = "apps/api/src/ruleset.ts";
const pinSource = readFileSync(join(repoRoot, pinFile), "utf8");
const pinned = /EXPECTED_RULESET_VERSION\s*=\s*"([^"]+)"/.exec(pinSource);
if (pinned === null) {
  console.error(
    `${pinFile} no longer declares EXPECTED_RULESET_VERSION, which this check reads as the one\n` +
      "place allowed to pin a ruleset version. If it moved, point this check at its new home.",
  );
  process.exit(1);
}
// EXACTLY ONE published ruleset is the invariant, and anything else is an ERROR here rather than
// a reason to stand down.
//
// An earlier draft ran the pin check only when the count was one and said nothing otherwise, which
// put a silent-failure path inside the guard written to remove one: in the single state where the
// invariant is already broken, the check that would say so went quiet. And that state is not
// exotic — it is precisely mid-bump, a new version added and the old one not yet deleted, which is
// when someone most needs this working. A validator that stands down on ambiguous input looks
// exactly like a validator that passed.
if (publishedRulesets.length !== 1) {
  console.error(
    publishedRulesets.length === 0
      ? `No published ruleset in rules/. The api loads one at boot and every plan pins its ` +
          `version, so there is nothing for this check — or the product — to be right about.`
      : `rules/ holds ${publishedRulesets.length} published rulesets, and exactly one is the ` +
          `invariant:\n\n` +
          publishedRulesets.map((entry) => `  • ${entry}`).join("\n") +
          `\n\n${pinFile} pins ${pinned[1]}, so that is the one to keep. A superseded ruleset is ` +
          `DELETED from the tree, not left beside its replacement: BASELINE.md records each one as ` +
          `a lineage row naming its git commit, which is how it stays recoverable. If you are ` +
          `mid-bump, this is the step between adding the new file and removing the old one.`,
  );
  process.exit(1);
}

const publishedVersion = JSON.parse(
  readFileSync(join(repoRoot, "rules", publishedRulesets[0]), "utf8"),
).ruleset_version;
if (pinned[1] !== publishedVersion) {
  console.error(
    `${pinFile} pins EXPECTED_RULESET_VERSION ${pinned[1]}, but ${publishedRulesets[0]} ` +
      `publishes ${publishedVersion}.\n\nThe api refuses to boot on that mismatch. Bump the pin ` +
      "with the artifact, in the same PR.",
  );
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

console.log(
  `Ruleset reference check passed: ${scanned.length} source files scanned, every ruleset ` +
    `path resolves, and ${pinFile} pins ${pinned[1]}.`,
);
console.log(`Baseline status check passed: ${checked.length} APPROVED artifacts consistent.`);
for (const c of checked) console.log("  ✓ " + c);

if (headerless.length > 0) {
  console.warn(
    `\n${headerless.length} file(s) the manifest marks APPROVED declare no status header of ` +
      `their own, so the manifest row is their only approval record (governance §7):`,
  );
  for (const rel of headerless) console.warn("  ! " + rel);
}
