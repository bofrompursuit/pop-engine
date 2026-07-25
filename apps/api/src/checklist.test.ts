// F-202 API surface against a real schema: materialization, status and notes, uploads, signed
// download urls, and what a rescope does to an existing checklist. Runs only when a database is
// configured, matching the other schema-backed suites (CI applies `migrate up` first).
//
// Object storage is a fake implementing the same `DocumentStorage` seam the S3 adapter does, so
// nothing here needs a bucket or a network. The adapter itself is tested in `storage.test.ts`.

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
import {
  FIXTURE_TODAY,
  SCENARIO_INTAKE_FIXTURES,
  fixtureSubmission,
} from "@pop-engine/engine/fixtures";
import { createApp } from "./app";
import { CHECKLIST_STATUSES } from "./checklist";
import { createPlanService } from "./plan";
import { loadRuleset, rulesFilePath } from "./ruleset";
import { DocumentStorageError, type DocumentStorage } from "./storage";

const databaseUrl = process.env.DATABASE_URL ?? "";

/** The smallest byte sequences each accepted format is required to start with. */
const PDF = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(64, 0x20)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0),
]);

type FakeStorage = DocumentStorage & {
  objects: Map<string, { body: Buffer; contentType: string }>;
};

const fakeStorage = (): FakeStorage => {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    objects,
    put: async (key, body, contentType) => {
      objects.set(key, { body, contentType });
    },
    signedDownloadUrl: async (key, expiresInSeconds) =>
      `https://storage.test/${key}?X-Amz-Expires=${expiresInSeconds}`,
  };
};

const unreachableStorage = (): DocumentStorage => ({
  put: async () => {
    throw new DocumentStorageError("document storage is unavailable");
  },
  signedDownloadUrl: async () => {
    throw new DocumentStorageError("document storage is unavailable");
  },
});

const scenario = (id: string): Record<string, unknown> => {
  const fixture = SCENARIO_INTAKE_FIXTURES.find((candidate) => candidate.scenario === id);
  if (fixture === undefined) throw new Error(`no fixture ${id}`);
  return fixtureSubmission(fixture);
};

type ChecklistItemView = {
  id: string;
  planItemId: string;
  ruleIds: string[];
  status: string;
  notes: string | null;
  inLatestPlan: boolean;
  latestApplyDate: string | null;
  applyAfterDate: string | null;
  agency: string | null;
  permitName: string | null;
  kind: string;
  verificationStatus: string;
  portalUrl: string | null;
  documents: { id: string; filename: string; contentType: string; sizeBytes: number }[];
};

const ruleIdsOf = (items: ChecklistItemView[]): string[][] => items.map((item) => item.ruleIds);

