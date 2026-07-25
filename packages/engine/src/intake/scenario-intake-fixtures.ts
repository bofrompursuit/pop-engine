// Intake inputs for the six approved scenario fixtures (docs/test-scenario-answer-key.md
// v3, the green-gate acceptance suite). Only the intake half lives here — expected
// findings and verdicts belong to the rules engine (F-201).
//
// Values are transcribed from the answer key, using the registry's field names. "No
// structures" / "no flame" are the registry's exclusive `none` option (the columns are
// NOT NULL).
//
// Two kinds of value are NOT from the answer key, and both are listed separately below so no
// test can claim a scenario is entered as written while the contradiction stands.
//
// Scenario F states catered food but no `food_vendor_count`, which the registry makes mandatory
// whenever food is present, so the scenario cannot be entered exactly as written. Filed as
// SPEC-CONFLICT #88.
//
// Scenarios A, B, D and F state no battery answer at all, and nyc.v2.5 asks `battery_present` of
// every event. This one matters more than a missing fact usually would: it is the input that
// decides whether FDNY-GENERATOR-001 fires, so a supplied `false` would have the green-gate suite
// proving a ruleset change with an input the key never documents. Filed as SPEC-CONFLICT #106.
// Scenario E is transcribed, not inferred — the key states "battery none" at line 82 — and
// Scenario C's Inputs line ends "nothing else", which covers it.
//
// Imported as `@pop-engine/engine/fixtures`.

export type ScenarioIntakeFixture = {
  readonly scenario: string;
  readonly title: string;
  /** Transcribed from the answer key. */
  readonly intake: Readonly<Record<string, unknown>>;
  /**
   * Answers the scenario does not state that the registry nonetheless requires, keyed
   * by field and carrying the open SPEC-CONFLICT issue. Empty for every scenario the
   * answer key specifies completely.
   */
  readonly inferred?: Readonly<Record<string, { value: unknown; conflictIssue: number }>>;
};

/** The complete submission for a fixture: what the key states, plus anything inferred. */
export const fixtureSubmission = (fixture: ScenarioIntakeFixture): Record<string, unknown> => ({
  ...fixture.intake,
  ...Object.fromEntries(
    Object.entries(fixture.inferred ?? {}).map(([field, { value }]) => [field, value]),
  ),
});

/** The answer key's clock: every fixture date is computed from this day. */
export const FIXTURE_TODAY = "2026-07-22";

export const SCENARIO_INTAKE_FIXTURES: readonly ScenarioIntakeFixture[] = [
  {
    scenario: "A",
    title: "Bushwick Street Activation",
    intake: {
      name: "Bushwick Street Activation",
      borough: "brooklyn",
      location_type: "street",
      obstructs_public_way: "yes",
      sapo_event_type: "street_event",
      street_event_size: "large",
      headcount: 75,
      event_date: "2026-08-26",
      event_open_to_public: "yes",
      food_present: true,
      food_vendor_count: 1,
      selling_anything: true,
      amplified_sound: true,
      structure_types: ["none"],
      open_flame_or_cooking: ["none"],
      generator_present: false,
      alcohol: false,
    },
    inferred: {
      battery_present: { value: false, conflictIssue: 106 },
    },
  },
  {
    scenario: "B",
    title: "Gallery Pop-up",
    intake: {
      name: "Gallery Pop-up",
      borough: "manhattan",
      location_type: "private_venue",
      headcount: 60,
      event_date: "2026-08-12",
      event_open_to_public: "yes",
      food_present: true,
      food_vendor_count: 1,
      selling_anything: false,
      amplified_sound: false,
      structure_types: ["none"],
      open_flame_or_cooking: ["none"],
      generator_present: false,
      alcohol: false,
    },
    inferred: {
      battery_present: { value: false, conflictIssue: 106 },
    },
  },
  {
    scenario: "C",
    title: "Prospect Park Community Day",
    intake: {
      name: "Prospect Park Community Day",
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
      battery_present: false,
      alcohol: false,
    },
  },
  {
    scenario: "D",
    title: "Queens Block Party",
    intake: {
      name: "Queens Block Party",
      borough: "queens",
      location_type: "street",
      obstructs_public_way: "yes",
      sapo_event_type: "block_party",
      has_amusement_ride: false,
      headcount: 200,
      event_date: "2026-09-30",
      event_open_to_public: "yes",
      food_present: false,
      selling_anything: false,
      amplified_sound: true,
      structure_types: ["none"],
      open_flame_or_cooking: ["charcoal_wood"],
      generator_present: false,
      alcohol: false,
    },
    inferred: {
      battery_present: { value: false, conflictIssue: 106 },
    },
  },
  {
    scenario: "E",
    title: "Plaza Brand Activation",
    intake: {
      name: "Plaza Brand Activation",
      borough: "manhattan",
      location_type: "plaza",
      obstructs_public_way: "yes",
      sapo_event_type: "plaza_event",
      plaza_level: "a",
      plaza_multiple_blocks: false,
      headcount: 300,
      event_date: "2026-12-04",
      event_open_to_public: "yes",
      food_present: true,
      food_vendor_count: 2,
      selling_anything: false,
      amplified_sound: true,
      structure_types: ["tent_canopy"],
      tent_area_sqft: 400,
      tent_days_in_place: 1,
      structure_over_10ft_tall: "unknown",
      open_flame_or_cooking: ["none"],
      generator_present: true,
      battery_present: false,
      generator_gasoline_gallons: 5,
      generator_kw: 50,
      alcohol: false,
    },
  },
  {
    scenario: "F",
    title: "Rooftop Launch Party",
    intake: {
      name: "Rooftop Launch Party",
      borough: "manhattan",
      location_type: "private_venue",
      headcount: 90,
      event_date: "2026-08-11",
      event_open_to_public: "no",
      food_present: true,
      food_affinity_private_exception_claimed: "unknown",
      selling_anything: false,
      amplified_sound: true,
      sound_audible_from_public_way: "unknown",
      structure_types: ["none"],
      open_flame_or_cooking: ["none"],
      generator_present: false,
      alcohol: true,
      venue_license_covers_event_area: "unknown",
      venue_has_assembly_approval: "unknown",
    },
    // Not in the answer key. The scenario says the food is catered and stops there,
    // while the registry requires a count whenever food is present (SPEC-CONFLICT #88).
    // One caterer is the reading that lets the fixture run; it is not an approved value.
    inferred: {
      battery_present: { value: false, conflictIssue: 106 },
      food_vendor_count: { value: 1, conflictIssue: 88 },
    },
  },
];
