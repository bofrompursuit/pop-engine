// Narrows the published ruleset JSON into the typed shape the engine evaluates.
// Pure: the caller reads the file (apps/api at boot) and hands over parsed JSON.
// Anything malformed throws — an evaluation input the engine cannot read is an error,
// never a quiet "no requirement" (AC 5).

import { EvaluationError } from "./types";
import type {
  Condition,
  ConditionOperator,
  Deadline,
  Disposition,
  EngineRule,
  EngineRuleset,
  IntakeFieldDefinition,
  RuleKind,
  RuleSource,
  TriggerNode,
  VerificationStatus,
} from "./types";

type JsonObject = Record<string, unknown>;

const CONDITION_OPERATORS: readonly ConditionOperator[] = [
  "eq",
  "in",
  "gt",
  "gte",
  "bool",
  "contains",
  "contains_any",
];

const RULE_KINDS: readonly RuleKind[] = [
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
];

const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "SOURCE_CONFIRMED",
  "OFFICIAL_CONFLICT",
  "RESEARCH_REQUIRED",
  "COVERAGE_GAP",
  "VERIFIED",
];

/** The rule domain publishes SCREAMING_CASE dispositions; plan items store the lowercase form (engine_conventions). */
const PUBLISHED_DISPOSITIONS: Readonly<Record<string, Disposition>> = {
  REQUIRED: "required",
  MAY_BE_REQUIRED: "may_be_required",
  PROHIBITED_OR_INELIGIBLE: "prohibited_or_ineligible",
  ADVISORY: "advisory",
  NO_NEW_REQUIREMENT_IDENTIFIED: "no_new_requirement",
};

function fail(message: string): never {
  throw new EvaluationError(`Ruleset cannot be evaluated: ${message}`);
}

function asObject(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`${label} must be an object`);
  return value as JsonObject;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") fail(`${label} must be a non-empty string`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be a number`);
  return value;
}

