import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The baseline check guards artifact integrity for the whole repo, and until this file existed it
// had no test. CI running it on a good tree proves only that it does not FALSE-POSITIVE. Nothing
// proved it still fails on a bad one — and a scanner that quietly stops catching things is
// indistinguishable from a clean repo, which is the exact failure this check was written to remove.
//
// So every rule it claims is exercised against a PLANTED tree: the defect is written to disk, the
// real script is run against it, and both the exit code and the message are asserted. Asserting the
// exit code alone would pass when the script fails for an unrelated reason, which is its own silent
// hole.
//
// The script is invoked as a SUBPROCESS against a temp root rather than imported. It is a top-level
// program that calls `process.exit`, so importing it would end the test run; and pointing the real
// file at a planted tree tests the artifact CI executes rather than a copy or a refactored subset.
// `BASELINE_CHECK_ROOT` is the one affordance added for that.

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "check-baseline-drift.mjs");

/**
 * Ruleset filenames are ASSEMBLED here, never written as literals, and that is not stylistic.
 *
 * This file is scanned by the very check it tests, and its fixtures are by construction names the
 * repo does not publish. A literal one would fail CI on the test suite itself. Concatenation is the
 * blind spot the check documents and deliberately does not close, so it is used here on purpose and
 * named so nobody tidies it back into a literal.
 *
 * The alternative was exempting this file from the scan, which is a change to what the check
 * catches; this round was scoped to adding tests, not to moving that line. Worth revisiting: an
 * explicit exemption may be the better long-term answer, and if concatenation is ever handled this
 * suite fails loudly rather than quietly, which is the right way round.
 */
const ruleset = (version) => ["nyc", `rules.v${version}.json`].join("-");

/** The fixture ruleset's version. Synthetic on purpose, and far from any published one. */
const FIXTURE_VERSION = "nyc.v0.0";
const FIXTURE_RULESET = ruleset("0.0");
/** Two versions that exist nowhere, for the dangling cases. */
const MISSING = ruleset("9.9");
const ALSO_MISSING = ruleset("8.8");

/**
 * The smallest tree the check will read to completion, plus whatever a test plants on top.
 *
 * The manifest is deliberately row-less: the status and checksum rules act only on rows marked
 * APPROVED, so a manifest with none of them passes through to the ruleset rules under test without
 * dragging their fixtures in.
 *
 * The fixture ruleset carries a version and NOTHING ELSE. It publishes no rule, permit, agency,
 * deadline or fee, because a test fixture is not a place to write regulatory content.
 */
