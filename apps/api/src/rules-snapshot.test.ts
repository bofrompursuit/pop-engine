import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { parseEngineRuleset, parseIntakeContract, type EngineRuleset } from "@pop-engine/engine";
import { createApp, type AppDependencies } from "./app";
import { createPlanService } from "./plan";
import { loadRuleset, rulesFilePath, VERIFICATION_STATUSES } from "./ruleset";

// F-206 AC 1: the banner's numbers come from the rules file the api loaded, never from copy
// held anywhere else. These read the published artifact and assert the route repeats it.

const published = await loadRuleset();

// The route never touches the database; the pool opens no connection until a query runs.
const dependencies: AppDependencies = {
  database: new Pool({ connectionString: "postgresql://unused" }),
  intakeContract: parseIntakeContract(published.document),
  today: () => "2026-07-25",
  rulesMeta: {
    rulesetVersion: published.rulesetVersion,
    snapshotDate: published.snapshotDate,
  },
};

describe("GET /api/rules/meta", () => {
  it("serves the loaded ruleset's own version and snapshot date", async () => {
    const response = await request(createApp(dependencies)).get("/api/rules/meta");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ruleset_version: published.rulesetVersion,
      snapshot_date: published.snapshotDate,
    });
  });

  it("repeats whatever the artifact says rather than a version this code knows", async () => {
    // A ruleset bump must move the banner with no code change (issue #15 flips statuses over
    // time too). Wiring a different meta proves nothing here is pinned to today's numbers.
    const response = await request(
      createApp({
        ...dependencies,
        rulesMeta: { rulesetVersion: "nyc.v9.9", snapshotDate: "2030-01-31" },
      }),
    ).get("/api/rules/meta");

    expect(response.body).toEqual({ ruleset_version: "nyc.v9.9", snapshot_date: "2030-01-31" });
  });

  it("does not register the route when no rules meta is wired", async () => {
    const { rulesMeta: _unwired, ...withoutMeta } = dependencies;
    const response = await request(createApp(withoutMeta)).get("/api/rules/meta");

    expect(response.status).toBe(404);
  });
});

