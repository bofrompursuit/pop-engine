// Tri-state condition evaluation (ARCHITECTURE "Condition evaluation").
// A material unknown propagates to `unknown` and never silently becomes false; a field the
// registry never scopes in is not material at all (F-201 spec, "Uncollected/inapplicable
// branch fields evaluate per the registry's asked-when scoping").

import { BOUNDARY_CONDITIONAL_RULES } from "./proposals";
import { EvaluationError } from "./types";
import type {
  Condition,
  EngineRuleset,
  EventIntake,
  IntakeValue,
  TriggeredBy,
  Tristate,
  TriggerNode,
} from "./types";

export const UNKNOWN_ANSWER = "unknown";

type ResolvedAnswer =
  | { readonly state: "not_asked" }
  | { readonly state: "unknown"; readonly isExplicitUnknown: boolean }
  | { readonly state: "answered"; readonly value: Exclude<IntakeValue, null> };

export type TriggerEvaluation = {
  readonly result: Tristate;
  /** Fields whose unanswered state is what made the trigger `unknown` — the branchable facts. */
  readonly unknownFields: readonly string[];
  readonly triggeredBy: readonly TriggeredBy[];
};

export type ScopeResolver = { isInScope: (field: string) => boolean };

/**
 * Evaluate the registry's `asked_when` scoping. The published expressions are a closed set of
 * conjunctions; anything outside the grammar throws rather than being ignored, because silently
 * treating a field as in-scope would change which findings fire.
 */
export function createScopeResolver(intake: EventIntake, ruleset: EngineRuleset): ScopeResolver {
  const definitions = new Map(ruleset.intakeFields.map((field) => [field.field, field]));
  const cache = new Map<string, boolean>();
  const resolving = new Set<string>();

  const valueOf = (field: string): IntakeValue => {
    if (!isInScope(field)) return null;
    return intake[field] ?? null;
  };

  const evaluateClause = (clause: string): boolean => {
    const inMatch = /^(\S+) in (\S+)$/.exec(clause);
    if (inMatch?.[1] !== undefined && inMatch[2] !== undefined && definitions.has(inMatch[1])) {
      const value = valueOf(inMatch[1]);
      return inMatch[2].split("/").includes(String(value));
    }

    const comparison = /^(\S+) (=|!=|gte) (\S+)$/.exec(clause);
    if (comparison?.[1] !== undefined && definitions.has(comparison[1])) {
      const value = valueOf(comparison[1]);
      const operand = comparison[3] ?? "";
      if (comparison[2] === "gte") return typeof value === "number" && value >= Number(operand);
      if (comparison[2] === "=") return value === operand;
      return value !== null && value !== operand;
    }

    // A bare token is either a boolean field ("food_present") or a declared member of a
    // multi-select field ("tent_canopy" means structure_types includes tent_canopy).
    if (definitions.has(clause)) return valueOf(clause) === true;
    const owner = ruleset.intakeFields.find((field) => field.values?.includes(clause) === true);
    if (owner === undefined)
      throw new EvaluationError(`asked_when clause "${clause}" names no declared field or value`);
    const value = valueOf(owner.field);
    return Array.isArray(value) ? value.includes(clause) : value === clause;
  };

  function isInScope(field: string): boolean {
    const cached = cache.get(field);
    if (cached !== undefined) return cached;

    const definition = definitions.get(field);
    if (definition === undefined)
      throw new EvaluationError(`intake field "${field}" is not declared by the ruleset`);
    if (definition.askedWhen === null) {
      cache.set(field, true);
      return true;
    }
    if (resolving.has(field)) throw new EvaluationError(`asked_when for "${field}" is cyclic`);

    resolving.add(field);
    try {
      const inScope = definition.askedWhen
        .split(" AND ")
        .every((clause) => evaluateClause(clause.trim()));
      cache.set(field, inScope);
      return inScope;
    } finally {
      resolving.delete(field);
    }
  }

  return { isInScope };
}

function resolveAnswer(field: string, intake: EventIntake, scope: ScopeResolver): ResolvedAnswer {
  if (!scope.isInScope(field)) return { state: "not_asked" };
  const value = intake[field];
  if (value === undefined || value === null) return { state: "unknown", isExplicitUnknown: false };
  if (value === UNKNOWN_ANSWER) return { state: "unknown", isExplicitUnknown: true };
  return { state: "answered", value };
}

function requireNumber(value: unknown, condition: Condition): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new EvaluationError(`${condition.field} must be numeric for op "${condition.op}"`);
  }
  return value;
}

function asStringArray(value: Exclude<IntakeValue, null>): readonly string[] | null {
  return Array.isArray(value) ? (value as readonly string[]) : null;
}