function plant(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "baseline-check-"));
  const seed = {
    "docs/BASELINE.md":
      "# Fixture manifest\n\nNo APPROVED rows, so no status or digest is claimed.\n",
    [`rules/${FIXTURE_RULESET}`]: JSON.stringify({ ruleset_version: FIXTURE_VERSION }),
    "apps/api/src/ruleset.ts": `const EXPECTED_RULESET_VERSION = "${FIXTURE_VERSION}";\n`,
    ...files,
  };
  for (const [relative, contents] of Object.entries(seed)) {
    if (contents === null) continue;
    const full = join(root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

function check(root) {
  const run = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, BASELINE_CHECK_ROOT: root },
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

const roots = [];
const runOn = (files) => {
  const root = plant(files);
  roots.push(root);
  return check(root);
};

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("the baseline check's own guarantees", () => {
  it("passes a tree with nothing wrong in it, so a failure below means something", () => {
    const { status, output } = runOn({});

    expect(status).toBe(0);
    expect(output).toContain("Ruleset reference check passed");
  });
});

describe("ruleset names in executable code", () => {
  it("fails on a dangling name in a string literal, naming file, line and version", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const a = 1;\nconst path = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:2 names ${MISSING}`);
    // The message says what the repo does publish, because whoever hits this is mid bump.
    expect(output).toContain(`The repo publishes: ${FIXTURE_RULESET}`);
  });

  // The deliberate boundary. A comment naming a superseded path is prose, most valuably when it
  // explains why the code no longer names it, and flagging that would punish the record of a fix.
  //
  // The names below are QUOTED inside the comments, and that detail is the whole test. Two separate
  // mechanisms keep prose out: comments are blanked, and only string literals are scanned. An
  // unquoted name in a comment is held out by the second alone, so a test using one still passes
  // when the blanking is deleted. Mutation-testing this suite caught exactly that: the first
  // version of this case survived removing `withoutComments`, which is the guard it claims to
  // cover. Markdown backticks in a doc comment are also the real-world shape, since they read as a
  // template literal.
  it("passes the same name in a comment, even quoted, which is the documented boundary", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts":
        `// \`rules/${MISSING}\` used to be read here.\n` +
        `/* and "rules/${ALSO_MISSING}" before that */\n` +
        "const a = 1;\n",
    });

    expect(status).toBe(0);
    expect(output).not.toContain(MISSING);
    expect(output).not.toContain(ALSO_MISSING);
  });

  it("fails on a name split across lines in a template literal", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const path = \`rules/\n${MISSING}\`;\n`,
    });

    expect(status).toBe(1);
    // Reported on the token's own line, not the line the literal opened on.
    expect(output).toContain(`apps/web/app/reader.ts:2 names ${MISSING}`);
  });

  // A pattern that stopped at `.json` matched a PREFIX of these, found the prefix in the published
  // set and passed. Both are here because a naive re-anchor would silently reopen exactly this.
  it.each([
    ["a .bak suffix", `${FIXTURE_RULESET}.bak`],
    ["a .jsonx suffix", FIXTURE_RULESET.replace(".json", ".jsonx")],
  ])("fails on a published name with %s", (_label, named) => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const path = "rules/${named}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${named}`);
  });

  // Round 2 took the whole run and compared it exactly, which closed `.bak` and `.jsonx`. The run
  // then stopped at the first character outside word/dot/hyphen, so a suffix built from any other
  // legal filename character left the published name as the token and passed — while the runtime
  // opens the whole thing and gets ENOENT. These are the characters the class used to end on.
  it.each([
    ["a query suffix", `${FIXTURE_RULESET}?backup`],
    ["a fragment suffix", `${FIXTURE_RULESET}#old`],
    ["a percent escape", `${FIXTURE_RULESET}%20`],
    ["a stream suffix", `${FIXTURE_RULESET}:2`],
  ])("fails on a published name with %s, which names no file", (_label, named) => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const path = "rules/${named}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${named}`);
  });

  // Trailing punctuation is no longer trimmed, in either rule. Both branches of that trade are
  // pinned here: the typo it now catches, and the prose it now costs. An accepted typo is silent
  // and breaks at runtime; a false positive on prose is loud and fixed in a minute.
  it.each([
    ["a trailing hyphen", `${FIXTURE_RULESET}-`],
    ["a trailing period", `${FIXTURE_RULESET}.`],
  ])("fails a published name with %s, which names no file", (_label, named) => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const path = "rules/${named}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${named}`);
  });

  it("costs a false positive on prose inside a literal, which is the accepted half of that trade", () => {
    const { status } = runOn({
      "apps/web/app/reader.ts": `const note = "Read from ${FIXTURE_RULESET}.";\n`,
    });

    expect(status).toBe(1);
  });

  // Reproduced from review: a preceding literal ending in an escaped backslash used to leave the
  // quote open, so the next quote read as its close and a later `//` blanked a real path away.
  it("fails on a path hidden after a literal that ends in an escaped backslash", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts":
        'const a = "ends with a backslash \\\\";\n' +
        `const p = read("rules//${MISSING}"); // trailing comment\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:2 names ${MISSING}`);
  });

  // Reproduced from review: an escaped delimiter used to end the literal early, putting the
  // filename outside every match.
  it.each([
    ["a double quote", '"', '\\"'],
    ["a single quote", "'", "\\'"],
    ["a backtick", "`", "\\`"],
  ])("fails on a path after %s escaped inside its own literal", (_label, quote, escaped) => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const p = ${quote}prefix ${escaped} rules/${MISSING}${quote};\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${MISSING}`);
  });

  // ESCAPE CONSUMPTION IS NOT PINNED BY THIS SUITE, and saying so is more useful than implying it
  // is. Mutation testing deleted the escape branch outright and all of these still passed, this one
  // included: handling comments before strings, and never deciding a close by looking backwards,
  // already fixes both reported shapes on their own. Three fixtures were tried and none made the
  // branch observable. So it is defence whose absence could not be demonstrated in this repo's
  // shapes, kept because the scan desyncs loudly rather than silently if it is ever needed, and
  // recorded here so nobody reads a passing suite as proof it earns its place.
  it("still finds a path after a literal that ends in an escaped quote", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": 'const a = "x \\"";\n' + `const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:2 names ${MISSING}`);
  });

  // The scanner must know a regex from a division, or an apostrophe inside a character class
  // opens a string that is not there and the rest of the file goes unscanned. This repo really
  // contains such a regex, so the guard below is not hypothetical.
  it("still finds a path after a regular expression containing a quote", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts":
        "const quoted = text.matchAll(/'([^']+)'/g);\n" + `const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:2 names ${MISSING}`);
  });
  // Regex-or-division cannot be decided by looking at the previous character: after `return` the
  // preceding token is a keyword, so `/` opens a regex, and a hand-rolled scanner that read the
  // letter `n` as the end of an operand called it division and let the apostrophe open a string
  // that ran to end of file. The parser decides it from grammar position, so there is nothing to
  // get wrong.
  it("still finds a path after a regex in return position", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts":
        "function quoted(text) {\n  return /'([^']+)'/.test(text);\n}\n" +
        `const p = "rules/${MISSING}";\n`,
    });

    // Valid source, so the failure must be the planted path and not a lexer complaining.
    expect(output).not.toContain("unterminated");
    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:4 names ${MISSING}`);
  });

  // Pairing backticks left to right closes the outer template on the inner one's opener, and the
  // filenames then sit BETWEEN the pairs rather than inside them. The reported shape has two nested
  // templates, so the mispairing lands the names outside every recorded literal and the check
  // passed. Every span is its own node now, and `${}` depth is the parser's to track.
  it("finds a path in a template literal that nests other template literals", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts":
        "const p = `${dir}/${legacy ? `" + MISSING + "` : `" + FIXTURE_RULESET + "`}`;\n",
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${MISSING}`);
  });

  // JSX TEXT IS NOT STRING CONTENT, and an apostrophe in English prose between two tags is the
  // commonest character in the repo's web copy. Read as a quote it opened a literal that never
  // closed and silently swallowed the remainder of the file.
  it("still finds a path after an apostrophe in JSX text", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.tsx":
        "export const Note = () => <p>don't file late</p>;\n" + `const p = "rules/${MISSING}";\n`,
    });

    // Valid source, so the failure must be the planted path and not a lexer complaining.
    expect(output).not.toContain("unterminated");
    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.tsx:2 names ${MISSING}`);
  });

  // A file the check cannot parse is a file it cannot vouch for, so it fails loudly rather than
  // scanning nothing and reporting a pass. Every source file in the repo parses clean, so this
  // costs nothing until it is real.
  it("fails on a file it cannot parse rather than passing it unscanned", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": "const broken = (((;\n",
    });

    expect(status).toBe(1);
    expect(output).toContain("apps/web/app/reader.ts");
    expect(output).toContain("could not be parsed");
  });
});

