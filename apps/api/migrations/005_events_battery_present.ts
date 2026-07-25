import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // The intake question nyc.v2.5 adds. It has to land with the registry declaration, not after it:
  // ruleset.test.ts asserts the events columns equal the ruleset's intake fields plus the eight
  // fixed columns, so either half alone fails that guard.
  pgm.addColumn("events", { battery_present: { type: "boolean" } });

  // A row carrying a kWh answer has a battery: the number is the evidence, and it is the one thing
  // the old questionnaire did record. This keeps `battery_system_kwh` in scope for that row, so an
  // event over the 20 kWh threshold does not lose its FDNY finding on the next regeneration.
  pgm.sql(`UPDATE events SET battery_present = true WHERE battery_system_kwh IS NOT NULL`);

  // A row with no kWh answer gets false, and this ASSERTS AN ANSWER NOBODY GAVE. Before v2.5 a
  // blank kWh was in scope and unanswered, which the engine reads as a material unknown and
  // reports as MAY_BE_REQUIRED; false makes it "no battery" instead. That is a real change to what
  // such a row evaluates to, and nothing in the row's own answers justifies it.
  //
  // It is written anyway, and only because there are no such rows: no database is configured in
  // any environment, so `events` is empty everywhere this runs.
  //
  // Leaving them NULL would not have preserved the unknown either, which is the part worth being
  // exact about. `asked_when: "battery_present"` is a truthy test — intake/visibility.ts compares
  // `answer === true` — so a NULL scopes `battery_system_kwh` out and the engine reads the row as
  // having no battery, exactly as false does. The difference is only that the schema would look
  // like it had preserved something. Both options assert; this one says so.
  pgm.sql(`UPDATE events SET battery_present = false WHERE battery_system_kwh IS NULL`);

  // The column stays nullable and no row is left NULL by the two statements above. NULL is not a
  // state the api can produce — `battery_present` has no `asked_when`, so it is always in scope and
  // `validateIntake` requires it on every submission — and if one ever did arise the engine would
  // read it as false, not as unknown. It is nullable only because several test helpers insert
  // events with partial column lists; a NOT NULL constraint here would be enforcing a rule those
  // callers do not follow, which is a change to them rather than to this column.
  //
  // A migration facing real rows could not write the false above. It would have to leave them
  // unanswered and let the engine keep reporting the unknown, which needs `asked_when` to carry
  // unknown rather than collapsing it to false — an engine semantics change touching every
  // conditional field in the registry, not something a column backfill can stand in for.
}