/** `true` when the answer sits exactly on a published threshold this rule flags as ambiguous (proposals §4). */
function isAtDeclaredBoundary(ruleId: string, condition: Condition, answer: number): boolean {
  return BOUNDARY_CONDITIONAL_RULES.some(
    (boundary) =>
      boundary.ruleId === ruleId &&
      boundary.field === condition.field &&
      condition.op === "gt" &&
      boundary.threshold === answer &&
      answer === condition.value,
  );
}

function compareAnswer(
  condition: Condition,
  value: Exclude<IntakeValue, null>,
  ruleId: string,
): Tristate {
  const asTristate = (matched: boolean): Tristate => (matched ? "true" : "false");
  const list = asStringArray(value);

  switch (condition.op) {
    case "eq":
      return asTristate(value === condition.value);
    case "in": {
      const candidates = Array.isArray(condition.value) ? (condition.value as unknown[]) : [];
      // A multi-select field matches `in` when any selected member matches (DOB-TALL-STRUCTURE-001).
      if (list !== null) return asTristate(list.some((entry) => candidates.includes(entry)));
      return asTristate(candidates.includes(value));
    }
    case "gt": {
      const answer = requireNumber(value, condition);
      if (isAtDeclaredBoundary(ruleId, condition, answer)) return "unknown";
      return asTristate(answer > requireNumber(condition.value, condition));
    }
    case "gte":
      return asTristate(
        requireNumber(value, condition) >= requireNumber(condition.value, condition),
      );
    case "bool":
      return asTristate(value === condition.value);
    case "contains":
      if (list === null)
        throw new EvaluationError(`${condition.field} must be a multi-select for op "contains"`);
      return asTristate(list.includes(String(condition.value)));
    case "contains_any": {
      if (list === null)
        throw new EvaluationError(
          `${condition.field} must be a multi-select for op "contains_any"`,
        );
      const candidates = Array.isArray(condition.value) ? (condition.value as unknown[]) : [];
      return asTristate(list.some((entry) => candidates.includes(entry)));
    }
    default:
      throw new EvaluationError(`unsupported operator "${String(condition.op)}"`);
  }
}

function evaluateCondition(
  condition: Condition,
  intake: EventIntake,
  scope: ScopeResolver,
  ruleId: string,
): TriggerEvaluation {
  const answer = resolveAnswer(condition.field, intake, scope);
  const contribution: TriggeredBy = {
    field: condition.field,
    value: intake[condition.field] ?? null,
  };

  if (answer.state === "not_asked") return { result: "false", unknownFields: [], triggeredBy: [] };

  if (answer.state === "unknown") {
    // A rule that lists "unknown" among its accepted values is answered by it, not blocked by it
    // (SLA-CATERING-001, ADV-NOISE-CODE-001, DOHMH-EXEMPTION-001).
    const acceptsUnknown =
      answer.isExplicitUnknown &&
      ((condition.op === "in" &&
        Array.isArray(condition.value) &&
        (condition.value as unknown[]).includes(UNKNOWN_ANSWER)) ||
        (condition.op === "eq" && condition.value === UNKNOWN_ANSWER));
    if (acceptsUnknown) return { result: "true", unknownFields: [], triggeredBy: [contribution] };
    return { result: "unknown", unknownFields: [condition.field], triggeredBy: [contribution] };
  }

  const result = compareAnswer(condition, answer.value, ruleId);
  return {
    result,
    unknownFields: result === "unknown" ? [condition.field] : [],
    triggeredBy: result === "false" ? [] : [contribution],
  };
}

/** Evaluate a trigger tree to true / false / unknown, collecting what drove the answer. */
export function evaluateTrigger(
  node: TriggerNode,
  intake: EventIntake,
  scope: ScopeResolver,
  ruleId: string,
): TriggerEvaluation {
  if ("field" in node) return evaluateCondition(node, intake, scope, ruleId);

  const isAll = "all" in node;
  const children = (isAll ? node.all : node.any).map((child) =>
    evaluateTrigger(child, intake, scope, ruleId),
  );
  const decisive: Tristate = isAll ? "false" : "true";
  const otherwise: Tristate = isAll ? "true" : "false";

  if (children.some((child) => child.result === decisive)) {
    return {
      result: decisive,
      unknownFields: [],
      // A decisive `any` is settled by its true children alone, so only those are the answers
      // that triggered the finding (AC 1). Recording an unanswered sibling — FDNY-GENERATOR-001's
      // null diesel amount next to a decisive gasoline figure — would claim provenance it has not
      // got. The `all` path and the undecided `any` path keep every contribution.
      triggeredBy:
        decisive === "true"
          ? children
              .filter((child) => child.result === "true")
              .flatMap((child) => child.triggeredBy)
          : [],
    };
  }

  const unknownChildren = children.filter((child) => child.result === "unknown");
  const result = unknownChildren.length > 0 ? "unknown" : otherwise;
  return {
    result,
    unknownFields: [...new Set(unknownChildren.flatMap((child) => child.unknownFields))],
    triggeredBy: result === "false" ? [] : children.flatMap((child) => child.triggeredBy),
  };
}
