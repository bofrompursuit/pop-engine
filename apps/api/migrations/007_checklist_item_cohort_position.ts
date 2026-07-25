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

  // Rows predating this column all take the default and tie, exactly as they tie on 004's
  // timestamp. Back-filling them from today's plans would re-assert the recalculated measurement
  // this column exists to stop reading, so they fall through to the deterministic `rule_ids`
  // backstop instead, which no regeneration moves.
}