describe.runIf(databaseUrl.length > 0)("F-202 compliance checklist", () => {
  let pool: Pool;
  let ruleset: EngineRuleset;
  let intakeContract: IntakeContract;
  const createdEventIds: string[] = [];

  // The answer key's scenarios are dated against its own clock, and the fixture windows carry no
  // contested holidays (AD-11), so the calendar is injected rather than the guard relaxed.
  const fixtureCalendar = (calendarId: string): HolidayCalendar => ({
    id: calendarId,
    holidays: [],
  });

  const appWith = (storage: DocumentStorage) =>
    createApp({
      database: pool,
      intakeContract,
      today: () => FIXTURE_TODAY,
      planService: createPlanService(pool, ruleset, fixtureCalendar, () => FIXTURE_TODAY),
      checklist: { database: pool, storage },
    });

  /** An event created through the intake endpoint, so it is exactly what F-101 would store. */
  const createEvent = async (submission: Record<string, unknown>): Promise<string> => {
    const response = await request(appWith(fakeStorage())).post("/api/events").send(submission);
    expect(response.status).toBe(201);
    const eventId = response.body.event.id as string;
    createdEventIds.push(eventId);
    return eventId;
  };

  const generatePlan = async (eventId: string): Promise<void> => {
    const response = await request(appWith(fakeStorage())).post(`/api/events/${eventId}/plan`);
    expect(response.status).toBe(201);
  };

  /** A scenario event with its plan and checklist already materialized. */
  const checklistFor = async (
    scenarioId: string,
    storage: DocumentStorage = fakeStorage(),
  ): Promise<{
    eventId: string;
    body: { items: ChecklistItemView[] } & Record<string, unknown>;
  }> => {
    const eventId = await createEvent(scenario(scenarioId));
    await generatePlan(eventId);
    const response = await request(appWith(storage)).post(`/api/events/${eventId}/checklist`);
    expect(response.status).toBe(201);
    return { eventId, body: response.body };
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    ruleset = parseEngineRuleset(JSON.parse(await readFile(rulesFilePath(), "utf8")));
    intakeContract = parseIntakeContract((await loadRuleset()).document);
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      await pool.query(
        `DELETE FROM documents WHERE checklist_item_id IN (
           SELECT checklist.id FROM checklist_items AS checklist
             JOIN permit_plan_items AS item ON item.id = checklist.plan_item_id
             JOIN permit_plans AS plan ON plan.id = item.plan_id
            WHERE plan.event_id = ANY($1))`,
        [createdEventIds],
      );
      await pool.query(
        `DELETE FROM checklist_items WHERE plan_item_id IN (
           SELECT item.id FROM permit_plan_items AS item
             JOIN permit_plans AS plan ON plan.id = item.plan_id
            WHERE plan.event_id = ANY($1))`,
        [createdEventIds],
      );
      await pool.query(
        `DELETE FROM permit_plan_items WHERE plan_id IN (
           SELECT id FROM permit_plans WHERE event_id = ANY($1))`,
        [createdEventIds],
      );
      await pool.query("DELETE FROM permit_plans WHERE event_id = ANY($1)", [createdEventIds]);
      await pool.query("DELETE FROM events WHERE id = ANY($1)", [createdEventIds]);
    }
    await pool.end();
  });

  describe("materializing a checklist from the latest plan (AC 1, AC 5)", () => {
    it("tracks every permit and insurance line and leaves other kinds as read-only context", async () => {
      const { body } = await checklistFor("A");
      const items = body.items;

      // Scenario A's permit and insurance findings, soonest published filing date first.
      expect(ruleIdsOf(items)).toEqual([
        ["SAPO-STREET-LARGE-001"],
        ["NYPD-SOUND-001"],
        ["DOHMH-VENDOR-PERMIT-001"],
        ["FDNY-GENERATOR-001"],
        ["SAPO-INSURANCE-001"],
      ]);
      expect(items.every((item) => ["permit", "insurance"].includes(item.kind))).toBe(true);
      // The notification line is real work but not a trackable task per the spec; it renders
      // as context so it cannot silently disappear either.
      expect((body.contextItems as { ruleIds: string[] }[]).map((item) => item.ruleIds)).toEqual([
        ["DOHMH-ORGANIZER-NOTIFY-001"],
      ]);
    });

    it("keeps each item linked to its plan item, so rule, agency, deadline and portal travel with it", async () => {
      const { body } = await checklistFor("A");
      const [blocking] = body.items;

      expect(blocking?.planItemId).toMatch(/^[0-9a-f-]{36}$/);
      expect(blocking?.agency).toBe("SAPO (Mayor's Office CECM)");
      // Spec AC 5: the deadline context lives where the work happens.
      expect(blocking?.latestApplyDate).toBe("2026-07-12");
      expect(blocking?.verificationStatus).toBe("SOURCE_CONFIRMED");
      expect(blocking?.portalUrl).not.toBeNull();
      expect(blocking?.status).toBe("not_started");

      const { rows } = await pool.query<{ plan_item_id: string }>(
        "SELECT plan_item_id FROM checklist_items WHERE id = $1",
        [blocking?.id],
      );
      expect(rows[0]?.plan_item_id).toBe(blocking?.planItemId);
    });

    it("carries the apply_after date of a dependency-gated item (AC 5, Scenario C)", async () => {
      const { body } = await checklistFor("C");
      const gated = body.items.find((item) => item.ruleIds[0] === "NYPD-SOUND-001");

      expect(gated?.applyAfterDate).toBe("2026-08-12");
      expect(gated?.latestApplyDate).toBe("2026-09-11");
    });

    it("returns the existing checklist instead of duplicating it when called twice", async () => {
      const { eventId, body } = await checklistFor("A");

      const second = await request(appWith(fakeStorage())).post(`/api/events/${eventId}/checklist`);

      expect(second.status).toBe(200);
      expect((second.body.items as ChecklistItemView[]).map((item) => item.id)).toEqual(
        body.items.map((item) => item.id),
      );
      expect(second.body.planChanged).toBe(false);
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*) FROM checklist_items AS checklist
           JOIN permit_plan_items AS item ON item.id = checklist.plan_item_id
           JOIN permit_plans AS plan ON plan.id = item.plan_id
          WHERE plan.event_id = $1`,
        [eventId],
      );
      expect(Number(rows[0]?.count)).toBe(body.items.length);
    });

    it("serves the same checklist on GET, without materializing anything", async () => {
      const { eventId, body } = await checklistFor("A");

      const read = await request(appWith(fakeStorage())).get(`/api/events/${eventId}/checklist`);

      expect(read.status).toBe(200);
      expect(read.body.items).toEqual(body.items);
      expect(read.body.statusRollup).toEqual({
        not_started: body.items.length,
        in_progress: 0,
        submitted: 0,
        approved: 0,
        rejected: 0,
      });
    });

    it("offers an empty checklist for a plan with no permit or insurance line", async () => {
      // No approved scenario currently produces a plan without a permit line (SPEC-CONFLICT #92
      // covers the spec's stale claim that Scenario B does), so the case is built directly from
      // a published advisory rule rather than asserted of a scenario that does not have it.
      const eventId = await createEvent(scenario("B"));
      const planId = randomUUID();
      await pool.query(
        `INSERT INTO permit_plans
           (id, event_id, event_revision, ruleset_version, verdict, verdict_detail, intake_snapshot)
         VALUES ($1, $2, 1, $3, 'conditional', '{}'::jsonb, '{}'::jsonb)`,
        [planId, eventId, ruleset.rulesetVersion],
      );
      await pool.query(
        `INSERT INTO permit_plan_items
           (id, plan_id, rule_ids, triggered_by, sources, kind, disposition, deadline_status,
            verification_status, permit_name)
         VALUES ($1, $2, ARRAY['ADV-VENUE-OCCUPANCY-001'], '[]'::jsonb, '[]'::jsonb, 'advisory',
                 'advisory', 'not_applicable', 'SOURCE_CONFIRMED', 'Venue occupancy advisory')`,
        [randomUUID(), planId],
      );

      const response = await request(appWith(fakeStorage())).post(
        `/api/events/${eventId}/checklist`,
      );

      // Nothing was created, so the call is already idempotent on its first use.
      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
      expect(response.body.planChanged).toBe(false);
      expect(
        (response.body.contextItems as { ruleIds: string[] }[]).map((item) => item.ruleIds),
      ).toEqual([["ADV-VENUE-OCCUPANCY-001"]]);
    });
  });

  describe("status and notes (AC 2, AC 4)", () => {
    it("accepts every transition, including backwards, and never rejects one as illegal", async () => {
      const { body } = await checklistFor("A");
      const itemId = body.items[0]?.id;
      const api = appWith(fakeStorage());

      // Agencies are messy: the spec allows any transition, so the walk goes forward,
      // sideways, and back to the start.
      for (const status of ["submitted", "approved", "rejected", "in_progress", "not_started"]) {
        const response = await request(api)
          .patch(`/api/checklist-items/${itemId}`)
          .send({ status });
        expect(response.status).toBe(200);
        expect(response.body.status).toBe(status);
      }
    });

    it("persists notes per item and leaves the status alone", async () => {
      const { eventId, body } = await checklistFor("A");
      const itemId = body.items[1]?.id;
      const api = appWith(fakeStorage());

      await request(api).patch(`/api/checklist-items/${itemId}`).send({ status: "in_progress" });
      const noted = await request(api)
        .patch(`/api/checklist-items/${itemId}`)
        .send({ notes: "Called the precinct; they want the SAPO number first." });

      expect(noted.status).toBe(200);
      expect(noted.body.notes).toBe("Called the precinct; they want the SAPO number first.");
      expect(noted.body.status).toBe("in_progress");

      const read = await request(api).get(`/api/events/${eventId}/checklist`);
      const stored = (read.body.items as ChecklistItemView[]).find((item) => item.id === itemId);
      expect(stored?.notes).toBe("Called the precinct; they want the SAPO number first.");
      // AC 2: the rollup follows the per-item status.
      expect(read.body.statusRollup).toMatchObject({ in_progress: 1, not_started: 4 });
    });

    it("clears a note when notes is explicitly null", async () => {
      const { body } = await checklistFor("A");
      const itemId = body.items[0]?.id;
      const api = appWith(fakeStorage());

      await request(api).patch(`/api/checklist-items/${itemId}`).send({ notes: "draft" });
      const cleared = await request(api)
        .patch(`/api/checklist-items/${itemId}`)
        .send({ notes: null });

      expect(cleared.body.notes).toBeNull();
    });

    it("rejects an unknown status, a non-string note, an empty edit and a malformed body", async () => {
      const { body } = await checklistFor("A");
      const itemId = body.items[0]?.id;
      const api = appWith(fakeStorage());

      const unknownStatus = await request(api)
        .patch(`/api/checklist-items/${itemId}`)
        .send({ status: "escalated" });
      expect(unknownStatus.status).toBe(400);
      expect(unknownStatus.body.error).toContain("not_started");

      const badNotes = await request(api)
        .patch(`/api/checklist-items/${itemId}`)
        .send({ notes: { text: "no" } });
      expect(badNotes.status).toBe(400);

      const empty = await request(api).patch(`/api/checklist-items/${itemId}`).send({});
      expect(empty.status).toBe(400);

      const notAnObject = await request(api)
        .patch(`/api/checklist-items/${itemId}`)
        .send(["not", "an", "object"]);
      expect(notAnObject.status).toBe(400);
    });

    it("holds the same status vocabulary the schema enforces", async () => {
      // The same guard as schema-contract.test.ts, for the one enum this feature holds in code:
      // a hand-kept copy that nothing compares is what issues #70, #73 and #76 all were.
      const { rows } = await pool.query<{ def: string }>(
        `SELECT pg_get_constraintdef(c.oid) AS def
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE c.contype = 'c' AND t.relname = 'checklist_items'
            AND pg_get_constraintdef(c.oid) ~ 'status'`,
      );
      const enforced = [...(rows[0]?.def.matchAll(/'([^']+)'/g) ?? [])].map((match) => match[1]);

      expect(enforced.length).toBeGreaterThan(0);
      expect([...CHECKLIST_STATUSES].sort()).toEqual(enforced.sort());
    });
  });

  describe("document upload and download (AC 3)", () => {
    it("stores the bytes in object storage and only the metadata in Postgres", async () => {
      const storage = fakeStorage();
      const { body } = await checklistFor("A", storage);
      const itemId = body.items[0]?.id as string;

      const upload = await request(appWith(storage))
        .post(`/api/checklist-items/${itemId}/documents`)
        .set("Content-Type", "application/pdf")
        .set("X-Filename", "sapo-application.pdf")
        .send(PDF);

      expect(upload.status).toBe(201);
      expect(upload.body).toMatchObject({
        filename: "sapo-application.pdf",
        contentType: "application/pdf",
        sizeBytes: PDF.byteLength,
      });
      const { rows } = await pool.query<{ storage_key: string; size_bytes: string }>(
        "SELECT storage_key, size_bytes FROM documents WHERE id = $1",
        [upload.body.id],
      );
      const storageKey = rows[0]?.storage_key as string;
      expect(storageKey).toMatch(new RegExp(`^checklist-items/${itemId}/[0-9a-f-]{36}\\.pdf$`));
      expect(storage.objects.get(storageKey)?.body).toEqual(PDF);
      // Nothing binary in Postgres: the row carries the key and the size, not the bytes.
      expect(Object.keys(rows[0] ?? {})).not.toContain("body");
    });

    it("lists uploaded documents on the checklist item", async () => {
      const storage = fakeStorage();
      const { eventId, body } = await checklistFor("A", storage);
      const itemId = body.items[0]?.id as string;
      const api = appWith(storage);

      await request(api)
        .post(`/api/checklist-items/${itemId}/documents`)
        .set("Content-Type", "image/png")
        .set("X-Filename", "site-map.png")
        .send(PNG);

      const read = await request(api).get(`/api/events/${eventId}/checklist`);
      const item = (read.body.items as ChecklistItemView[]).find((entry) => entry.id === itemId);
      expect(item?.documents).toEqual([
        expect.objectContaining({ filename: "site-map.png", contentType: "image/png" }),
      ]);
    });

    it("hands back a short-lived signed url for download", async () => {
      const storage = fakeStorage();
      const { body } = await checklistFor("A", storage);
      const api = appWith(storage);
      const upload = await request(api)
        .post(`/api/checklist-items/${body.items[0]?.id}/documents`)
        .set("Content-Type", "application/pdf")
        .send(PDF);

      const signed = await request(api).get(`/api/documents/${upload.body.id}/url`);

      expect(signed.status).toBe(200);
      expect(signed.body.expiresInSeconds).toBe(300);
      expect(signed.body.url).toContain("X-Amz-Expires=300");
    });

    it("refuses a type the spec does not allow and bytes that contradict the declared type", async () => {
      const storage = fakeStorage();
      const { body } = await checklistFor("A", storage);
      const itemId = body.items[0]?.id;
      const api = appWith(storage);

      const wrongType = await request(api)
        .post(`/api/checklist-items/${itemId}/documents`)
        .set("Content-Type", "application/zip")
        .send(Buffer.from("PK"));
      expect(wrongType.status).toBe(415);
      expect(wrongType.body.error).toContain("application/pdf");

      // A content type is a claim by the caller; an executable announced as a PDF is not one.
      const lyingBytes = await request(api)
        .post(`/api/checklist-items/${itemId}/documents`)
        .set("Content-Type", "application/pdf")
        .send(Buffer.from("MZ executable"));
      expect(lyingBytes.status).toBe(400);

      const empty = await request(api)
        .post(`/api/checklist-items/${itemId}/documents`)
        .set("Content-Type", "application/pdf")
        .send(Buffer.alloc(0));
      expect(empty.status).toBe(400);

      expect(storage.objects.size).toBe(0);
    });

    it("refuses a document larger than 10 MB", async () => {
      const storage = fakeStorage();
      const { body } = await checklistFor("A", storage);
      const oversized = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);

      const response = await request(appWith(storage))
        .post(`/api/checklist-items/${body.items[0]?.id}/documents`)
        .set("Content-Type", "application/pdf")
        .send(oversized);

      expect(response.status).toBe(413);
      expect(storage.objects.size).toBe(0);
    });

    it("treats a client filename as a display name only, never as a path", async () => {
      const storage = fakeStorage();
      const { body } = await checklistFor("A", storage);
      const itemId = body.items[0]?.id as string;

      const upload = await request(appWith(storage))
        .post(`/api/checklist-items/${itemId}/documents`)
        .set("Content-Type", "application/pdf")
        .set("X-Filename", "../../../etc/passwd")
        .send(PDF);

      expect(upload.status).toBe(201);
      expect(upload.body.filename).toBe("passwd");
      const [storedKey] = [...storage.objects.keys()];
      expect(storedKey).toBe(`checklist-items/${itemId}/${storedKey?.split("/")[2]}`);
      expect(storedKey).not.toContain("passwd");
    });

    it("keeps the item's state and writes no metadata row when storage is unreachable", async () => {
      const { body } = await checklistFor("A");
      const itemId = body.items[0]?.id as string;
      const api = appWith(unreachableStorage());

      const failed = await request(api)
        .post(`/api/checklist-items/${itemId}/documents`)
        .set("Content-Type", "application/pdf")
        .send(PDF);

      expect(failed.status).toBe(503);
      // The message is ours; no SDK, bucket or endpoint detail reaches the client.
      expect(failed.body).toEqual({ error: "document storage is unavailable", retryable: true });
      const { rows } = await pool.query("SELECT id FROM documents WHERE checklist_item_id = $1", [
        itemId,
      ]);
      expect(rows).toHaveLength(0);
      const { rows: item } = await pool.query<{ status: string }>(
        "SELECT status FROM checklist_items WHERE id = $1",
        [itemId],
      );
      expect(item[0]?.status).toBe("not_started");
    });

    it("reports an unsignable download without leaking why", async () => {
      const storage = fakeStorage();
      const { body } = await checklistFor("A", storage);
      const upload = await request(appWith(storage))
        .post(`/api/checklist-items/${body.items[0]?.id}/documents`)
        .set("Content-Type", "application/pdf")
        .send(PDF);

      const signed = await request(appWith(unreachableStorage())).get(
        `/api/documents/${upload.body.id}/url`,
      );

      expect(signed.status).toBe(503);
      expect(signed.body.error).toBe("document storage is unavailable");
    });
  });

  describe("regenerating the plan (AC 6)", () => {
    it("keeps the checklist, flags the change, strikes dropped items and appends new ones", async () => {
      const { eventId, body } = await checklistFor("A");
      const api = appWith(fakeStorage());
      const large = body.items.find((item) => item.ruleIds[0] === "SAPO-STREET-LARGE-001");
      await request(api)
        .patch(`/api/checklist-items/${large?.id}`)
        .send({ status: "submitted", notes: "filed 2026-07-10" });

      // The rescope the demo path uses: the same event, scoped down a size class.
      const edited = await request(api)
        .patch(`/api/events/${eventId}`)
        .send({ street_event_size: "medium" });
      expect(edited.status).toBe(200);
      await generatePlan(eventId);

      const rescoped = await request(api).post(`/api/events/${eventId}/checklist`);

      expect(rescoped.status).toBe(201);
      expect(rescoped.body.planChanged).toBe(true);
      const items = rescoped.body.items as ChecklistItemView[];
      // Nothing is deleted: the large-event line survives with its status and note intact,
      // marked as no longer in the plan so the UI can strike it through.
      const dropped = items.find((item) => item.ruleIds[0] === "SAPO-STREET-LARGE-001");
      expect(dropped?.inLatestPlan).toBe(false);
      expect(dropped?.status).toBe("submitted");
      expect(dropped?.notes).toBe("filed 2026-07-10");
      // The new requirement is appended rather than inserted among the tracked work.
      expect(items.at(-1)?.ruleIds).toEqual(["SAPO-STREET-MEDIUM-001"]);
      expect(items.at(-1)?.inLatestPlan).toBe(true);
      // Requirements the rescope did not change keep their identity, not a duplicate row.
      expect(items.filter((item) => item.ruleIds[0] === "NYPD-SOUND-001")).toHaveLength(1);
      // A struck item is not current work, so it does not count toward the rollup.
      expect(rescoped.body.statusRollup).toMatchObject({ submitted: 0 });
    });

    it("renders a still-required item against the latest plan's recalculated dates", async () => {
      const { eventId, body } = await checklistFor("A");
      const before = body.items.find((item) => item.ruleIds[0] === "NYPD-SOUND-001");
      const api = appWith(fakeStorage());

      // Moving the event moves every computed filing date with it (PRD principle 6).
      await request(api).patch(`/api/events/${eventId}`).send({ event_date: "2026-09-30" });
      await generatePlan(eventId);

      const read = await request(api).get(`/api/events/${eventId}/checklist`);
      const after = (read.body.items as ChecklistItemView[]).find(
        (item) => item.ruleIds[0] === "NYPD-SOUND-001",
      );
      expect(after?.id).toBe(before?.id);
      expect(after?.latestApplyDate).not.toBe(before?.latestApplyDate);
      expect(after?.inLatestPlan).toBe(true);
    });

    it("flags a plan change before the new items are materialized", async () => {
      const { eventId } = await checklistFor("A");
      const api = appWith(fakeStorage());

      await request(api).patch(`/api/events/${eventId}`).send({ street_event_size: "medium" });
      await generatePlan(eventId);

      const read = await request(api).get(`/api/events/${eventId}/checklist`);
      expect(read.body.planChanged).toBe(true);
      expect(
        (read.body.items as ChecklistItemView[]).some(
          (item) => item.ruleIds[0] === "SAPO-STREET-MEDIUM-001",
        ),
      ).toBe(false);
    });
  });

  describe("requests that name something that is not there", () => {
    it("answers 404 for an unknown event, an event with no plan, and unknown ids", async () => {
      const api = appWith(fakeStorage());
      const absent = randomUUID();

      expect((await request(api).post(`/api/events/${absent}/checklist`)).status).toBe(404);
      expect((await request(api).get(`/api/events/${absent}/checklist`)).status).toBe(404);
      expect(
        (await request(api).patch(`/api/checklist-items/${absent}`).send({ status: "approved" }))
          .status,
      ).toBe(404);
      expect((await request(api).get(`/api/documents/${absent}/url`)).status).toBe(404);

      const planless = await createEvent(scenario("A"));
      const response = await request(api).post(`/api/events/${planless}/checklist`);
      expect(response.status).toBe(404);
      expect(response.body.error).toContain("no plan generated");
    });

    it("answers 404 when uploading against a checklist item that does not exist", async () => {
      const storage = fakeStorage();
      const response = await request(appWith(storage))
        .post(`/api/checklist-items/${randomUUID()}/documents`)
        .set("Content-Type", "application/pdf")
        .send(PDF);

      expect(response.status).toBe(404);
      // The check runs before the upload, so an unknown item cannot leave bytes in the bucket.
      expect(storage.objects.size).toBe(0);
    });

    it("answers 400 for a malformed id rather than letting Postgres refuse the cast", async () => {
      const api = appWith(fakeStorage());

      for (const response of [
        await request(api).post("/api/events/not-a-uuid/checklist"),
        await request(api).get("/api/events/not-a-uuid/checklist"),
        await request(api).patch("/api/checklist-items/not-a-uuid").send({ status: "approved" }),
        await request(api).get("/api/documents/not-a-uuid/url"),
      ]) {
        expect(response.status).toBe(400);
        expect(response.body.error).toContain("must be a uuid");
      }
    });
  });
});
