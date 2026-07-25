// Engine behaviors the scenario fixtures do not reach: determinism, dedupe merging, the
// tri-state rules, business-day arithmetic, and every way evaluation can fail loudly.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  countBusinessDays,
  differenceInCalendarDays,
  evaluate,
  parseEngineRuleset,
  subtractBusinessDays,
  triggerFields,
  EvaluationError,
} from "./index";
import type { EventIntake, HolidayCalendar, PublishedHolidayCalendar } from "./types";

const TODAY = "2026-07-22";
const rawRuleset: Record<string, unknown> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../rules/nyc-rules.v2.2.json", import.meta.url)),
    "utf8",
  ),
);
const ruleset = parseEngineRuleset(rawRuleset);
const calendar: PublishedHolidayCalendar = { id: ruleset.calendarId, holidays: [] };

const parkIntake: EventIntake = {
  borough: "brooklyn",
  location_type: "park",
  headcount: 150,
  event_date: "2026-09-16",
  event_open_to_public: "yes",
  food_present: false,
  selling_anything: false,
  amplified_sound: true,
  structure_types: ["none"],
  open_flame_or_cooking: ["none"],
  generator_present: false,
  battery_system_kwh: 0,
  alcohol: false,
};

/** A two-rule ruleset in the published shape, for behaviors nyc.v2.2 does not exercise. */
function syntheticRuleset(rules: unknown[]): ReturnType<typeof parseEngineRuleset> {
  return parseEngineRuleset({
    ruleset_version: "test.v1",
    jurisdiction: "US-NY-NYC",
    snapshot_date: "2026-07-22",
    config: {
      slack_warning_days: { value: 14 },
      business_day_math: { calendar: "test-calendar@2026" },
    },
    intake_fields: [
      { field: "event_date", type: "date" },
      { field: "headcount", type: "integer" },
      { field: "structure_types", type: "multi_enum", values: ["tent_canopy", "none"] },
    ],
    rules,
    advisories: [],
  });
}

const dedupeRule = (id: string, citation: string) => ({
  id,
  kind: "permit",
  trigger: { all: [{ field: "headcount", op: "gte", value: 10 }] },
  output: { permit_name: `${id} permit`, agency: "DOB", dedupe_key: "dob-structure" },
  verification: { status: "SOURCE_CONFIRMED" },
  source: { citation, urls: [`https://example.test/${id}`] },
});

describe("determinism (AC 3)", () => {
  it("produces a byte-identical plan for the same revision, ruleset, today, and calendar", () => {
    const first = JSON.stringify(evaluate(parkIntake, ruleset, TODAY, calendar));
    const second = JSON.stringify(evaluate(parkIntake, ruleset, TODAY, calendar));
    expect(first).toBe(second);
  });

  it("is insensitive to the order the intake keys arrive in", () => {
    const reordered = Object.fromEntries(Object.entries(parkIntake).reverse()) as EventIntake;
    expect(JSON.stringify(evaluate(reordered, ruleset, TODAY, calendar))).toBe(
      JSON.stringify(evaluate(parkIntake, ruleset, TODAY, calendar)),
    );
  });

  it("moves with `today`, which is a parameter and never the system clock", () => {
    // Same intake, same ruleset: only the clock moved, past the Parks 21-day floor.
    const later = evaluate(parkIntake, ruleset, "2026-09-01", calendar);
    expect(later.today).toBe("2026-09-01");
    expect(later.verdict).toBe("INFEASIBLE");
    expect(evaluate(parkIntake, ruleset, TODAY, calendar).verdict).toBe("FEASIBLE");
  });
});

