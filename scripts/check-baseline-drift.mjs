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

const CODE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
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
// WHAT THESE TWO RULES DO NOT COVER, kept current rather than written once and left to rot:
//
//   • Prose in code naming a superseded artifact goes stale silently. Deliberate, per the three
//     reasons above. In a documentation lint, not here.
//   • A path assembled by CONCATENATION — `"rules/nyc-rules.v" + version + ".json"` — is invisible.
//     A multiline template literal used to be too, and no longer is, and the two are worth telling
//     apart because they look like one gap: a template literal is a LEXICAL shape, so a scanner can
//     see the whole path by matching across newlines, whereas concatenation needs the value of an
//     expression, which needs real parsing and constant folding. One was a scanning bug; the other
//     is a different tool. Half of this gap closed, and the half that did not is named.
//   • A correct filename under a wrong directory, per the note on `existingRulesets` above.
//   • Escape consumption inside the scanner is not covered by a failing test. Deleting it changes
//     no observable outcome in this repo's shapes, because handling comments before strings and
//     never deciding a close by looking backwards already fix the reported cases. It is kept as
//     defence, and its absence would show as a loud desync rather than a quiet miss, but nobody
//     should read the suite as proof that it earns its place.
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
const RULESET_FILENAME = /nyc-rules\.[\w.-]*/g;

/** Where `text` has a ruleset name that is not one of the files that exist, and on what line. */
function danglingIn(text) {
  const found = [];
  const lineOf = (index) => text.slice(0, index).split("\n").length;
  for (const match of text.matchAll(RULESET_FILENAME)) {
    if (!existingRulesets.has(match[0])) found.push({ line: lineOf(match.index), named: match[0] });
  }
  return found;
}

/** The same search, confined to the string literals the scanner found, at their real offsets. */
function danglingInLiterals(source, literals) {
  const found = [];
  const lineOf = (index) => source.slice(0, index).split("\n").length;
  for (const literal of literals) {
    for (const token of literal.value.matchAll(RULESET_FILENAME)) {
      if (!existingRulesets.has(token[0])) {
        found.push({ line: lineOf(literal.index + token.index), named: token[0] });
      }
    }
  }
  return found;
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
 * One pass over a JavaScript source, returning what every rule below needs to read it correctly.
 *
 * ONE SCANNER, NOT THREE. This script hand-rolled lexing in three places and was wrong in all
 * three: an escape check that looked only at the previous character, so `"ends with \\\\"` left the
 * quote open and a later `//` blanked a real path away; a literal regex that treated an escaped
 * delimiter as the end of the literal, so `"prefix \\" rules/…json"` put the path outside every
 * match; and a pin lookup run on raw source, which read a commented-out assignment instead of the
 * live constant. Three separate patches would have been three more chances to be wrong the same
 * way, so the lexing happens once, here, and every rule consumes the result.
 *
 * Returns `commentFree`, the source with comments blanked and string contents intact, and
 * `literals`, every string literal with the offset it starts at. Escapes are handled by consuming
 * the escaped character rather than by looking backwards, which is what makes both the backslash
 * parity case and the escaped delimiter case fall out rather than needing rules of their own.
 *
 * Regular-expression literals are recognised too, because they are not optional here: this repo
 * contains `/'([^']+)'/g`, and a scanner that does not know a regex from a division reads that
 * apostrophe as a string opening and loses sync for the rest of the file. Regex-versus-division is
 * decided the standard way, by what precedes the slash, since a regex cannot follow a value.
 *
 * Known limit, since this is a scanner and not a parser, and pretending otherwise is how the last
 * three bugs happened: a template substitution's contents are treated as literal text, so a quote
 * or backtick inside `${...}` can confuse it. That is caught rather than silent. A scan that ends
 * inside an unterminated literal fails loudly at the call site, because real source does not end
 * that way, so a desync is reported instead of quietly narrowing what gets seen.
 */
function scanSource(source) {
  let commentFree = "";
  const literals = [];
  /** The last code character that was not whitespace, which is what tells a regex from a division. */
  let lastSignificant = null;
  let i = 0;
  while (i < source.length) {
    const pair = source.slice(i, i + 2);
    if (pair === "/*") {
      const close = source.indexOf("*/", i + 2);
      const stop = close === -1 ? source.length : close + 2;
      for (let j = i; j < stop; j += 1) commentFree += source[j] === "\n" ? "\n" : " ";
      i = stop;
      continue;
    }
    if (pair === "//") {
      const lineEnd = source.indexOf("\n", i);
      const stop = lineEnd === -1 ? source.length : lineEnd;
      commentFree += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    // A slash begins a regular expression unless it follows a value, which is the only place
    // division can appear. Getting this wrong desyncs the scan, and the unterminated-literal
    // invariant at the call site is what makes that loud rather than silent.
    if (source[i] === "/" && !/[\w$)\]]/.test(lastSignificant ?? "")) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length) {
        const character = source[j];
        if (character === "\\") {
          j += 2;
          continue;
        }
        if (character === "\n") break;
        if (character === "[") inClass = true;
        else if (character === "]") inClass = false;
        else if (character === "/" && !inClass) {
          j += 1;
          break;
        }
        j += 1;
      }
      commentFree += source.slice(i, j);
      lastSignificant = "/";
      i = j;
      continue;
    }

    const quote = source[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      const start = i;
      let value = quote;
      i += 1;
      let terminated = false;
      while (i < source.length) {
        const character = source[i];
        if (character === "\\") {
          // The escaped character is consumed with its backslash, so a trailing `\\\\` cannot be
          // mistaken for an escape of the closing quote, and an escaped quote cannot close it.
          value += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        value += character;
        i += 1;
        if (character === quote) {
          terminated = true;
          break;
        }
        // A single-quoted or double-quoted literal cannot span lines; a template can.
        if (character === "\n" && quote !== "`") break;
      }
      commentFree += value;
      lastSignificant = quote;
      if (terminated) literals.push({ value, index: start });
      else return { commentFree, literals, unterminated: true };
      continue;
    }
    if (!/\s/.test(source[i])) lastSignificant = source[i];
    commentFree += source[i];
    i += 1;
  }
  return { commentFree, literals, unterminated: false };
}

