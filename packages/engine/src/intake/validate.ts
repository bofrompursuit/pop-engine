// Intake validation: types, applicability, contradictions, and the inline notices.
//
// Every field rule is read from the published registry (`IntakeContract`), so a ruleset
// edit changes validation without a code change. Blocking problems come back as errors;
// the spec's inline warnings (block-party eligibility, alcohol in public space) never
// block submission — they are shown and the event is stored as answered.

import type { IntakeContract, IntakeField } from "./registry";
import { askedFieldNames, type IntakeAnswers, type IntakeValue } from "./visibility";

export type IntakeIssue = {
  readonly field: string;
  readonly code: string;
  readonly message: string;
};

export type IntakeRecord = Readonly<Record<string, IntakeValue>>;

export type IntakeValidation = {
  /** The full event row to persist, or null when `errors` is non-empty. */
  readonly values: IntakeRecord | null;
  readonly errors: readonly IntakeIssue[];
  readonly warnings: readonly IntakeIssue[];
};

/**
 * Columns the `events` table carries that the ruleset does not declare, because they
 * hold no regulatory meaning (ARCHITECTURE.md events table: Identity, Scale + date).
 * `capacity` is the confirmed venue capacity for F-402, not the headcount.
 */
const DESCRIPTIVE_FIELDS = [
  { field: "name", type: "text", required: true },
  { field: "location_name", type: "text", required: false },
  { field: "capacity", type: "positive_integer", required: false },
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The exclusive option a multi-enum uses for "none of these" (mirrors the CHECK constraint). */
const EXCLUSIVE_OPTION = "none";

const issue = (field: string, code: string, message: string): IntakeIssue => ({
  field,
  code,
  message,
});

function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

/** Coerce one submitted value against its declared type, or describe why it does not fit. */
function readFieldValue(field: IntakeField, raw: unknown): IntakeValue | IntakeIssue {
  const rejected = (message: string): IntakeIssue => issue(field.field, "invalid_value", message);

  switch (field.type) {
    case "enum":
      return typeof raw === "string" && field.values?.includes(raw) === true
        ? raw
        : rejected(`${field.field} must be one of ${field.values?.join(", ")}`);
    case "multi_enum": {
      if (!Array.isArray(raw) || raw.length === 0) {
        return rejected(`${field.field} must select at least one option`);
      }
      const selected = [...new Set(raw)];
      if (
        selected.some(
          (value) => typeof value !== "string" || field.values?.includes(value) !== true,
        )
      ) {
        return rejected(`${field.field} must only contain ${field.values?.join(", ")}`);
      }
      if (selected.includes(EXCLUSIVE_OPTION) && selected.length > 1) {
        return rejected(`${field.field} cannot combine "${EXCLUSIVE_OPTION}" with other options`);
      }
      return selected as readonly string[];
    }
    case "boolean":
      return typeof raw === "boolean" ? raw : rejected(`${field.field} must be true or false`);
    case "integer":
      return Number.isInteger(raw)
        ? (raw as number)
        : rejected(`${field.field} must be a whole number`);
    case "number":
      return typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : rejected(`${field.field} must be a number`);
    case "date":
      return typeof raw === "string" && isIsoDate(raw)
        ? raw
        : rejected(`${field.field} must be a date (YYYY-MM-DD)`);
  }
}

function readDescriptiveValue(
  descriptive: (typeof DESCRIPTIVE_FIELDS)[number],
  raw: unknown,
): IntakeValue | IntakeIssue {
  if (descriptive.type === "text") {
    return typeof raw === "string" && raw.trim().length > 0
      ? raw.trim()
      : issue(descriptive.field, "invalid_value", `${descriptive.field} must be text`);
  }
  return Number.isInteger(raw) && (raw as number) > 0
    ? (raw as number)
    : issue(
        descriptive.field,
        "invalid_value",
        `${descriptive.field} must be a positive whole number`,
      );
}

const isIssue = (value: IntakeValue | IntakeIssue): value is IntakeIssue =>
  typeof value === "object" && value !== null && !Array.isArray(value) && "code" in value;

const isProvided = (submission: Readonly<Record<string, unknown>>, field: string): boolean =>
  submission[field] !== undefined && submission[field] !== null;

/** The columns an intake record covers: the registry's fields plus the descriptive ones. */
export function intakeColumnNames(contract: IntakeContract): string[] {
  return [
    ...contract.fields.map((field) => field.field),
    ...DESCRIPTIVE_FIELDS.map((field) => field.field),
  ];
}

/** The spec's inline warnings for a set of answers. Never blocking; safe to recompute. */
export function intakeWarnings(contract: IntakeContract, answers: IntakeAnswers): IntakeIssue[] {
  const warnings: IntakeIssue[] = [];

  // Spec #4: a block party that sells or serves alcohol conflicts with block-party
  // eligibility. Warn inline, store the answers as given; the plan renders the
  // PROHIBITED_OR_INELIGIBLE finding.
  if (
    answers.sapo_event_type === "block_party" &&
    (answers.selling_anything === true || answers.alcohol === true)
  ) {
    warnings.push(
      issue(
        "sapo_event_type",
        "block_party_eligibility_conflict",
        contract.blockPartyEligibilityNotice,
      ),
    );
  }

  // Spec #5: alcohol in public space is outside this ruleset version's coverage. The
  // public location types are every location type other than the private venue; the
  // engine tests pin this against ADV-ALCOHOL-PUBLIC-001's own trigger.
  if (
    answers.alcohol === true &&
    typeof answers.location_type === "string" &&
    answers.location_type !== "private_venue"
  ) {
    warnings.push(issue("alcohol", "coverage_gap", contract.alcoholInPublicSpaceNotice));
  }

  return warnings;
}

/**
 * Validate a complete intake submission against the published contract.
 *
 * `today` is an explicit ISO date (the engine never reads the clock) and is only used
 * for the past-date check.
 */
export function validateIntake(
  contract: IntakeContract,
  submission: Readonly<Record<string, unknown>>,
  today: string,
): IntakeValidation {
  const errors: IntakeIssue[] = [];
  const answers: Record<string, IntakeValue> = {};

  const known = new Set<string>([
    ...contract.fields.map((field) => field.field),
    ...DESCRIPTIVE_FIELDS.map((field) => field.field),
  ]);
  for (const key of Object.keys(submission)) {
    if (!known.has(key)) {
      errors.push(issue(key, "unknown_field", `${key} is not an intake field`));
    }
  }

  for (const field of contract.fields) {
    if (!isProvided(submission, field.field)) continue;
    const value = readFieldValue(field, submission[field.field]);
    if (isIssue(value)) errors.push(value);
    else answers[field.field] = value;
  }

  const asked = askedFieldNames(contract.fields, answers);
  for (const field of contract.fields) {
    if (!asked.has(field.field)) {
      if (isProvided(submission, field.field)) {
        errors.push(
          issue(
            field.field,
            "not_applicable",
            `${field.field} is only asked when ${field.askedWhenSource}; remove it or change the answer that triggers it`,
          ),
        );
      }
      continue;
    }
    if (!isProvided(submission, field.field) && !field.nullable) {
      errors.push(issue(field.field, "required", `${field.field} is required for this event`));
    }
  }

  for (const descriptive of DESCRIPTIVE_FIELDS) {
    if (!isProvided(submission, descriptive.field)) {
      if (descriptive.required) {
        errors.push(issue(descriptive.field, "required", `${descriptive.field} is required`));
      }
      continue;
    }
    const value = readDescriptiveValue(descriptive, submission[descriptive.field]);
    if (isIssue(value)) errors.push(value);
    else answers[descriptive.field] = value;
  }

  if (typeof answers.headcount === "number" && answers.headcount <= 0) {
    errors.push(issue("headcount", "must_be_positive", "headcount must be at least 1"));
  }
  if (typeof answers.event_date === "string" && answers.event_date < today) {
    errors.push(issue("event_date", "in_the_past", "event_date must be today or later"));
  }

  const warnings = intakeWarnings(contract, answers);
  if (errors.length > 0) return { values: null, errors, warnings };

  // Un-asked fields persist as NULL: the question was never put to the organizer.
  const values: Record<string, IntakeValue> = {};
  for (const field of contract.fields) values[field.field] = answers[field.field] ?? null;
  for (const descriptive of DESCRIPTIVE_FIELDS) {
    values[descriptive.field] = answers[descriptive.field] ?? null;
  }
  return { values, errors, warnings };
}