function optionalString(container: JsonObject, key: string): string | null {
  const value = container[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function optionalStringArray(container: JsonObject, key: string, label: string): string[] {
  const value = container[key];
  if (value === undefined) return [];
  return asArray(value, label).map((entry, index) => asString(entry, `${label}[${index}]`));
}

function parseTrigger(value: unknown, label: string): TriggerNode {
  const node = asObject(value, label);
  const keys = ["all", "any", "field"].filter((key) => Object.hasOwn(node, key));
  if (keys.length !== 1) fail(`${label} must contain exactly one of all, any, or field`);

  if (keys[0] === "field") {
    const operator = asString(node.op, `${label}.op`) as ConditionOperator;
    if (!CONDITION_OPERATORS.includes(operator))
      fail(`${label}.op has unsupported value "${operator}"`);
    if (!Object.hasOwn(node, "value")) fail(`${label}.value is required`);
    return {
      field: asString(node.field, `${label}.field`),
      op: operator,
      value: node.value,
    } satisfies Condition;
  }

  const combinator = keys[0] === "all" ? "all" : "any";
  const children = asArray(node[combinator], `${label}.${combinator}`);
  if (children.length === 0) fail(`${label}.${combinator} must not be empty`);
  const parsed = children.map((child, index) =>
    parseTrigger(child, `${label}.${combinator}[${index}]`),
  );
  return combinator === "all" ? { all: parsed } : { any: parsed };
}

function parseDeadline(value: unknown, label: string): Deadline | null {
  if (value === undefined || value === null) return null;
  const deadline = asObject(value, label);
  const type = asString(deadline.type, `${label}.type`);
  const display = optionalString(deadline, "display");

  switch (type) {
    case "published_minimum":
      return {
        type,
        calendarDays: asNumber(deadline.calendar_days, `${label}.calendar_days`),
        display,
      };
    case "published_minimum_by_level": {
      const levels = asObject(deadline.levels, `${label}.levels`);
      const parsedLevels: Record<string, { calendarDays: number; multiBlockDays: number | null }> =
        {};
      for (const [level, definition] of Object.entries(levels)) {
        const entry = asObject(definition, `${label}.levels.${level}`);
        const multiBlockDays = entry.multi_block_days;
        parsedLevels[level] = {
          calendarDays: asNumber(entry.calendar_days, `${label}.levels.${level}.calendar_days`),
          multiBlockDays:
            multiBlockDays === undefined
              ? null
              : asNumber(multiBlockDays, `${label}.levels.${level}.multi_block_days`),
        };
      }
      if (Object.keys(parsedLevels).length === 0) fail(`${label}.levels must not be empty`);
      return {
        type,
        levels: parsedLevels,
        unknownLevelBehavior: optionalString(deadline, "unknown_level_behavior"),
      };
    }
    case "composite": {
      const range = asArray(deadline.processing_range_days, `${label}.processing_range_days`);
      if (range.length !== 2) fail(`${label}.processing_range_days must hold two numbers`);
      return {
        type,
        hardFloorDays: asNumber(deadline.hard_floor_days, `${label}.hard_floor_days`),
        processingRangeDays: [
          asNumber(range[0], `${label}.processing_range_days[0]`),
          asNumber(range[1], `${label}.processing_range_days[1]`),
        ],
        display,
      };
    }
    case "business_days_minimum":
      return {
        type,
        businessDays: asNumber(deadline.business_days, `${label}.business_days`),
        display,
      };
    case "before_issuance":
      return { type, display };
    case "research_required":
      return { type, display };
    default:
      return fail(`${label}.type has unsupported value "${type}"`);
  }
}

function parseSource(value: unknown, label: string): RuleSource | null {
  if (value === undefined) return null;
  const source = asObject(value, label);
  return {
    citation: asString(source.citation, `${label}.citation`),
    urls: asArray(source.urls, `${label}.urls`).map((url, index) =>
      asString(url, `${label}.urls[${index}]`),
    ),
  };
}

function parseRule(value: unknown, label: string): EngineRule {
  const rule = asObject(value, label);
  const kind = asString(rule.kind, `${label}.kind`) as RuleKind;
  if (!RULE_KINDS.includes(kind)) fail(`${label}.kind has unsupported value "${kind}"`);

  const output = asObject(rule.output, `${label}.output`);
  const publishedDisposition = optionalString(output, "disposition");
  if (publishedDisposition !== null && PUBLISHED_DISPOSITIONS[publishedDisposition] === undefined) {
    fail(`${label}.output.disposition has unsupported value "${publishedDisposition}"`);
  }

  const verification = asObject(rule.verification, `${label}.verification`);
  const verificationStatus = asString(
    verification.status,
    `${label}.verification.status`,
  ) as VerificationStatus;
  if (!VERIFICATION_STATUSES.includes(verificationStatus)) {
    fail(`${label}.verification.status has unsupported value "${verificationStatus}"`);
  }

  const portal =
    output.portal === undefined ? null : asObject(output.portal, `${label}.output.portal`);
  const fee =
    output.fee === undefined || output.fee === null
      ? null
      : asObject(output.fee, `${label}.output.fee`);

  return {
    id: asString(rule.id, `${label}.id`),
    kind,
    trigger: parseTrigger(rule.trigger, `${label}.trigger`),
    name:
      optionalString(output, "permit_name") ??
      optionalString(output, "requirement_name") ??
      optionalString(output, "advisory_text") ??
      optionalString(output, "note_text"),
    agency: optionalString(output, "agency"),
    publishedDisposition:
      publishedDisposition === null ? null : (PUBLISHED_DISPOSITIONS[publishedDisposition] ?? null),
    deadline: parseDeadline(output.deadline, `${label}.output.deadline`),
    feeDisplay: fee === null ? null : optionalString(fee, "display"),
    portalName: portal === null ? null : optionalString(portal, "name"),
    portalUrl: portal === null ? null : optionalString(portal, "url"),
    noteText: optionalString(output, "note_text"),
    notes: optionalStringArray(output, "notes", `${label}.output.notes`),
    dedupeKey: optionalString(output, "dedupe_key"),
    verificationStatus,
    verificationQualification: optionalString(verification, "qualification"),
    source: parseSource(rule.source, `${label}.source`),
  };
}

function parseIntakeField(value: unknown, label: string): IntakeFieldDefinition {
  const definition = asObject(value, label);
  const values = definition.values;
  return {
    field: asString(definition.field, `${label}.field`),
    type: asString(definition.type, `${label}.type`),
    values:
      values === undefined
        ? null
        : asArray(values, `${label}.values`).map((entry, index) =>
            asString(entry, `${label}.values[${index}]`),
          ),
    askedWhen: optionalString(definition, "asked_when"),
    nullable: definition.nullable === true,
  };
}

/** Narrow parsed ruleset JSON into the engine's typed view. */
export function parseEngineRuleset(value: unknown): EngineRuleset {
  const ruleset = asObject(value, "ruleset");
  const config = asObject(ruleset.config, "ruleset.config");
  const slackWarning = asObject(config.slack_warning_days, "ruleset.config.slack_warning_days");
  const businessDayMath = asObject(config.business_day_math, "ruleset.config.business_day_math");

  const intakeFields = asArray(ruleset.intake_fields, "ruleset.intake_fields").map((field, index) =>
    parseIntakeField(field, `ruleset.intake_fields[${index}]`),
  );
  const rules = asArray(ruleset.rules, "ruleset.rules").map((rule, index) =>
    parseRule(rule, `ruleset.rules[${index}]`),
  );
  const advisories = asArray(ruleset.advisories, "ruleset.advisories").map((rule, index) =>
    parseRule(rule, `ruleset.advisories[${index}]`),
  );

  const declaredFields = new Set(intakeFields.map((field) => field.field));
  for (const rule of [...rules, ...advisories]) {
    for (const field of triggerFields(rule.trigger)) {
      if (!declaredFields.has(field))
        fail(`rule ${rule.id} references undeclared field "${field}"`);
    }
  }

  return {
    rulesetVersion: asString(ruleset.ruleset_version, "ruleset.ruleset_version"),
    snapshotDate: asString(ruleset.snapshot_date, "ruleset.snapshot_date"),
    slackWarningDays: asNumber(slackWarning.value, "ruleset.config.slack_warning_days.value"),
    calendarId: asString(businessDayMath.calendar, "ruleset.config.business_day_math.calendar"),
    intakeFields,
    rules: [...rules, ...advisories],
  };
}

/** Every intake field a trigger tree reads. */
export function triggerFields(node: TriggerNode): string[] {
  if ("field" in node) return [node.field];
  const children = "all" in node ? node.all : node.any;
  return children.flatMap(triggerFields);
}
