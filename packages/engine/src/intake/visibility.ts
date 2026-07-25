// Which intake questions this event actually gets asked.
//
// Visibility is two-state on purpose: a question is either put to the organizer or it is
// not. Tri-state evaluation belongs to the rules engine (F-201), which reads the stored
// answers. An unanswered trigger keeps its dependent question hidden — the organizer
// answers the trigger first.

import type { AskedWhenTerm, IntakeField, IntakeRegistry } from "./registry";

export type IntakeValue = string | number | boolean | readonly string[] | null;
export type IntakeAnswers = Readonly<Record<string, IntakeValue | undefined>>;

function termHolds(term: AskedWhenTerm, answer: IntakeValue): boolean {
  switch (term.operator) {
    case "equals":
      return answer === term.value;
    case "not_equals":
      // On a multi-enum ("structure_types != none") the comparison is membership.
      return Array.isArray(answer)
        ? !answer.includes(term.value)
        : answer !== null && answer !== term.value;
    case "in":
      return typeof answer === "string" && term.values.includes(answer);
    case "at_least":
      return typeof answer === "number" && answer >= term.value;
    case "is_true":
      return answer === true;
    case "selected":
      return Array.isArray(answer) && answer.includes(term.value);
  }
}

/**
 * The questions this event is asked, in registry order.
 *
 * An answer only counts toward another question's condition when its own question was
 * asked, so a stale answer left behind by an edit (a SAPO class kept after the location
 * moved to a park) cannot revive the questions below it. Conditions reference other
 * fields, so the asked set is grown to a fixed point rather than resolved in one pass.
 */
export function askedFields(registry: IntakeRegistry, answers: IntakeAnswers): IntakeField[] {
  const asked = new Set<string>();
  for (let pass = 0; pass <= registry.length; pass += 1) {
    const newlyAsked = registry.filter(
      (field) =>
        !asked.has(field.field) &&
        field.askedWhen.every(
          (term) => asked.has(term.field) && termHolds(term, answers[term.field] ?? null),
        ),
    );
    if (newlyAsked.length === 0) break;
    for (const field of newlyAsked) asked.add(field.field);
  }
  return registry.filter((field) => asked.has(field.field));
}

/** The names of the questions this event is asked. */
export function askedFieldNames(registry: IntakeRegistry, answers: IntakeAnswers): Set<string> {
  return new Set(askedFields(registry, answers).map((field) => field.field));
}