// F-206 AC 4: a plan states the ruleset that produced it — the version AND the publication date
// that version carried, both off the plan's own row. Several versions have now been published and
// superseded plans are real, so this is a live property of the read path rather than a
// hypothetical. Runs only when a database is configured, matching the other schema-backed suites.

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.runIf(databaseUrl.length > 0)("a plan's pinned ruleset version", () => {
  let pool: Pool;
  let api: ReturnType<typeof createApp>;
  let engineRuleset: EngineRuleset;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    engineRuleset = parseEngineRuleset(JSON.parse(await readFile(rulesFilePath(), "utf8")));
    api = createApp({
      database: pool,
      intakeContract: parseIntakeContract(published.document),
      today: () => "2026-07-25",
      planService: createPlanService(
        pool,
        engineRuleset,
        (calendarId) => ({ id: calendarId, holidays: [] }),
        () => "2026-07-25",
      ),
      rulesMeta: {
        rulesetVersion: published.rulesetVersion,
        snapshotDate: published.snapshotDate,
      },
    });
  });

  afterAll(async () => {
    for (const eventId of createdEventIds) {
      await pool.query(
        `DELETE FROM permit_plan_items WHERE plan_id IN
           (SELECT id FROM permit_plans WHERE event_id = $1)`,
        [eventId],
      );
      await pool.query("DELETE FROM permit_plans WHERE event_id = $1", [eventId]);
      await pool.query("DELETE FROM events WHERE id = $1", [eventId]);
    }
    await pool.end();
  });

  const planForAPark = async (): Promise<string> => {
    const created = await request(api)
      .post("/api/events")
      .send({
        name: "Snapshot pinning",
        borough: "brooklyn",
        location_type: "park",
        headcount: 150,
        event_date: "2026-09-16",
        event_open_to_public: "yes",
        food_present: false,
        selling_anything: false,
        amplified_sound: false,
        structure_types: ["none"],
        open_flame_or_cooking: ["none"],
        generator_present: false,
        // nyc.v2.5 asks this of every event, and `battery_system_kwh` only when it is true.
        battery_present: false,
        alcohol: false,
      });
    const eventId = String(created.body.event.id);
    createdEventIds.push(eventId);
    await request(api).post(`/api/events/${eventId}/plan`);
    return eventId;
  };

  it("generates a plan pinned to the ruleset the api has loaded", async () => {
    const eventId = await planForAPark();
    const response = await request(api).get(`/api/events/${eventId}/plan`);

    expect(response.status).toBe(200);
    expect(response.body.rulesetVersion).toBe(published.rulesetVersion);
    // The date is pinned with the version, not left for the reader to fetch off the live file.
    expect(response.body.snapshotDate).toBe(published.snapshotDate);
  });

  it("returns the pinned pair from the generation call too, not only the read", async () => {
    const created = await request(api)
      .post("/api/events")
      .send({
        name: "Snapshot pinning on generate",
        borough: "brooklyn",
        location_type: "park",
        headcount: 150,
        event_date: "2026-09-16",
        event_open_to_public: "yes",
        food_present: false,
        selling_anything: false,
        amplified_sound: false,
        structure_types: ["none"],
        open_flame_or_cooking: ["none"],
        generator_present: false,
        // nyc.v2.5 asks this of every event, and `battery_system_kwh` only when it is true.
        battery_present: false,
        alcohol: false,
      });
    const eventId = String(created.body.event.id);
    createdEventIds.push(eventId);

    const generated = await request(api).post(`/api/events/${eventId}/plan`);
    expect(generated.status).toBe(201);
    expect(generated.body.rulesetVersion).toBe(published.rulesetVersion);
    expect(generated.body.snapshotDate).toBe(published.snapshotDate);
  });

  it("keeps serving the pair that produced it after the live ruleset moves on", async () => {
    const eventId = await planForAPark();
    // Stand in for a plan generated before the current publication: the row keeps the version and
    // date it was written with, and the live file has since moved to a newer pair.
    await pool.query(
      "UPDATE permit_plans SET ruleset_version = $1, snapshot_date = $2 WHERE event_id = $3",
      ["nyc.v2.1", "2026-03-02", eventId],
    );

    const response = await request(api).get(`/api/events/${eventId}/plan`);
    expect(response.body.rulesetVersion).toBe("nyc.v2.1");
    expect(response.body.rulesetVersion).not.toBe(published.rulesetVersion);
    // The pair travels together: serving this version beside the live file's date would hand the
    // banner a combination that never existed on any artifact.
    expect(response.body.snapshotDate).toBe("2026-03-02");
    expect(response.body.snapshotDate).not.toBe(published.snapshotDate);

    // The live file is unchanged and still says what it says; the banner reads the difference
    // between the two versions and tells the organizer a newer ruleset exists.
    const meta = await request(api).get("/api/rules/meta");
    expect(meta.body.ruleset_version).toBe(published.rulesetVersion);
  });

  it("serves a null snapshot date for a plan generated before migration 002 added the column", async () => {
    const eventId = await planForAPark();
    // The only way a row reaches this state: it was written before the column existed. Nothing
    // backfills it, because the plan does not record which artifact it read.
    await pool.query("UPDATE permit_plans SET snapshot_date = NULL WHERE event_id = $1", [eventId]);

    const response = await request(api).get(`/api/events/${eventId}/plan`);
    expect(response.body.rulesetVersion).toBe(published.rulesetVersion);
    expect(response.body.snapshotDate).toBeNull();
  });

  it("carries each line's canonical verification status and its sources, never the deprecated column", async () => {
    const eventId = await planForAPark();
    const response = await request(api).get(`/api/events/${eventId}/plan`);

    const statuses = new Set(
      response.body.findings.map((finding: { verificationStatus: string }) =>
        String(finding.verificationStatus),
      ),
    );
    expect(statuses.size).toBeGreaterThan(0);
    for (const finding of response.body.findings) {
      expect(VERIFICATION_STATUSES.has(String(finding.verificationStatus))).toBe(true);
      // Every citation the line rests on survives the round trip, so the UI can render it.
      for (const source of finding.sources) {
        expect(typeof source.citation).toBe("string");
        expect(Array.isArray(source.urls)).toBe(true);
      }
    }

    // `verified_status` is the deprecated duplicate in migration 001 and stays unwritten.
    const { rows } = await pool.query<{ verified_status: string | null }>(
      `SELECT item.verified_status FROM permit_plan_items item
         JOIN permit_plans plan ON plan.id = item.plan_id
        WHERE plan.event_id = $1`,
      [eventId],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.verified_status === null)).toBe(true);
  });
});
