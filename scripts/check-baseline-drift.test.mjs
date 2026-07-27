import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  it("passes a filename that ends an English sentence inside a string", () => {
    // The trailing period is punctuation, not part of the name.
    const { status } = runOn({
      "apps/web/app/reader.ts": `const note = "Read from ${FIXTURE_RULESET}.";\n`,
    });

    expect(status).toBe(0);
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

describe("the version pin", () => {
  it("fails when the artifact moved and the pin did not", () => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts": `const EXPECTED_RULESET_VERSION = "nyc.v9.9";\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain("pins EXPECTED_RULESET_VERSION nyc.v9.9");
    expect(output).toContain(`${FIXTURE_RULESET} publishes ${FIXTURE_VERSION}`);
  });

  it("fails when the one constant allowed to name a version is gone", () => {
    const { status, output } = runOn({
      "apps/api/src/ruleset.ts": `export const somethingElse = 1;\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain("no longer declares EXPECTED_RULESET_VERSION");
  });
});
