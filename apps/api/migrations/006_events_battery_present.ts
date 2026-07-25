import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // The intake question nyc.v2.5 adds. It has to land with the registry declaration, not after it:
  // ruleset.test.ts asserts the events columns equal the ruleset's intake fields plus the eight
  // fixed columns, so either half alone fails that guard.
  pgm.addColumn("events", { battery_present: { type: "boolean" } });

  // A POSITIVE kWh answer is evidence of a battery, and it is the one thing the old questionnaire
  // recorded. Backfilling it keeps `battery_system_kwh` in scope for that row, so an event over the
  // 20 kWh threshold does not lose its FDNY finding on the next regeneration.
  //
  // `> 0` rather than `IS NOT NULL`, and this is not a tidier way to write the same thing. Zero was
  // an accepted quantity under the previous contract and it was how "no battery" was written: both
  // pre-v2.5 fixture sets encode it that way — `acceptance.test.ts` sets `battery_system_kwh: 0`
  // with a comment reading it off the answer key as "no battery system", and `plan.test.ts` does
  // the same beside `generator_present: false`. Treating every non-NULL number as a battery would
  // make those rows report "battery present: yes" in the edit form and the API, which is the
  // opposite of what the organizer answered. Zero is the one value whose meaning the raw number
  // does not carry, so it is handled with the NULLs below rather than here.
  //
  // Negative values need no case: `validateIntake` rejects them on every quantity field and did so
  // before v2.5 too, on the grounds that a negative is not a smaller value but not an answer, so
  // one cannot reach this table through the api. If a hand-written row ever held one, `> 0` reads
  // it as no battery, which is the safe direction.
  pgm.sql(`UPDATE events SET battery_present = true WHERE battery_system_kwh > 0`);

  // Zero means the organizer said there is no battery. NULL means they were never asked — and this
  // half ASSERTS AN ANSWER NOBODY GAVE. Before v2.5 a blank kWh was in scope and unanswered, which
  // the engine reads as a material unknown and reports as MAY_BE_REQUIRED; false makes it "no
  // battery" instead. That is a real change to what such a row evaluates to, and nothing in the
  // row's own answers justifies it.
  //
  // It is written anyway, and only because there are no such rows: no database is configured in
  // any environment, so `events` is empty everywhere this runs.
  //
  // Leaving the NULLs alone would not have preserved the unknown either, which is the part worth
  // being exact about. `asked_when: "battery_present"` is a truthy test — intake/visibility.ts
  // compares `answer === true` — so a NULL scopes `battery_system_kwh` out and the engine reads the
  // row as having no battery, exactly as false does. The difference is only that the schema would
  // look like it had preserved something. Both options assert; this one says so.
  pgm.sql(
    `UPDATE events SET battery_present = false WHERE battery_system_kwh IS NULL OR battery_system_kwh = 0`,
  );

  // The column stays nullable and no row is left NULL by the three cases above, which are total.
  // NULL is not a state the api can produce — `battery_present` has no `asked_when`, so it is
  // always in scope and `validateIntake` requires it on every submission — and if one ever did
  // arise the engine would read it as false, not as unknown. It is nullable only because several
  // test helpers insert events with partial column lists; a NOT NULL constraint here would be
  // enforcing a rule those callers do not follow, which is a change to them rather than to this
  // column.
  //
  // A migration facing real rows could not write the false above for the NULLs. It would have to
  // leave them unanswered and let the engine keep reporting the unknown, which needs `asked_when`
  // to carry unknown rather than collapsing it to false — an engine semantics change touching
  // every conditional field in the registry, not something a column backfill can stand in for.
}
