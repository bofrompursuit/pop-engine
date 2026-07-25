import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Resolves SPEC-CONFLICT #100 for F-301.
 *
 * Adds the two events columns the public page needs that migration 001 lacked:
 * - description: organizer-entered promotion copy (not an intake/rules field)
 * - public_page_published: visibility toggle (unpublished → friendly 404)
 *
 * Numbered 005 so it runs after the already-merged 004_checklist_item_created_at.
 * (An earlier draft used 003; that name would fail node-pg-migrate's default
 * order check on databases that already applied 004.)
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
