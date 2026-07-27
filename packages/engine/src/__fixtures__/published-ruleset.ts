// The published ruleset's path, found rather than named, for the suites that evaluate against the
// real artifact.
//
// WHY THIS EXISTS. Four engine suites used to hard-code `rules/nyc-rules.v2.8.json`, and each read
// it at MODULE SCOPE. A version bump deletes the file the old name points at, so the read throws
// during import and the whole file fails to collect: vitest reports "no tests" for it rather than a
// red assertion. That is how #128 took main down without anyone noticing — a suite that stops
// existing looks a lot like a suite that passes. Naming the next version instead only moves the
// landmine, because a bump structurally cannot find references that did not exist when it ran.
//
// Resolved relative to THIS file rather than to each caller, so a suite's own depth in the tree is
// not a thing that can be wrong: `intake/intake.test.ts` and `engine.test.ts` sit at different
// depths and previously spelled their own `../../../` prefixes.
//
// This is test support and deliberately NOT exported from the package. `packages/engine` reads no
// files at runtime — `parseEngineRuleset` takes a document, which is what makes AD-7 replay work
// from a lineage commit — and that stays true.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Published rulesets are `nyc-rules.v<version>.json`; `rules/proposals/` is drafts and excluded. */
const PUBLISHED_RULESET = /^nyc-rules\.v.+\.json$/;

const RULES_DIRECTORY = fileURLToPath(new URL("../../../../rules/", import.meta.url));

/**
 * The one published ruleset in `rules/`.
 *
 * Exactly one is expected. Zero and two both throw with what was actually found, because a fixture
 * that silently picks one of two rulesets is worse than one that stops: the suite would go green
 * against an artifact nobody chose. Failing loudly here is the whole point of the change — a bump
 * that breaks this gets an error naming the directory contents, not an empty test file.
 */
function publishedRulesFile(): string {
  const published = readdirSync(RULES_DIRECTORY).filter((entry) => PUBLISHED_RULESET.test(entry));
  if (published.length !== 1) {
    throw new Error(
      `expected exactly one published ruleset in ${RULES_DIRECTORY}, found ${published.length}` +
        (published.length === 0 ? "" : `: ${published.join(", ")}`),
    );
  }
  return `${RULES_DIRECTORY}${published[0] as string}`;
}

export const PUBLISHED_RULES_FILE = publishedRulesFile();
