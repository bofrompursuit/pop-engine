import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadRuleset } from "./ruleset";

// Regression guard for issue #73: the published rule kinds and the persisted
// finding-kind contract must not drift apart. A rule's `kind` describes what the
// rule IS; a plan item's `kind` describes the finding it EMITS. They are equal for
// every rule except `classification`, which persists as a `note` finding. This test
// derives both enum sets from their authoritative sources (the migration CHECKs and
// the published ruleset) rather than hard-coding a fourth copy, so any new rule kind
// forces an explicit persistence decision here.

const migrationFile = fileURLToPath(
  new URL("../migrations/001_initial_schema.ts", import.meta.url),
);

// A classification rule is not persisted with its own kind; it becomes a note.
// Add an entry here (with review) if a future rule kind is also non-persistable.
const RULE_KIND_TO_FINDING_KIND: Record<string, string> = { classification: "note" };

/** Extract the string list from the `oneOf("kind", [...])` CHECK inside one createTable block. */
function kindCheckFor(source: string, tableName: string): Set<string> {
  const tableStart = source.search(new RegExp(`createTable\\(\\s*"${tableName}"`));
  if (tableStart === -1) throw new Error(`table ${tableName} not found in migration`);
  const region = source.slice(tableStart);
  const match = region.match(/oneOf\("kind",\s*\[([^\]]*)\]/);
  if (!match || match[1] === undefined) throw new Error(`no kind CHECK found for ${tableName}`);
  return new Set([...match[1].matchAll(/"([^"]+)"/g)].flatMap((m) => (m[1] ? [m[1]] : [])));
}

describe("rule kind vs persisted finding kind (#73)", () => {
  it("keeps rule kinds and finding kinds consistent across ruleset and migration", async () => {
    const migration = await readFile(migrationFile, "utf8");
    const ruleKindsDb = kindCheckFor(migration, "permit_rules");
    const findingKinds = kindCheckFor(migration, "permit_plan_items");

    const ruleset = await loadRuleset();
    const usedKinds = new Set(
      [...ruleset.rules, ...ruleset.advisories].map((rule) => rule.kind),
    );

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
    // the ruleset uses and one the plan-item table rejects. This forces the mapping to
    // stay minimal and current.
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