describe("where a named ruleset has to exist, which is not just anywhere", () => {
  const FIXTURES = "packages/engine/src/__fixtures__";

  // Reproduced from review, and not a lexing bug: one flat set of every ruleset name anywhere let a
  // superseded REPLAY fixture vouch for a PRODUCTION path. The file the code would open is absent
  // and the check passed on the strength of a same-named file in a different directory.
  it("does not let a replay fixture satisfy a path under rules/", () => {
    const { status, output } = runOn({
      [`${FIXTURES}/${MISSING}`]: JSON.stringify({ ruleset_version: "nyc.v9.9" }),
      "apps/api/src/loader.ts": `const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/api/src/loader.ts:1 names ${MISSING}`);
  });

  // The other half of the same rule, which is what makes it a resolution and not a blanket ban:
  // replay code pointing AT the fixture directory is correct and must keep passing.
  it("accepts a fixture path that points at the fixture directory", () => {
    const { status, output } = runOn({
      [`${FIXTURES}/${MISSING}`]: JSON.stringify({ ruleset_version: "nyc.v9.9" }),
      "packages/engine/src/replay.ts": `const p = "${FIXTURES}/${MISSING}";\n`,
    });

    expect(status).toBe(0);
    expect(output).toContain("Ruleset reference check passed");
  });
});

describe("the RULES_FILE override, which no code scan can see through", () => {
  it("fails on a stale ruleset pinned in a .env file", () => {
    const { status, output } = runOn({
      "apps/api/.env.example": `PORT=3001\nRULES_FILE=../../rules/${MISSING}\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/api/.env.example:2 names ${MISSING}`);
  });

  // The opposite of the JS rule, on purpose: in a .env template a commented-out line is
  // configuration waiting to be uncommented, which is the thing that goes stale and then bites
  // whoever enables it. This test exists because that inversion is the most likely to be
  // "simplified" away by someone who sees the JS rule and assumes both work the same way.
  it("fails on a stale ruleset in a COMMENTED OUT .env line", () => {
    const { status, output } = runOn({
      "apps/api/.env.example": `PORT=3001\n# RULES_FILE=../../rules/${MISSING}\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/api/.env.example:2 names ${MISSING}`);
  });

  it("fails on a stale ruleset in a workflow file", () => {
    const { status, output } = runOn({
      ".github/workflows/ci.yml": `jobs:\n  verify:\n    env:\n      RULES_FILE: rules/${MISSING}\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`.github/workflows/ci.yml:4 names ${MISSING}`);
  });
});

describe("how many rulesets are published", () => {
  // The state this fires in is mid bump, new version added and old one not yet deleted, which is
  // when the check is most needed. Standing down here would be a silent-failure path inside the
  // guard written to remove one.
  it("fails on two published rulesets, naming every file and the one to keep", () => {
    const { status, output } = runOn({
      [`rules/${ruleset("0.1")}`]: JSON.stringify({ ruleset_version: "nyc.v0.1" }),
    });

    expect(status).toBe(1);
    expect(output).toContain("rules/ holds 2 published rulesets");
    expect(output).toContain(FIXTURE_RULESET);
    expect(output).toContain(ruleset("0.1"));
    expect(output).toContain(`pins ${FIXTURE_VERSION}, so that is the one to keep`);
  });

  it("fails when nothing is published at all", () => {
    const root = plant({ [`rules/${FIXTURE_RULESET}`]: null });
    roots.push(root);
    mkdirSync(join(root, "rules"), { recursive: true });

    const { status, output } = check(root);

    expect(status).toBe(1);
    expect(output).toContain("No published ruleset in rules/");
  });
});

describe("the version, which is spelled in three places", () => {
  // Reproduced from review: comparing the JSON field against the pin checked two of the three and
  // left the filename free to disagree, so a rename with neither updated passed.
  it("fails when the filename says one version and the file and pin say another", () => {
    const root = plant({});
    roots.push(root);
    renameSync(join(root, "rules", FIXTURE_RULESET), join(root, "rules", ruleset("0.1")));

    const { status, output } = check(root);

    expect(status).toBe(1);
    expect(output).toContain(`${ruleset("0.1")} is named for nyc.v0.1`);
    expect(output).toContain(`the file's own ruleset_version is ${FIXTURE_VERSION}`);
    expect(output).toContain(`pins ${FIXTURE_VERSION}`);
  });

  // Reproduced from review: an unanchored first match over raw source read a commented-out
  // assignment as the pin, so the check passed while the live constant said something else.
  it("reads the live pin, not one quoted in a comment above it", () => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts":
        `// const EXPECTED_RULESET_VERSION = "${FIXTURE_VERSION}"\n` +
        `const EXPECTED_RULESET_VERSION = "nyc.v9.9";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain("pins nyc.v9.9");
  });

  // Blanking comments fixed the commented-out pin above and left the same bug one shape over: any
  // assignment-shaped TEXT still matched first, including one inside a string. The pin is read as a
  // variable DECLARATION now, so only a declaration can be one.
  it("reads the live pin, not one quoted inside a string literal", () => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts":
        `const banner = 'EXPECTED_RULESET_VERSION = "nyc.v9.9"';\n` +
        `const EXPECTED_RULESET_VERSION = "${FIXTURE_VERSION}";\n` +
        `export { banner, EXPECTED_RULESET_VERSION };\n`,
    });

    expect(status).toBe(0);
    expect(output).toContain("Ruleset reference check passed");
  });

  it("fails when the artifact moved and the pin did not", () => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts": `const EXPECTED_RULESET_VERSION = "nyc.v9.9";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`${FIXTURE_RULESET} is named for ${FIXTURE_VERSION}`);
    expect(output).toContain("pins nyc.v9.9");
  });

  // The module-scope restriction is argued from `const` forbidding reassignment, so `const` has to
  // be the thing that is checked. The pin below is initialised to the RIGHT version and reassigned
  // afterwards: a check reading only the declaration's position confirms the initial value against
  // the artifact and passes, while `validateRuleset` compares the reassigned one and rejects the
  // published ruleset at boot.
  it.each([["let"], ["var"]])("refuses a %s pin, which the const argument does not cover", (kind) => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts":
        `${kind} EXPECTED_RULESET_VERSION = "${FIXTURE_VERSION}";\n` +
        `EXPECTED_RULESET_VERSION = "nyc.v9.9";\n` +
        `export { EXPECTED_RULESET_VERSION };\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain("no longer declares EXPECTED_RULESET_VERSION");
  });

  it("fails when the one constant allowed to name a version is gone", () => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts": `export const somethingElse = 1;\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain("no longer declares EXPECTED_RULESET_VERSION");
  });
});

describe("round 7: the rules the parser made reachable", () => {
  // The check restated the discoverers' pattern more broadly than they write it. A publication
  // without the `v` satisfied the guard and then found zero rulesets at boot, which is a green
  // check on a tree that cannot start.
  it("refuses a published name the runtime's own pattern would not discover", () => {
    // The bump REPLACES the published file, which is what a bump does. Every discoverer requires
    // the `v`, so this tree boots to zero rulesets; a check whose pattern was broader counted one
    // and went green on it.
    const withoutV = ["nyc", "rules.2.9.json"].join("-");
    const { status, output } = runOn({
      [`rules/${FIXTURE_RULESET}`]: null,
      [`rules/${withoutV}`]: JSON.stringify({ ruleset_version: FIXTURE_VERSION }),
    });

    expect(status).toBe(1);
    expect(output).toContain("No published ruleset in rules/");
  });

  // The copy this check keeps of that pattern is the thing that can drift, so the copies are
  // compared directly. Reading the repo rather than a planted tree on purpose: divergence is a fact
  // about the real files.
  it("keeps its published-ruleset pattern identical to every runtime discoverer", () => {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const declared = (relative) => {
      const text = readFileSync(join(repo, relative), "utf8");
      return /PUBLISHED_RULESET\s*=\s*(\/[^\n]*?\/)[;\s]/.exec(text)?.[1] ?? null;
    };
    const copies = [
      declared("scripts/check-baseline-drift.mjs"),
      declared("apps/api/src/ruleset.ts"),
      declared("apps/web/app/rules-file.ts"),
      declared("packages/engine/src/__fixtures__/published-ruleset.ts"),
    ];
    expect(copies.every((copy) => copy !== null)).toBe(true);
    expect(new Set(copies).size).toBe(1);
  });

  // A directory that holds no rulesets was treated as `rules/` merely for not being the fixtures
  // one, so a path to nowhere resolved against a file it does not point at.
  it("fails a published name written in a directory that holds no rulesets", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const p = "elsewhere/${FIXTURE_RULESET}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${FIXTURE_RULESET}`);
  });

  // `../../rules/` is how the env template reaches it and `rules//` is how a fixed bug wrote it.
  // Both are the published directory, so both must still resolve.
  it.each([["../../rules/"], ["./rules/"], ["rules//"]])(
    "resolves a published name written under %s",
    (prefix) => {
      const { status } = runOn({
        "apps/web/app/reader.ts": `const p = "${prefix}${FIXTURE_RULESET}";\n`,
      });

      expect(status).toBe(0);
    },
  );

  // An escape is the one way to write a path that a text search cannot see and a runtime reads
  // perfectly. Matched on the cooked value, reported at the literal the reader is looking at.
  it("fails on a name an escape hides from the raw text", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const p = "rules/nyc\\x2drules.v9.9.json";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${MISSING}`);
  });

  // A nested declaration shadows nothing the module uses, so reading it as the pin checks a
  // constant `validateRuleset` never sees.
  it("reads the module-scope pin rather than a nested declaration of the same name", () => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts":
        `const EXPECTED_RULESET_VERSION = "nyc.v9.9";\n` +
        `function helper() {\n  const EXPECTED_RULESET_VERSION = "${FIXTURE_VERSION}";\n` +
        `  return EXPECTED_RULESET_VERSION;\n}\n`,
    });

    // The module-scope pin is the wrong one, and the nested correct-looking one must not mask it.
    expect(status).toBe(1);
    expect(output).toContain("nyc.v9.9");
  });

  // Extensions the toolchain runs but the walker did not visit were a hole with no diagnostic:
  // a file naming a deleted ruleset simply was not read.
  it.each([[".mts"], [".cts"], [".cjs"], [".jsx"]])("scans a %s file", (extension) => {
    const { status, output } = runOn({
      [`apps/web/app/reader${extension}`]: `const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader${extension}:1 names ${MISSING}`);
  });
});

describe("round 7: the fixture-name exemption, and what it does not cover", () => {
  it("lets a TEST file declare that its ruleset names are fixtures", () => {
    const { status } = runOn({
      "apps/web/app/reader.test.ts":
        `// baseline-check: fixture ruleset names\n` +
        `const names = ["${MISSING}", "${ALSO_MISSING}"];\n`,
    });

    expect(status).toBe(0);
  });

  it("accepts the marker on the same line as the names", () => {
    const { status } = runOn({
      "apps/web/app/reader.test.ts": `const names = ["${MISSING}"]; // baseline-check: fixture ruleset names\n`,
    });

    expect(status).toBe(0);
  });

  // The half that matters. A fixture BUILDER is not a test file, and PR #138's break was exactly
  // that shape: `checklist-fixtures.ts` hardcoding a ruleset path. Claiming the exemption there
  // would mean renaming the file into `*.test.*`, which changes what vitest runs.
  it("refuses the marker in a file that is not a test", () => {
    const { status, output } = runOn({
      "apps/web/app/checklist-fixtures.ts":
        `// baseline-check: fixture ruleset names\n` + `const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/checklist-fixtures.ts:2 names ${MISSING}`);
  });

  // Stated in the check's own comment and pinned here so the cost is not deniable: inside a test
  // file the marker silences a real dangling path too. Its defence is that it is greppable and
  // shows up in a diff, not that it is impossible to misuse.
  it("silences a genuinely dangling path in a test file, which is the cost it admits", () => {
    const { status } = runOn({
      "apps/web/app/reader.test.ts":
        `// baseline-check: fixture ruleset names\n` + `const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(0);
  });

  it("leaves an unmarked line in a test file checked", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.test.ts":
        `// baseline-check: fixture ruleset names\n` +
        `const ok = ["${MISSING}"];\n` +
        `const p = "rules/${ALSO_MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.test.ts:3 names ${ALSO_MISSING}`);
  });
});

