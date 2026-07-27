// Where the published ruleset is, found rather than named.
//
// WHY THIS EXISTS. `rules/nyc-rules.v2.8.json` was spelled out in four places in this app — the
// intake page's production read, two suites that read it at module scope, and one that pointed
// `RULES_FILE` at it. A version bump deletes the file every one of those names, and the two
// module-scope reads fail during IMPORT, so vitest reports "no tests" for those files rather than a
// red assertion. That is how #128 took main down unnoticed: a suite that stops existing looks like
// a suite that passes. Writing the next version in instead only moves the landmine, because a bump
// structurally cannot find references that did not exist when it ran.
//
// The directory takes an argument rather than being fixed, because the two callers legitimately
// resolve from different bases: the Next app runs with its own directory as the working directory,
// and vitest runs from the repo root.

import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Published rulesets are `nyc-rules.v<version>.json`; `rules/proposals/` is drafts and excluded. */
const PUBLISHED_RULESET = /^nyc-rules\.v.+\.json$/;

/**
 * The one published ruleset in `rulesDirectory`.
 *
 * Exactly one is expected. Zero and two both throw naming what was actually found, because
 * silently picking one of two rulesets is worse than stopping: every permit fact on screen would
 * come from an artifact nobody chose, and the page would look entirely normal doing it.
 */
export function publishedRulesFileIn(rulesDirectory: string): string {
  const published = readdirSync(rulesDirectory).filter((entry) => PUBLISHED_RULESET.test(entry));
  if (published.length !== 1) {
    throw new Error(
      `expected exactly one published ruleset in ${rulesDirectory}, found ${published.length}` +
        (published.length === 0 ? "" : `: ${published.join(", ")}`),
    );
  }
  return join(rulesDirectory, published[0] as string);
}
