import type { Verdict, VerdictDetail } from "@pop-engine/engine";

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
 * The approved copy for a verdict, with the slots the answer key leaves open filled from the
 * plan's own detail: "apply within N days" for at-risk, and the unanswered fields for
 * conditional. A slot whose value the plan does not carry is left off rather than guessed.
 */
export function verdictCopy(verdict: Verdict, detail?: VerdictDetail): string {
  const base = VERDICT_COPY[verdict];

  if (verdict === "FEASIBLE_AT_RISK") {
    const days = detail?.minSlackDays;
    // The threshold behind this is PopEngine's internal planning buffer, never an official
    // deadline; the plan's own lines carry the published dates.
    return typeof days === "number" ? `${base} — apply within ${days} days` : base;
  }

  if (verdict === "CONDITIONAL") {
    const facts = (detail?.missingFacts ?? []).map((fact) => fact.field.replace(/_/g, " "));
    return facts.length > 0 ? `${base}: ${facts.join(", ")}` : base;
  }

  return base;
}