// Every case above is the check letting something bad THROUGH. These are the opposite: the check
// rejecting code that is correct. They are grouped because that direction needs its own attention.
// A gate that blocks correct work gets switched off by whoever it blocks, and the class it was
// built to catch then comes back with the gate disabled, so a false positive is not the mirror
// image of a false negative here. Each one is paired with the true positive nearest to it, because
// the way to make any of these pass is to stop catching something.
describe("round 9: valid code the check used to reject", () => {
  // Scanning raw text AND cooked values meant reporting from both, and the raw pass stopped at the
  // backslash: a literal that IS the published artifact was reported as naming a file that does not
  // exist, and the cooked pass could not retract a finding already made.
  it("accepts an escaped literal that cooks to the published artifact", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const p = "rules/${FIXTURE_RULESET.replace(".json", "\\x2ejson")}";\n`,
    });

    expect(status).toBe(0);
    expect(output).toContain("Ruleset reference check passed");
  });

  // The pair. Judging only the cooked value must not stop an escape from hiding a real one, which
  // is the whole reason cooked values are read at all.
  it("still fails an escaped literal that cooks to a name that is not there", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const p = "rules/${MISSING.replace("v9.9", "v9\\x2e9")}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${MISSING}`);
  });

  // `\\` was excluded from the filename class as an escape lead-in, which is a hazard of RAW source
  // text and not of a cooked value, where a backslash is one ordinary character of the name. The
  // truncation cut both ways: round 8 recorded the false negative, and this suite's own outer
  // literals then hit the false positive. The token runs through it now and is compared whole.
  it("fails a published name with a backslash suffix, which names no file", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const p = "rules/${FIXTURE_RULESET}\\\\backup";\n`,
    });

    expect(status).toBe(1);
    // The WHOLE token, not the published prefix of it, which is the point of the change.
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${FIXTURE_RULESET}\\backup`);
  });

  // A template head is a fragment by construction: its value is continued by the span that follows.
  // Reporting `nyc-rules.v` as a missing file made ordinary dynamic selection fail CI.
  it("accepts a version interpolated into the filename", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": "const p = `rules/" + ["nyc", "rules.v"].join("-") + "${version}.json`;\n",
    });

    expect(status).toBe(0);
    expect(output).toContain("Ruleset reference check passed");
  });

  // The pair, and the reason the rule is written as "ends AT the boundary" rather than "appears in
  // a head": a complete name earlier in the same head is still a complete name.
  it("still fails a complete dangling name earlier in the same template head", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": "const p = `rules/" + MISSING + "/${leaf}`;\n",
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${MISSING}`);
  });

  // A template TAIL is not continued by anything, so a name running to its end is finished and is
  // judged normally. Only the two spans an interpolation is appended to are fragments.
  it("still fails a dangling name in a template tail", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": "const p = `${dir}/" + MISSING + "`;\n",
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${MISSING}`);
  });

  // The cost of the fragment rule, pinned so it is not deniable. A name written immediately before
  // an interpolation is not reported, because the path is that name plus whatever the span
  // evaluates to and this check does not evaluate expressions. That is the documented concatenation
  // gap in template form; the old behaviour looked like coverage only because a fragment happened
  // to be spelled like a whole name.
  it("does not report a name immediately before an interpolation, which is the cost it admits", () => {
    const { status } = runOn({
      "apps/web/app/reader.ts": "const p = `rules/" + MISSING + "${suffix}`;\n",
    });

    expect(status).toBe(0);
  });

  // Four fixes to the pin lookup, three of which closed the shape in the review comment and left
  // the class. The category is wrappers TypeScript ERASES: after compilation the initializer is the
  // same string, so the value read is the value the api compares.
  it.each([
    ["parentheses", `("${FIXTURE_VERSION}")`],
    ["as const", `"${FIXTURE_VERSION}" as const`],
    ["as string", `"${FIXTURE_VERSION}" as string`],
    ["satisfies", `"${FIXTURE_VERSION}" satisfies string`],
    ["a non-null assertion", `"${FIXTURE_VERSION}"!`],
    ["both, nested", `("${FIXTURE_VERSION}" as const)`],
  ])("reads a pin written with %s", (_label, initializer) => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts": `const EXPECTED_RULESET_VERSION = ${initializer};\n`,
    });

    expect(status).toBe(0);
    expect(output).toContain(`pins ${FIXTURE_VERSION}`);
  });

  // The pair. Unwrapping must not lose the disagreement it exists to find.
  it("still fails a wrapped pin that names the wrong version", () => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts": `const EXPECTED_RULESET_VERSION = ("nyc.v9.9") as const;\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain("pins nyc.v9.9");
  });

  // The boundary of that category, and the admission test for anything added to it later. A
  // wrapper that CHANGES the value at runtime means the pin is computed, this check cannot know it,
  // and reporting no pin is the correct answer rather than a false positive.
  it("still reports no pin when the value is computed rather than wrapped", () => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts":
        `const versions = ["${FIXTURE_VERSION}"];\n` +
        `const EXPECTED_RULESET_VERSION = versions[0];\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain("no longer declares EXPECTED_RULESET_VERSION");
  });
});

describe("round 10: the exemption is only for files vitest runs", () => {
  // The property this design was chosen over a directory-shaped alternative to get: claiming the
  // exemption forces a rename into a file the suite EXECUTES, which cannot be done quietly. The
  // predicate was `.test.` anywhere in the basename, which is broader than vitest's include set in
  // two independent ways, so the escape hatch was reachable from exactly where it was advertised as
  // unreachable. Both shapes below are ordinary importable production code.
  it.each([
    ["a suffix vitest does not collect", "apps/web/app/reader.test.helper.ts"],
    ["a tree no include pattern covers", "tools/reader.test.ts"],
  ])("refuses the marker in %s", (_label, path) => {
    const { status, output } = runOn({
      [path]: `// baseline-check: fixture ruleset names\n` + `export const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`${path}:2 names ${MISSING}`);
  });

  // The pair, and the half that makes it an exemption rather than a ban: the files vitest really
  // does collect must still be able to claim it. One per include pattern.
  it.each([
    ["apps/web/app/reader.test.ts"],
    ["apps/web/app/nested/deep/reader.test.tsx"],
    ["apps/api/src/reader.test.ts"],
    ["packages/engine/src/nested/reader.test.ts"],
  ])("still lets %s claim it", (path) => {
    const { status } = runOn({
      [path]: `// baseline-check: fixture ruleset names\n` + `export const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(0);
  });

  // The copy of vitest's include array is the thing that can drift, so the copies are compared
  // directly. Reading the repo rather than a planted tree on purpose: divergence is a fact about
  // the real files. Reading the config at RUNTIME was not an option for the same reason reading
  // `ruleset.ts` was not in round 7 — the planted trees do not contain one.
  it("keeps its copy of vitest's include patterns identical to the real config", () => {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    // Quoted entries between the brackets, NOT a comma split: `{apps,packages}` contains a comma
    // and splitting on it silently produced two half-patterns that happened to compare equal.
    const arrayAfter = (text, declaration) => {
      const opens = new RegExp(`${declaration}\\s*\\[`).exec(text);
      if (opens === null) return [];
      const body = text.slice(opens.index + opens[0].length);
      return [...body.slice(0, body.indexOf("]")).matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    };

    const fromConfig = arrayAfter(readFileSync(join(repo, "vitest.config.ts"), "utf8"), "include:");
    const fromCheck = arrayAfter(
      readFileSync(join(repo, "scripts/check-baseline-drift.mjs"), "utf8"),
      "const VITEST_INCLUDE =",
    );

    expect(fromConfig.length).toBeGreaterThan(0);
    expect(fromCheck).toEqual(fromConfig);
  });
});

describe("round 10: pruning by basename pruned real source", () => {
  // `build` was in a hand-written skip list and is in nobody's .gitignore, so `src/build/` is an
  // ordinary tracked source directory. The walker pruned it by basename at any depth: the file went
  // unscanned, the check exited 0, and the count it printed simply got smaller. A guard that
  // quietly scans less reads exactly like a clean repo.
  it("scans a source directory whose name is not ignored", () => {
    const { status, output } = runOn({
      ".gitignore": "node_modules/\ndist/\n",
      "apps/api/src/build/reader.ts": `export const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/api/src/build/reader.ts:1 names ${MISSING}`);
  });

  // The pair. A tree the repo really does ignore is still pruned, because a gitignored directory
  // cannot hold a committed reference and descending into `node_modules` reports pnpm's symlinked
  // workspace copies beside the real files.
  it.each([["node_modules"], ["dist"]])("still prunes %s, which is ignored", (ignored) => {
    const { status } = runOn({
      ".gitignore": "node_modules/\ndist/\n",
      [`apps/api/src/${ignored}/reader.ts`]: `export const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(0);
  });

  // With no .gitignore the set falls back to the two names that are never source, and the direction
  // is the point: a smaller prune set scans MORE, so a missing file makes this noisier, never
  // quieter. The opposite fallback would be the same silent narrowing by another route.
  it("scans an ignorable-looking directory when nothing declares it ignored", () => {
    const { status, output } = runOn({
      "apps/api/src/dist/reader.ts": `export const p = "rules/${MISSING}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/api/src/dist/reader.ts:1 names ${MISSING}`);
  });
});

describe("round 10: package scripts are executable entry points", () => {
  // A package script is a command CI and developers actually run, so a ruleset path in one breaks
  // on a publication exactly like the `.env` override did, and was invisible for the same reason:
  // not JavaScript source, and not a config format this check knew about.
  it.each([["package.json"], ["apps/api/package.json"], ["packages/engine/package.json"]])(
    "fails on a stale ruleset in %s",
    (manifest) => {
      const { status, output } = runOn({
        [manifest]: JSON.stringify({ name: "x", scripts: { seed: `node seed.mjs rules/${MISSING}` } }, null, 2),
      });

      expect(status).toBe(1);
      expect(output).toContain(`${manifest}:4 names ${MISSING}`);
    },
  );

  // The boundary, and it is the reason this is scoped to one field rather than to JSON. The ruleset
  // artifacts ARE JSON and are full of ruleset names by definition, as are the replay fixtures, so
  // a blanket JSON rule would report the published artifact as a dangling reference to itself.
  it("does not read ruleset names out of the rest of a manifest", () => {
    const { status, output } = runOn({
      "package.json": JSON.stringify(
        { name: "x", description: `supersedes rules/${MISSING}`, scripts: { build: "tsc" } },
        null,
        2,
      ),
    });

    expect(status).toBe(0);
    expect(output).toContain("check passed");
  });

  // A manifest this check cannot read is a manifest it cannot vouch for, the same rule the source
  // scan applies to a file that will not parse.
  it("fails on a manifest it cannot parse rather than passing it unscanned", () => {
    const { status, output } = runOn({ "package.json": "{ not json\n" });

    expect(status).toBe(1);
    expect(output).toContain("could not be parsed");
  });
});

describe("round 11: a bump does not break the guard", () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const NEXT = ruleset("2.9");

  /** The tree as it will look the day v2.9 ships: the new artifact published, the old one gone. */
  const afterTheBump = (files) => {
    const root = plant({ [`rules/${FIXTURE_RULESET}`]: null, ...files });
    roots.push(root);
    mkdirSync(join(root, "rules"), { recursive: true });
    writeFileSync(join(root, "rules", NEXT), JSON.stringify({ ruleset_version: "nyc.v2.9" }));
    writeFileSync(
      join(root, "apps/api/src/ruleset.ts"),
      `const EXPECTED_RULESET_VERSION = "nyc.v2.9";\n`,
    );
    return check(root);
  };

  // THE FINDING, and the reason it is a test rather than a fix to twelve lines. This PR exists
  // because a bump left dangling paths and took main from 957 tests to 542 with 415 silently not
  // running. A guard that then FAILS the next bump, loudly, on files that are correct, is the
  // disabling-pressure case: whoever it blocks switches it off, and the class it was built to catch
  // comes back with the guard disabled.
  //
  // The REAL file is read rather than a paraphrase of it, because a copy proves only that the copy
  // is safe. A fixture name that spells the current version is a fixture that needs editing every
  // bump, which is the maintenance this whole PR exists to end.
  it("passes with the real rules-file.test.ts when the published artifact has moved on", () => {
    const { status, output } = afterTheBump({
      "apps/web/app/rules-file.test.ts": readFileSync(
        join(repo, "apps/web/app/rules-file.test.ts"),
        "utf8",
      ),
    });

    expect(status).toBe(0);
    expect(output).toContain("Ruleset reference check passed");
  });

  // The whole repo, not one file, since any source file may name the version that just went away.
  it("passes with every real source file when the published artifact has moved on", () => {
    const sources = {};
    const collect = (directory) => {
      for (const entry of readdirSync(join(repo, directory), { withFileTypes: true })) {
        const relative = `${directory}/${entry.name}`;
        if (entry.isDirectory()) {
          if (!["node_modules", ".next", "dist", "coverage"].includes(entry.name)) collect(relative);
        } else if (
          // The replay fixtures come too. `engine.test.ts` points at
          // `__fixtures__/nyc-rules.v2.3.json`, which is a superseded ruleset kept so old plans
          // replay and is NOT affected by a bump; leaving it out of the planted tree would fail
          // this test for a reason that has nothing to do with publishing.
          (/\.(ts|tsx)$/.test(entry.name) && !relative.includes("/ruleset.ts")) ||
          relative.includes("/__fixtures__/")
        ) {
          sources[relative] = readFileSync(join(repo, relative), "utf8");
        }
      }
    };
    collect("apps/web/app");
    collect("packages/engine/src");

    const { status, output } = afterTheBump(sources);

    expect(Object.keys(sources).length).toBeGreaterThan(20);
    expect(status).toBe(0);
    expect(output).toContain("Ruleset reference check passed");
  });

  // The pair, and it is what stops the two tests above from being satisfied by a check that has
  // simply stopped looking. A file that really does point at the deleted artifact must still fail
  // after the bump, which is the entire original purpose.
  it("still fails a real path to the artifact the bump deleted", () => {
    const { status, output } = afterTheBump({
      "apps/web/app/reader.ts": `export const p = "rules/${FIXTURE_RULESET}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${FIXTURE_RULESET}`);
  });
});

describe("round 11: cooked values are tokenized as values", () => {
  // Round 9 unified the JS rule on cooked values and kept the class that had served the raw scan.
  // In a cooked value the parser has already resolved the delimiters, so these are ordinary
  // filename characters and the token was truncating to the published prefix: matched exactly,
  // passed, and the runtime opens the whole thing and gets ENOENT. Same family as `.bak` and
  // `?backup`, reached by a route the earlier fixes did not cover.
  it.each([
    ["an opening brace", "{backup"],
    ["a closing brace", "}backup"],
    ["a single quote", "'backup"],
    ['a double quote', '\\"backup'],
    ["a backtick", "`backup"],
  ])("fails a published name with %s in a string literal", (_label, suffix) => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": `const p = "rules/${FIXTURE_RULESET}${suffix}";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${FIXTURE_RULESET}`);
  });

  // The pair, and the reason the two classes are separate rather than merged onto the wider one.
  // In raw config text those characters ARE delimiters: a quoted YAML value ends at its quote, and
  // a name that ran through it would swallow the punctuation and report a file nobody wrote.
  it("still reads a quoted name in a workflow file as ending at its quote", () => {
    const { status, output } = runOn({
      ".github/workflows/ci.yml": `jobs:\n  verify:\n    env:\n      RULES_FILE: "rules/${MISSING}"\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`.github/workflows/ci.yml:4 names ${MISSING}`);
    // The quote is not part of the name, which is what the raw-text class buys.
    expect(output).not.toContain(`${MISSING}"`);
  });

  it("still accepts a quoted published name in a workflow file", () => {
    const { status } = runOn({
      ".github/workflows/ci.yml": `jobs:\n  verify:\n    env:\n      RULES_FILE: "rules/${FIXTURE_RULESET}"\n`,
    });

    expect(status).toBe(0);
  });
});

// One root cause in two scanners. Rounds 9 and 11 moved the JavaScript rule onto values and left
// the package-script and config rules reading bytes, so the same defect class kept arriving by a
// route the previous fix had not covered. The rule they now share: every scanner judges the value a
// runtime would see, and the tokenizer follows the VALUE rather than the file type.
describe("round 12: every scanner judges the value a runtime would see", () => {
  // A package.json is raw bytes and the command inside it is a VALUE, because JSON.parse already
  // decoded it. Handed to the raw-text tokenizer, the token stopped at the brace and validated on
  // the published `.json` prefix while the runtime opens the whole thing.
  it.each([
    ["an opening brace", "{backup"],
    ["a closing brace", "}backup"],
    ["a single quote", "'backup"],
    ["a backtick", "`backup"],
  ])("fails a package script naming a published name with %s", (_label, suffix) => {
    const { status, output } = runOn({
      "package.json": JSON.stringify(
        { name: "x", scripts: { seed: `node seed.mjs rules/${FIXTURE_RULESET}${suffix}` } },
        null,
        2,
      ),
    });

    expect(status).toBe(1);
    expect(output).toContain(`package.json:4 names ${FIXTURE_RULESET}${suffix}`);
  });

  // The pair. A script naming the real artifact is the ordinary case and must stay quiet.
  it("still accepts a package script naming the published artifact", () => {
    const { status, output } = runOn({
      "package.json": JSON.stringify(
        { name: "x", scripts: { seed: `node seed.mjs rules/${FIXTURE_RULESET}` } },
        null,
        2,
      ),
    });

    expect(status).toBe(0);
    expect(output).toContain("check passed");
  });

  // A quoted scalar is decoded by the loader before the process sees it, so the bytes on disk never
  // show the `nyc-rules.` prefix at all. Reading the file whole could not see this one.
  it.each([
    [".github/workflows/ci.yml", (v) => `jobs:\n  verify:\n    env:\n      RULES_FILE: ${v}\n`, 4],
    ["apps/api/.env.example", (v) => `PORT=3001\nRULES_FILE=${v}\n`, 2],
  ])("fails on an escaped ruleset hidden in a quoted scalar in %s", (file, shape, line) => {
    const { status, output } = runOn({ [file]: shape(`"rules/nyc\\x2drules.v9.9.json"`) });

    expect(status).toBe(1);
    expect(output).toContain(`${file}:${line} names ${MISSING}`);
  });

  // Same escape, resolving to the artifact that IS there. Decoding must find the real name too, not
  // only report on everything it decodes.
  it("accepts an escaped quoted scalar that decodes to the published artifact", () => {
    const { status, output } = runOn({
      "apps/api/.env.example": `RULES_FILE="rules/nyc\\x2drules.v0.0.json"\n`,
    });

    expect(status).toBe(0);
    expect(output).toContain("check passed");
  });

  // A single-quoted scalar is literal in both formats, so it is NOT decoded. The quotes still come
  // off, which is what makes a brace inside one an ordinary filename character.
  it("does not decode escapes inside a single-quoted scalar", () => {
    const { status } = runOn({
      "apps/api/.env.example": `RULES_FILE='rules/nyc\\x2drules.v9.9.json'\n`,
    });

    // The value contains a literal backslash and no `nyc-rules.` prefix, so there is nothing to
    // find. Decoding it would invent a name the loader never produces.
    expect(status).toBe(0);
  });

  // The pair for the segmentation itself. Outside a quoted scalar the text really is raw, and the
  // exclusions that belong there have to keep applying.
  it("still reads an unquoted stale ruleset in a workflow file", () => {
    const { status, output } = runOn({
      ".github/workflows/ci.yml": `jobs:\n  verify:\n    env:\n      RULES_FILE: rules/${MISSING}\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain(`.github/workflows/ci.yml:4 names ${MISSING}`);
  });
});

describe("round 12: a tagged template's value is the tag's to decide", () => {
  // The one place "judge the cooked value" is wrong. The parser cooks `\x2e` to `.`, producing the
  // published name, which exists; `String.raw` returns the raw text and the runtime opens a file
  // that is not there.
  it("fails String.raw whose raw value names a file that is not there", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts":
        "const p = readFileSync(String.raw`rules/" +
        FIXTURE_RULESET.replace(".json", "\\x2ejson") +
        "`);\n",
    });

    expect(status).toBe(1);
    expect(output).toContain("apps/web/app/reader.ts:1 names");
  });

  // The pair, and the reason String.raw is recognised rather than lumped in with the unknown tags:
  // its cooked text must NOT be judged, or an escape that cooks into the published name would be
  // reported as missing.
  it("still accepts String.raw whose raw value is the published artifact", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": "const p = readFileSync(String.raw`rules/" + FIXTURE_RULESET + "`);\n",
    });

    expect(status).toBe(0);
    expect(output).toContain("check passed");
  });

  // An unrecognised tag is an arbitrary function, so neither candidate is authoritative and both
  // must resolve. Here the cooked value is the published artifact and the raw value is not.
  it("fails an unknown tag when only one of its candidate values resolves", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts":
        "const p = dedent`rules/" + FIXTURE_RULESET.replace(".json", "\\x2ejson") + "`;\n",
    });

    expect(status).toBe(1);
    expect(output).toContain("apps/web/app/reader.ts:1 names");
  });

  // The pair, and the reason holding both candidates is not a blanket false positive: with no
  // escape the raw and cooked forms are identical, so this is one judgement, which is what almost
  // every tagged template in real code looks like.
  it("still accepts an unknown tag naming the published artifact", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": "const p = dedent`rules/" + FIXTURE_RULESET + "`;\n",
    });

    expect(status).toBe(0);
    expect(output).toContain("check passed");
  });

  // A plain string inside an interpolation is the tag's ARGUMENT, not its template text, so it is
  // judged as the ordinary cooked value it is. Walking up from any literal to a tagged template
  // would have swept this in.
  it("treats a string inside a tagged interpolation as an ordinary literal", () => {
    const { status, output } = runOn({
      "apps/web/app/reader.ts": 'const p = dedent`x${"rules/' + MISSING + '"}y`;\n',
    });

    expect(status).toBe(1);
    expect(output).toContain(`apps/web/app/reader.ts:1 names ${MISSING}`);
  });
});
