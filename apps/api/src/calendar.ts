import type { HolidayCalendar } from "@pop-engine/engine";

/**
 * Plan generation cannot proceed without the holiday list its ruleset pins.
 *
 * `config.business_day_math` pins `us-ny-business-days@2026.1` but states in the same block that
 * the holiday list itself is still RESEARCH_REQUIRED, and no artifact publishes one. Substituting
 * weekday-only arithmetic would count a holiday as a business day, push every business-day
 * deadline later than it really is, and can report an already-missed filing window as on track.
 * Overclaiming feasibility is the failure this product exists to prevent, so generation fails
 * loudly instead. Inventing holidays to fill the gap is not an option (AGENTS.md, Golden Rule 1).
 */
export class MissingHolidayCalendarError extends Error {
  constructor(calendarId: string) {
    super(
      `holiday calendar "${calendarId}" has no published holiday list, so business-day deadlines ` +
        `cannot be computed; plans are withheld until the verification owner publishes it`,
    );
    this.name = "MissingHolidayCalendarError";
  }
}

/**
 * Published holiday lists, keyed by the calendar id a ruleset pins. Empty on purpose: an entry
 * appears here only when the verification owner publishes the dates for that calendar.
 */
const PUBLISHED_HOLIDAY_CALENDARS: Readonly<Record<string, readonly string[]>> = {};

export function pinnedCalendar(calendarId: string): HolidayCalendar {
  const holidays = PUBLISHED_HOLIDAY_CALENDARS[calendarId];
  if (holidays === undefined) throw new MissingHolidayCalendarError(calendarId);
  return { id: calendarId, holidays };
}
