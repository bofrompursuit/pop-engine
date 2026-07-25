import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Resolves SPEC-CONFLICT #100 for F-301.
 *
 * Adds the two events columns the public page needs that migration 001 lacked:
 * - description: organizer-entered promotion copy (not an intake/rules field)
 * - public_page_published: visibility toggle (unpublished → friendly 404)
 *
 * Numbered 003 so it does not collide with migration 002 in PR #98
 * (checklist acknowledgements + plan snapshot_date). If 002 is absent on a
 * database, node-pg-migrate still applies 003 after 001 by name order only when
 * 002 has already run or is not present — operators applying from main that only
 * has 001 get 003 next; once #98 merges, both 002 and 003 apply in order.
 */
export function up(pgm: MigrationBuilder): void {
  pgm.addColumns("events", {
    description: { type: "text" },
    public_page_published: {
      type: "boolean",
      notNull: true,
      default: false,
    },
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumns("events", ["description", "public_page_published"]);
}
