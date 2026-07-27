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
import ts from "typescript";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/**
 * The tree to check. Defaults to this repo, which is the only thing CI and a developer ever want.
 *
 * `BASELINE_CHECK_ROOT` exists so the test suite can point the REAL script at a planted tree rather
 * than testing a copy of it. It is the smallest affordance that makes these rules provable: the
 * alternatives were copying the script into a temp directory, which verifies a copy and not the
 * file CI runs, or wrapping every rule in exported functions, which is the restructure this did not
 * need. Nothing in the repo sets it.
 */
const repoRoot = process.env.BASELINE_CHECK_ROOT
  ? resolve(process.env.BASELINE_CHECK_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

// Every extension the toolchain can execute. The first four were the ones the repo happened to
// contain; the rest are not hypothetical, they are the shapes a file can take TOMORROW without
// anyone thinking to revisit this list. A `.mts` config or a `.cjs` script naming a deleted ruleset
// would have been invisible to a check whose whole purpose is that references cannot hide.
const CODE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js", ".jsx"];
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", ".git", "dist", "coverage", "build"]);

/**
 * Every file under `directory` that `matches`, skipping the trees that are not this repo's source.
 *
 * One walker for both rules, and `node_modules` is the reason it is shared rather than duplicated:
 * a recursive read that does not skip it descends through pnpm's symlinked workspace copies and
 * reports `node_modules/.pnpm/node_modules/api/.env.example` beside the real file. Observed, not
 * anticipated — the config rule below found it on its first run.
 */
function filesUnder(directory, matches, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) filesUnder(full, matches, found);
    } else if (matches(full.slice(repoRoot.length + 1), entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * What the runtime counts as a published ruleset. A COPY of the three discoverers' pattern, and
 * the copy is deliberate after trying not to make one.
 *
 * This check restated the pattern as `^nyc-rules\..+\.json$`, which is broader than
 * `apps/api/src/ruleset.ts`, `apps/web/app/rules-file.ts` and
 * `packages/engine/src/__fixtures__/published-ruleset.ts`, all of which require the `v`. A
 * publication of `nyc-rules.2.9.json` — no `v`, field and pin in order — passed this check and then
 * found ZERO published rulesets at boot. A green guard on a tree that cannot start is the exact
 * failure this file exists to prevent, so the guard must not be able to disagree with the thing it
 * guards.
 *
 * READING IT OUT OF THE RUNTIME WAS TRIED AND REVERTED, which is worth recording so nobody spends
 * the afternoon again. The check already parses TypeScript, so lifting the declaration out of
 * `apps/api/src/ruleset.ts` costs nothing and removes the copy entirely. It also makes this check
 * unable to run against a tree that does not contain that file — and every test in this file's
 * suite works by planting a MINIMAL tree and pointing the real script at it. Twenty-seven of
 * thirty-one went red, not because the rule was wrong but because a guard that requires the whole
 * app to be present cannot be tested on anything smaller. The copy is the lesser cost, and
 * `runtimePatternsAgree` in the suite is what stops it drifting: it reads all three runtime
 * declarations and this one, and fails if any two differ.
 */
const PUBLISHED_RULESET = /^nyc-rules\.v.+\.json$/;

/**
 * What the repo actually publishes, so the message can say so rather than only what is wrong.
 *
 * Computed on first use rather than at module scope, because reading the runtime's pattern goes
 * through the parser and the parser's `SCRIPT_KINDS` table is declared further down this file. A
 * `const` initialised here would reach it before it exists.
 */
let publishedCache = null;
const publishedRulesets = () => {
  publishedCache ??= readdirSync(join(repoRoot, "rules")).filter((entry) =>
    PUBLISHED_RULESET.test(entry),
  );
  return publishedCache;
};

/**
 * Where a named ruleset must exist for a reference to it to resolve.
 *
 * Two directories publish files matching `nyc-rules.*.json` and they are not interchangeable:
 * `rules/` holds the ONE published artifact the product loads, and
 * `packages/engine/src/__fixtures__` holds superseded rulesets kept so old plans replay. A flat set
 * of every name anywhere let a fixture satisfy a production path: a reference to
 * `rules/nyc-rules.v2.3.json` passed because a same-named replay fixture existed, while the file
 * the code would actually open was not there. That is not a lexing problem and was not fixed by
 * parsing; it is this set conflating two directories, and it is fixed by asking where the reference
 * points rather than only what it is called.
 */
const RULESET_DIRECTORIES = [
  { prefix: "rules", names: publishedRulesets },
  {
    prefix: "packages/engine/src/__fixtures__",
    names: () =>
      existsSync(join(repoRoot, "packages/engine/src/__fixtures__"))
        ? readdirSync(join(repoRoot, "packages/engine/src/__fixtures__"))
        : [],
  },
];

/**
 * Whether `named`, appearing at `at` inside `text`, names a file that exists where it points.
 *
 * The directory is read from the path written around the name, which is what a reader and a runtime
 * both go by, and then reduced to its LAST SEGMENT. That reduction is the fix: `rules`, `./rules`,
 * `../../rules` and `rules//` all point at the published directory and all now say so, while a
 * directory that is neither of the two places rulesets live is rejected instead of being treated as
 * `rules/` by default.
 *
 * The default was the bug. A path in any unrecognised directory was validated against `rules/`
 * merely for not containing `__fixtures__`, so `elsewhere/nyc-rules.v2.8.json` passed while naming
 * nothing that exists anywhere. The earlier note admitted a limit here and understated it: the
 * limit was not "some directories are not distinguished", it was "every directory except one is
 * treated as `rules/`".
 *
 * A reference carrying no directory at all is still held to the published `rules/` artifact,
 * because that is what an unqualified ruleset name means in this repo and in a config line.
 */
function resolves(named, text, at) {
  const before = text.slice(0, at);
  const written = /([\w./@-]*)$/.exec(before)?.[1] ?? "";
  const segments = written.split("/").filter((segment) => segment !== "");
  const directory = segments[segments.length - 1] ?? "";
  if (directory === "") return RULESET_DIRECTORIES[0].names().includes(named);
  if (directory === "__fixtures__") return RULESET_DIRECTORIES[1].names().includes(named);
  if (directory === "rules") return RULESET_DIRECTORIES[0].names().includes(named);
  // Neither directory holds rulesets, so nothing this points at can be there.
  return false;
}

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
// So the file is PARSED, by the TypeScript compiler already in devDependencies, and only string
// literals, no-substitution templates and template spans are scanned. Comments are trivia and are
// never visited, which is the same deliberate boundary as before but reached by construction rather
// than by blanking text and hoping the blanking agreed with the scanner. Stated both ways, as
// before: `const p = "rules/nyc-rules.v1.json"` fails, and the same text in a comment does not.
//
// WHAT THE PARSER GUARANTEES, precisely, because the previous scanner's guarantee was "these four
// reported shapes now work" and that is what kept breaking. Node positions come from the same
// grammar the runtime uses, so every place a hand-rolled scanner had to guess is decided instead:
// a regex literal is a RegularExpressionLiteral and its contents are not string contents; JSX text
// is JsxText and an apostrophe in it opens nothing; a template literal's spans are separate nodes
// whatever they nest; an escape is the parser's problem. There is no longer a class of "the
// scanner lost sync" bug to test for, because there is no scanner state to lose.
//
// A parse failure is a HARD failure, not a skip. A file this check cannot read is a file it cannot
// vouch for, and silently passing it is the exact shape of miss the check exists to prevent. All
// 106 source files in the repo parse clean today, so this costs nothing until it is real.
//
// WHAT THESE TWO RULES DO NOT COVER, kept current rather than written once and left to rot:
//
//   • Prose in code naming a superseded artifact goes stale silently. Deliberate, per the three
//     reasons above. In a documentation lint, not here.
//   • A path assembled by CONCATENATION — `"rules/nyc-rules.v" + version + ".json"` — is invisible,
//     and parsing does NOT close it. Each operand is its own literal node and none of them contains
//     a ruleset name, so the parser sees exactly what the old scanner saw. Closing it needs the
//     VALUE of an expression, which is constant folding, not parsing, and that is deliberately out
//     of scope: it would mean evaluating imported constants to be sound. This file's own test suite
//     relies on the gap to name fixtures it does not want flagged, which is honest about the cost.
//   • A path whose directory is not written beside the name, because the directory is read from the
//     text around it. `join(someDir, name)` is held to `rules/`, which is the right default here and
//     is still a default.
//   • Compose v2's default filenames, `compose.yaml` and `compose.yml`, which drop the `docker-`
//     prefix `CONFIGURES_RULES_FILE` requires. No compose file exists here, so this is prospective
//     rather than live — but it is a silent miss in the config rule's OWN file set, which is the
//     class this whole check exists for, so it is named rather than left to be rediscovered.
//   • The reverse risk in the same rule: config files are scanned whole, comments included, so
//     prose in one that reads "the nyc-rules. file" yields the token `nyc-rules`, which is in no
//     published set, and CI goes red on a sentence. Also prospective, and worth naming because
//     `apps/api/.env.example` now carries several lines of explanatory prose that this rule reads.
//
// Covered as of this round and not before: the `RULES_FILE` override in `.env`, compose and
// workflow files, which is where the only live stale reference in the repo actually was.
// The WHOLE filename token, compared exactly against what exists, rather than a prefix ending in
// `.json`. A pattern that stopped at `.json` matched a prefix of `nyc-rules.v2.8.json.bak` and of
// `nyc-rules.v2.8.jsonx`, found the prefix in the published set, and passed — accepting a reference
// to a file that is not there. Taking the whole run and requiring an exact match closes both, and
// requires the name to end at `.json` as a consequence rather than as a second rule: the set holds
// only `.json` names.
//
// TRAILING PUNCTUATION IS NOT TRIMMED, in either rule, and that is a decided trade rather than an
// oversight. Trimming was added so a filename ending an English sentence would not be misread, and
// it also silently accepted `nyc-rules.v2.8.json-` and `nyc-rules.v2.8.json.`, which are path typos
// naming files that are not there. The two errors are not equal: a false positive on prose is loud
// and fixed in a minute, an accepted typo is silent and breaks at runtime, and the second is the
// class this check exists for. So the token is compared as written.
//
// The cost, stated: a string or a config line whose prose ends with the filename and a full stop
// fails. Nothing in the repo does that today. If it becomes a nuisance the answer is to narrow what
// is scanned, not to go back to accepting typos quietly.
//
// THE RUN HAS TO RUN FAR ENOUGH FOR ANY OF THAT TO HOLD, which is what `[\w.-]*` did not do. It
// stopped at the first character outside word/dot/hyphen, so `rules/nyc-rules.v2.8.json?backup`
// yielded the published name, matched it exactly, and passed — while `readFileSync` opens the whole
// token and gets ENOENT. Same family as `.bak` and `.jsonx` above: a prefix of a bad name is a good
// name. Taking the whole run is only a fix if the run ends where the FILENAME ends, and `?`, `#`,
// `%`, `:` and the rest of that set are legal in one.
//
// So the class is stated as what a filename cannot contain here, not as a shortlist of what it can:
//
//   • `/` ends the segment — the directory is read separately, by `resolves`;
//   • whitespace ends the token in every format scanned;
//   • `'`, `"`, backtick, `{` and `}` are delimiters and flow punctuation in the CONFIG text the
//     second rule reads whole, so a name at the end of a quoted YAML value must stop before its
//     closing quote.
//
// The delimiter exclusions used to serve the JS rule too, back when it scanned raw literal text.
// It scans COOKED VALUES now (see below), and a value has no delimiters in it, so there they cost
// nothing and are simply never reached.
//
// `\` WAS IN THIS SET AND IS NOT ANY MORE, which is a consequence of that move rather than a
// separate decision. It was excluded as an escape lead-in, to stop a real `\n` written after a real
// path being read as part of it — a hazard that only exists in raw source text. In a cooked value a
// backslash is one ordinary character of the filename, and truncating there was reporting
// `nyc-rules.v2.8` for a path that is nothing of the sort. Round 8 recorded the resulting false
// NEGATIVE, `nyc-rules.v2.8.json\backup` reading as the published name, and missed that the same
// truncation produces false POSITIVES in the other direction. Both close together: the token now
// runs through the backslash and is compared whole, and a real newline is still excluded by `\s`.
const RULESET_FILENAME = /nyc-rules\.[^\s/'"`{}]*/g;

/** Where `text` has a ruleset name that is not one of the files that exist, and on what line. */
function danglingIn(text) {
  const found = [];
  const lineOf = (index) => text.slice(0, index).split("\n").length;
  for (const match of text.matchAll(RULESET_FILENAME)) {
    if (!resolves(match[0], text, match.index)) {
      found.push({ line: lineOf(match.index), named: match[0] });
    }
  }
  return found;
}

/**
 * The same search, confined to the string literals the parser found.
 *
 * ONLY THE COOKED VALUE IS JUDGED, and the raw text is used only to locate what the value found.
 * The previous round scanned both and reported from both, which is where the first false positive
 * this check has ever produced came from: `"rules/nyc-rules.v2.8\x2ejson"` is the published
 * artifact, and the raw scan stopped at the backslash, recorded `nyc-rules.v2.8` as a name that
 * does not exist, and could not take it back when the cooked pass then resolved the real one. Two
 * scans producing findings means one of them is looking at something that is not a filename.
 *
 * The cooked value is the right one to judge because it is what the string IS at runtime, and the
 * runtime is what opens the file: the parser reads `"rules/nyc\x2drules.v9.9.json"` as
 * `rules/nyc-rules.v9.9.json`, which names a file that is not there while matching nothing a text
 * search can see. Nothing is lost by dropping the raw pass, because a name visible in the source
 * but not in the value is not a name anything ever opens.
 *
 * WHAT THE RAW TEXT IS STILL FOR: the reported line. An unescaped literal is its delimiters plus
 * its value, so the value appears verbatim in the source and the offset maps exactly, which is how
 * a name inside a multi-line template still lands on its own line. An escape changes the length,
 * the value stops being a substring of the source, and the literal's own line is then the honest
 * answer rather than a computed one that would point at the wrong column.
 *
 * A FRAGMENT IS NOT A NAME. A TemplateHead's or TemplateMiddle's value is continued by the span
 * that follows it, so a token running to the end of one is an unfinished path and not a missing
 * file: `` `rules/nyc-rules.v${version}.json` `` was reported as naming `nyc-rules.v`, which is
 * ordinary dynamic selection failing CI. Such a token is skipped. Note the shape of the rule, which
 * is narrow on purpose: only a token that ENDS at the boundary is spared, so a complete name
 * earlier in the same head is still reported.
 *
 * The cost of that, stated rather than left to be discovered: a dangling name written immediately
 * before an interpolation, `` `rules/nyc-rules.v9.9.json${suffix}` ``, is not reported. It cannot
 * honestly be, since the path is the name plus whatever the span evaluates to and this check does
 * not evaluate expressions. That is the documented concatenation gap in template form rather than
 * a new one; the previous behaviour looked like coverage only because a fragment happened to be
 * spelled like a whole name.
 */
function danglingInLiterals(sourceFile, literals) {
  const found = [];
  for (const literal of literals) {
    const valueAt = literal.raw.indexOf(literal.cooked);
    for (const token of literal.cooked.matchAll(RULESET_FILENAME)) {
      if (resolves(token[0], literal.cooked, token.index)) continue;
      if (literal.continues && token.index + token[0].length === literal.cooked.length) continue;
      const at =
        valueAt === -1 ? literal.index : literal.index + valueAt + token.index;
      found.push({ line: sourceFile.getLineAndCharacterOfPosition(at).line + 1, named: token[0] });
    }
  }
  return found;
}

/**
 * The one exemption, and the only one: a line in a TEST file that declares its ruleset names are
 * fixtures rather than paths.
 *
 * WHY IT EXISTS. `apps/web/app/rules-file.test.ts` builds `nyc-rules.v2.9.json` and
 * `nyc-rules.v3.0.json` as names for a temp directory it creates, to prove discovery returns the
 * one published ruleset WHATEVER VERSION IT NAMES. They are deliberately fictional and they must
 * stay fictional for the test to mean anything. This is the second file to need this: the check's
 * own suite got there first and assembled its names through a lexer blind spot that the parser
 * then closed. Two files reaching for the same trick is evidence about the trick.
 *
 * WHY A MARKER RATHER THAN A RULE. The tempting rule is "a literal that is exactly a filename is
 * not a path", which is elegant, needs no marker, and is wrong about a file that is not in front of
 * us: `const RULES = "nyc-rules.v2.8.json"` joined to a directory elsewhere is ordinary production
 * code, and a check built to catch hardcoded ruleset paths must not be structurally blind to a
 * class of production reference. The marker gives up elegance to keep that coverage.
 *
 * WHAT IT DOES NOT COVER, said plainly because an exemption that hides its cost is worse than no
 * exemption:
 *
 *   1. IT CAN BE SPRINKLED, inside a test file. Nothing here can tell a fictional fixture name from
 *      a genuinely dangling path that someone would rather not fix, so a test that reads the REAL
 *      `rules/` directory by literal name and marks the line goes unguarded by this check. The
 *      marker is greppable and shows up in a diff, which is the whole of its defence.
 *   2. IT IS NOT AVAILABLE TO PRODUCTION CODE, which is the half that matters. Only `*.test.*`
 *      files may claim it. `apps/web/app/checklist/checklist-fixtures.ts` is a fixture BUILDER and
 *      not a test file, so the PR #138 break — that file hardcoding `rules/nyc-rules.v2.7.json` —
 *      is still caught today. Claiming the exemption there means renaming the file into `*.test.*`,
 *      which changes what vitest runs and what coverage measures, so it cannot be done quietly.
 */
const FIXTURE_NAMES_MARKER = "baseline-check: fixture ruleset names";

/** Whether `file` may claim the exemption at all, and whether `line` claims it. */
function claimsFixtureExemption(relative, sourceLines, line) {
  if (!/(^|\/)[^/]*\.test\.[^/]*$/.test(relative)) return false;
  const own = sourceLines[line - 1] ?? "";
  const above = sourceLines[line - 2] ?? "";
  return own.includes(FIXTURE_NAMES_MARKER) || above.includes(FIXTURE_NAMES_MARKER);
}

/**
 * Files that can set `RULES_FILE`, which is the override the resolver reads before its default.
 *
 * Scanned because the override is the one place a hardcoded version is invisible to the rule above:
 * the mechanism built to point the resolver elsewhere was the mechanism no check could see through.
 * `apps/api/.env.example` named `nyc-rules.v2.5.json` for three publications, and its own first line
 * says "copy to .env for local dev" — so the documented way to run the api locally was to point it
 * at a file deleted long ago.
 *
 * These are not JavaScript, and the JS rule's machinery is deliberately not stretched over them: a
 * `KEY=value` line is not a string literal, and `#` is the comment marker in all three formats. So
 * this is a second, narrower rule — every ruleset name anywhere in the file must exist.
 *
 * COMMENTS ARE SCANNED HERE, and that is the opposite of the JS rule on purpose. In code a comment
 * is prose about the code; in a `.env` template a commented-out line is configuration waiting to be
 * uncommented, which is exactly the thing that goes stale and then bites whoever enables it.
 */
const CONFIGURES_RULES_FILE =
  /(^|\/)(\.env(\..+)?|docker-compose.*\.ya?ml)$|^\.github\/workflows\/.+\.ya?ml$/;

/**
 * The string literals a JavaScript or TypeScript source contains, found by PARSING it.
 *
 * This replaces a hand-rolled scanner, and the reason is worth recording rather than the change
 * being read as taste. The script lexed by hand in three places, then in one place after those were
 * consolidated, and each version produced a fresh list of findings: escape parity, escaped
 * delimiters, a pin read out of a comment, then nested template literals, a regex after `return`,
 * and an apostrophe in JSX text read as a string. Nested templates, regex-versus-division after a
 * keyword, and JSX are not edge cases to patch. They are the reason parsers exist.
 *
 * `typescript` is already a devDependency, so this adds no package and no supply-chain surface.
 * What the parser settles, by construction rather than by rule:
 *
 *   • a nested template inside `${...}` is its own literal node, so a path in one is seen;
 *   • a regular expression is a `RegularExpressionLiteral` wherever it appears, `return /'/` too;
 *   • JSX text is `JsxText` and is not a literal, so an apostrophe in markup means nothing here;
 *   • a comment is trivia and never a node, so the deliberate rule that a ruleset name in a comment
 *     passes now holds because comments are not in the tree at all, rather than because a blanking
 *     pass was correct.
 *
 * RAW source text is read rather than the parser's cooked `.text`, because an escape changes the
 * offsets and the reported line has to be the one the name is actually on. Ruleset names contain no
 * escapes, so raw and cooked agree on the name itself.
 */
// One entry per `CODE_EXTENSIONS` member. `.mts` and `.cts` are TypeScript with a module-format
// suffix rather than a different language, so they parse as TS; the JS family parses as JS. The
// fallback below still exists, but nothing in `CODE_EXTENSIONS` should be reaching it.
const SCRIPT_KINDS = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

function parseSource(relative, source) {
  const extension = relative.slice(relative.lastIndexOf("."));
  const sourceFile = ts.createSourceFile(
    relative,
    source,
    ts.ScriptTarget.Latest,
    true,
    SCRIPT_KINDS[extension] ?? ts.ScriptKind.JS,
  );
  const literals = [];
  const visit = (node) => {
    const isLiteral =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail;
    if (isLiteral) {
      const start = node.getStart(sourceFile);
      // `cooked` is what the string IS at runtime, with escapes resolved, and it is the only form
      // judged: the parser reads `"rules/nyc\\x2drules.v9.9.json"` as `rules/nyc-rules.v9.9.json`,
      // which names a file that is not there while matching nothing in the raw text. `raw` and
      // `index` are kept to locate a finding, not to make one.
      //
      // `continues` marks the two spans a template interpolation is appended to. Their values are
      // fragments by construction, so a name running to the end of one is unfinished rather than
      // missing, and reporting it blocks ordinary dynamic selection.
      literals.push({
        raw: source.slice(start, node.end),
        cooked: node.text,
        index: start,
        continues:
          node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { sourceFile, literals };
}

/**
 * The version the api pins, read as a MODULE-SCOPE declaration.
 *
 * THIS IS THE THIRD FIX TO THIS LOOKUP and the first two moved the target rather than closing it,
 * so it is worth being exact about what changed. A regex over file text found
 * `EXPECTED_RULESET_VERSION = "…"` inside a comment; stripping comments moved it to any string
 * that happened to contain the assignment; parsing moved it to any DECLARATION, which is closer but
 * still accepts one nested inside a function or a block, where it shadows nothing the module uses.
 * A nested `const EXPECTED_RULESET_VERSION = "nyc.v2.9"` in a test helper would be read as the pin
 * while `validateRuleset` went on comparing against a stale module-scope constant, and the check
 * would confirm the wrong one against the artifact.
 *
 * Each earlier attempt narrowed WHERE IN THE TEXT to look. This one narrows the tree position:
 * declaration inside a declaration list inside a statement whose parent is the file itself. That
 * is a structural fact about the program rather than a guess about its formatting, which is why it
 * is not the same kind of fix as the two before it.
 *
 * WHAT IS AND IS NOT CLAIMED, and the claim is deliberately smaller than the two before it made.
 * This reads the same binding the api's module-level `validateRuleset` resolves, and `const`
 * forbids reassignment, so the value checked against the artifact is the value that code compares.
 * THE `const` IS REQUIRED HERE RATHER THAN ASSUMED, because the sentence before this one is the
 * whole argument and it is only true if the declaration is checked: a module-scope
 * `let EXPECTED_RULESET_VERSION = "nyc.v2.8"` reassigned lower down would satisfy a shape test,
 * confirm the initial value against the artifact, and leave `validateRuleset` comparing the
 * reassigned one. A non-const declaration is rejected outright, which reads as "no pin" and says so.
 * That is the whole claim. It is NOT "final": the gap that remains is a rename, or a second
 * module-scope declaration of the same name, and neither is closed by scope. Both are visible in a
 * diff, which is the difference between this and the earlier fixes — those were beaten by things
 * invisible in a diff, a comment and then a string. Closing the rest needs dataflow and is not
 * attempted.
 *
 * THE INITIALIZER IS UNWRAPPED FIRST, and since this is the fourth fix here it is aimed at the
 * category rather than at what was reported. `("nyc.v2.8")` is a ParenthesizedExpression and
 * `"nyc.v2.8" as const` is an AsExpression, so neither is a string literal and the pin read as
 * ABSENT: a check blocking CI to say the constant disappeared, in front of a file that plainly
 * declares it. Each of the three previous fixes closed the shape in the review comment and left
 * the class behind, which is the habit this one is trying to break.
 *
 * The category is wrappers TypeScript ERASES. After compilation the initializer is the same string,
 * so the value read here is exactly the value the api compares, which is what makes unwrapping
 * sound rather than merely convenient — and it is the admission test for anything added to the list
 * later. A wrapper that changes the value at runtime, a call or a concatenation or a conditional,
 * is deliberately NOT here: those mean the pin is computed, this check cannot know it, and
 * reporting no pin is then the correct answer rather than a false positive.
 */
const ERASED_WRAPPERS = new Set([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.AsExpression, // x as const, x as string
  ts.SyntaxKind.SatisfiesExpression, // x satisfies string
  ts.SyntaxKind.TypeAssertionExpression, // <string>x
  ts.SyntaxKind.NonNullExpression, // x!
]);
const unwrapped = (node) =>
  node !== undefined && ERASED_WRAPPERS.has(node.kind) ? unwrapped(node.expression) : node;

function pinnedVersion(sourceFile) {
  let pinned = null;
  const atModuleScope = (declaration) =>
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0 &&
    ts.isVariableStatement(declaration.parent.parent) &&
    declaration.parent.parent.parent === sourceFile;
  const visit = (node) => {
    const initializer = ts.isVariableDeclaration(node) ? unwrapped(node.initializer) : undefined;
    if (
      initializer !== undefined &&
      ts.isIdentifier(node.name) &&
      node.name.text === "EXPECTED_RULESET_VERSION" &&
      ts.isStringLiteralLike(initializer) &&
      atModuleScope(node)
    ) {
      pinned = initializer.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return pinned;
}

const scanned = filesUnder(repoRoot, (_relative, name) =>
  CODE_EXTENSIONS.some((extension) => name.endsWith(extension)),
);
const configFiles = filesUnder(repoRoot, (relative) => CONFIGURES_RULES_FILE.test(relative));
const danglingReferences = [];

/** Each scanned file's parse, kept so the pin lookup reads the same tree rather than a second one. */
const parsedSource = new Map();

for (const file of scanned) {
  const relative = file.slice(repoRoot.length + 1);
  const source = readFileSync(file, "utf8");
  const { sourceFile, literals } = parseSource(relative, source);

  // A file that will not parse yields no literals, and no literals is indistinguishable from
  // nothing to find. Reported rather than scanned past, for the same reason every other narrowing
  // in this script is reported: a check that quietly stops looking reads exactly like a clean tree.
  if (sourceFile.parseDiagnostics.length > 0) {
    const first = sourceFile.parseDiagnostics[0];
    console.error(
      `${relative} could not be parsed, so it was not scanned: ` +
        ts.flattenDiagnosticMessageText(first.messageText, " ") +
        "\n\nA file this check cannot read is a file this check cannot vouch for.",
    );
    process.exit(1);
  }

  parsedSource.set(relative, sourceFile);
  const sourceLines = source.split(/\r?\n/);
  for (const found of danglingInLiterals(sourceFile, literals)) {
    if (claimsFixtureExemption(relative, sourceLines, found.line)) continue;
    danglingReferences.push({ file: relative, ...found });
  }
}

for (const file of configFiles) {
  const relative = file.slice(repoRoot.length + 1);
  for (const found of danglingIn(readFileSync(file, "utf8"))) {
    danglingReferences.push({ file: relative, ...found });
  }
}

if (danglingReferences.length > 0) {
  console.error("A ruleset artifact is named that is not in the repo:\n");
  for (const reference of danglingReferences) {
    console.error(`  ✗ ${reference.file}:${reference.line} names ${reference.named}`);
  }
  console.error(
    `\nThe repo publishes: ${publishedRulesets().join(", ") || "(nothing under rules/)"}.\n` +
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
// Read as a DECLARATION from the parse tree. A regex over file text reported a commented-out
// assignment as the pin, and then an assignment-shaped string as the pin. Neither is a declaration,
// so neither can be mistaken for one now.
const pinTree =
  parsedSource.get(pinFile) ??
  parseSource(pinFile, readFileSync(join(repoRoot, pinFile), "utf8")).sourceFile;
const pinned = pinnedVersion(pinTree);
if (pinned === null) {
  console.error(
    `${pinFile} no longer declares EXPECTED_RULESET_VERSION as a module-scope const, which this\n` +
      "check reads as the one place allowed to pin a ruleset version. A `let` or `var` pin is\n" +
      "rejected on purpose: it can be reassigned after this check reads it, so the value confirmed\n" +
      "here would not be the value validateRuleset compares. If it moved, point this check at its\n" +
      "new home.",
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
const publishedNow = publishedRulesets();
if (publishedNow.length !== 1) {
  console.error(
    publishedNow.length === 0
      ? `No published ruleset in rules/. The api loads one at boot and every plan pins its ` +
          `version, so there is nothing for this check — or the product — to be right about.`
      : `rules/ holds ${publishedNow.length} published rulesets, and exactly one is the ` +
          `invariant:\n\n` +
          publishedNow.map((entry) => `  • ${entry}`).join("\n") +
          `\n\n${pinFile} pins ${pinned}, so that is the one to keep. A superseded ruleset is ` +
          `DELETED from the tree, not left beside its replacement: BASELINE.md records each one as ` +
          `a lineage row naming its git commit, which is how it stays recoverable. If you are ` +
          `mid-bump, this is the step between adding the new file and removing the old one.`,
  );
  process.exit(1);
}

// THE VERSION IS SPELLED IN THREE PLACES AND ALL THREE MUST AGREE: the artifact's filename, the
// `ruleset_version` inside it, and the api's pin. Comparing the JSON against the pin alone checked
// two of them and left the filename free to disagree, so a bump that renamed the file to
// `nyc-rules.v2.9.json` while both the field and the pin still said `nyc.v2.8` passed everything.
//
// That is worse than it sounds and is why it is checked here rather than left to review. Plans
// persist `ruleset_version` and replay against it (AD-7), and the snapshot banner reports it, so a
// publication that identifies itself as the version before it corrupts replay and tells organizers
// their plan came from rules it did not come from, with every check green.
//
// The filename is the anchor because it is what the manifest names and what a reader sees first.
// `<jurisdiction>-rules.<version>.json` publishes `<jurisdiction>.<version>`, derived rather than
// hardcoded so a second jurisdiction needs no change here.
const published = publishedNow[0];
const namedInFile = /^(.+)-rules\.(.+)\.json$/.exec(published);
if (namedInFile === null) {
  console.error(
    `${published} is not named <jurisdiction>-rules.<version>.json, so this check cannot derive ` +
      "the version the file claims to publish. Rename it or teach this check the new shape.",
  );
  process.exit(1);
}
const expectedVersion = `${namedInFile[1]}.${namedInFile[2]}`;
const publishedVersion = JSON.parse(
  readFileSync(join(repoRoot, "rules", published), "utf8"),
).ruleset_version;

const disagreements = [
  publishedVersion === expectedVersion
    ? null
    : `the file's own ruleset_version is ${publishedVersion}`,
  pinned === expectedVersion ? null : `${pinFile} pins ${pinned}`,
].filter(Boolean);

if (disagreements.length > 0) {
  console.error(
    `${published} is named for ${expectedVersion}, but ${disagreements.join(", and ")}.\n\n` +
      "The filename, the ruleset_version inside the file, and the api pin all name the same " +
      "publication, so all three move together or none do. Plans persist ruleset_version and " +
      "replay against it, so a file that identifies itself as an earlier version corrupts replay " +
      "and the snapshot banner while every other check stays green.",
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
  `Ruleset reference check passed: ${scanned.length} source and ${configFiles.length} config ` +
    `files scanned, every ruleset name exists, and ${pinFile} pins ${pinned}.`,
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
