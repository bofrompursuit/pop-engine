import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // The intake question nyc.v2.5 adds. It has to land with the registry declaration, not after it:
  // ruleset.test.ts asserts the events columns equal the ruleset's intake fields plus the eight
  // fixed columns, so either half alone fails that guard.
  //
  // Nullable, and deliberately not `NOT NULL DEFAULT false`. A row written before this migration
  // was never asked about a battery, and "not asked" is a state the engine already represents and
  // acts on: it makes the field a material unknown rather than an answer. Defaulting those rows to
  // false would assert an answer nobody gave, scope `battery_system_kwh` out of the plan, and
  // change what a regeneration says about an event that has not changed. The demo data being
  // synthetic (AD-12) is an argument about the rows; the column is a contract, and it should be
  // able to say "unanswered" because that is what those rows are.
  pgm.addColumn("events", {
    battery_present: { type: "boolean" },
  });

  // A row that already carries a kWh answer has a battery — that is what the number means, and it
  // is the one case where the old questionnaire did record the fact. Backfilling it keeps
  // `battery_system_kwh` in scope for those rows, so an event over the 20 kWh threshold does not
  // quietly lose its FDNY finding on the next regeneration. Rows with no kWh answer stay NULL:
  // they were never asked, and nothing here knows better.
  pgm.sql(`UPDATE events SET battery_present = true WHERE battery_system_kwh IS NOT NULL`);

  // New events still have to answer it. The registry declares `battery_present` without
  // `nullable`, so validateIntake requires it on every submission; NULL is reachable only for rows
  // that predate the question.
}
