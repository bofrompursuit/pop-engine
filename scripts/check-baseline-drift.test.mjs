import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
