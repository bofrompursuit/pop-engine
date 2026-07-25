import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Where a task sits among the tasks created with it. Migration 004 records WHEN a requirement
  // became a task, which orders one materialization against another; it cannot order within one,
  // because Postgres fixes `current_timestamp` per transaction and every task of a single
  // materialization therefore carries the identical value. That is not a rare tie: it is every
  // row of a first checklist.
  //
  // Nothing already stored can answer it either, and this is the second column of #92's ordering
  // defect rather than a new question. `plan.generated_at` was the first answer and derived the
  // order from the plan a row happens to point at, which a rescope moves. The plan item's
  // `latest_apply_date` was the second and is recalculated by every regeneration, so a retained
  // row re-pointed at a new date crosses a dropped row still carrying the last-known date of the
  // plan that raised it, and the pair swaps under the organizer. Both read a plan; a plan is not
  // a property of the task.
  //
  // Written once, on insert, from the position the requirement had in the plan being
  // materialized, which `materialize` walks in published filing-date order, so a checklist still
  // leads with the soonest deadline (F-202 AC 5, and the order the work happens in). Frozen
  // there: `latest` moves, `when it was created` does not.
  pgm.addColumn("checklist_items", {
    cohort_position: {
      type: "integer",
      notNull: true,
      default: 0,
    },
  });

  // What the default alone would do to rows that already exist: give every one of them 0, so a
  // whole cohort ties and falls through to the `rule_ids` backstop. Measured against a database
  // built on the pre-007 schema and then migrated, a checklist displayed [ZULU, ALPHA] by filing
  // date came back [ALPHA, ZULU]. A migration whose purpose is stopping the list from reshuffling
  // would have reshuffled every existing list once, on the way in, with no rescope and no user
  // action. So the position is carried over rather than defaulted.
  //
  // THE ORDER THIS ASSERTS, precisely. For rows created after this migration, `cohort_position` is
  // the requirement's place in the plan being materialized, recorded at insert. For rows created
  // before it, it is **the order those rows were being displayed in when this migration ran**,
  // which is not the same statement. The creation order of an old row is unrecoverable, because
  // `plan_item_id` is re-pointed on every regeneration and the plan it was created against is no
  // longer reachable from the row. What is recoverable is what the organizer was looking at, and
  // that is what is preserved: the SELECT below is the pre-007 read path's ORDER BY, verbatim,
  // down to NULLS LAST. Rows predating migration 004 share its timestamp and rank as one cohort,
  // which is also exactly what they displayed as.
  //
  // Unlike 004's creation timestamps and 006's battery answer, this is not a fact nobody recorded
  // and it is not inferred: it is computed from the same rows the old query read. That is the
  // reason this backfills where those two deliberately did not.
  //
  // Expected to update nothing today. No database is configured anywhere for this project: no
  // deployed environment, no seeded instance, and CI builds a throwaway Postgres per run, so
  // `checklist_items` is empty everywhere this will run. The backfill is here because that is an
  // argument about today: it costs one statement, and it is what makes the migration correct for
  // any database that does hold rows, including one nobody remembered to mention.
  pgm.sql(`
    UPDATE checklist_items
       SET cohort_position = ranked.position
      FROM (
        SELECT checklist.id,
               row_number() OVER (
                 PARTITION BY plan.event_id, checklist.created_at
                 ORDER BY plan.generated_at, item.latest_apply_date NULLS LAST,
                          item.permit_name, item.rule_ids
               ) - 1 AS position
          FROM checklist_items AS checklist
          JOIN permit_plan_items AS item ON item.id = checklist.plan_item_id
          JOIN permit_plans AS plan ON plan.id = item.plan_id
      ) AS ranked
     WHERE checklist_items.id = ranked.id
  `);
}
