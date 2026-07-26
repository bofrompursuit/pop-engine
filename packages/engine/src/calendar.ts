// Calendar arithmetic. Dates are ISO `YYYY-MM-DD` strings throughout and every computation
// is UTC, so a deploy's timezone cannot move a deadline. The holiday list is injected
// (AD-11); the engine never derives holidays and never reads the clock.

import { EvaluationError } from "./types";
import type { PublishedHolidayCalendar } from "./types";

const MILLISECONDS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toEpochDay(date: string): number {
  if (!ISO_DATE.test(date)) throw new EvaluationError(`"${date}" is not an ISO calendar date`);
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new EvaluationError(`"${date}" is not a valid calendar date`);
  const normalized = new Date(parsed).toISOString().slice(0, 10);
  if (normalized !== date) throw new EvaluationError(`"${date}" is not a valid calendar date`);
  return parsed / MILLISECONDS_PER_DAY;
}

/**
 * `toISOString` switches to an extended year outside 0000–9999, so `.slice(0, 10)` would truncate
 * `-000001-12-31T…` to `"-000001-12"` — ten characters that are not a date, returned with no error.
 *
 * `ISO_DATE` is the guard. A round-trip compare like `toEpochDay`'s above is NOT: the truncated
 * string reparses to the same instant, so `"-000001-12"` and `"+275760-09"` each compare equal to
 * themselves and the check passes. `toEpochDay`'s three guards catch different things and only the
 * first applies here — `ISO_DATE` rejects a malformed shape, the `Number.isNaN` check rejects an
 * unparseable one, and the round-trip catches an overflow date like `2026-02-31` normalising to
 * `2026-03-03`. Past ±8.64e15 ms `toISOString` throws `RangeError` on its own; this covers the much
 * wider band below that where it returns a wrong answer instead.
 */
function fromEpochDay(epochDay: number): string {
  const date = new Date(epochDay * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
  if (!ISO_DATE.test(date)) {
    throw new EvaluationError(
      `epoch day ${epochDay} is outside the representable calendar range (years 0000-9999): ` +
        `date arithmetic produced "${date}", which is not a calendar date`,
    );
  }
  return date;
}

export function addCalendarDays(date: string, days: number): string {
  return fromEpochDay(toEpochDay(date) + days);
}

export function differenceInCalendarDays(from: string, to: string): number {
  return toEpochDay(to) - toEpochDay(from);
}

function isBusinessDay(date: string, calendar: PublishedHolidayCalendar): boolean {
  const weekday = new Date(toEpochDay(date) * MILLISECONDS_PER_DAY).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !calendar.holidays.includes(date);
}

/**
 * The latest date that still leaves `businessDays` full business days before `date`
 * (SLA's "received minimum 15 business days prior", DOB's TUP filing window).
 */
export function subtractBusinessDays(
  date: string,
  businessDays: number,
  calendar: PublishedHolidayCalendar,
): string {
  if (!Number.isInteger(businessDays) || businessDays < 0) {
    throw new EvaluationError(
      `business-day count must be a non-negative integer, received ${businessDays}`,
    );
  }
  let cursor = date;
  let remaining = businessDays;
  while (remaining > 0) {
    cursor = addCalendarDays(cursor, -1);
    if (isBusinessDay(cursor, calendar)) remaining -= 1;
  }
  return cursor;
}

/** Business days strictly after `from`, up to and including `to`. Negative when `to` precedes `from`. */
export function countBusinessDays(
  from: string,
  to: string,
  calendar: PublishedHolidayCalendar,
): number {
  const span = differenceInCalendarDays(from, to);
  if (span < 0) return -countBusinessDays(to, from, calendar);
  let counted = 0;
  let cursor = from;
  for (let step = 0; step < span; step += 1) {
    cursor = addCalendarDays(cursor, 1);
    if (isBusinessDay(cursor, calendar)) counted += 1;
  }
  return counted;
}
