// pop-engine rules engine.
//
// PURE module (AGENTS.md "Engine invariants"): no database, HTTP, environment reads,
// randomness, or system clock. `today`, the ruleset, and the holiday calendar are always
// explicit inputs. The real evaluate(intake, ruleset, today, calendar) lands with F-201
// (issue #4); this scaffold only proves the toolchain and the cross-package wiring.

export const ENGINE_NAME = "pop-engine-engine";

// The intake contract (F-101): the ruleset's field registry, the asked-when conditions,
// and submission validation. Shared by apps/api and apps/web (AD-8) so the contract has
// exactly one implementation.
export type {
  AskedWhenTerm,
  IntakeContract,
  IntakeField,
  IntakeFieldType,
  IntakeRegistry,
  PublishedNotice,
} from "./intake/registry";
export { parseIntakeContract } from "./intake/registry";
export type { IntakeAnswers, IntakeValue } from "./intake/visibility";
export { askedFieldNames, askedFields } from "./intake/visibility";
export type { IntakeIssue, IntakeRecord, IntakeValidation } from "./intake/validate";
export {
  intakeColumnNames,
  intakeWarnings,
  isIntakeUnchanged,
  mergeIntakeEdit,
  validateIntake,
} from "./intake/validate";

/** Hello-world placeholder. Deterministic and side-effect free by construction. */
export function describeEngine(): string {
  return `${ENGINE_NAME} ready`;
}
