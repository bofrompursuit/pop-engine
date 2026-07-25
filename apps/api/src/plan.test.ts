// F-201 API surface: POST /api/events/:id/plan and GET /api/events/:id/plan against a real
// database. Runs only when one is configured, matching the other schema-backed suites.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  parseEngineRuleset,
  parseIntakeContract,
  type EngineRuleset,
  type HolidayCalendar,
  type IntakeContract,
} from "@pop-engine/engine";
import { createApp } from "./app";
import { holidayCalendarWarning, pinnedCalendar, todayInJurisdiction } from "./calendar";
import { calendarDateFrom, createPlanService } from "./plan";
import { loadRuleset, rulesFilePath } from "./ruleset";

const databaseUrl = process.env.DATABASE_URL ?? "";
const TODAY = "2026-07-22";

/** Scenario A's intake as an events row, with every NOT NULL column answered. */
const scenarioAEvent = {
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
  battery_system_kwh: 0,
  alcohol: false,
};

describe.runIf(databaseUrl.length > 0)("plan API (F-201)", () => {
  let pool: Pool;
  let ruleset: EngineRuleset;
  let intakeContract: IntakeContract;

  const insertEvent = async (overrides: Record<string, unknown> = {}): Promise<string> => {
    const row: Record<string, unknown> = { ...scenarioAEvent, ...overrides };
    const columns = Object.keys(row);
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO events (id, ${columns.join(", ")})
       VALUES ($1, ${columns.map((_column, index) => `$${index + 2}`).join(", ")})`,
      [eventId, ...columns.map((column) => row[column])],
    );
    return eventId;
  };

  // Production refuses to run without a published holiday list; the fixtures pin dates in windows
  // the answer key states carry no contested holidays (AD-11), so they inject the list explicitly
  // rather than relaxing that guard.
  const fixtureCalendar = (calendarId: string): HolidayCalendar => ({
    id: calendarId,
    holidays: [],
  });

  // The app serves the intake routes alongside the plan routes, so it takes their
  // dependencies too. These tests drive only the plan routes; the intake contract and
  // the pool are the same ones the api boots with.
  const appWith = (resolveCalendar = fixtureCalendar) =>
    createApp({
      database: pool,
      intakeContract,
      today: () => TODAY,
      planService: createPlanService(pool, ruleset, resolveCalendar, () => TODAY),
    });

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    ruleset = parseEngineRuleset(JSON.parse(await readFile(rulesFilePath(), "utf8")));
    intakeContract = parseIntakeContract((await loadRuleset()).document);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("generates a plan whose findings carry rule ids, agency, sources, and verification status", async () => {
    const eventId = await insertEvent();
    const response = await request(appWith()).post(`/api/events/${eventId}/plan`);

    expect(response.status).toBe(201);
    expect(response.body.rulesetVersion).toBe("nyc.v2.2");
    expect(response.body.eventRevision).toBe(1);
    expect(response.body.verdict).toBe("INFEASIBLE");
    expect(response.body.findings.map((finding: { ruleIds: string[] }) => finding.ruleIds)).toEqual(
      [
        ["SAPO-STREET-LARGE-001"],
        ["SAPO-INSURANCE-001"],
        ["NYPD-SOUND-001"],
        ["DOHMH-VENDOR-PERMIT-001"],
        ["DOHMH-ORGANIZER-NOTIFY-001"],
      ],
    );
    const [blocking] = response.body.findings;
    expect(blocking.agency).toBe("SAPO (Mayor's Office CECM)");
    expect(blocking.latestApplyDate).toBe("2026-07-12");
    expect(blocking.verificationStatus).toBe("SOURCE_CONFIRMED");
    expect(blocking.sources[0].urls.length).toBeGreaterThan(0);
    expect(blocking.triggeredBy).toEqual([
      { field: "sapo_event_type", value: "street_event" },
      { field: "street_event_size", value: "large" },
    ]);
  });

  it("persists plan items with the columns the schema requires and leaves verified_status unwritten", async () => {
    const eventId = await insertEvent();
    await request(appWith()).post(`/api/events/${eventId}/plan`);

    const { rows } = await pool.query<{
      rule_ids: string[];
      kind: string;
      disposition: string;
      deadline_status: string;
      verification_status: string;
      verified_status: string | null;
      latest_apply_date: Date | null;
    }>(
      `SELECT item.* FROM permit_plan_items item
         JOIN permit_plans plan ON plan.id = item.plan_id
        WHERE plan.event_id = $1`,
      [eventId],
    );

    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.verified_status === null)).toBe(true);
    const notification = rows.find((row) => row.rule_ids[0] === "DOHMH-ORGANIZER-NOTIFY-001");
    expect(notification?.kind).toBe("notification");
    expect(notification?.disposition).toBe("may_be_required");
    expect(notification?.deadline_status).toBe("deadline_approaching");
    expect(notification?.verification_status).toBe("SOURCE_CONFIRMED");
  });

  it("writes an immutable new plan per generation and serves the latest one", async () => {
    const eventId = await insertEvent();
    const app = appWith();
    const first = await request(app).post(`/api/events/${eventId}/plan`);
    const second = await request(app).post(`/api/events/${eventId}/plan`);
    expect(first.body.id).not.toBe(second.body.id);

    const { rows } = await pool.query("SELECT id FROM permit_plans WHERE event_id = $1", [eventId]);
    expect(rows).toHaveLength(2);

    const latest = await request(app).get(`/api/events/${eventId}/plan`);
    expect(latest.status).toBe(200);
    expect(latest.body.id).toBe(second.body.id);
  });

  it("round-trips a stored plan identically to the plan it returned at generation (AC 3)", async () => {
    const eventId = await insertEvent();
    const app = appWith();
    const generated = await request(app).post(`/api/events/${eventId}/plan`);
    const fetched = await request(app).get(`/api/events/${eventId}/plan`);
    expect(fetched.body.findings).toEqual(generated.body.findings);
    expect(fetched.body.verdict).toBe(generated.body.verdict);
  });

  it("keeps the official conflict and its sources readable after storage (AC 2)", async () => {
    const eventId = await insertEvent({
      location_type: "park",
      obstructs_public_way: null,
      sapo_event_type: null,
      street_event_size: null,
      headcount: 150,
      selling_anything: true,
    });
    const app = appWith();
    await request(app).post(`/api/events/${eventId}/plan`);
    const fetched = await request(app).get(`/api/events/${eventId}/plan`);

    const tua = fetched.body.findings.find((finding: { ruleIds: string[] }) =>
      finding.ruleIds.includes("PARKS-TUA-001"),
    );
    expect(tua.disposition).toBe("may_be_required");
    expect(tua.verificationStatus).toBe("OFFICIAL_CONFLICT");
    expect(tua.conflictText).toContain("OFFICIAL CONFLICT");
    expect(tua.sources[0].urls).toHaveLength(4);
  });

  it("renders 'confirm with agency' on a research-required lead time after storage", async () => {
    const eventId = await insertEvent({ open_flame_or_cooking: ["charcoal_wood"] });
    const app = appWith();
    await request(app).post(`/api/events/${eventId}/plan`);
    const fetched = await request(app).get(`/api/events/${eventId}/plan`);

    const fuel = fetched.body.findings.find((finding: { ruleIds: string[] }) =>
      finding.ruleIds.includes("FDNY-FUEL-001"),
    );
    expect(fuel.deadlineStatus).toBe("not_calculable");
    expect(fuel.notes).toContain("confirm with agency");
  });

  it("returns an explicit error and stores nothing when evaluation fails (AC 5)", async () => {
    const eventId = await insertEvent();
    const response = await request(
      appWith((calendarId) => ({ id: `${calendarId}-mismatched`, holidays: [] })),
    ).post(`/api/events/${eventId}/plan`);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("plan generation failed");
    expect(response.body.detail).toContain("does not match the ruleset's pinned calendar");
    expect(response.body.findings).toBeUndefined();
    const { rows } = await pool.query("SELECT id FROM permit_plans WHERE event_id = $1", [eventId]);
    expect(rows).toHaveLength(0);
  });

  it("generates normally with no published holiday list when nothing needs business days", async () => {
    // Scenario A triggers no business-day rule, so its plan is fully computable. Withholding it
    // because some other rule would have needed a holiday list helps nobody.
    const eventId = await insertEvent();
    const response = await request(appWith(pinnedCalendar)).post(`/api/events/${eventId}/plan`);

    expect(response.status).toBe(201);
    expect(response.body.verdict).toBe("INFEASIBLE");
    expect(response.body.findings).toHaveLength(5);
    expect(response.body.findings[0].latestApplyDate).toBe("2026-07-12");
    // The only undated lines are ones the ruleset itself leaves undated: insurance is owed before
    // issuance and the DOHMH vendor lead time is research-required. Neither is a calendar gap, and
    // no business_days_minimum rule triggers here.
    const undated = response.body.findings.filter(
      (finding: { latestApplyDate: string | null; deadline: { type: string } | null }) =>
        finding.latestApplyDate === null && finding.deadline !== null,
    );
    expect(undated.map((finding: { deadline: { type: string } }) => finding.deadline.type)).toEqual(
      ["before_issuance", "research_required"],
    );
  });

  it("warns operators that the pinned calendar has no published holiday list", () => {
    // Plans still generate; the warning is how an operator learns why business-day lines are
    // undated, instead of an organizer discovering it.
    const warning = holidayCalendarWarning(pinnedCalendar(ruleset.calendarId));
    expect(warning).toContain("no published holiday list");
    expect(warning).toContain(ruleset.calendarId);
    expect(holidayCalendarWarning({ id: "published@2026", holidays: [] })).toBeNull();
  });

  it("derives today in the jurisdiction's own calendar, not UTC", () => {
    // 2026-08-12T02:30:00Z is still 2026-08-11 in New York. Reading the date off UTC would age the
    // plan a day early and could mark a window missed hours before it closes.
    const lateEvening = new Date("2026-08-12T02:30:00Z");
    expect(todayInJurisdiction("US-NY-NYC", lateEvening)).toBe("2026-08-11");
    expect(todayInJurisdiction("US-NY-NYC", new Date("2026-08-12T14:00:00Z"))).toBe("2026-08-12");
    expect(() => todayInJurisdiction("US-XX-NOWHERE")).toThrow(/no local time zone is mapped/);
  });

  it("moves the rollover with the offset rather than fixing it", () => {
    // The same boundary in January, when New York is UTC-5 rather than UTC-4. An intake
    // date and a plan deadline both read the day from here, so a fixed offset would put
    // one of the two on the wrong side of midnight for part of the year.
    expect(todayInJurisdiction("US-NY-NYC", new Date("2026-01-12T04:30:00Z"))).toBe("2026-01-11");
    expect(todayInJurisdiction("US-NY-NYC", new Date("2026-01-12T05:30:00Z"))).toBe("2026-01-12");
  });

  it("rejects a malformed event id without touching the database", async () => {
    const app = appWith();
    for (const route of ["post", "get"] as const) {
      const response = await request(app)[route]("/api/events/not-a-uuid/plan");
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("event id must be a uuid");
      // No driver text: a 22P02 would otherwise arrive here as a 500 carrying Postgres detail.
      expect(JSON.stringify(response.body)).not.toContain("22P02");
      expect(response.body.detail).toBeUndefined();
    }
  });

  it("keeps a plan conditional and names the finding whose window it cannot date", async () => {
    // Rooftop with alcohol and no venue licence: SLA-ONEDAY-001 is a 15-business-day deadline.
    const eventId = await insertEvent({
      location_type: "private_venue",
      obstructs_public_way: null,
      sapo_event_type: null,
      street_event_size: null,
      headcount: 90,
      event_open_to_public: "no",
      food_present: false,
      food_vendor_count: null,
      selling_anything: false,
      amplified_sound: false,
      alcohol: true,
      venue_license_covers_event_area: "no",
    });

    const degraded = await request(appWith(pinnedCalendar)).post(`/api/events/${eventId}/plan`);
    expect(degraded.status).toBe(201);
    const withoutList = degraded.body.findings.find((finding: { ruleIds: string[] }) =>
      finding.ruleIds.includes("SLA-ONEDAY-001"),
    );
    expect(withoutList.latestApplyDate).toBeNull();
    expect(withoutList.deadlineStatus).toBe("not_calculable");
    expect(withoutList.notes).toContain("confirm with agency");
    // The window is published and real, so the plan says so rather than quietly dropping it.
    expect(degraded.body.verdict).toBe("CONDITIONAL");
    expect(
      degraded.body.verdictDetail.unresolvedTimelines.map(
        (entry: { ruleIds: string[] }) => entry.ruleIds,
      ),
    ).toContainEqual(["SLA-ONEDAY-001"]);
    // Everything that needs no business-day math still carries its real date.
    const assembly = degraded.body.findings.find((finding: { ruleIds: string[] }) =>
      finding.ruleIds.includes("DOB-ASSEMBLY-001"),
    );
    expect(assembly.latestApplyDate).toBe("2026-08-16");

    // With a published list the same finding dates for real, which is what the fixtures exercise.
    const computed = await request(appWith()).post(`/api/events/${eventId}/plan`);
    const withList = computed.body.findings.find((finding: { ruleIds: string[] }) =>
      finding.ruleIds.includes("SLA-ONEDAY-001"),
    );
    expect(withList.latestApplyDate).toBe("2026-08-05");
    expect(withList.deadlineStatus).toBe("on_track");
  });

  it("reads a Postgres date as its stored calendar day, east of UTC included", async () => {
    // node-postgres builds a `date` at local midnight; toISOString() would move it back a day in
    // any timezone east of UTC and shift every deadline with it.
    const localMidnight = new Date(2026, 7, 26);
    expect(calendarDateFrom(localMidnight)).toBe("2026-08-26");
    expect(calendarDateFrom("2026-08-26")).toBe("2026-08-26");

    const eventId = await insertEvent();
    const generated = await request(appWith()).post(`/api/events/${eventId}/plan`);
    // Scenario A's event date is 2026-08-26 and the SAPO line is a 45-day published minimum.
    expect(generated.body.findings[0].latestApplyDate).toBe("2026-07-12");
    const fetched = await request(appWith()).get(`/api/events/${eventId}/plan`);
    expect(fetched.body.findings[0].latestApplyDate).toBe("2026-07-12");
  });

  it("fails the read rather than serving a plan whose items went missing (AC 5)", async () => {
    const eventId = await insertEvent();
    const app = appWith();
    const generated = await request(app).post(`/api/events/${eventId}/plan`);
    expect(generated.body.findings).toHaveLength(5);

    // Simulate a lost child row. The insert is transactional, so this cannot happen during normal
    // generation, but nothing in the schema enforces the item count afterwards.
    await pool.query(
      `DELETE FROM permit_plan_items WHERE plan_id = $1 AND rule_ids = ARRAY['NYPD-SOUND-001']::text[]`,
      [generated.body.id],
    );

    const fetched = await request(app).get(`/api/events/${eventId}/plan`);
    expect(fetched.status).toBe(500);
    expect(fetched.body.error).toBe("plan lookup failed");
    expect(fetched.body.detail).toContain("is incomplete");
    // The surviving four findings are not served as if they were the whole plan.
    expect(fetched.body.findings).toBeUndefined();
  });

  it("persists the dependency-gated apply-after date for the Parks to NYPD sequence", async () => {
    const eventId = await insertEvent({
      location_type: "park",
      obstructs_public_way: null,
      sapo_event_type: null,
      street_event_size: null,
      headcount: 150,
      event_date: "2026-09-16",
      food_present: false,
      food_vendor_count: null,
      selling_anything: false,
      amplified_sound: true,
    });
    const app = appWith();
    await request(app).post(`/api/events/${eventId}/plan`);

    const { rows } = await pool.query<{ apply_after_date: Date | string | null }>(
      `SELECT item.apply_after_date FROM permit_plan_items item
         JOIN permit_plans plan ON plan.id = item.plan_id
        WHERE plan.event_id = $1 AND item.rule_ids = ARRAY['NYPD-SOUND-001']::text[]`,
      [eventId],
    );
    expect(rows).toHaveLength(1);
    expect(calendarDateFrom(rows[0]!.apply_after_date as Date)).toBe("2026-08-12");

    const fetched = await request(app).get(`/api/events/${eventId}/plan`);
    const sound = fetched.body.findings.find((finding: { ruleIds: string[] }) =>
      finding.ruleIds.includes("NYPD-SOUND-001"),
    );
    expect(sound.applyAfterDate).toBe("2026-08-12");
  });

  it("round-trips the published in-person filing instructions through storage", async () => {
    const eventId = await insertEvent({
      location_type: "park",
      obstructs_public_way: null,
      sapo_event_type: null,
      street_event_size: null,
      headcount: 150,
      food_present: false,
      food_vendor_count: null,
      selling_anything: false,
      amplified_sound: true,
    });
    const app = appWith();
    const generated = await request(app).post(`/api/events/${eventId}/plan`);
    const fetched = await request(app).get(`/api/events/${eventId}/plan`);

    for (const body of [generated.body, fetched.body]) {
      const sound = body.findings.find((finding: { ruleIds: string[] }) =>
        finding.ruleIds.includes("NYPD-SOUND-001"),
      );
      // No URL is published for this permit, so the instructions are the whole filing route.
      expect(sound.portalUrl).toBeNull();
      expect(sound.portalInstructions).toBe(
        "File at the precinct where the device will be used; application form PD 656-041A.",
      );
    }
  });

  it("404s for an unknown event and for an event with no plan yet", async () => {
    const app = appWith();
    const unknownId = randomUUID();
    expect((await request(app).post(`/api/events/${unknownId}/plan`)).status).toBe(404);
    expect((await request(app).get(`/api/events/${unknownId}/plan`)).status).toBe(404);

    const eventId = await insertEvent();
    const noPlanYet = await request(app).get(`/api/events/${eventId}/plan`);
    expect(noPlanYet.status).toBe(404);
    expect(noPlanYet.body.error).toContain("no plan generated");
  });
});
