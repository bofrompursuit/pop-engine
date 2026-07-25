import type { HolidayCalendar } from "@pop-engine/engine";

// The calendar the ruleset pins (`config.business_day_math.calendar`, AD-11). Its holiday
// list is still RESEARCH_REQUIRED upstream — the ruleset says so in the same block — and a
// permit fact may not be invented to fill a gap, so no holidays are asserted here. Business-day
// math therefore counts weekdays only until the verification owner publishes the list.
// Tracked as a finding on F-201; the id stays pinned so plans record which calendar they used.
export function pinnedCalendar(calendarId: string): HolidayCalendar {
  return { id: calendarId, holidays: [] };
}
