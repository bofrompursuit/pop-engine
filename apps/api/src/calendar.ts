import type { HolidayCalendar } from "@pop-engine/engine";

/**
 * The pinned holiday calendar is unavailable, so business-day deadlines cannot be computed.
 *
 * `config.business_day_math` pins `us-ny-business-days@2026.1` but states in the same block that
 * the holiday list itself is still RESEARCH_REQUIRED, and no artifact publishes one. Substituting
 * weekday-only arithmetic would count a holiday as a business day, push every business-day
 * deadline later than it really is, and can report an already-missed filing window as on track.
 * Overclaiming feasibility is the failure this product exists to prevent, and inventing holidays
 * to fill the gap is not an option (AGENTS.md, Golden Rule 1).
 *
 * This condition is now per finding, not per plan. Only three of the published rules use
 * business-day deadlines (DOB-TENT-001, SLA-ONEDAY-001, SLA-CATERING-001); a plan that triggers
 * none of them is fully computable and is generated normally. A plan that does trigger one gets
 * that line rendered NOT_CALCULABLE with "confirm with agency" and excluded from verdict
 * arithmetic — the ruleset's own treatment for a deadline the engine cannot compute
 * (engine_conventions) — rather than the whole plan being withheld. Declining to claim one date
 * tells an organizer exactly which item needs confirmation; withholding a correct plan tells them
 * nothing. The under-claiming risk is still covered, because NOT_CALCULABLE never counts toward
 * FEASIBLE.
 */
export class MissingHolidayCalendarError extends Error {
  constructor(calendarId: string) {
    super(
      `holiday calendar "${calendarId}" has no published holiday list; business-day deadlines ` +
        `render as "confirm with agency" until the verification owner publishes it`,
    );
    this.name = "MissingHolidayCalendarError";
  }
}

/**
 * Published holiday lists, keyed by the calendar id a ruleset pins. Empty on purpose: an entry
 * appears here only when the verification owner publishes the dates for that calendar. A missing
 * entry yields `holidays: null`, which the engine reads as "no list published" — distinct from a
 * published list that happens to hold no dates.
 */
const PUBLISHED_HOLIDAY_CALENDARS: Readonly<Record<string, readonly string[]>> = {};

export function pinnedCalendar(calendarId: string): HolidayCalendar {
  return { id: calendarId, holidays: PUBLISHED_HOLIDAY_CALENDARS[calendarId] ?? null };
}

/** Operational warning at boot: plans still generate, but business-day lines will not be dated. */
export function holidayCalendarWarning(calendar: HolidayCalendar): string | null {
  return calendar.holidays === null ? new MissingHolidayCalendarError(calendar.id).message : null;
}
