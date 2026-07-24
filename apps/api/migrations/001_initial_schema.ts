import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

const oneOf = (column: string, values: readonly string[]): string =>
  `"${column}" IN (${values.map((value) => `'${value}'`).join(", ")})`;

const currentTimestamp = (pgm: MigrationBuilder) => pgm.func("current_timestamp");

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("events", {
    id: { type: "uuid", primaryKey: true },
    name: { type: "text", notNull: true },
    borough: {
      type: "text",
      notNull: true,
      check: oneOf("borough", ["manhattan", "brooklyn", "queens", "bronx", "staten_island"]),
    },
    location_type: {
      type: "text",
      notNull: true,
      check: oneOf("location_type", ["street", "sidewalk", "plaza", "park", "private_venue"]),
    },
    location_name: { type: "text" },
    obstructs_public_way: {
      type: "text",
      check: oneOf("obstructs_public_way", ["yes", "no", "unknown"]),
    },
    sapo_event_type: {
      type: "text",
      check: oneOf("sapo_event_type", [
        "street_event",
        "block_party",
        "plaza_event",
        "other_sapo_class",
        "unknown",
      ]),
    },
    street_event_size: {
      type: "text",
      check: oneOf("street_event_size", ["small", "medium", "large", "extra_large", "unknown"]),
    },
    plaza_level: {
      type: "text",
      check: oneOf("plaza_level", ["a", "b", "c", "d", "unknown"]),
    },
    plaza_multiple_blocks: { type: "boolean" },
    has_amusement_ride: { type: "boolean" },
    headcount: { type: "integer", notNull: true },
    capacity: { type: "integer" },
    event_date: { type: "date", notNull: true },
    event_open_to_public: {
      type: "text",
      notNull: true,
      check: oneOf("event_open_to_public", ["yes", "no", "unknown"]),
    },
    food_present: { type: "boolean", notNull: true },
    food_vendor_count: { type: "integer" },
    food_affinity_private_exception_claimed: {
      type: "text",
      check: oneOf("food_affinity_private_exception_claimed", ["yes", "no", "unknown"]),
    },
    selling_anything: { type: "boolean", notNull: true },
    amplified_sound: { type: "boolean", notNull: true },
    sound_audible_from_public_way: {
      type: "text",
      check: oneOf("sound_audible_from_public_way", ["yes", "no", "unknown"]),
    },
    structure_types: {
      type: "text[]",
      notNull: true,
      check:
        '"structure_types" <@ ARRAY[' +
        "'tent_canopy', 'stage_platform_scaffold', 'prop_truss', " +
        "'bleachers_inflatable', 'none']::text[]",
    },
    tent_area_sqft: { type: "integer" },
    tent_days_in_place: { type: "integer" },
    stage_height_ft: { type: "numeric" },
    stage_area_sqft: { type: "integer" },
    structure_over_10ft_tall: {
      type: "text",
      check: oneOf("structure_over_10ft_tall", ["yes", "no", "unknown"]),
    },
    open_flame_or_cooking: {
      type: "text[]",
      notNull: true,
      check:
        '"open_flame_or_cooking" <@ ARRAY[' +
        "'charcoal_wood', 'propane_lpg', 'sterno_candles_heaters', 'none']::text[]",
    },
    generator_present: { type: "boolean", notNull: true },
    generator_gasoline_gallons: { type: "numeric" },
    generator_diesel_gallons: { type: "numeric" },
    generator_kw: { type: "numeric" },
    battery_system_kwh: { type: "numeric" },
    alcohol: { type: "boolean", notNull: true },
    venue_license_covers_event_area: {
      type: "text",
      check: oneOf("venue_license_covers_event_area", ["yes", "no", "unknown"]),
    },
    venue_has_assembly_approval: {
      type: "text",
      check: oneOf("venue_has_assembly_approval", ["yes", "no", "unknown"]),
    },
    status: {
      type: "text",
      notNull: true,
      default: "draft",
      check: oneOf("status", ["draft", "planned", "live", "done"]),
    },
    revision_counter: { type: "integer", notNull: true, default: 1 },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: currentTimestamp(pgm),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: currentTimestamp(pgm),
    },
  });

  pgm.createTable(
    "permit_rules",
    {
      ruleset_version: { type: "text", notNull: true },
      rule_id: { type: "text", notNull: true },
      kind: {
        type: "text",
        notNull: true,
        check: oneOf("kind", [
          "permit",
          "insurance",
          "notification",
          "registration",
          "eligibility",
          "prohibition",
          "dependency",
          "classification",
          "advisory",
          "note",
        ]),
      },
      title: { type: "text" },
      agency: { type: "text" },
      trigger: { type: "jsonb", notNull: true },
      output: { type: "jsonb", notNull: true },
      verification: { type: "jsonb", notNull: true },
      source: { type: "jsonb" },
    },
    { constraints: { primaryKey: ["ruleset_version", "rule_id"] } },
  );

  pgm.createTable("permit_plans", {
    id: { type: "uuid", primaryKey: true },
    event_id: {
      type: "uuid",
      notNull: true,
      references: "events",
    },
    event_revision: { type: "integer", notNull: true },
    ruleset_version: { type: "text", notNull: true },
    verdict: {
      type: "text",
      notNull: true,
      check: oneOf("verdict", ["feasible", "feasible_at_risk", "conditional", "infeasible"]),
    },
    verdict_detail: { type: "jsonb", notNull: true },
    intake_snapshot: { type: "jsonb", notNull: true },
    generated_at: {
      type: "timestamptz",
      notNull: true,
      default: currentTimestamp(pgm),
    },
  });

  pgm.createTable("permit_plan_items", {
    id: { type: "uuid", primaryKey: true },
    plan_id: {
      type: "uuid",
      notNull: true,
      references: "permit_plans",
    },
    rule_id: { type: "text", notNull: true },
    permit_name: { type: "text" },
    agency: { type: "text" },
    deadline: { type: "jsonb" },
    latest_apply_date: { type: "date" },
    apply_after_date: { type: "date" },
    fee_display: { type: "text" },
    required_documents: { type: "jsonb" },
    portal_name: { type: "text" },
    portal_url: { type: "text" },
    source_url: { type: "text" },
    verified_status: { type: "text" },
    last_verified_date: { type: "date" },
    kind: {
      type: "text",
      notNull: true,
      check: oneOf("kind", [
        "permit",
        "insurance",
        "notification",
        "registration",
        "eligibility",
        "prohibition",
        "dependency",
        "advisory",
        "note",
      ]),
    },
    disposition: {
      type: "text",
      notNull: true,
      check: oneOf("disposition", [
        "required",
        "may_be_required",
        "prohibited_or_ineligible",
        "advisory",
        "no_new_requirement",
      ]),
    },
    deadline_status: {
      type: "text",
      notNull: true,
      check: oneOf("deadline_status", [
        "on_track",
        "deadline_approaching",
        "published_deadline_missed",
        "not_calculable",
        "not_applicable",
      ]),
    },
    verification_status: {
      type: "text",
      notNull: true,
      check: oneOf("verification_status", [
        "SOURCE_CONFIRMED",
        "OFFICIAL_CONFLICT",
        "RESEARCH_REQUIRED",
        "COVERAGE_GAP",
        "VERIFIED",
      ]),
    },
  });

  pgm.createTable("checklist_items", {
    id: { type: "uuid", primaryKey: true },
    event_id: {
      type: "uuid",
      notNull: true,
      references: "events",
    },
    plan_item_id: {
      type: "uuid",
      notNull: true,
      references: "permit_plan_items",
    },
    status: {
      type: "text",
      notNull: true,
      default: "not_started",
      check: oneOf("status", ["not_started", "in_progress", "submitted", "approved", "rejected"]),
    },
    notes: { type: "text" },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: currentTimestamp(pgm),
    },
  });

  pgm.createTable("documents", {
    id: { type: "uuid", primaryKey: true },
    checklist_item_id: {
      type: "uuid",
      notNull: true,
      references: "checklist_items",
    },
    filename: { type: "text", notNull: true },
    content_type: { type: "text", notNull: true },
    size_bytes: { type: "bigint", notNull: true },
    storage_key: { type: "text", notNull: true },
    uploaded_at: {
      type: "timestamptz",
      notNull: true,
      default: currentTimestamp(pgm),
    },
  });

  pgm.createTable("alerts", {
    id: { type: "uuid", primaryKey: true },
    event_id: {
      type: "uuid",
      notNull: true,
      references: "events",
    },
    checklist_item_id: {
      type: "uuid",
      references: "checklist_items",
    },
    alert_type: {
      type: "text",
      notNull: true,
      check: oneOf("alert_type", ["deadline_reminder", "slack_warning", "dependency_unlocked"]),
    },
    channel: {
      type: "text",
      notNull: true,
      check: oneOf("channel", ["email", "sms"]),
    },
    recipient: { type: "text", notNull: true },
    idempotency_key: { type: "text", notNull: true, unique: true },
    send_at: { type: "timestamptz", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "pending",
      check: oneOf("status", ["pending", "sent", "failed", "cancelled"]),
    },
    sent_at: { type: "timestamptz" },
    payload: { type: "jsonb", notNull: true },
  });

  pgm.createTable("rsvps", {
    id: { type: "uuid", primaryKey: true },
    event_id: {
      type: "uuid",
      notNull: true,
      references: "events",
    },
    name: { type: "text", notNull: true },
    email: { type: "text", notNull: true },
    phone: { type: "text" },
    status: {
      type: "text",
      notNull: true,
      default: "confirmed",
      check: oneOf("status", ["confirmed", "cancelled"]),
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: currentTimestamp(pgm),
    },
  });

  pgm.createTable("checkins", {
    id: { type: "uuid", primaryKey: true },
    event_id: {
      type: "uuid",
      notNull: true,
      references: "events",
    },
    rsvp_id: {
      type: "uuid",
      references: "rsvps",
    },
    name: { type: "text", notNull: true },
    contact: { type: "text", notNull: true },
    checked_in_at: {
      type: "timestamptz",
      notNull: true,
      default: currentTimestamp(pgm),
    },
  });
}
