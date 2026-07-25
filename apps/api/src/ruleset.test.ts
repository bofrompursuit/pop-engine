import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadRuleset, syncPermitRules, validateRuleset, type PublishedRuleset } from "./ruleset";

type JsonObject = Record<string, unknown>;

const rulesFile = fileURLToPath(new URL("../../../rules/nyc-rules.v2.3.json", import.meta.url));
const packageFile = fileURLToPath(new URL("../../../package.json", import.meta.url));
const originalRulesFile = process.env.RULES_FILE;

async function readRawRuleset(): Promise<JsonObject> {
  return JSON.parse(await readFile(rulesFile, "utf8")) as JsonObject;
}

function object(value: unknown): JsonObject {
  return value as JsonObject;
}

function array(value: unknown): unknown[] {
  return value as unknown[];
}

function firstRule(ruleset: JsonObject): JsonObject {
  return object(array(ruleset.rules)[0]);
}

function firstCondition(ruleset: JsonObject): JsonObject {
  return object(array(object(firstRule(ruleset).trigger).all)[0]);
}

function ruleById(ruleset: JsonObject, id: string): JsonObject {
  const found = [...array(ruleset.rules), ...array(ruleset.advisories)]
    .map(object)
    .find((rule) => rule.id === id);
  if (found === undefined) {
    throw new Error(`fixture expects rule ${id} to exist in the published ruleset`);
  }
  return found;
}

afterEach(() => {
  if (originalRulesFile === undefined) {
    delete process.env.RULES_FILE;
  } else {
    process.env.RULES_FILE = originalRulesFile;
  }
});

