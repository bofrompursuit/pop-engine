import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRuleset } from "./ruleset";

// Regression guard for issue #73: the published rule kinds and the persisted
// finding-kind contract must not drift apart. A rule's `kind` describes what the
// rule IS; a plan item's `kind` describes the finding it EMITS. They are equal for
// every rule except `classification`, which persists as a `note` finding.
//
// The allowed kind sets are read from the live database's CHECK constraints after
// the full migration chain has run (CI applies `migrate up` before tests), not from
// a specific migration file. That way a correctly-added future migration is honored
// and nobody is pushed to edit a merged migration. Runs only when a database is
// configured, matching the other schema-backed suites.

const databaseUrl = process.env.DATABASE_URL ?? "";

// A classification rule is not persisted with its own kind; it becomes a note.
// Add an entry here (with review) if a future rule kind is also non-persistable.
const RULE_KIND_TO_FINDING_KIND: Record<string, string> = { classification: "note" };

/** Read the allowed values of a table's `kind` CHECK constraint from the current schema. */
async function allowedKinds(db: Client, table: string): Promise<Set<string>> {
  const { rows } = await db.query<{ def: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
      WHERE c.contype = 'c' AND t.relname = $1
        AND pg_get_constraintdef(c.oid) ~ 'kind ='`,
    [table],
  );
  if (rows.length === 0) throw new Error(`no kind CHECK constraint found on ${table}`);
  const kinds = new Set<string>();
  for (const { def } of rows) {
    for (const match of def.matchAll(/'([^']+)'/g)) if (match[1]) kinds.add(match[1]);
  }
  return kinds;
}

describe.runIf(databaseUrl.length > 0)("rule kind vs persisted finding kind (#73)", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: databaseUrl });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it("keeps rule kinds and finding kinds consistent across ruleset and current schema", async () => {
    const ruleKindsDb = await allowedKinds(db, "permit_rules");
    const findingKinds = await allowedKinds(db, "permit_plan_items");

    const ruleset = await loadRuleset();
    const usedKinds = new Set([...ruleset.rules, ...ruleset.advisories].map((rule) => rule.kind));

    // Every kind the ruleset actually uses must be accepted by the rules read model.
    for (const kind of usedKinds) {
      expect(ruleKindsDb, `permit_rules.kind must accept "${kind}"`).toContain(kind);
    }

    // Every used kind must either persist as itself or have a reviewed mapping to a
    // kind the plan-item table accepts.
    for (const kind of usedKinds) {
      if (findingKinds.has(kind)) continue;
      const mapped = RULE_KIND_TO_FINDING_KIND[kind];
      expect(mapped, `rule kind "${kind}" is not a finding kind and has no mapping`).toBeDefined();
      expect(findingKinds, `mapping target "${mapped}" must be a finding kind`).toContain(mapped);
    }

    // The mapping may not carry stale entries: every mapped source kind must be one
    // the ruleset uses and one the plan-item table rejects. This keeps the mapping
    // minimal and forces a decision when a new non-persistable kind appears.
    for (const source of Object.keys(RULE_KIND_TO_FINDING_KIND)) {
      expect(usedKinds, `mapping source "${source}" is unused by the ruleset`).toContain(source);
      expect(findingKinds, `mapping source "${source}" is already a finding kind`).not.toContain(
        source,
      );
    }

    // Pin the specific case this test exists for.
    expect(ruleKindsDb.has("classification")).toBe(true);
    expect(findingKinds.has("classification")).toBe(false);
  });
});
