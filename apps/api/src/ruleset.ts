import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";

type JsonObject = Record<string, unknown>;

export type PublishedRule = {
  id: string;
  kind: string;
  trigger: JsonObject;
  output: JsonObject;
  verification: JsonObject;
  source: JsonObject | null;
};

export type PublishedRuleset = {
  schema: string;
  rulesetVersion: string;
  status: string;
  intakeFields: string[];
  rules: PublishedRule[];
  advisories: PublishedRule[];
};

const EXPECTED_SCHEMA = "popengine-rules/v2";
const EXPECTED_RULESET_VERSION = "nyc.v2.1";
const EXPECTED_RULE_COUNT = 33;
const EXPECTED_ADVISORY_COUNT = 4;
const DEFAULT_RULES_FILE = fileURLToPath(
  new URL("../../../rules/nyc-rules.v2.1.json", import.meta.url),
);

const RULE_KINDS = new Set([
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
]);
const CONDITION_OPERATORS = new Set(["eq", "in", "gt", "gte", "bool", "contains", "contains_any"]);
const VERIFICATION_STATUSES = new Set([
  "SOURCE_CONFIRMED",
  "OFFICIAL_CONFLICT",
  "RESEARCH_REQUIRED",
  "COVERAGE_GAP",
  "VERIFIED",
]);

function validationError(message: string): never {
  throw new Error(`Ruleset validation failed: ${message}`);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    validationError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    validationError(`${label} must be an array`);
  }
  return value;
}