describe("ruleset validation", () => {
  it("loads the approved published ruleset", async () => {
    delete process.env.RULES_FILE;
    const ruleset = await loadRuleset();

    expect(ruleset.schema).toBe("popengine-rules/v2");
    expect(ruleset.rulesetVersion).toBe("nyc.v2.3");
    expect(ruleset.snapshotDate).toBe("2026-07-25");
    expect(ruleset.intakeFields).toHaveLength(32);
    expect(ruleset.rules).toHaveLength(33);
    expect(ruleset.advisories).toHaveLength(4);
  });

  it("pins which published rules are exempt from agency and source", async () => {
    // The exemptions are deliberate, so they are named here rather than merely
    // permitted. A future rule that quietly joins either list has to change this test.
    delete process.env.RULES_FILE;
    const { rules, advisories } = await loadRuleset();
    const all = [...rules, ...advisories];

    // Issue #77: advisory / note / classification describe a condition rather than a
    // filing, so they may omit the agency. Everything else must name one.
    expect(all.filter((rule) => rule.output.agency === undefined).map((rule) => rule.id)).toEqual([
      "SAPO-SCOPE-001",
      "PARKS-INSURANCE-NOTE-001",
      "DOHMH-EXEMPTION-001",
      "SLA-VENUE-LICENSE-001",
      "ADV-ALCOHOL-PUBLIC-001",
      "ADV-SAPO-OTHER-CLASS-001",
      "ADV-NOISE-CODE-001",
      "ADV-VENUE-OCCUPANCY-001",
    ]);

    // Issue #75: only a COVERAGE_GAP advisory, which asserts nothing, may omit its source.
    expect(all.filter((rule) => rule.source === null).map((rule) => rule.id)).toEqual([
      "ADV-ALCOHOL-PUBLIC-001",
      "ADV-SAPO-OTHER-CLASS-001",
    ]);
  });

  it("honors RULES_FILE", async () => {
    process.env.RULES_FILE = rulesFile;
    await expect(loadRuleset()).resolves.toMatchObject({
      rulesetVersion: "nyc.v2.3",
    });
  });

  it("reports unreadable and structurally invalid files as boot failures", async () => {
    await expect(loadRuleset("/missing/rules.json")).rejects.toThrow(
      "Ruleset validation failed: cannot load",
    );
    await expect(loadRuleset(packageFile)).rejects.toThrow(
      "Ruleset validation failed: ruleset.schema",
    );
  });

  it("rejects non-object input", () => {
    expect(() => validateRuleset(null)).toThrow("ruleset must be an object");
  });

  it.each<{
    name: string;
    mutate: (ruleset: JsonObject) => void;
    error: RegExp;
  }>([
    {
      name: "wrong schema",
      mutate: (ruleset) => {
        ruleset.schema = "popengine-rules/v1";
      },
      error: /expected schema/,
    },
    {
      name: "wrong version",
      mutate: (ruleset) => {
        ruleset.ruleset_version = "nyc.v3";
      },
      error: /expected ruleset version/,
    },
    {
      name: "invalid snapshot date",
      mutate: (ruleset) => {
        ruleset.snapshot_date = "2026-02-31";
      },
      error: /snapshot_date must be an ISO date/,
    },
    {
      name: "unapproved status",
      mutate: (ruleset) => {
        ruleset.status = "PROPOSED";
      },
      error: /status must be APPROVED/,
    },
    {
      name: "duplicate intake field",
      mutate: (ruleset) => {
        const fields = array(ruleset.intake_fields);
        fields.push(structuredClone(fields[0]));
      },
      error: /intake field names must be unique/,
    },
    {
      name: "wrong rule count",
      mutate: (ruleset) => {
        array(ruleset.rules).pop();
      },
      error: /expected 33 rules/,
    },
    {
      name: "wrong advisory count",
      mutate: (ruleset) => {
        array(ruleset.advisories).pop();
      },
      error: /expected 4 advisories/,
    },
    {
      name: "unsupported kind",
      mutate: (ruleset) => {
        firstRule(ruleset).kind = "future_kind";
      },
      error: /kind has unsupported value/,
    },
    {
      name: "undeclared trigger field",
      mutate: (ruleset) => {
        firstCondition(ruleset).field = "undeclared";
      },
      error: /references undeclared field/,
    },
    {
      name: "unsupported condition operator",
      mutate: (ruleset) => {
        firstCondition(ruleset).op = "execute";
      },
      error: /op has unsupported value/,
    },
    {
      name: "mixed trigger node",
      mutate: (ruleset) => {
        firstRule(ruleset).trigger = {
          field: "borough",
          op: "eq",
          value: "brooklyn",
          all: [{ field: "undeclared", op: "eq", value: true }],
        };
      },
      error: /exactly one of all, any, or field/,
    },
    {
      name: "condition without a value",
      mutate: (ruleset) => {
        delete firstCondition(ruleset).value;
      },
      error: /\.value is required/,
    },
    {
      name: "empty trigger combinator",
      mutate: (ruleset) => {
        firstRule(ruleset).trigger = { all: [] };
      },
      error: /all must not be empty/,
    },
    {
      name: "duplicate rule id",
      mutate: (ruleset) => {
        const rules = array(ruleset.rules);
        object(rules[1]).id = object(rules[0]).id;
      },
      error: /duplicate rule id/,
    },
    {
      name: "missing rule source",
      mutate: (ruleset) => {
        delete firstRule(ruleset).source;
      },
      error: /source is required/,
    },
    {
      name: "source without a citation",
      mutate: (ruleset) => {
        firstRule(ruleset).source = {};
      },
      error: /source.citation must be a non-empty string/,
    },
    {
      name: "source without URLs",
      mutate: (ruleset) => {
        firstRule(ruleset).source = { citation: "Source", urls: [] };
      },
      error: /source.urls must not be empty/,
    },
    {
      name: "source with an invalid URL entry",
      mutate: (ruleset) => {
        firstRule(ruleset).source = { citation: "Source", urls: [null] };
      },
      error: /source.urls\[0\] must be a non-empty string/,
    },
    {
      name: "unsupported verification status",
      mutate: (ruleset) => {
        object(firstRule(ruleset).verification).status = "UNREVIEWED";
      },
      error: /verification.status has unsupported value/,
    },
    {
      // Issue #77: a finding that directs the organizer to act with a body must name it.
      name: "an agency-required kind with no agency",
      mutate: (ruleset) => {
        delete object(ruleById(ruleset, "PARKS-PROPANE-001").output).agency;
      },
      error: /output.agency must be a non-empty string/,
    },
    {
      // Issue #75: only a COVERAGE_GAP advisory, which asserts nothing, may omit its source.
      name: "a non-COVERAGE_GAP advisory with no source",
      mutate: (ruleset) => {
        delete ruleById(ruleset, "ADV-NOISE-CODE-001").source;
      },
      error: /source is required unless verification.status is COVERAGE_GAP/,
    },
  ])("rejects $name", async ({ mutate, error }) => {
    const ruleset = await readRawRuleset();
    mutate(ruleset);
    expect(() => validateRuleset(ruleset)).toThrow(error);
  });
});

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.runIf(databaseUrl.length > 0)("migration 001 and rules sync", () => {
  let database: Client;
  let ruleset: PublishedRuleset;

  beforeAll(async () => {
    database = new Client({ connectionString: databaseUrl });
    await database.connect();
    ruleset = await loadRuleset(rulesFile);
  });

  afterAll(async () => {
    await database.end();
  });

  it("creates every approved table and mirrors the intake registry", async () => {
    const tables = await database.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> 'pgmigrations'
       ORDER BY table_name`,
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual(
      [
        "alerts",
        "checkins",
        "checklist_items",
        "documents",
        "events",
        "permit_plan_items",
        "permit_plans",
        "permit_rules",
        "rsvps",
      ].sort(),
    );

    const eventColumns = await database.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'events'
       ORDER BY column_name`,
    );
    expect(eventColumns.rows.map(({ column_name }) => column_name)).toEqual(
      [
        ...ruleset.intakeFields,
        "id",
        "name",
        "location_name",
        "capacity",
        "status",
        "revision_counter",
        "created_at",
        "updated_at",
      ].sort(),
    );
  });

  it("enforces event enums and lifecycle defaults", async () => {
    const values = [
      randomUUID(),
      "Schema test",
      "brooklyn",
      "private_venue",
      60,
      "2026-08-12",
      "yes",
      false,
      false,
      false,
      ["none"],
      ["none"],
      false,
      false,
    ];
    const insert = `INSERT INTO events
      (id, name, borough, location_type, headcount, event_date,
       event_open_to_public, food_present, selling_anything, amplified_sound,
       structure_types, open_flame_or_cooking, generator_present, alcohol)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING status, revision_counter, capacity`;

    const inserted = await database.query<{
      status: string;
      revision_counter: number;
      capacity: number | null;
    }>(insert, values);
    expect(inserted.rows[0]).toEqual({
      status: "draft",
      revision_counter: 1,
      capacity: null,
    });

    await expect(
      database.query(insert, [
        randomUUID(),
        ...values.slice(1, 3),
        "invalid_location",
        ...values.slice(4),
      ]),
    ).rejects.toThrow(/check constraint/);

    const invalidMultiSelects: Array<[string[], string[]]> = [
      [[], ["none"]],
      [["none", "tent_canopy"], ["none"]],
      [["none"], []],
      [["none"], ["none", "charcoal_wood"]],
    ];
    for (const [structureTypes, flameTypes] of invalidMultiSelects) {
      const invalidValues = [...values];
      invalidValues[0] = randomUUID();
      invalidValues[10] = structureTypes;
      invalidValues[11] = flameTypes;
      await expect(database.query(insert, invalidValues)).rejects.toThrow(/check constraint/);
    }
  });

  it("supports cancelled alerts, unique sends, and walk-in check-ins", async () => {
    const eventId = randomUUID();
    await database.query(
      `INSERT INTO events
        (id, name, borough, location_type, headcount, event_date,
         event_open_to_public, food_present, selling_anything, amplified_sound,
         structure_types, open_flame_or_cooking, generator_present, alcohol)
       VALUES ($1, 'Ops test', 'queens', 'street', 200, '2026-09-30',
               'yes', false, false, true, ARRAY['none'], ARRAY['none'], false, false)`,
      [eventId],
    );

    const idempotencyKey = `${eventId}:deadline`;
    await database.query(
      `INSERT INTO alerts
        (id, event_id, alert_type, channel, recipient, idempotency_key, send_at, status, payload)
       VALUES ($1, $2, 'deadline_reminder', 'email', 'demo@example.com', $3,
               current_timestamp, 'cancelled', '{}'::jsonb)`,
      [randomUUID(), eventId, idempotencyKey],
    );
    await expect(
      database.query(
        `INSERT INTO alerts
          (id, event_id, alert_type, channel, recipient, idempotency_key, send_at, payload)
         VALUES ($1, $2, 'deadline_reminder', 'email', 'demo@example.com', $3,
                 current_timestamp, '{}'::jsonb)`,
        [randomUUID(), eventId, idempotencyKey],
      ),
    ).rejects.toThrow(/unique constraint/);

    const walkIn = await database.query<{ rsvp_id: string | null }>(
      `INSERT INTO checkins (id, event_id, name, contact)
       VALUES ($1, $2, 'Walk In', 'walkin@example.com')
       RETURNING rsvp_id`,
      [randomUUID(), eventId],
    );
    expect(walkIn.rows[0]?.rsvp_id).toBeNull();
  });

  it("stores plan provenance and rejects duplicate checklist and attendee identities", async () => {
    const eventId = randomUUID();
    await database.query(
      `INSERT INTO events
        (id, name, borough, location_type, headcount, event_date,
         event_open_to_public, food_present, selling_anything, amplified_sound,
         structure_types, open_flame_or_cooking, generator_present, alcohol)
       VALUES ($1, 'Constraint test', 'manhattan', 'private_venue', 100, '2026-10-01',
               'yes', false, false, false, ARRAY['none'], ARRAY['none'], false, false)`,
      [eventId],
    );

    const planId = randomUUID();
    await database.query(
      `INSERT INTO permit_plans
        (id, event_id, event_revision, ruleset_version, verdict, verdict_detail, intake_snapshot)
       VALUES ($1, $2, 1, $3, 'feasible', '{}'::jsonb, '{}'::jsonb)`,
      [planId, eventId, ruleset.rulesetVersion],
    );

    const contributingRules = ruleset.rules.filter(({ id }) =>
      ["DOB-TENT-001", "DOB-TALL-STRUCTURE-001"].includes(id),
    );
    expect(contributingRules).toHaveLength(2);
    const ruleIds = contributingRules.map(({ id }) => id);
    const triggeredBy = [
      { field: "structure_types", value: ["tent_canopy"] },
      { field: "structure_over_10ft_tall", value: "yes" },
    ];
    const sources = contributingRules.map(({ id, source }) => ({ rule_id: id, source }));
    const planItemId = randomUUID();
    const planItem = await database.query<{
      rule_ids: string[];
      sources: JsonObject[];
      triggered_by: JsonObject[];
    }>(
      `INSERT INTO permit_plan_items
        (id, plan_id, rule_ids, triggered_by, sources, kind, disposition,
         deadline_status, verification_status)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'permit', 'may_be_required',
               'not_applicable', 'SOURCE_CONFIRMED')
       RETURNING rule_ids, triggered_by, sources`,
      [planItemId, planId, ruleIds, JSON.stringify(triggeredBy), JSON.stringify(sources)],
    );
    expect(planItem.rows[0]).toEqual({
      rule_ids: ruleIds,
      triggered_by: triggeredBy,
      sources,
    });

    const checklistItemId = randomUUID();
    await database.query(
      `INSERT INTO checklist_items (id, plan_item_id)
       VALUES ($1, $2)`,
      [checklistItemId, planItemId],
    );
    const checklistEvent = await database.query<{ event_id: string }>(
      `SELECT plans.event_id
       FROM checklist_items AS checklist
       JOIN permit_plan_items AS items ON items.id = checklist.plan_item_id
       JOIN permit_plans AS plans ON plans.id = items.plan_id
       WHERE checklist.id = $1`,
      [checklistItemId],
    );
    expect(checklistEvent.rows[0]?.event_id).toBe(eventId);

    await expect(
      database.query(
        `INSERT INTO checklist_items (id, plan_item_id)
         VALUES ($1, $2)`,
        [randomUUID(), planItemId],
      ),
    ).rejects.toThrow(/unique constraint/);

    const otherEventId = randomUUID();
    await database.query(
      `INSERT INTO events
        (id, name, borough, location_type, headcount, event_date,
         event_open_to_public, food_present, selling_anything, amplified_sound,
         structure_types, open_flame_or_cooking, generator_present, alcohol)
       VALUES ($1, 'Other event', 'brooklyn', 'private_venue', 50, '2026-10-02',
               'yes', false, false, false, ARRAY['none'], ARRAY['none'], false, false)`,
      [otherEventId],
    );

    await database.query(
      `INSERT INTO alerts
        (id, event_id, checklist_item_id, alert_type, channel, recipient,
         idempotency_key, send_at, payload)
       VALUES ($1, $2, $3, 'deadline_reminder', 'email', 'demo@example.com',
               $4, current_timestamp, '{}'::jsonb)`,
      [randomUUID(), eventId, checklistItemId, `${eventId}:checklist`],
    );
    await expect(
      database.query(
        `INSERT INTO alerts
          (id, event_id, checklist_item_id, alert_type, channel, recipient,
           idempotency_key, send_at, payload)
         VALUES ($1, $2, $3, 'deadline_reminder', 'email', 'demo@example.com',
                 $4, current_timestamp, '{}'::jsonb)`,
        [randomUUID(), otherEventId, checklistItemId, `${otherEventId}:wrong-checklist`],
      ),
    ).rejects.toThrow(/alert checklist item must belong to event/);

    const email = "guest@example.com";
    const rsvpId = randomUUID();
    await database.query(
      `INSERT INTO rsvps (id, event_id, name, email)
       VALUES ($1, $2, 'Guest', $3)`,
      [rsvpId, eventId, email],
    );
    await expect(
      database.query(
        `INSERT INTO rsvps (id, event_id, name, email)
         VALUES ($1, $2, 'Duplicate Guest', $3)`,
        [randomUUID(), eventId, email],
      ),
    ).rejects.toThrow(/unique constraint/);

    await database.query(
      `INSERT INTO checkins (id, event_id, rsvp_id, name, contact)
       VALUES ($1, $2, $3, 'Guest', $4)`,
      [randomUUID(), eventId, rsvpId, email],
    );
    await expect(
      database.query(
        `INSERT INTO checkins (id, event_id, rsvp_id, name, contact)
         VALUES ($1, $2, $3, 'Wrong Event Guest', 'wrong-event@example.com')`,
        [randomUUID(), otherEventId, rsvpId],
      ),
    ).rejects.toThrow(/foreign key constraint/);

    const contact = "walkin@example.com";
    await database.query(
      `INSERT INTO checkins (id, event_id, name, contact)
       VALUES ($1, $2, 'Walk In', $3)`,
      [randomUUID(), eventId, contact],
    );
    await expect(
      database.query(
        `INSERT INTO checkins (id, event_id, name, contact)
         VALUES ($1, $2, 'Duplicate Walk In', $3)`,
        [randomUUID(), eventId, contact],
      ),
    ).rejects.toThrow(/unique constraint/);
  });

  it("syncs all 37 rules and repairs same-version drift", async () => {
    await syncPermitRules(database, ruleset);

    const count = await database.query<{ count: string }>(
      "SELECT count(*) FROM permit_rules WHERE ruleset_version = $1",
      [ruleset.rulesetVersion],
    );
    expect(Number(count.rows[0]?.count)).toBe(37);

    await database.query(
      `UPDATE permit_rules
       SET kind = 'note'
       WHERE ruleset_version = $1 AND rule_id = 'SAPO-STREET-LARGE-001'`,
      [ruleset.rulesetVersion],
    );
    await syncPermitRules(database, ruleset);

    const repaired = await database.query<{
      kind: string;
      verification_status: string;
    }>(
      `SELECT kind, verification->>'status' AS verification_status
       FROM permit_rules
       WHERE ruleset_version = $1 AND rule_id = 'SAPO-STREET-LARGE-001'`,
      [ruleset.rulesetVersion],
    );
    expect(repaired.rows[0]).toEqual({
      kind: "permit",
      verification_status: "SOURCE_CONFIRMED",
    });
  });

  it("serializes concurrent same-version rules syncs", async () => {
    await syncPermitRules(database, ruleset);
    const concurrentDatabase = new Client({ connectionString: databaseUrl });
    await concurrentDatabase.connect();
    try {
      await Promise.all([
        syncPermitRules(database, ruleset),
        syncPermitRules(concurrentDatabase, ruleset),
      ]);
    } finally {
      await concurrentDatabase.end();
    }

    const count = await database.query<{ count: string }>(
      "SELECT count(*) FROM permit_rules WHERE ruleset_version = $1",
      [ruleset.rulesetVersion],
    );
    expect(Number(count.rows[0]?.count)).toBe(37);
  });

  it("rolls back a failed sync without erasing the prior read model", async () => {
    const invalidRuleset: PublishedRuleset = {
      ...ruleset,
      rules: ruleset.rules.map((rule, index) =>
        index === 0 ? { ...rule, kind: "invalid_kind" } : rule,
      ),
    };

    await expect(syncPermitRules(database, invalidRuleset)).rejects.toThrow(/check constraint/);
    const count = await database.query<{ count: string }>(
      "SELECT count(*) FROM permit_rules WHERE ruleset_version = $1",
      [ruleset.rulesetVersion],
    );
    expect(Number(count.rows[0]?.count)).toBe(37);
  });
});
