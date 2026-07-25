import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // The intake question nyc.v2.5 adds. It has to land with the registry declaration, not after it:
  // ruleset.test.ts asserts the events columns equal the ruleset's intake fields plus the eight
  // fixed columns, so either half alone fails that guard.
  //
  // NOT NULL DEFAULT false back-fills every existing row as "no battery system". That is only
  // honest because there are none that genuinely have one: the demo environment holds synthetic
  // data only (AD-12), and no fixture or scenario has ever set a battery. Against real rows it
  // would be wrong — it would assert an answer nobody gave — and the column would have to be
  // nullable with the unknown carried into the plan instead.
  pgm.addColumn("events", {
    battery_present: { type: "boolean", notNull: true, default: false },
  });
}