const scanned = filesUnder(repoRoot, (_relative, name) =>
  CODE_EXTENSIONS.some((extension) => name.endsWith(extension)),
);
const configFiles = filesUnder(repoRoot, (relative) => CONFIGURES_RULES_FILE.test(relative));
const danglingReferences = [];

/** Every scanned source, kept so the pin lookup below reads the same comment-free text. */
const scannedSource = new Map();

for (const file of scanned) {
  const relative = file.slice(repoRoot.length + 1);
  const source = readFileSync(file, "utf8");
  const { commentFree, literals, unterminated } = scanSource(source);

  // Two invariants a correct scan must hold, both failing loudly rather than scanning less. A
  // scanner that loses sync sees fewer literals than the file has, and seeing less is
  // indistinguishable from passing, which is the failure mode this whole check exists to remove.
  if (unterminated) {
    console.error(
      `The source scanner reached the end of ${relative} inside an unterminated string literal. ` +
        "Real source does not end that way, so this is the scanner losing sync — most likely on a " +
        "template substitution or a regular-expression literal containing a quote. Reported " +
        "rather than scanned past, because a desynced scan quietly stops finding things.",
    );
    process.exit(1);
  }
  if (commentFree.length !== source.length) {
    console.error(
      `The source scanner corrupted ${relative}: ${source.length} characters in, ` +
        `${commentFree.length} out. That is a bug in this check, not in the file.`,
    );
    process.exit(1);
  }

  scannedSource.set(relative, commentFree);
  for (const found of danglingInLiterals(source, literals)) {
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
// Read from the COMMENT-FREE source the scanner already produced. An unanchored first match over
// raw source found `// const EXPECTED_RULESET_VERSION = "nyc.v2.8"` in a comment and reported that
// as the pin, so the check passed while the live constant said something else entirely.
const pinSource =
  scannedSource.get(pinFile) ??
  scanSource(readFileSync(join(repoRoot, pinFile), "utf8")).commentFree;
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
const published = publishedRulesets[0];
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
  pinned[1] === expectedVersion ? null : `${pinFile} pins ${pinned[1]}`,
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
    `files scanned, every ruleset name exists, and ${pinFile} pins ${pinned[1]}.`,
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