describe("provenance (AC 1)", () => {
  it("records the intake answers that triggered each finding", () => {
    const sound = evaluate(parkIntake, ruleset, TODAY, calendar).findings.find((finding) =>
      finding.ruleIds.includes("NYPD-SOUND-001"),
    );
    expect(sound?.triggeredBy).toEqual([
      { field: "amplified_sound", value: true },
      { field: "location_type", value: "park" },
    ]);
  });

  it("attaches a tri-state trace for every published rule", () => {
    const plan = evaluate(parkIntake, ruleset, TODAY, calendar);
    expect(plan.verdictDetail.trace).toHaveLength(ruleset.rules.length);
    expect(
      plan.verdictDetail.trace.find((entry) => entry.ruleId === "PARKS-EVENT-001")?.result,
    ).toBe("true");
    expect(plan.verdictDetail.trace.find((entry) => entry.ruleId === "PARKS-TUA-001")?.result).toBe(
      "false",
    );
  });

  it("merges findings that share a dedupe key, retaining every rule id and source", () => {
    const merged = evaluate(
      { event_date: "2026-12-04", headcount: 50, structure_types: ["none"] },
      syntheticRuleset([dedupeRule("RULE-A", "citation A"), dedupeRule("RULE-B", "citation B")]),
      TODAY,
      { id: "test-calendar@2026", holidays: [] },
    );
    expect(merged.findings).toHaveLength(1);
    expect(merged.findings[0]?.ruleIds).toEqual(["RULE-A", "RULE-B"]);
    expect(merged.findings[0]?.sources.map((source) => source.citation)).toEqual([
      "citation A",
      "citation B",
    ]);
  });
});

describe("tri-state evaluation", () => {
  const structureIntake: EventIntake = {
    ...parkIntake,
    structure_types: ["tent_canopy"],
    tent_days_in_place: 1,
    structure_over_10ft_tall: "no",
  };

  it("treats an unanswered numeric on a selected structure as unknown, not false", () => {
    const tent = evaluate(
      { ...structureIntake, tent_area_sqft: null },
      ruleset,
      TODAY,
      calendar,
    ).findings.find((finding) => finding.ruleIds.includes("DOB-TENT-001"));
    expect(tent?.disposition).toBe("may_be_required");
  });

  it("does not make a field the registry never asked into a material unknown", () => {
    // tent_area_sqft is asked only when a tent is selected; with no tent it stays silent.
    const plan = evaluate({ ...parkIntake, tent_area_sqft: null }, ruleset, TODAY, calendar);
    expect(plan.findings.flatMap((finding) => finding.ruleIds)).not.toContain("DOB-TENT-001");
    expect(plan.verdict).toBe("FEASIBLE");
  });

  it("treats `unknown` as an answer for a rule that lists it among accepted values", () => {
    const plan = evaluate(
      {
        ...parkIntake,
        location_type: "private_venue",
        headcount: 40,
        amplified_sound: true,
        sound_audible_from_public_way: "unknown",
      },
      ruleset,
      TODAY,
      calendar,
    );
    const noiseAdvisory = plan.findings.find((finding) =>
      finding.ruleIds.includes("ADV-NOISE-CODE-001"),
    );
    expect(noiseAdvisory?.disposition).toBe("advisory");
  });

  it("records only the answers that decided a settled `any` trigger", () => {
    // FDNY-GENERATOR-001 is any(gasoline > 2.5, diesel > 10, battery > 20). Gasoline alone
    // settles it; the unanswered diesel amount did not trigger anything and must not be
    // recorded as if it had (AC 1).
    const plan = evaluate(
      {
        ...parkIntake,
        generator_present: true,
        generator_gasoline_gallons: 5,
        generator_diesel_gallons: null,
        generator_kw: 0,
      },
      ruleset,
      TODAY,
      calendar,
    );
    const generator = plan.findings.find((finding) =>
      finding.ruleIds.includes("FDNY-GENERATOR-001"),
    );
    expect(generator?.triggeredBy).toEqual([{ field: "generator_gasoline_gallons", value: 5 }]);
  });

  it("keeps every contribution when an `any` trigger is not settled", () => {
    // No decisive child: gasoline is under the threshold and diesel is unanswered, so the finding
    // is conditional and both answers are part of why.
    const plan = evaluate(
      {
        ...parkIntake,
        generator_present: true,
        generator_gasoline_gallons: 1,
        generator_diesel_gallons: null,
        generator_kw: 0,
      },
      ruleset,
      TODAY,
      calendar,
    );
    const generator = plan.findings.find((finding) =>
      finding.ruleIds.includes("FDNY-GENERATOR-001"),
    );
    expect(generator?.disposition).toBe("may_be_required");
    expect(generator?.triggeredBy).toEqual([{ field: "generator_diesel_gallons", value: null }]);
  });

  it("reads the ruleset's trigger fields for provenance tooling", () => {
    const rule = ruleset.rules.find((entry) => entry.id === "NYPD-SOUND-001");
    expect(triggerFields(rule?.trigger ?? { all: [] })).toEqual([
      "amplified_sound",
      "location_type",
      "amplified_sound",
      "location_type",
      "sound_audible_from_public_way",
    ]);
  });
});

