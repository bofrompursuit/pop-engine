// The fixture suite and the published ruleset must agree about which rules each scenario reaches.
//
// Every regulatory defect closed this week was one artifact disagreeing with another while nothing
// compared them. The answer key names the rules each scenario is expected to produce; the ruleset
// decides which rules an intake actually reaches; and until now only a human reading both could
// tell when they diverged. This evaluates every published trigger against each scenario's intake
// and compares the result to what the key lists.
//
// It uses the engine's real evaluation, not a reimplementation of trigger matching. That matters:
// a version of this check that skipped `asked_when` scoping reported the SAPO rules as conditional
// in Scenario B purely because `obstructs_public_way` is never asked at a private venue. Reading
// the trace the engine already produces means this check can only ever agree with the engine.
//
// Known disagreements are allowlisted with the issue that owns them, in the shape
// finding-kinds.test.ts uses: a recorded disagreement stays visible and attributed, and a NEW one
// fails. Nothing here edits a fixture or a rule to make the comparison pass — that would be the
// engine bending to a broken expectation, which the authority order forbids.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluate, parseEngineRuleset } from "./index";
import type { EventIntake, HolidayCalendar } from "./types";
import {
  FIXTURE_TODAY,
  SCENARIO_INTAKE_FIXTURES,
  fixtureSubmission,
} from "./intake/scenario-intake-fixtures";

const repoFile = (relativePath: string): string =>
  fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url));

const publishedRuleset: {
  rules: { id: string; exercised_by_scenarios?: string[] }[];
  advisories: { id: string; exercised_by_scenarios?: string[] }[];
} = JSON.parse(readFileSync(repoFile("rules/nyc-rules.v2.3.json"), "utf8"));

const ruleset = parseEngineRuleset(publishedRuleset);
const answerKey = readFileSync(repoFile("docs/test-scenario-answer-key.md"), "utf8");
const calendar: HolidayCalendar = { id: ruleset.calendarId, holidays: [] };

/**
 * A published rule id: uppercase segments ending in a three-digit suffix. Deliberately narrow so
 * prose in the key (section references, dollar amounts, code citations) cannot be mistaken for one.
 */
const RULE_ID = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}\b/g;

/**
 * The rule ids the key lists under a scenario's "Expected findings".
 *
 * Scoped to that block on purpose. Scenario D's fixture-guard note names
 * SAPO-BLOCK-PARTY-ELIG-001 while saying it belongs to a separate unit fixture, so reading the
 * whole section would import an id the scenario explicitly does not expect.
 */