function requireString(object: JsonObject, key: string, label: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    validationError(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

function collectTriggerFields(value: unknown, label: string): string[] {
  const trigger = requireObject(value, label);

  if (Object.hasOwn(trigger, "field")) {
    const field = requireString(trigger, "field", label);
    const operator = requireString(trigger, "op", label);
    if (!CONDITION_OPERATORS.has(operator)) {
      validationError(`${label}.op has unsupported value "${operator}"`);
    }
    if (!Object.hasOwn(trigger, "value")) {
      validationError(`${label}.value is required`);
    }
    return [field];
  }

  const combinators = ["all", "any"].filter((key) => Object.hasOwn(trigger, key));
  if (combinators.length !== 1) {
    validationError(`${label} must contain exactly one of all, any, or field`);
  }

  const combinator = combinators[0]!;
  const children = requireArray(trigger[combinator], `${label}.${combinator}`);
  if (children.length === 0) {
    validationError(`${label}.${combinator} must not be empty`);
  }

  return children.flatMap((child, index) =>
    collectTriggerFields(child, `${label}.${combinator}[${index}]`),
  );
}

function parseRule(
  value: unknown,
  label: string,
  declaredFields: ReadonlySet<string>,
  requiresSource: boolean,
): PublishedRule {
  const rule = requireObject(value, label);
  const id = requireString(rule, "id", label);
  const kind = requireString(rule, "kind", label);
  if (!RULE_KINDS.has(kind)) {
    validationError(`${label}.kind has unsupported value "${kind}"`);
  }

  const trigger = requireObject(rule.trigger, `${label}.trigger`);
  for (const field of collectTriggerFields(trigger, `${label}.trigger`)) {
    if (!declaredFields.has(field)) {
      validationError(`${label}.trigger references undeclared field "${field}"`);
    }
  }

  const output = requireObject(rule.output, `${label}.output`);
  const verification = requireObject(rule.verification, `${label}.verification`);
  const verificationStatus = requireString(verification, "status", `${label}.verification`);
  if (!VERIFICATION_STATUSES.has(verificationStatus)) {
    validationError(`${label}.verification.status has unsupported value "${verificationStatus}"`);
  }

  const source = rule.source === undefined ? null : requireObject(rule.source, `${label}.source`);
  if (requiresSource && source === null) {
    validationError(`${label}.source is required`);
  }

  return { id, kind, trigger, output, verification, source };
}

export function validateRuleset(value: unknown): PublishedRuleset {
  const ruleset = requireObject(value, "ruleset");
  const schema = requireString(ruleset, "schema", "ruleset");
  if (schema !== EXPECTED_SCHEMA) {
    validationError(`expected schema ${EXPECTED_SCHEMA}, received ${schema}`);
  }

  const rulesetVersion = requireString(ruleset, "ruleset_version", "ruleset");
  if (rulesetVersion !== EXPECTED_RULESET_VERSION) {
    validationError(
      `expected ruleset version ${EXPECTED_RULESET_VERSION}, received ${rulesetVersion}`,
    );
  }

  const status = requireString(ruleset, "status", "ruleset");
  if (!status.startsWith("APPROVED")) {
    validationError("ruleset status must be APPROVED");
  }

  const intakeFields = requireArray(ruleset.intake_fields, "ruleset.intake_fields").map(
    (field, index) =>
      requireString(
        requireObject(field, `ruleset.intake_fields[${index}]`),
        "field",
        `ruleset.intake_fields[${index}]`,
      ),
  );
  const declaredFields = new Set(intakeFields);
  if (declaredFields.size !== intakeFields.length) {
    validationError("intake field names must be unique");
  }

  const ruleValues = requireArray(ruleset.rules, "ruleset.rules");
  if (ruleValues.length !== EXPECTED_RULE_COUNT) {
    validationError(`expected ${EXPECTED_RULE_COUNT} rules, received ${ruleValues.length}`);
  }

  const advisoryValues = requireArray(ruleset.advisories, "ruleset.advisories");
  if (advisoryValues.length !== EXPECTED_ADVISORY_COUNT) {
    validationError(
      `expected ${EXPECTED_ADVISORY_COUNT} advisories, received ${advisoryValues.length}`,
    );
  }

  const rules = ruleValues.map((rule, index) =>
    parseRule(rule, `ruleset.rules[${index}]`, declaredFields, true),
  );
  const advisories = advisoryValues.map((rule, index) =>
    parseRule(rule, `ruleset.advisories[${index}]`, declaredFields, false),
  );

  const ids = new Set<string>();
  for (const rule of [...rules, ...advisories]) {
    if (ids.has(rule.id)) {
      validationError(`duplicate rule id "${rule.id}"`);
    }
    ids.add(rule.id);
  }

  return {
    schema,
    rulesetVersion,
    status,
    intakeFields,
    rules,
    advisories,
  };
}

export async function loadRuleset(
  filePath = process.env.RULES_FILE ? resolve(process.env.RULES_FILE) : DEFAULT_RULES_FILE,
): Promise<PublishedRuleset> {
  try {
    return validateRuleset(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Ruleset validation failed:")) {
      throw error;
    }
    throw new Error(`Ruleset validation failed: cannot load ${filePath}`, {
      cause: error,
    });
  }
}

function optionalString(object: JsonObject, key: string): string | null {
  const value = object[key];
  return typeof value === "string" ? value : null;
}

function ruleTitle(rule: PublishedRule): string | null {
  for (const key of ["permit_name", "requirement_name", "advisory_text", "note_text"]) {
    const title = optionalString(rule.output, key);
    if (title !== null) return title;
  }
  return null;
}

export async function syncPermitRules(client: Client, ruleset: PublishedRuleset): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM permit_rules WHERE ruleset_version = $1", [
      ruleset.rulesetVersion,
    ]);

    // ponytail: 37 boot-time rows; use one bulk insert only if ruleset size grows materially.
    for (const rule of [...ruleset.rules, ...ruleset.advisories]) {
      await client.query(
        `INSERT INTO permit_rules
          (ruleset_version, rule_id, kind, title, agency, trigger, output, verification, source)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)`,
        [
          ruleset.rulesetVersion,
          rule.id,
          rule.kind,
          ruleTitle(rule),
          optionalString(rule.output, "agency"),
          JSON.stringify(rule.trigger),
          JSON.stringify(rule.output),
          JSON.stringify(rule.verification),
          rule.source === null ? null : JSON.stringify(rule.source),
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
