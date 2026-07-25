// ─────────────────────────────────────────────────────────────────────────────
// PROPOSAL — NOT YET APPROVED. Needs verification owner + engine owner sign-off
// (DOCUMENTATION-GOVERNANCE §6, "rule trigger, dedupe, branch, deadline, or formula
// semantics"). Everything in this file is a contract that F-201 needs and that no
// approved artifact states. It is collected here, in one place, on purpose: when the
// team decides, the decision moves into the ruleset's `engine_conventions` and this
// file shrinks or disappears. Nothing here invents a regulatory fact — every value is
// either a vocabulary mapping or a quotation of published rule text.
//
// Recorded on issue #4 (comment "Two undecided contracts F-201 will hit") for §1 and §2.
// §3–§5 were found while deriving the six scenarios and are new.
// ─────────────────────────────────────────────────────────────────────────────

import type { Disposition, RuleKind } from "./types";

/**
 * §1 — Default disposition per rule kind.
 *
 * `permit_plan_items.disposition` is NOT NULL, but 24 of the 37 published rules omit
 * `output.disposition`, and no artifact says what those rules emit. A rule's own
 * `output.disposition` always wins; this table only fills the silence.
 *
 * Scenario B's single dated finding is DOHMH-ORGANIZER-NOTIFY-001, whose 30-day window
 * (2026-07-13) is already past on the fixture clock, and the answer key pins B as
 * CONDITIONAL rather than INFEASIBLE. That uncertainty is now carried by the rule itself:
 * the product owner authorized adding `disposition: MAY_BE_REQUIRED` to that one rule's
 * output (its own commit on this branch; needs verification-owner and rules-owner sign-off
 * per governance §6). So `notification` stays `required` here — the per-rule mark is not a
 * kind-wide weakening.
 */
export const DEFAULT_DISPOSITION_BY_RULE_KIND: Readonly<Record<RuleKind, Disposition>> = {
  permit: "required",
  insurance: "required",
  registration: "required",
  notification: "required",
  eligibility: "may_be_required",
  prohibition: "prohibited_or_ineligible",
  dependency: "may_be_required",
  advisory: "advisory",
  note: "no_new_requirement",
  // A classification rule persists as a note finding with this disposition (#73,
  // ARCHITECTURE "Rule kind vs finding kind"). That part is approved; it is repeated
  // here only so the table is total.
  classification: "no_new_requirement",
};

/**
 * §2 — A finding whose trigger evaluated tri-state `unknown` is never definitive.
 *
 * engine_conventions says a material unknown propagates to CONDITIONAL and never silently
 * becomes false; it does not say what disposition the resulting finding carries. Rendering
 * it as REQUIRED would overclaim, so a `required` finding whose trigger came back unknown
 * is downgraded to this. Dispositions that already hedge or already say something other
 * than "you must file this" (advisory, no_new_requirement, prohibited_or_ineligible) are
 * left exactly as published.
 */
export const UNKNOWN_TRIGGER_DISPOSITION: Disposition = "may_be_required";

/**
 * §3 — A MAY_BE_REQUIRED finding whose published window has passed yields CONDITIONAL.
 *
 * ARCHITECTURE step 4 only says a *definitively required* missed finding gives INFEASIBLE,
 * and step 5 only covers positive slack. A missed window on a finding that may not apply
 * falls through both. Fixtures B and F both land on it. Ranked after INFEASIBLE and before
 * FEASIBLE-AT-RISK.
 */
export const MISSED_MAY_BE_REQUIRED_IS_CONDITIONAL = true;

/**
 * §4 — Exact-boundary conditionality, per rule.
 *
 * The answer key requires `tent_area_sqft = 400` against DOB-TENT-001's `gt 400` to render
 * CONDITIONAL, while `generator_gasoline_gallons = 2.5` against FDNY-GENERATOR-001's
 * `gt 2.5`, `stage_height_ft = 2.0`, and `battery_system_kwh = 20` must render nothing.
 * So this cannot be an operator-level rule — it is per rule, and the only place it is
 * stated is DOB-TENT-001's own `output.notes[0]`, quoted below. Reading prose notes at
 * runtime would be worse than naming the rule here.
 *
 * Effect: the listed condition returns `unknown` (not `false`) when the answer sits exactly
 * on the threshold, so the finding renders MAY_BE_REQUIRED with the published note.
 */
export const BOUNDARY_CONDITIONAL_RULES: readonly {
  readonly ruleId: string;
  readonly field: string;
  readonly threshold: number;
  readonly publishedNote: string;
}[] = [
  {
    ruleId: "DOB-TENT-001",
    field: "tent_area_sqft",
    threshold: 400,
    publishedNote:
      "Exactly 400 sq ft (e.g. 20x20) sits ON the published 'more than 400' boundary → engine renders CONDITIONAL, not REQUIRED, with 'confirm footprint calculation with DOB'.",
  },
];

/**
 * §5 — Deadline-to-intake bindings.
 *
 * A `published_minimum_by_level` deadline publishes level keys (a/b/c/d) and a
 * `multi_block_days` variant but never names the intake fields that resolve them.
 * SAPO-PLAZA-001 is the only such rule today.
 */
export const LEVEL_DEADLINE_BINDING = {
  levelField: "plaza_level",
  multiBlockField: "plaza_multiple_blocks",
} as const;

/**
 * §6 — Rescope generation policy.
 *
 * ARCHITECTURE says rescope suggestions are full re-evaluations of modified intakes but
 * never says which modifications to try. Scenario A pins exactly three. These three rules
 * reproduce them from the published registry alone:
 *
 *  R1 candidates are alternate declared values of a field in the blocking rule's trigger,
 *     or of the root field that gates that rule through the registry's `asked_when` chain
 *     (for Scenario A: street_event_size, and location_type at the root). `unknown` is
 *     never suggested — telling an organizer to un-know a fact is not a rescope.
 *  R2 keep it only if the verdict strictly improves.
 *  R3 drop it if the re-evaluated plan introduces any of:
 *     - a COVERAGE_GAP finding — the ruleset asserts nothing there, so the engine cannot
 *       claim the change helps (rules out "hold it as some other SAPO class");
 *     - a definitively-required finding from an agency the current plan does not already
 *       involve — trading one agency's permit burden for another's is not advice (rules out
 *       "hold it in a park", which swaps SAPO for Parks);
 *     - a finding whose deadline is NOT_CALCULABLE — a scope whose timeline the engine
 *       cannot compute is not a scope it can recommend (rules out "hold it on a plaza",
 *       whose deadline depends on an unasked plaza level).
 *     Re-sizing within the same agency survives all three, which is Scenario A's ladder.
 */
export const RESCOPE_EXCLUDES_UNKNOWN_VALUES = true;