function expectedRuleIds(scenario: string): string[] {
  const section = answerKey
    .split(/^## Scenario /m)
    .find((candidate) => candidate.startsWith(`${scenario} `));
  if (section === undefined) throw new Error(`answer key has no Scenario ${scenario} section`);
  const findings = section.split("**Expected findings:**")[1]?.split("**EXPECTED VERDICT")[0];
  if (findings === undefined)
    throw new Error(`Scenario ${scenario} has no expected-findings block`);
  return [...new Set(findings.match(RULE_ID) ?? [])];
}

type Reached = { fired: string[]; conditional: string[] };

function reachedIn(scenario: string): Reached {
  const fixture = SCENARIO_INTAKE_FIXTURES.find((entry) => entry.scenario === scenario);
  if (fixture === undefined) throw new Error(`no intake fixture for Scenario ${scenario}`);
  const plan = evaluate(
    fixtureSubmission(fixture) as EventIntake,
    ruleset,
    FIXTURE_TODAY,
    calendar,
  );
  return {
    fired: plan.verdictDetail.trace.filter((entry) => entry.result === "true").map((e) => e.ruleId),
    conditional: plan.verdictDetail.trace
      .filter((entry) => entry.result === "unknown")
      .map((entry) => entry.ruleId),
  };
}

/**
 * Disagreements that exist today between two approved artifacts. Each is a decision someone owns,
 * not something a test may resolve: changing either side is a rules-owner or team change.
 */
const KNOWN_DISAGREEMENTS: readonly {
  scenarios: readonly string[];
  ruleId: string;
  kind: "fires-but-key-omits" | "claims-scenario-it-cannot-reach" | "reaches-scenario-it-omits";
  issue: string;
}[] = [
  {
    scenarios: ["F"],
    ruleId: "ADV-VENUE-OCCUPANCY-001",
    kind: "fires-but-key-omits",
    issue:
      "#89 item 5: the advisory triggers on location_type = private_venue alone, so it fires in F, " +
      "and it names F in its own exercised_by_scenarios — but F's expected findings omit it. " +
      "Whether the key gains the line or the rule narrows is an open product decision.",
  },
  {
    scenarios: ["B"],
    ruleId: "DOHMH-EXEMPTION-001",
    kind: "claims-scenario-it-cannot-reach",
    issue:
      "#89: the rule lists B in exercised_by_scenarios, but B's event_open_to_public = yes and the " +
      "trigger needs no/unknown, so it cannot fire there. Stale metadata on a published rule.",
  },
  {
    scenarios: ["F"],
    ruleId: "DOHMH-EXEMPTION-001",
    kind: "reaches-scenario-it-omits",
    issue:
      "#89: the same rule fires in F (invite-only, catered) and does not list F. Its scenario " +
      "metadata is wrong in both directions — it names the one scenario it cannot reach and omits " +
      "the one it does.",
  },
  {
    scenarios: ["B"],
    ruleId: "DOHMH-ORGANIZER-NOTIFY-001",
    kind: "reaches-scenario-it-omits",
    issue:
      "#89: the rule fires in B and B's expected findings list it, but its exercised_by_scenarios " +
      "names only A and E.",
  },
  {
    scenarios: ["E"],
    ruleId: "DOB-TALL-STRUCTURE-001",
    kind: "reaches-scenario-it-omits",
    issue:
      "#89: the rule is conditional in E — structure_over_10ft_tall is unknown there — and E's " +
      "expected findings name it inside item 8, but its exercised_by_scenarios is empty. Found by " +
      "widening the reverse check from fired to reached.",
  },
  {
    scenarios: ["A", "B", "C", "D", "F"],
    ruleId: "FDNY-GENERATOR-001",
    kind: "reaches-scenario-it-omits",
    issue:
      "#88: not a rule defect. The shared intake fixtures never answer battery_system_kwh, which " +
      "the registry asks unconditionally and allows to be blank, so the battery arm of this " +
      "rule's `any` trigger is unknown in every scenario and the rule is conditional throughout. " +
      'The answer key states a battery answer only for E ("battery none"). Filling the blank ' +
      "would invent an answer the key does not state for the other five, which is the same " +
      "conflict class already recorded for Scenario F's food_vendor_count.",
  },
];

const isKnown = (scenario: string, ruleId: string, kind: string): boolean =>
  KNOWN_DISAGREEMENTS.some(
    (entry) => entry.scenarios.includes(scenario) && entry.ruleId === ruleId && entry.kind === kind,
  );

/**
 * Rules a scenario reaches whose `exercised_by_scenarios` omits it.
 *
 * Reached, not fired. A rule a scenario only reaches through a material unknown is still exercised
 * by it — it appears in the plan as a conditional finding — so checking only the rules that fired
 * let a conditional-only rule lose its metadata silently. Pure so the case can be tested directly
 * rather than waiting for the published ruleset to grow one.
 */
export function metadataOmissions(
  scenario: string,
  reached: readonly string[],
  claims: ReadonlyMap<string, readonly string[]>,
): string[] {
  return reached.filter((ruleId) => !(claims.get(ruleId) ?? []).includes(scenario));
}

const scenarios = SCENARIO_INTAKE_FIXTURES.map((fixture) => fixture.scenario);

describe("the fixture suite and the published ruleset agree", () => {
  it("reads a rule id out of every scenario's expected findings", () => {
    // Guards the scrape itself: a reformat of the key that stopped matching would otherwise turn
    // this whole file into a no-op that still reports green.
    for (const scenario of scenarios) {
      expect(
        expectedRuleIds(scenario).length,
        `Scenario ${scenario} expected findings`,
      ).toBeGreaterThan(0);
    }
    expect(expectedRuleIds("A")).toContain("SAPO-STREET-LARGE-001");
    // Scoped to the expected-findings block, so D's separate-unit-fixture note stays out.
    expect(expectedRuleIds("D")).not.toContain("SAPO-BLOCK-PARTY-ELIG-001");
  });

  it.each(scenarios)("Scenario %s fires nothing the answer key omits", (scenario) => {
    const expected = expectedRuleIds(scenario);
    const unlisted = reachedIn(scenario)
      .fired.filter((ruleId) => !expected.includes(ruleId))
      .filter((ruleId) => !isKnown(scenario, ruleId, "fires-but-key-omits"));
    expect(
      unlisted,
      `rules that fire in ${scenario} but are absent from its expected findings`,
    ).toEqual([]);
  });

  it.each(scenarios)("Scenario %s reaches everything the answer key lists", (scenario) => {
    // A listed rule may be conditional rather than firing — the key lists the DOB structure rules
    // in E precisely because they are unresolved — but it may not be inert.
    const { fired, conditional } = reachedIn(scenario);
    const inert = expectedRuleIds(scenario).filter(
      (ruleId) => !fired.includes(ruleId) && !conditional.includes(ruleId),
    );
    expect(inert, `rules the key lists for ${scenario} that no intake answer reaches`).toEqual([]);
  });

  it.each(scenarios)("Scenario %s agrees with exercised_by_scenarios", (scenario) => {
    const { fired, conditional } = reachedIn(scenario);
    const reached = new Set([...fired, ...conditional]);
    const claims = new Map(
      [...publishedRuleset.rules, ...publishedRuleset.advisories].map((rule) => [
        rule.id,
        rule.exercised_by_scenarios ?? [],
      ]),
    );

    const claimsButCannotReach = [...claims]
      .filter(([ruleId, listed]) => listed.includes(scenario) && !reached.has(ruleId))
      .map(([ruleId]) => ruleId)
      .filter((ruleId) => !isKnown(scenario, ruleId, "claims-scenario-it-cannot-reach"));
    expect(claimsButCannotReach, `rules claiming ${scenario} that it never reaches`).toEqual([]);

    const reachesButOmits = metadataOmissions(scenario, [...reached], claims).filter(
      (ruleId) => !isKnown(scenario, ruleId, "reaches-scenario-it-omits"),
    );
    expect(
      reachesButOmits,
      `rules ${scenario} reaches, fired or conditional, whose exercised_by_scenarios omits it`,
    ).toEqual([]);
  });

  it("catches a rule a scenario reaches only conditionally", () => {
    // The check this replaces looked at fired alone, so a rule reached only through a material
    // unknown could lose its scenario from exercised_by_scenarios and stay green. That is the
    // check that caught DOHMH-EXEMPTION-001 being wrong in both directions, so it is worth
    // pinning against synthetic input rather than waiting for the ruleset to grow another case.
    const claims = new Map<string, readonly string[]>([
      ["FIRES-001", ["X"]],
      ["CONDITIONAL-001", []],
      ["DOCUMENTED-001", ["X"]],
    ]);

    expect(metadataOmissions("X", ["FIRES-001", "DOCUMENTED-001"], claims)).toEqual([]);
    // reached-but-not-fired, and its metadata does not name the scenario
    expect(metadataOmissions("X", ["FIRES-001", "CONDITIONAL-001"], claims)).toEqual([
      "CONDITIONAL-001",
    ]);
    // a rule with no metadata at all is an omission, not an exemption
    expect(metadataOmissions("X", ["UNKNOWN-001"], claims)).toEqual(["UNKNOWN-001"]);
  });

  it("keeps the allowlist honest: every recorded disagreement still exists", () => {
    // The mirror of the checks above. Once a disagreement is resolved its entry must go, or the
    // list becomes a place where a real finding can hide behind an issue number.
    for (const entry of KNOWN_DISAGREEMENTS) {
      for (const scenario of entry.scenarios) {
        const { fired, conditional } = reachedIn(scenario);
        const reached = new Set([...fired, ...conditional]);
        const claims =
          [...publishedRuleset.rules, ...publishedRuleset.advisories].find(
            (rule) => rule.id === entry.ruleId,
          )?.exercised_by_scenarios ?? [];

        const stillDisagrees =
          entry.kind === "fires-but-key-omits"
            ? fired.includes(entry.ruleId) && !expectedRuleIds(scenario).includes(entry.ruleId)
            : entry.kind === "claims-scenario-it-cannot-reach"
              ? claims.includes(scenario) && !reached.has(entry.ruleId)
              : reached.has(entry.ruleId) && !claims.includes(scenario);

        expect(
          stillDisagrees,
          `${entry.ruleId} / Scenario ${scenario} no longer disagrees — remove its allowlist entry`,
        ).toBe(true);
      }
    }
  });

  it("cites an owning issue for every recorded disagreement", () => {
    for (const entry of KNOWN_DISAGREEMENTS) {
      expect(entry.issue, `${entry.ruleId} in ${entry.scenarios.join(", ")}`).toMatch(/#\d+/);
      expect(entry.scenarios.length, `${entry.ruleId} covers no scenario`).toBeGreaterThan(0);
    }
  });
});
