// Typed deadlines → a backward date and a per-finding status (ARCHITECTURE "Typed deadlines",
// "Verdict algorithm" step 2). Never one number: each published deadline type has its own
// semantics, and a type the engine cannot date says so rather than guessing.

import { addCalendarDays, differenceInCalendarDays, subtractBusinessDays } from "./calendar";
import { LEVEL_DEADLINE_BINDING } from "./proposals";
import type { Deadline, DeadlineStatus, EventIntake, HolidayCalendar } from "./types";

export const CONFIRM_WITH_AGENCY = "confirm with agency";

export type DatedDeadline = {
  readonly latestApplyDate: string | null;
  readonly deadlineStatus: DeadlineStatus;
  readonly slackDays: number | null;
  readonly deadlineDisplay: string | null;
};

export type DeadlineContext = {
  readonly intake: EventIntake;
  readonly eventDate: string;
  readonly today: string;
  readonly calendar: HolidayCalendar;
  readonly slackWarningDays: number;
};

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
  };
}

function undatable(deadlineStatus: DeadlineStatus, deadlineDisplay: string | null): DatedDeadline {
  return { latestApplyDate: null, deadlineStatus, slackDays: null, deadlineDisplay };
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
      if (days === null) return undatable("not_calculable", levelRangeDisplay(deadline));
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

    case "business_days_minimum":
      return {
        ...dateBackFrom(
          subtractBusinessDays(context.eventDate, deadline.businessDays, context.calendar),
          context,
        ),
        deadlineDisplay: deadline.display,
      };

    // Listed with its parent permit; no independent date arithmetic.
    case "before_issuance":
      return undatable("not_applicable", deadline.display);

    // Listed, rendered "confirm with agency", excluded from verdict and slack arithmetic.
    case "research_required":
      return undatable("not_calculable", deadline.display ?? CONFIRM_WITH_AGENCY);
  }
}
