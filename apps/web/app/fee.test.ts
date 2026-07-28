import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FindingKind } from "@pop-engine/engine";
import { isFeeBearing } from "./fee";
import { publishedRulesFileIn } from "./rules-file";

// Holds `fee.ts`'s claim against the artifact itself rather than against a list retyped here. The
// file is resolved through `publishedRulesFileIn` for the same reason every other test does: naming
// the ruleset file literally is what `check:baseline` exists to catch.
const artifact: {
  rules: PublishedRule[];
  advisories: PublishedRule[];
} = JSON.parse(readFileSync(resolve(publishedRulesFileIn("rules")), "utf8"));

type PublishedRule = {
  id: string;
  kind: string;
  output: { fee?: { display?: string } | null };
};

/** The mapping `findings.ts` applies: a classification rule persists as a note finding (#73). */
const findingKindOf = (rule: PublishedRule): FindingKind =>
  (rule.kind === "classification" ? "note" : rule.kind) as FindingKind;

const published = [...artifact.rules, ...artifact.advisories];
const publishesAnAmount = (rule: PublishedRule): boolean =>
  rule.output.fee !== undefined && rule.output.fee !== null;

describe("which findings can be said to have an unpublished fee", () => {
  it("suppresses the claim for no rule that publishes an amount", () => {
    // The direction that would lose information: a kind excluded from the fee-bearing set while
    // some rule of that kind does publish a fee. The renderers guard this a second way, by printing
    // any non-null `feeDisplay` whatever the kind, but the set itself should not need that guard.
    const suppressed = published
      .filter(publishesAnAmount)
      .filter((rule) => !isFeeBearing(findingKindOf(rule)))
      .map((rule) => rule.id);

    expect(suppressed).toEqual([]);
  });

  it("covers every kind the artifact ever charges for", () => {
    const chargingKinds = new Set(published.filter(publishesAnAmount).map(findingKindOf));

    // v2.8 publishes an amount on `permit` and `insurance` rules only, so this is what the artifact
    // can prove. `notification` and `registration` are in the set on the semantic ground that they
    // are filings an organizer submits; both publish an explicit null fee, which the parser cannot
    // tell from an absent one, so nothing in the artifact settles them either way.
    expect([...chargingKinds].sort()).toEqual(["insurance", "permit"]);
    for (const kind of chargingKinds) expect(isFeeBearing(kind)).toBe(true);
  });

  it("makes no claim for any kind that describes a condition rather than a filing", () => {
    // The three shapes the rendered line was wrong about, plus the other two of their class.
    for (const kind of ["advisory", "note", "eligibility", "prohibition", "dependency"] as const) {
      expect(isFeeBearing(kind)).toBe(false);
    }

    // And none of them publishes a fee, so refusing to speak for them withholds nothing.
    const withAFee = published
      .filter((rule) => !isFeeBearing(findingKindOf(rule)))
      .filter(publishesAnAmount);
    expect(withAFee).toEqual([]);
  });
});
