import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // When a requirement became a checklist task, which is what "new items appended" orders by
  // (F-202 AC 6). Nothing already stored can answer it. `permit_plans.generated_at` answers a
  // different question — when the requirement first appeared in any plan — and the two diverge
  // exactly when a requirement appears early, is absent as the checklist is created, and returns
  // later: the reintroduced task then sorts ahead of rows the organizer has been working.
  // `checklist_items.updated_at` cannot stand in either, because a status change or a note moves
  // it, so ordering by it would reshuffle the list as the work proceeds.
  //
  // Set once, on insert. `materialize` re-points a surviving row at the current plan's item and
  // deliberately leaves both timestamps alone: being re-pointed is not the organizer doing
  // something, and it is not the task being created again.
  pgm.addColumn("checklist_items", {
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  // Rows that predate this column all take the migration's own timestamp and therefore tie. That
  // is the honest outcome: their creation time was never recorded, and back-dating them from the
  // plans would re-assert the very measurement this column replaces. Ties fall through to the
  // deterministic filing-date order the query already applies, so the display stays stable.
}
