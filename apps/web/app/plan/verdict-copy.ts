import type { Verdict } from "@pop-engine/engine";
import type { ConsumedVerdictDetail } from "./plan-api";

// The verdict's user-facing copy, in one place.
//
// These strings are mandated, not chosen. `docs/test-scenario-answer-key.md` (verdict model,
// approved) and `specs/F-102-feasibility-verdict.md` (copy rule) both fix them, and INFEASIBLE's
// wording is the load-bearing one: a missed filing window must never be presented as a claim of
// legal impossibility. Rendering the raw enum token throws that commitment away.
//
// F-102 owns the verdict card itself (branch tables, rescope ladder). When it lands it imports
// this rather than restating the copy.

const VERDICT_COPY: Readonly<Record<Verdict, string>> = {
  FEASIBLE: "On track",
  FEASIBLE_AT_RISK: "At risk",
  CONDITIONAL: "Depends on",
  INFEASIBLE: "Published deadline missed as scoped",
};

/**
 * The label F-102's verdict table requires beside FEASIBLE-AT-RISK: "threshold labeled as
 * PopEngine's **internal planning buffer**, never an official threshold". The ruleset says the
 * same thing about the value itself — `config.slack_warning_days.note` reads "NOT an official
 * threshold; UI must label it as internal policy".
 *
 * The organizer is who has to read this. An "apply within N days" line with the buffer explained
 * only in a source comment reads as an agency filing threshold, which is the overclaim the layered
 * status model exists to prevent: each line's own published date is the agency's deadline, and
 * this warning sits inside it. The number is deliberately not restated here — the plan does not
 * carry the ruleset's `slack_warning_days`, and hardcoding 14 would go stale the first time a
 * published ruleset moves it.
 */
export const AT_RISK_BUFFER_NOTE =
  "“apply within” counts down PopEngine's internal planning buffer, not an agency filing deadline. Each requirement below carries its own published date.";

/**
 * The approved copy for a verdict, with the slots the answer key leaves open filled from the
 * plan's own detail: "apply within N days" for at-risk, and the unanswered fields for
 * conditional. A slot whose value the plan does not carry is left off rather than guessed.
 */
/**
 * `detail` is narrowed to the two members this copy reads, not the engine's whole `VerdictDetail`.
 * A full `VerdictDetail` is still assignable, so F-102's verdict card can pass one unchanged; the
 * narrowing is what stops this file reading a member the plan endpoint's body was never checked for.
 */
export function verdictCopy(verdict: Verdict, detail?: ConsumedVerdictDetail): string {
  const base = VERDICT_COPY[verdict];

  if (verdict === "FEASIBLE_AT_RISK") {
    const days = detail?.minSlackDays;
    // What the buffer is gets said on screen, in `AT_RISK_BUFFER_NOTE`, not in this comment.
    return typeof days === "number" ? `${base} — apply within ${days} days` : base;
  }

  if (verdict === "CONDITIONAL") {
    const facts = (detail?.missingFacts ?? []).map((fact) => fact.field.replace(/_/g, " "));
    return facts.length > 0 ? `${base}: ${facts.join(", ")}` : base;
  }

  return base;
}
