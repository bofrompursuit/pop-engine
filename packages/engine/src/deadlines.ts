// Typed deadlines → a backward date and a per-finding status (ARCHITECTURE "Typed deadlines",
// "Verdict algorithm" step 2). Never one number: each published deadline type has its own
// semantics, and a type the engine cannot date says so rather than guessing.

import { addCalendarDays, differenceInCalendarDays, subtractBusinessDays } from "./calendar";
import type { ScopeResolver } from "./conditions";
import { UNKNOWN_ANSWER } from "./conditions";
import { LEVEL_DEADLINE_BINDING } from "./proposals";
import type {
  Deadline,
  DeadlineBoundary,
  DeadlineStatus,
  EventIntake,
  HolidayCalendar,
} from "./types";

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
  /**
   * Set when a published deadline exists but its date cannot be computed from the inputs supplied
   * — as opposed to `research_required`, where no agency published a lead time at all. The window
   * is real, so it must keep weighing on the verdict as an unknown timeline (P1-A).
   */
  readonly timelineUnresolvedReason: string | null;
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

/**
 * The last valid filing date for a published bound. An exclusive bound ("earlier than N days
 * before the event") makes day N itself too late, so the last valid day is one earlier; an
 * inclusive bound ("at least N days before") keeps day N. Shifting the date rather than only the
 * comparison keeps `latest_apply_date` honest for the copy, the alerts and the checklist, all of
 * which read the date rather than re-deriving it.
 */
function lastValidFilingDate(
  bound: string,
  boundary: DeadlineBoundary,
  stepBack: (date: string, units: number) => string,
): string {
  return boundary === "exclusive" ? stepBack(bound, 1) : bound;
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
    timelineUnresolvedReason: null,
  };
}

function undatable(
  deadlineStatus: DeadlineStatus,
  deadlineDisplay: string | null,
  unknownFields: readonly string[] = [],
  timelineUnresolvedReason: string | null = null,
): DatedDeadline {
  return {
    latestApplyDate: null,
    deadlineStatus,
    slackDays: null,
    deadlineDisplay,
    unknownFields,
    timelineUnresolvedReason,
  };
}

/** True when `field` is in scope but carries no answer, i.e. the question was asked and not answered. */
function isUnanswered(field: string, context: DeadlineContext): boolean {
  if (!context.scope.isInScope(field)) return false;
  const value = context.intake[field];
  return value === undefined || value === null || value === UNKNOWN_ANSWER;
}

type LevelResolution =
  | { readonly kind: "days"; readonly days: number }
  | { readonly kind: "unknown"; readonly field: string; readonly display: string }
  | { readonly kind: "unresolvable" };

function resolveLevelDays(
  deadline: Extract<Deadline, { type: "published_minimum_by_level" }>,
  context: DeadlineContext,
): LevelResolution {
  const { levelField, multiBlockField } = LEVEL_DEADLINE_BINDING;
  if (isUnanswered(levelField, context)) {
    return { kind: "unknown", field: levelField, display: levelRangeDisplay(deadline) };
  }

  const level = context.intake[levelField];
  const definition = typeof level === "string" ? deadline.levels[level] : undefined;
  if (definition === undefined) return { kind: "unresolvable" };

  const { calendarDays, multiBlockDays } = definition;
  if (multiBlockDays === null) return { kind: "days", days: calendarDays };

  // A level that publishes a distinct multi-block window cannot be dated from an unanswered flag:
  // treating "not answered" as "single block" would quietly apply the shorter window and can
  // present an already-missed multi-block deadline as on track (P1-B).
  if (isUnanswered(multiBlockField, context)) {
    return {
      kind: "unknown",
      field: multiBlockField,
      display:
        `${calendarDays}–${multiBlockDays} days depending on whether the event spans multiple ` +
        `blocks; ${CONFIRM_WITH_AGENCY}`,
    };
  }

  return {
    kind: "days",
    days: context.intake[multiBlockField] === true ? multiBlockDays : calendarDays,
  };
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
        ...dateBackFrom(
          lastValidFilingDate(
            addCalendarDays(context.eventDate, -deadline.calendarDays),
            deadline.boundary,
            (date, units) => addCalendarDays(date, -units),
          ),
          context,
        ),
        deadlineDisplay: deadline.display,
      };

    case "published_minimum_by_level": {
      // SAPO-PLAZA-001 publishes its own unknown-level behavior: "CONDITIONAL listing 14–60
      // range". Reporting the blocking field as a material unknown is what makes the verdict
      // conditional; every number comes from the rule's own level table, never from a guess.
      const resolution = resolveLevelDays(deadline, context);
      if (resolution.kind === "unknown") {
        return undatable("not_calculable", resolution.display, [resolution.field]);
      }
      if (resolution.kind === "unresolvable") {
        return undatable("not_calculable", levelRangeDisplay(deadline));
      }
      return {
        ...dateBackFrom(
          lastValidFilingDate(
            addCalendarDays(context.eventDate, -resolution.days),
            deadline.boundary,
            (date, units) => addCalendarDays(date, -units),
          ),
          context,
        ),
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
      // would count a holiday as a business day and put the deadline later than it really is.
      //
      // The agency HAS published this deadline, so the requirement and its window are real; only
      // our ability to date it is missing. That is an unknown timeline, not an absent one, and
      // ARCHITECTURE step 3 makes an unknown that changes the timeline CONDITIONAL. Dropping it
      // from the arithmetic the way a research_required lead time is dropped would let a plan read
      // FEASIBLE while the window is already closed (P1-A).
      const { holidays } = context.calendar;
      if (holidays === null) {
        return undatable(
          "not_calculable",
          deadline.display,
          [],
          `${deadline.businessDays} business days before the event, which needs the ` +
            `"${context.calendar.id}" holiday list; no list is published for it`,
        );
      }
      const publishedCalendar = { ...context.calendar, holidays };
      return {
        ...dateBackFrom(
          lastValidFilingDate(
            subtractBusinessDays(context.eventDate, deadline.businessDays, publishedCalendar),
            deadline.boundary,
            (date, units) => subtractBusinessDays(date, units, publishedCalendar),
          ),
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
