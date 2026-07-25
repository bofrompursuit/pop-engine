// F-201 API surface: POST /api/events/:id/plan and GET /api/events/:id/plan against a real
// database. Runs only when one is configured, matching the other schema-backed suites.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEngineRuleset, type EngineRuleset, type HolidayCalendar } from "@pop-engine/engine";
import { createApp } from "./app";
import { MissingHolidayCalendarError, pinnedCalendar } from "./calendar";
import { calendarDateFrom, createPlanService } from "./plan";
import { rulesFilePath } from "./ruleset";

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

  const appWith = (resolveCalendar = fixtureCalendar) =>
    createApp({
      planService: createPlanService(pool, ruleset, resolveCalendar, () => TODAY),
    });

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    ruleset = parseEngineRuleset(JSON.parse(await readFile(rulesFilePath(), "utf8")));
  });

  afterAll(async () => {
    await pool.end();
  });

  it("generates a plan whose findings carry rule ids, agency, sources, and verification status", async () => {
    const eventId = await insertEvent();
    const response = await request(appWith()).post(`/api/events/${eventId}/plan`);

    expect(response.status).toBe(201);
    expect(response.body.rulesetVersion).toBe("nyc.v2.1");
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

  it("withholds a plan when the pinned holiday calendar has no published list", async () => {
    const eventId = await insertEvent();
    expect(() => pinnedCalendar(ruleset.calendarId)).toThrow(MissingHolidayCalendarError);
    const response = await request(appWith(pinnedCalendar)).post(`/api/events/${eventId}/plan`);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe("plan generation unavailable");
    expect(response.body.detail).toContain("no published holiday list");
    expect(response.body.findings).toBeUndefined();
    const { rows } = await pool.query("SELECT id FROM permit_plans WHERE event_id = $1", [eventId]);
    expect(rows).toHaveLength(0);
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
