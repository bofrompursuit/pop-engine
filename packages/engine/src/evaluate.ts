// The engine entry point (ARCHITECTURE "Rules Engine").
//
// PURE (AGENTS.md "Engine invariants"): no database, HTTP, environment reads, randomness, or
// system clock. `today`, the ruleset, and the holiday calendar are explicit inputs, so the
// same intake + ruleset version + today + calendar always produces a byte-identical plan.

import { differenceInCalendarDays } from "./calendar";
import { computeVerdict } from "./verdict";
import { EvaluationError } from "./types";
import type { EngineRuleset, EventIntake, HolidayCalendar, PermitPlan } from "./types";

const EVENT_DATE_FIELD = "event_date";

export function evaluate(
  intake: EventIntake,
  ruleset: EngineRuleset,
  today: string,
  calendar: HolidayCalendar,
): PermitPlan {
  const eventDate = intake[EVENT_DATE_FIELD];
  if (typeof eventDate !== "string") {
    throw new EvaluationError(`intake.${EVENT_DATE_FIELD} is required to date a plan`);
  }
  // Validates both dates up front: a plan dated from an unparseable clock is an error,
  // never a plan with no requirements (AC 5).
  differenceInCalendarDays(today, eventDate);

  if (calendar.id !== ruleset.calendarId) {
    throw new EvaluationError(
      `calendar "${calendar.id}" does not match the ruleset's pinned calendar "${ruleset.calendarId}"`,
    );
  }

  const { findings, verdict, verdictDetail } = computeVerdict(intake, ruleset, {
    intake,
    eventDate,
    today,
    calendar,
    slackWarningDays: ruleset.slackWarningDays,
  });

  return {
    rulesetVersion: ruleset.rulesetVersion,
    today,
    calendarId: calendar.id,
    findings,
    verdict,
    verdictDetail,
  };
}
