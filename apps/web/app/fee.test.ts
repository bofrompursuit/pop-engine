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

/** Every kind a finding can persist as; `classification` is a rule role only (#73). */
const FINDING_KINDS: readonly FindingKind[] = [
  "permit",
  "insurance",
  "notification",
  "registration",
  "eligibility",
  "prohibition",
  "dependency",
  "advisory",
  "note",
];

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

  it("claims a fee for exactly the kinds the artifact is evidenced to charge for", () => {
    // The invariant itself, rather than a list retyped from the module: a kind may be spoken for
    // only where some rule of that kind publishes an amount, which is what shows the kind is
    // charged for at all. Stating it as an equality means the set cannot drift from the evidence in
    // either direction — a kind added without a published instance fails here just as loudly as a
    // charging kind left out.
    const chargingKinds = new Set(published.filter(publishesAnAmount).map(findingKindOf));

    expect([...chargingKinds].sort()).toEqual(["insurance", "permit"]);
    for (const kind of FINDING_KINDS) expect(isFeeBearing(kind)).toBe(chargingKinds.has(kind));
  });

  it("makes no claim for a filing kind the artifact has never been seen to charge for", () => {
    // `notification` and `registration` ARE filings an organizer submits, and that was the reasoning
    // that first put them in the set. Being a filing does not establish that it is charged for:
    // DOHMH-ORGANIZER-NOTIFY-001 and DEP-GENERATOR-REG-001 are the only rules of those kinds and
    // neither publishes an amount, so "fee not published" would assert both that a price exists and
    // that it was withheld, on nothing. Omitting the row asserts neither.
    for (const kind of ["notification", "registration"] as const) {
      expect(isFeeBearing(kind)).toBe(false);

      const rules = published.filter((rule) => findingKindOf(rule) === kind);
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.filter(publishesAnAmount)).toEqual([]);
    }
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
