// Typed deadlines → a backward date and a per-finding status (ARCHITECTURE "Typed deadlines",
// "Verdict algorithm" step 2). Never one number: each published deadline type has its own
// semantics, and a type the engine cannot date says so rather than guessing.

import { addCalendarDays, differenceInCalendarDays, subtractBusinessDays } from "./calendar";
import type { ScopeResolver } from "./conditions";
import { UNKNOWN_ANSWER } from "./conditions";
import { LEVEL_DEADLINE_BINDING } from "./proposals";
import type { Deadline, DeadlineStatus, EventIntake, HolidayCalendar } from "./types";

export const CONFIRM_WITH_AGENCY = "confirm with agency";

export type DatedDeadline = {
  readonly latestApplyDate: string | null;
  readonly deadlineStatus: DeadlineStatus;
  readonly slackDays: number | null;
  readonly deadlineDisplay: string | null;
  /**
   * Intake fields whose unanswered state is what stopped the deadline from resolving. These are
   * material unknowns exactly like the ones a trigger surfaces: SAPO-PLAZA-001 triggers on
   * `sapo_event_type` alone, so without this an unknown plaza level would never reach the verdict
   * and a plan whose real 14–60-day window may already be missed would read FEASIBLE.
   */
  readonly unknownFields: readonly string[];
};

export type DeadlineContext = {
  readonly intake: EventIntake;
  readonly scope: ScopeResolver;
  readonly eventDate: string;
  readonly today: string;
  readonly calendar: HolidayCalendar;
  readonly slackWarningDays: number;
};

/** What a caller supplies; the scope resolver is built per intake while findings resolve. */
export type PlanContext = Omit<DeadlineContext, "scope">;

function statusFromSlack(
  slackDays: number,
  slackWarningDays: number,
  missedAtZero: boolean,
): DeadlineStatus {
  if (slackDays < 0 || (missedAtZero && slackDays === 0)) return "published_deadline_missed";
  return slackDays < slackWarningDays ? "deadline_approaching" : "on_track";
}

function dateBackFrom(
  latestApplyDate: string,
  context: DeadlineContext,
  missedAtZero = false,
): DatedDeadline {
  const slackDays = differenceInCalendarDays(context.today, latestApplyDate);
  return {
    latestApplyDate,
    deadlineStatus: statusFromSlack(slackDays, context.slackWarningDays, missedAtZero),
    slackDays,
    deadlineDisplay: null,
    unknownFields: [],
  };
}

function undatable(
  deadlineStatus: DeadlineStatus,
  deadlineDisplay: string | null,
  unknownFields: readonly string[] = [],
): DatedDeadline {
  return { latestApplyDate: null, deadlineStatus, slackDays: null, deadlineDisplay, unknownFields };
}

/** True when the level field is in scope but unanswered — the case the rule publishes behavior for. */
function isLevelUnknown(context: DeadlineContext): boolean {
  if (!context.scope.isInScope(LEVEL_DEADLINE_BINDING.levelField)) return false;
  const level = context.intake[LEVEL_DEADLINE_BINDING.levelField];
  return level === undefined || level === null || level === UNKNOWN_ANSWER;
}

function resolveLevelDays(
  deadline: Extract<Deadline, { type: "published_minimum_by_level" }>,
  intake: EventIntake,
) {
  const level = intake[LEVEL_DEADLINE_BINDING.levelField];
  const definition = typeof level === "string" ? deadline.levels[level] : undefined;
  if (definition === undefined) return null;
  const isMultiBlock = intake[LEVEL_DEADLINE_BINDING.multiBlockField] === true;
  return isMultiBlock && definition.multiBlockDays !== null
    ? definition.multiBlockDays
    : definition.calendarDays;
}

/** The published day range across all levels, for the CONDITIONAL rendering when the level is unknown. */
function levelRangeDisplay(
  deadline: Extract<Deadline, { type: "published_minimum_by_level" }>,
): string {
  const days = Object.values(deadline.levels).flatMap((level) =>
    level.multiBlockDays === null
      ? [level.calendarDays]
      : [level.calendarDays, level.multiBlockDays],
  );
  return `${Math.min(...days)}–${Math.max(...days)} days depending on level; ${CONFIRM_WITH_AGENCY}`;
}

export function computeDeadline(
  deadline: Deadline | null,
  context: DeadlineContext,
): DatedDeadline {
  if (deadline === null) return undatable("not_applicable", null);

  switch (deadline.type) {
    case "published_minimum":
      return {
        ...dateBackFrom(addCalendarDays(context.eventDate, -deadline.calendarDays), context),
        deadlineDisplay: deadline.display,
      };

    case "published_minimum_by_level": {
      const days = resolveLevelDays(deadline, context.intake);
      // SAPO-PLAZA-001 publishes its own unknown-level behavior: "CONDITIONAL listing 14–60
      // range". Reporting the level as a material unknown is what makes the verdict conditional;
      // the range comes from the rule's own level table, never from a guess.
      if (days === null) {
        return undatable(
          "not_calculable",
          levelRangeDisplay(deadline),
          isLevelUnknown(context) ? [LEVEL_DEADLINE_BINDING.levelField] : [],
        );
      }
      return {
        ...dateBackFrom(addCalendarDays(context.eventDate, -days), context),
        deadlineDisplay: null,
      };
    }

    case "composite": {
      // The hard floor is a cliff, not a gradient: inside it, applications are not accepted
      // (F-102 AC 3). A runway shorter than the published processing range is at risk even
      // when the floor clears — "processing may not complete before event" (interpretation I-5).
      const dated = dateBackFrom(
        addCalendarDays(context.eventDate, -deadline.hardFloorDays),
        context,
        true,
      );
      const runwayDays = differenceInCalendarDays(context.today, context.eventDate);
      const processingCeiling = deadline.processingRangeDays[1];
      const isProcessingAtRisk =
        dated.deadlineStatus === "on_track" && runwayDays < processingCeiling;
      return {
        ...dated,
        deadlineStatus: isProcessingAtRisk ? "deadline_approaching" : dated.deadlineStatus,
        deadlineDisplay: deadline.display,
      };
    }

    case "business_days_minimum": {
      // No published holiday list means this date cannot be computed. Weekday-only arithmetic
      // would count a holiday as a business day and put the deadline later than it really is, so
      // the finding takes the ruleset's own treatment for an uncomputable deadline instead: listed,
      // rendered "confirm with agency", excluded from verdict arithmetic (engine_conventions).
      // Only the findings that need business days degrade; the rest of the plan still computes.
      const { holidays } = context.calendar;
      if (holidays === null) return undatable("not_calculable", deadline.display);
      return {
        ...dateBackFrom(
          subtractBusinessDays(context.eventDate, deadline.businessDays, {
            ...context.calendar,
            holidays,
          }),
          context,
        ),
        deadlineDisplay: deadline.display,
      };
    }

    // Listed with its parent permit; no independent date arithmetic.
    case "before_issuance":
      return undatable("not_applicable", deadline.display);

    // Listed, rendered "confirm with agency", excluded from verdict and slack arithmetic.
    case "research_required":
      return undatable("not_calculable", deadline.display ?? CONFIRM_WITH_AGENCY);
  }
}
