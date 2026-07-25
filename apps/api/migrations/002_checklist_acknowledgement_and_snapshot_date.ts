import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

const currentTimestamp = (pgm: MigrationBuilder) => pgm.func("current_timestamp");

export function up(pgm: MigrationBuilder): void {
  // What the organizer last reviewed, so "your plan changed" can be answered by comparing the
  // latest plan against an acknowledgement rather than by inspecting the checklist's own rows.
  // The checklist cannot answer it: a regeneration that removes every trackable requirement
  // leaves nothing to compare, and that is exactly the case the prompt must still fire in.
  // One row per event; re-acknowledging overwrites it (F-202 AC 6).
  pgm.createTable("checklist_acknowledgements", {
    event_id: {
      type: "uuid",
      primaryKey: true,
      references: "events",
    },
    plan_id: {
      type: "uuid",
      notNull: true,
      references: "permit_plans",
    },
    acknowledged_at: {
      type: "timestamptz",
      notNull: true,
      default: currentTimestamp(pgm),
    },
  });

  // The ruleset's published snapshot date, pinned on the plan alongside ruleset_version so a
  // stored plan carries the same pair the banner rendered (F-206). Published-on, not
  // verified-on. Nullable because plans generated before this migration have no recorded value
  // and inventing one would assert a publication date the plan was never evaluated against.
  pgm.addColumn("permit_plans", {
    snapshot_date: { type: "date" },
  });
}