describe("typed deadlines", () => {
  it("renders the Parks processing band as at-risk once the runway is shorter than processing", () => {
    // 25 days out: the 21-day hard floor still clears, but 21–30 days of processing may not.
    const plan = evaluate({ ...parkIntake, event_date: "2026-08-16" }, ruleset, TODAY, calendar);
    const parks = plan.findings.find((finding) => finding.ruleIds.includes("PARKS-EVENT-001"));
    expect(parks?.deadlineStatus).toBe("deadline_approaching");
    expect(plan.verdict).toBe("FEASIBLE_AT_RISK");
  });

  it("treats the Parks hard floor as a cliff on the day it closes", () => {
    const plan = evaluate({ ...parkIntake, event_date: "2026-08-12" }, ruleset, TODAY, calendar);
    const parks = plan.findings.find((finding) => finding.ruleIds.includes("PARKS-EVENT-001"));
    expect(parks?.deadlineStatus).toBe("published_deadline_missed");
    expect(plan.verdict).toBe("INFEASIBLE");
  });

  const unknownLevelPlaza: EventIntake = {
    ...parkIntake,
    location_type: "plaza",
    obstructs_public_way: "yes",
    sapo_event_type: "plaza_event",
    plaza_level: "unknown",
    plaza_multiple_blocks: false,
    amplified_sound: false,
  };

  it("lists the published plaza range instead of guessing when the level is unknown", () => {
    const plan = evaluate(unknownLevelPlaza, ruleset, TODAY, calendar);
    const plaza = plan.findings.find((finding) => finding.ruleIds.includes("SAPO-PLAZA-001"));
    expect(plaza?.latestApplyDate).toBeNull();
    expect(plaza?.deadlineStatus).toBe("not_calculable");
    expect(plaza?.deadlineDisplay).toBe("14–60 days depending on level; confirm with agency");
  });

  it("makes an unknown plaza level conditional, as SAPO-PLAZA-001 publishes", () => {
    // The rule's own deadline block says `unknown_level_behavior: "CONDITIONAL listing 14–60
    // range"`. SAPO-PLAZA-001 triggers on sapo_event_type alone, so the level only reaches the
    // verdict because deadline resolution reports it as a material unknown.
    const plan = evaluate(unknownLevelPlaza, ruleset, TODAY, calendar);
    expect(plan.verdict).toBe("CONDITIONAL");
    const levelFact = plan.verdictDetail.missingFacts.find((fact) => fact.field === "plaza_level");
    expect(levelFact?.branches.map((branch) => branch.value)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps an unknown level conditional even when every branch clears its window", () => {
    // Far-future event: each branch verdict is FEASIBLE, and only the timeline differs. The
    // engine must still refuse to call it feasible, because which window applies is unknown.
    const plan = evaluate(
      { ...unknownLevelPlaza, event_date: "2027-06-01" },
      ruleset,
      TODAY,
      calendar,
    );
    const levelFact = plan.verdictDetail.missingFacts.find((fact) => fact.field === "plaza_level");
    expect(levelFact?.branches.map((branch) => branch.verdict)).toEqual([
      "FEASIBLE",
      "FEASIBLE",
      "FEASIBLE",
      "FEASIBLE",
    ]);
    expect(plan.verdict).toBe("CONDITIONAL");
  });

  it("reports an unknown level as missed rather than on track when every window has closed", () => {
    // Nine days out: even the shortest published level window (14 days) is already gone, so no
    // answer to the level question reopens it. Calling that conditional would understate a closed
    // window; the finding still renders undated with the published range.
    const plan = evaluate(
      { ...unknownLevelPlaza, event_date: "2026-07-31" },
      ruleset,
      TODAY,
      calendar,
    );
    const levelFact = plan.verdictDetail.missingFacts.find((fact) => fact.field === "plaza_level");
    expect(levelFact?.branches.every((branch) => branch.verdict === "INFEASIBLE")).toBe(true);
    expect(plan.verdict).toBe("INFEASIBLE");
    expect(plan.findings.find((f) => f.ruleIds.includes("SAPO-PLAZA-001"))?.deadlineStatus).toBe(
      "not_calculable",
    );
  });

  it("uses the multi-block variant of a level deadline when the event spans blocks", () => {
    const plan = evaluate(
      {
        ...parkIntake,
        location_type: "plaza",
        obstructs_public_way: "yes",
        sapo_event_type: "plaza_event",
        plaza_level: "a",
        plaza_multiple_blocks: true,
        event_date: "2026-12-04",
        amplified_sound: false,
      },
      ruleset,
      TODAY,
      calendar,
    );
    const plaza = plan.findings.find((finding) => finding.ruleIds.includes("SAPO-PLAZA-001"));
    expect(plaza?.latestApplyDate).toBe("2026-10-05");
  });
});

describe("business-day arithmetic against the pinned calendar", () => {
  it("skips weekends when counting backward", () => {
    expect(subtractBusinessDays("2026-08-11", 15, calendar)).toBe("2026-07-21");
    expect(subtractBusinessDays("2026-07-27", 1, calendar)).toBe("2026-07-24");
  });

  it("honors an injected holiday", () => {
    const withHoliday: PublishedHolidayCalendar = { id: calendar.id, holidays: ["2026-07-24"] };
    expect(subtractBusinessDays("2026-07-27", 1, withHoliday)).toBe("2026-07-23");
    expect(countBusinessDays("2026-07-22", "2026-07-27", withHoliday)).toBe(2);
  });

  it("counts in both directions and across calendar days", () => {
    expect(countBusinessDays("2026-07-22", "2026-08-11", calendar)).toBe(14);
    expect(countBusinessDays("2026-08-11", "2026-07-22", calendar)).toBe(-14);
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(differenceInCalendarDays("2026-07-22", "2026-08-26")).toBe(35);
  });

  it("keeps an uncomputable published window conditional instead of dropping it", () => {
    // holidays: null is "no list published for this calendar id", not "a list with no holidays".
    // Weekday-only math would date SLA-ONEDAY-001 at 2026-07-21 and could call a missed window
    // on track, so the finding takes the published uncomputable-deadline treatment instead.
    const unpublished: HolidayCalendar = { id: ruleset.calendarId, holidays: null };
    const rooftop: EventIntake = {
      ...parkIntake,
      location_type: "private_venue",
      headcount: 40,
      event_date: "2026-08-11",
      amplified_sound: false,
      alcohol: true,
      venue_license_covers_event_area: "no",
    };

    const withList = evaluate(rooftop, ruleset, TODAY, calendar);
    const dated = withList.findings.find((finding) => finding.ruleIds.includes("SLA-ONEDAY-001"));
    expect(dated?.latestApplyDate).toBe("2026-07-21");
    expect(dated?.deadlineStatus).toBe("published_deadline_missed");

    const withoutList = evaluate(rooftop, ruleset, TODAY, unpublished);
    const degraded = withoutList.findings.find((finding) =>
      finding.ruleIds.includes("SLA-ONEDAY-001"),
    );
    expect(degraded?.latestApplyDate).toBeNull();
    expect(degraded?.deadlineStatus).toBe("not_calculable");
    expect(degraded?.notes).toContain("confirm with agency");
    // Excluded from verdict arithmetic: the same plan is INFEASIBLE only when the date is real.
    expect(withList.verdict).toBe("INFEASIBLE");
    expect(withoutList.verdict).not.toBe("INFEASIBLE");
  });

  it("still computes every finding that needs no business-day math", () => {
    const unpublished: HolidayCalendar = { id: ruleset.calendarId, holidays: null };
    const plan = evaluate(parkIntake, ruleset, TODAY, unpublished);
    expect(plan.verdict).toBe("FEASIBLE");
    expect(plan.findings.find((f) => f.ruleIds.includes("PARKS-EVENT-001"))?.latestApplyDate).toBe(
      "2026-08-26",
    );
  });

  it("rejects a nonsensical business-day count", () => {
    expect(() => subtractBusinessDays("2026-08-11", -1, calendar)).toThrow(EvaluationError);
  });
});

describe("failures are explicit and never a 'no requirement' result (AC 5)", () => {
  const validCalendar = calendar;

  it("rejects an intake with no event date", () => {
    const { event_date: _omitted, ...withoutDate } = parkIntake;
    expect(() => evaluate(withoutDate, ruleset, TODAY, validCalendar)).toThrow(
      /event_date is required/,
    );
  });

  it("rejects an unparseable date on either side", () => {
    expect(() =>
      evaluate({ ...parkIntake, event_date: "2026-13-01" }, ruleset, TODAY, validCalendar),
    ).toThrow(EvaluationError);
    expect(() => evaluate(parkIntake, ruleset, "tomorrow", validCalendar)).toThrow(EvaluationError);
  });

  it("refuses a calendar that is not the one the ruleset pins", () => {
    expect(() =>
      evaluate(parkIntake, ruleset, TODAY, { id: "some-other-calendar", holidays: [] }),
    ).toThrow(/does not match the ruleset's pinned calendar/);
  });

  it("refuses an intake value whose type the operator cannot compare", () => {
    expect(() =>
      evaluate({ ...parkIntake, headcount: "many" }, ruleset, TODAY, validCalendar),
    ).toThrow(/headcount must be numeric/);
  });

  it("refuses an intake field the ruleset does not declare", () => {
    const strayField = syntheticRuleset([
      {
        id: "RULE-STRAY",
        kind: "permit",
        trigger: { all: [{ field: "headcount", op: "gte", value: 1 }] },
        output: { permit_name: "stray", agency: "DOB" },
        verification: { status: "SOURCE_CONFIRMED" },
        source: { citation: "c", urls: ["https://example.test"] },
      },
    ]);
    expect(() =>
      evaluate(
        { event_date: "2026-12-04", headcount: 5, structure_types: ["none"] },
        strayField,
        TODAY,
        {
          id: "test-calendar@2026",
          holidays: [],
        },
      ),
    ).not.toThrow();
  });
});

describe("ruleset parsing rejects anything it cannot evaluate", () => {
  const withRule = (rule: Record<string, unknown>) => () => syntheticRuleset([rule]);
  const baseRule = {
    id: "RULE-X",
    kind: "permit",
    trigger: { all: [{ field: "headcount", op: "gte", value: 1 }] },
    output: { permit_name: "x", agency: "DOB" },
    verification: { status: "SOURCE_CONFIRMED" },
    source: { citation: "c", urls: ["https://example.test"] },
  };

  it("rejects a non-object ruleset", () => {
    expect(() => parseEngineRuleset("nope")).toThrow(/ruleset must be an object/);
  });

  it("rejects an unsupported operator, kind, disposition, deadline type, or status", () => {
    expect(
      withRule({ ...baseRule, trigger: { all: [{ field: "headcount", op: "near", value: 1 }] } }),
    ).toThrow(/unsupported value "near"/);
    expect(withRule({ ...baseRule, kind: "vibe" })).toThrow(/unsupported value "vibe"/);
    expect(withRule({ ...baseRule, output: { ...baseRule.output, disposition: "MAYBE" } })).toThrow(
      /unsupported value "MAYBE"/,
    );
    expect(
      withRule({ ...baseRule, output: { ...baseRule.output, deadline: { type: "soonish" } } }),
    ).toThrow(/unsupported value "soonish"/);
    expect(withRule({ ...baseRule, verification: { status: "PROBABLY" } })).toThrow(
      /unsupported value "PROBABLY"/,
    );
  });

  it("rejects a malformed trigger tree", () => {
    expect(withRule({ ...baseRule, trigger: { all: [] } })).toThrow(/must not be empty/);
    expect(withRule({ ...baseRule, trigger: { all: [{ any: [], field: "headcount" }] } })).toThrow(
      /exactly one of all, any, or field/,
    );
    expect(
      withRule({ ...baseRule, trigger: { any: [{ field: "headcount", op: "gte" }] } }),
    ).toThrow(/value is required/);
  });

  it("rejects a trigger on a field the registry does not declare", () => {
    expect(
      withRule({ ...baseRule, trigger: { all: [{ field: "vibes", op: "eq", value: 1 }] } }),
    ).toThrow(/references undeclared field "vibes"/);
  });

  it("rejects a malformed deadline body", () => {
    expect(
      withRule({
        ...baseRule,
        output: {
          ...baseRule.output,
          deadline: { type: "composite", hard_floor_days: 21, processing_range_days: [21] },
        },
      }),
    ).toThrow(/must hold two numbers/);
    expect(
      withRule({
        ...baseRule,
        output: {
          ...baseRule.output,
          deadline: { type: "published_minimum_by_level", levels: {} },
        },
      }),
    ).toThrow(/levels must not be empty/);
  });

  it("accepts the published ruleset unchanged", () => {
    expect(ruleset.rulesetVersion).toBe("nyc.v2.2");
    expect(ruleset.slackWarningDays).toBe(14);
    expect(ruleset.rules).toHaveLength(37);
  });
});

describe("asked_when scoping", () => {
  it("rejects a clause that names neither a declared field nor a declared value", () => {
    const badScope = parseEngineRuleset({
      ...rawRuleset,
      intake_fields: [
        { field: "event_date", type: "date" },
        { field: "headcount", type: "integer", asked_when: "the_vibes_are_right" },
      ],
      rules: [
        {
          id: "RULE-SCOPE",
          kind: "permit",
          trigger: { all: [{ field: "headcount", op: "gte", value: 1 }] },
          output: { permit_name: "x", agency: "DOB" },
          verification: { status: "SOURCE_CONFIRMED" },
          source: { citation: "c", urls: ["https://example.test"] },
        },
      ],
      advisories: [],
    });
    expect(() =>
      evaluate({ event_date: "2026-12-04", headcount: 5 }, badScope, TODAY, {
        id: badScope.calendarId,
        holidays: [],
      }),
    ).toThrow(/names no declared field or value/);
  });

  it("rejects a cyclic asked_when chain", () => {
    const cyclic = parseEngineRuleset({
      ...rawRuleset,
      intake_fields: [
        { field: "event_date", type: "date" },
        { field: "left", type: "boolean", asked_when: "right" },
        { field: "right", type: "boolean", asked_when: "left" },
      ],
      rules: [
        {
          id: "RULE-CYCLE",
          kind: "permit",
          trigger: { all: [{ field: "left", op: "bool", value: true }] },
          output: { permit_name: "x", agency: "DOB" },
          verification: { status: "SOURCE_CONFIRMED" },
          source: { citation: "c", urls: ["https://example.test"] },
        },
      ],
      advisories: [],
    });
    expect(() =>
      evaluate({ event_date: "2026-12-04", left: true, right: true }, cyclic, TODAY, {
        id: cyclic.calendarId,
        holidays: [],
      }),
    ).toThrow(/cyclic/);
  });
});
