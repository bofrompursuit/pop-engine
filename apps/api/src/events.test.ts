import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { parseIntakeContract } from "@pop-engine/engine";
import { FIXTURE_TODAY, SCENARIO_INTAKE_FIXTURES } from "@pop-engine/engine/fixtures";
import { createApp } from "./app";
import { loadRuleset } from "./ruleset";

// Integration tests for the F-101 endpoints against a real schema: the intake rules
// themselves are unit-tested in packages/engine, so these assert persistence, status
// codes, and the revision/stale-plan behavior. Runs only when a database is configured,
// matching the other schema-backed suites (CI applies `migrate up` first).

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.runIf(databaseUrl.length > 0)("F-101 event intake endpoints", () => {
  let database: Pool;
  let api: ReturnType<typeof createApp>;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    database = new Pool({ connectionString: databaseUrl });
    api = createApp({
      database,
      intakeContract: parseIntakeContract((await loadRuleset()).document),
      today: () => FIXTURE_TODAY,
    });
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      await database.query("DELETE FROM permit_plans WHERE event_id = ANY($1)", [createdEventIds]);
      await database.query("DELETE FROM events WHERE id = ANY($1)", [createdEventIds]);
    }
    await database.end();
  });

  const post = async (intake: Record<string, unknown>) => {
    const response = await request(api).post("/api/events").send(intake);
    const id: unknown = response.body?.event?.id;
    if (typeof id === "string") createdEventIds.push(id);
    return response;
  };

  const errorCodes = (body: { errors?: { field: string; code: string }[] }) =>
    Object.fromEntries((body.errors ?? []).map((error) => [error.field, error.code]));

  describe("POST /api/events", () => {
    it.each(SCENARIO_INTAKE_FIXTURES)(
      "stores scenario $scenario ($title) exactly as the answer key specifies",
      async (fixture) => {
        const response = await post(fixture.intake);
        expect(response.status).toBe(201);
        for (const [field, value] of Object.entries(fixture.intake)) {
          expect(response.body.event[field], field).toEqual(value);
        }
        expect(response.body.event.revision_counter).toBe(1);
        expect(response.body.event.status).toBe("draft");
        expect(response.body.plan_stale).toBe(false);
      },
    );

    it("stores unknown answers and blank dimensions as the answer key writes them", async () => {
      const rooftop = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "F");
      const { body } = await post({ ...rooftop?.intake });
      expect(body.event.venue_license_covers_event_area).toBe("unknown");
      expect(body.event.venue_has_assembly_approval).toBe("unknown");
      expect(body.event.sound_audible_from_public_way).toBe("unknown");

      const plaza = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "E");
      const blank = await post({ ...plaza?.intake, tent_area_sqft: null, generator_kw: null });
      expect(blank.body.event.tent_area_sqft).toBeNull();
      expect(blank.body.event.generator_kw).toBeNull();
      expect(blank.body.event.structure_over_10ft_tall).toBe("unknown");
    });

    it("leaves every question the event was not asked null", async () => {
      const park = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "C");
      const { body } = await post({ ...park?.intake });
      expect(body.event.obstructs_public_way).toBeNull();
      expect(body.event.street_event_size).toBeNull();
      expect(body.event.food_vendor_count).toBeNull();
      expect(body.event.capacity).toBeNull();
    });

    it("rejects a contradictory submission with a per-field error and stores nothing", async () => {
      const street = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "A");
      const before = await database.query<{ count: string }>("SELECT count(*) FROM events");
      const response = await post({ ...street?.intake, tent_area_sqft: 200, headcount: 0 });
      expect(response.status).toBe(400);
      expect(errorCodes(response.body)).toEqual({
        tent_area_sqft: "not_applicable",
        headcount: "must_be_positive",
      });
      const after = await database.query<{ count: string }>("SELECT count(*) FROM events");
      expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    });

    it("rejects an event date in the past against the injected clock", async () => {
      const park = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "C");
      const response = await post({ ...park?.intake, event_date: "2026-07-21" });
      expect(response.status).toBe(400);
      expect(errorCodes(response.body)).toEqual({ event_date: "in_the_past" });
    });

    it("rejects a body that is not a JSON object", async () => {
      const response = await request(api).post("/api/events").send([]);
      expect(response.status).toBe(400);
      expect(errorCodes(response.body)).toEqual({ body: "invalid_body" });
    });

    it("warns inline that a selling block party conflicts with eligibility, and stores it", async () => {
      const blockParty = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "D");
      const response = await post({ ...blockParty?.intake, selling_anything: true });
      expect(response.status).toBe(201);
      expect(response.body.event.selling_anything).toBe(true);
      expect(response.body.warnings).toHaveLength(1);
      expect(response.body.warnings[0].code).toBe("block_party_eligibility_conflict");
    });

    it("renders the coverage warning for alcohol in public space", async () => {
      const park = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "C");
      const response = await post({ ...park?.intake, alcohol: true });
      expect(response.status).toBe(201);
      expect(response.body.warnings[0].code).toBe("coverage_gap");
      expect(response.body.warnings[0].message).toContain("Confirm with the relevant agency.");
    });
  });

  describe("GET /api/events/:id", () => {
    it("returns the stored event and repeats any standing warning", async () => {
      const park = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "C");
      const created = await post({ ...park?.intake, alcohol: true });
      const response = await request(api).get(`/api/events/${created.body.event.id}`);
      expect(response.status).toBe(200);
      expect(response.body.event).toEqual(created.body.event);
      expect(response.body.warnings[0].code).toBe("coverage_gap");
    });

    it("returns 404 for an unknown or malformed id", async () => {
      expect((await request(api).get(`/api/events/${randomUUID()}`)).status).toBe(404);
      expect((await request(api).get("/api/events/not-an-id")).status).toBe(404);
    });
  });

  describe("PATCH /api/events/:id", () => {
    const createStreetEvent = async () => {
      const street = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "A");
      const created = await post({ ...street?.intake });
      return created.body.event as Record<string, unknown> & { id: string };
    };

    it("bumps the revision counter on every accepted edit", async () => {
      const event = await createStreetEvent();
      const first = await request(api)
        .patch(`/api/events/${event.id}`)
        .send({ street_event_size: "medium" });
      expect(first.status).toBe(200);
      expect(first.body.event.street_event_size).toBe("medium");
      expect(first.body.event.revision_counter).toBe(2);

      const second = await request(api).patch(`/api/events/${event.id}`).send({ headcount: 90 });
      expect(second.body.event.revision_counter).toBe(3);
      expect(second.body.event.street_event_size).toBe("medium");
    });

    it("marks an existing plan stale once the event moves past the revision it evaluated", async () => {
      const event = await createStreetEvent();
      await database.query(
        `INSERT INTO permit_plans (id, event_id, event_revision, ruleset_version, verdict,
                                   verdict_detail, intake_snapshot)
         VALUES ($1, $2, 1, 'nyc.v2.1', 'infeasible', '{}'::jsonb, '{}'::jsonb)`,
        [randomUUID(), event.id],
      );

      expect((await request(api).get(`/api/events/${event.id}`)).body.plan_stale).toBe(false);
      const edited = await request(api)
        .patch(`/api/events/${event.id}`)
        .send({ street_event_size: "small" });
      expect(edited.body.plan_stale).toBe(true);
      expect((await request(api).get(`/api/events/${event.id}`)).body.plan_stale).toBe(true);
    });

    it("re-validates the whole intake, so an edit cannot leave a contradiction behind", async () => {
      const event = await createStreetEvent();
      const response = await request(api)
        .patch(`/api/events/${event.id}`)
        .send({ location_type: "park" });
      expect(response.status).toBe(400);
      // The SAPO answers the street event carried no longer apply to a park.
      expect(errorCodes(response.body)).toMatchObject({ obstructs_public_way: "not_applicable" });

      const unchanged = await request(api).get(`/api/events/${event.id}`);
      expect(unchanged.body.event.revision_counter).toBe(1);
      expect(unchanged.body.event.location_type).toBe("street");
    });

    it("accepts a rescope that clears the answers it makes inapplicable", async () => {
      // Scenario A's rescope (c): the same event moved to a private venue. The SAPO
      // answers go away and the venue questions take their place.
      const event = await createStreetEvent();
      const missing = await request(api).patch(`/api/events/${event.id}`).send({
        location_type: "private_venue",
        obstructs_public_way: null,
        sapo_event_type: null,
        street_event_size: null,
      });
      expect(errorCodes(missing.body)).toEqual({
        sound_audible_from_public_way: "required",
        venue_has_assembly_approval: "required",
      });

      const response = await request(api).patch(`/api/events/${event.id}`).send({
        location_type: "private_venue",
        obstructs_public_way: null,
        sapo_event_type: null,
        street_event_size: null,
        sound_audible_from_public_way: "unknown",
        venue_has_assembly_approval: "unknown",
      });
      expect(response.status).toBe(200);
      expect(response.body.event.location_type).toBe("private_venue");
      expect(response.body.event.street_event_size).toBeNull();
      expect(response.body.event.venue_has_assembly_approval).toBe("unknown");
      expect(response.body.event.revision_counter).toBe(2);
    });

    it("warns inline on an edit that creates a coverage gap", async () => {
      const park = SCENARIO_INTAKE_FIXTURES.find((fixture) => fixture.scenario === "C");
      const created = await post({ ...park?.intake });
      const response = await request(api)
        .patch(`/api/events/${created.body.event.id}`)
        .send({ alcohol: true });
      expect(response.status).toBe(200);
      expect(response.body.warnings[0].code).toBe("coverage_gap");
    });

    it("returns 404 for an unknown id and 400 for a body that is not an object", async () => {
      expect((await request(api).patch(`/api/events/${randomUUID()}`).send({})).status).toBe(404);
      expect((await request(api).patch("/api/events/not-an-id").send({})).status).toBe(404);
      const event = await createStreetEvent();
      expect(
        (await request(api).patch(`/api/events/${event.id}`).type("json").send("[]")).status,
      ).toBe(400);
    });

    it("rejects a field the registry does not declare", async () => {
      const event = await createStreetEvent();
      const response = await request(api)
        .patch(`/api/events/${event.id}`)
        .send({ attendee_wifi: true });
      expect(response.status).toBe(400);
      expect(errorCodes(response.body)).toEqual({ attendee_wifi: "unknown_field" });
    });
  });
});
