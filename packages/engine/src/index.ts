// pop-engine rules engine.
//
// PURE module (AGENTS.md "Engine invariants"): no database, HTTP, environment reads,
// randomness, or system clock. `today`, the ruleset, and the holiday calendar are always
// explicit inputs. `evaluate(intake, ruleset, today, calendar)` is the entry point (F-201).

export const ENGINE_NAME = "pop-engine-engine";

/** Hello-world placeholder. Deterministic and side-effect free by construction. */
export function describeEngine(): string {
  return `${ENGINE_NAME} ready`;
}

export { evaluate } from "./evaluate";
export { parseEngineRuleset, triggerFields } from "./ruleset";
export {
  addCalendarDays,
  countBusinessDays,
  differenceInCalendarDays,
  subtractBusinessDays,
} from "./calendar";
export { CONFIRM_WITH_AGENCY } from "./deadlines";
export { computeWindowVerdict } from "./verdict";
export { UNKNOWN_ANSWER } from "./conditions";
export {
  BOUNDARY_CONDITIONAL_RULES,
  DEFAULT_DISPOSITION_BY_RULE_KIND,
  UNKNOWN_TRIGGER_DISPOSITION,
} from "./proposals";
export * from "./types";
