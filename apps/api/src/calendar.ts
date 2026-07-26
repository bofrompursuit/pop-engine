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
 *
 * `us-ny-business-days@2026.1` was researched for publication and then deliberately NOT published.
 * If you are here to add it, read this first: the blocker is not that nobody looked up the dates.
 *
 * ONE CALENDAR ID SERVES RULES FROM TWO GOVERNMENTS. DOB-TENT-001 is a New York CITY agency;
 * SLA-ONEDAY-001 and SLA-CATERING-001 are a New York STATE agency. Their closure calendars
 * provably differ, so any single list is wrong for one of them:
 *   - Fri 2026-07-03 — the city observes it ("07/03 - Independence Day (Observed)",
 *     nyc.gov/site/opa/my-payroll/list-of-holidays.page) and so does the federal government
 *     (opm.gov 2026 schedule, "Friday, July 03"). The STATE does not: its 2026 calendar records
 *     Saturday 2026-07-04 as a "pass day holiday" (cs.ny.gov), so state offices work the Friday.
 *   - Thu 2026-02-12 — a state legal holiday under General Construction Law §24; in the city only
 *     a floating holiday, for employees hired before 2004-07-01, not a citywide closure.
 *   - Tue 2026-11-03 — a state and city holiday; not federal.
 * The observance RULES differ too, so this is structural rather than three exceptions: §24 rolls a
 * holiday forward only when it falls on a Sunday ("if any of such days except Flag day is Sunday,
 * the next day thereafter") and states no Saturday rule at all, while DCAS Personnel Services
 * Bulletin 440-2 and OPM both roll a Saturday holiday back to the preceding Friday.
 *
 * THE DEEPER GAP, and the actual reason this stays empty: no source defines "business day" for a
 * filing lead. GCL §24 (nysenate.gov/legislation/laws/GCN/24) enumerates public holidays; it does
 * not say an agency's filing counter stops on them. GCL §25-a extends a period that ENDS on a
 * Saturday, Sunday or public holiday, while this engine counts BACKWARD from an event date
 * (`subtractBusinessDays`), so §25-a never reaches the arithmetic. The DOB Temporary Use Permit
 * page publishes "no later than 15 business days prior" without defining the unit, and the ruleset
 * defines it no further. Every candidate list is therefore an inference about what a published
 * closure means for a filing, not a published fact — and a comment can document an inference
 * without authorizing it.
 *
 * A UNION of the city and state closures was considered and rejected. It never counts a closed day
 * as open, so it can only move a deadline earlier, which reads as the safe direction and is not:
 * an over-early date can raise `published_deadline_missed`, which the verdict turns into
 * INFEASIBLE. On any day between the union-derived date and the real one the engine would tell an
 * organizer their event cannot happen when it still can. F-201 AC 4 names over-prescribing as a
 * failure mode alongside overclaiming.
 *
 * Two notes for whoever picks this up:
 *   - Cite General CONSTRUCTION Law §24, path GCN/24. GCT/24 is General CITY Law §24, a different
 *     statute with no holidays in it; landing there suggests, wrongly, that the citation is bad.
 *   - One unexplored lead, offered as a lead and not as authority: NY Public Officers Law §62, on
 *     the transaction of business in state public offices. It sits closer to an SLA filing than an
 *     employee leave calendar does, and it does not touch DOB at all.
 *
 * What would unblock this is not a better list of dates. It is a source establishing, per agency,
 * that the agency's published closure stops that agency's filing counter.
 */
const PUBLISHED_HOLIDAY_CALENDARS: Readonly<Record<string, readonly string[]>> = {};

export function pinnedCalendar(calendarId: string): HolidayCalendar {
  return { id: calendarId, holidays: PUBLISHED_HOLIDAY_CALENDARS[calendarId] ?? null };
}

/**
 * The clock a plan's `today` is read from, per jurisdiction. A deadline is a calendar day in the
 * city that publishes it, so deriving `today` from UTC would roll over between 8pm and midnight
 * New York time and could mark a window missed hours before it closes. This is a deployment
 * mapping, not a regulatory fact: the ruleset publishes the jurisdiction but no timezone.
 */
const JURISDICTION_TIME_ZONES: Readonly<Record<string, string>> = {
  "US-NY-NYC": "America/New_York",
};

export class UnmappedJurisdictionError extends Error {
  constructor(jurisdiction: string) {
    super(`no local time zone is mapped for jurisdiction "${jurisdiction}"`);
    this.name = "UnmappedJurisdictionError";
  }
}

/** `today` in the jurisdiction's own calendar, as an ISO date the engine can take as a parameter. */
export function todayInJurisdiction(jurisdiction: string, now: Date = new Date()): string {
  const timeZone = JURISDICTION_TIME_ZONES[jurisdiction];
  if (timeZone === undefined) throw new UnmappedJurisdictionError(jurisdiction);
  // en-CA formats as YYYY-MM-DD, which is the shape every date in a plan uses.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Operational warning at boot: plans still generate, but business-day lines will not be dated. */
export function holidayCalendarWarning(calendar: HolidayCalendar): string | null {
  return calendar.holidays === null ? new MissingHolidayCalendarError(calendar.id).message : null;
}
