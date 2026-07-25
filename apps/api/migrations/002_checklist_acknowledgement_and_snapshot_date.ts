import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

const currentTimestamp = (pgm: MigrationBuilder) => pgm.func("current_timestamp");

export function up(pgm: MigrationBuilder): void {
  // What the organizer last reviewed, so "your plan changed" can be answered by comparing the
  // latest plan against an acknowledgement rather than by inspecting the checklist's own rows.
  // The checklist cannot answer it: a regeneration that removes every trackable requirement
  // leaves nothing to compare, and that is exactly the case the prompt must still fire in.
  // One row per event; re-acknowledging overwrites it (F-202 AC 6).
  // The target a composite foreign key needs, not a second identity for the plan. `rsvps`
  // carries the same pair for `checkins`.
  pgm.addConstraint("permit_plans", "permit_plans_event_id_id_key", {
    unique: ["event_id", "id"],
  });

  pgm.createTable(
    "checklist_acknowledgements",
    {
      event_id: {
        type: "uuid",
        primaryKey: true,
        references: "events",
      },
      plan_id: { type: "uuid", notNull: true },
      acknowledged_at: {
        type: "timestamptz",
        notNull: true,
        default: currentTimestamp(pgm),
      },
    },
    {
      // Pairwise, so the database rejects an acknowledgement naming another event's plan.
      // Two independent references would accept it, and the "plan has changed" comparison
      // would then be answered against a plan the organizer could never have seen.
      constraints: {
        foreignKeys: {
          columns: ["event_id", "plan_id"],
          references: "permit_plans(event_id, id)",
        },
      },
    },
  );

  // The ruleset's published snapshot date, pinned on the plan alongside ruleset_version so a
  // stored plan carries the same pair the banner rendered (F-206). Published-on, not
  // verified-on. Nullable because plans generated before this migration have no recorded value
  // and inventing one would assert a publication date the plan was never evaluated against.
  pgm.addColumn("permit_plans", {
    snapshot_date: { type: "date" },
  });
}
