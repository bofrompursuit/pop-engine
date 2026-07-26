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
 * ONE CALENDAR ID SERVES RULES FROM TWO GOVERNMENTS, AND THEIR PUBLISHED STAFF HOLIDAY SCHEDULES
 * DIFFER. DOB-TENT-001 is a New York CITY agency; SLA-ONEDAY-001 and SLA-CATERING-001 are a New
 * York STATE agency. What was established is a divergence between three EMPLOYEE holiday schedules
 * — which days staff are off — and one statute enumerating legal holidays. Not one of the four is
 * a DOB or SLA FILING-OFFICE calendar, and no such calendar was located. Each source is labelled
 * below for what it actually is, because the labels are the whole point:
 *   - Fri 2026-07-03 — on the city's PAYROLL holiday list ("07/03 - Independence Day (Observed)",
 *     nyc.gov/site/opa/my-payroll/list-of-holidays.page, Office of Payroll Administration) and on
 *     the federal EMPLOYEE schedule (opm.gov 2026, "Friday, July 03"). Not on the state's CIVIL
 *     SERVICE calendar, which records Saturday 2026-07-04 as a "pass day holiday" (cs.ny.gov) —
 *     an employee-attendance treatment.
 *   - Thu 2026-02-12 — a state legal holiday under General Construction LAW §24, which is a
 *     statute and not a staff schedule; in the city a floating holiday for EMPLOYEES hired before
 *     2004-07-01, which is a staff-leave entitlement rather than a citywide closure.
 *   - Tue 2026-11-03 — a state and city holiday; not federal.
 * The observance rules differ too, and that comparison has the same shape: §24 rolls a holiday
 * forward only when it falls on a Sunday ("if any of such days except Flag day is Sunday, the next
 * day thereafter") and states no Saturday rule at all, while DCAS PERSONNEL SERVICES Bulletin
 * 440-2 and the federal EMPLOYEE schedule both roll a Saturday holiday back to the preceding
 * Friday. That is one statute set beside two staff schedules, not two filing calendars compared.
 *
 * WHAT FOLLOWS FROM THOSE DATES IS CONDITIONAL, and the condition is unestablished. IF an agency's
 * staff closure stops that agency's filing counter, THEN no single list is right for both
 * governments and this one calendar id cannot serve all three rules. Whether it does is precisely
 * the question the leads below are leads for, and nothing consulted here answers it. An earlier
 * draft of this comment said the closure calendars "provably differ" and that "any single list is
 * wrong for one of them": the dates are real evidence and they stand, but the regulatory
 * consequence drawn from them was asserted rather than established, so it is withdrawn to the
 * conditional above rather than left for the next reader to inherit.
 *
 * THE DEEPER GAP, which is the INDEPENDENT and sufficient reason this stays empty: no source
 * consulted here defines "business day" for a filing lead. It rests on nothing above — the dates
 * and their downgrade to a conditional leave it exactly as it was, and the conditional's
 * unestablished premise is this same gap seen from the other side. GCL §24
 * (nysenate.gov/legislation/laws/GCN/24) enumerates public holidays; it does not say an agency's
 * filing counter stops on them. The DOB Temporary Use Permit page publishes "no later than 15
 * business days prior" without defining the unit, and the ruleset defines it no further. Two
 * statutes bear on the question and NEITHER was run down; they are listed as unresolved leads
 * below rather than dismissed here. Every candidate list is therefore an inference about what a
 * published closure means for a filing, not a published fact — and a comment can document an
 * inference without authorizing it. The decision not to publish stands on this paragraph.
 *
 * A UNION of the city and state staff schedules was considered and rejected. It never counts a closed day
 * as open, so it can only move a deadline earlier, which reads as the safe direction and is not:
 * an over-early date can raise `published_deadline_missed`, which the verdict turns into
 * INFEASIBLE. On any day between the union-derived date and the real one the engine would tell an
 * organizer their event cannot happen when it still can. F-201 AC 4 names over-prescribing as a
 * failure mode alongside overclaiming.
 *
 * A citation trap, before the leads: cite General CONSTRUCTION Law §24, path GCN/24. GCT/24 is
 * General CITY Law §24, a different statute with no holidays in it; landing there suggests,
 * wrongly, that the citation is bad.
 *
 * TWO UNRESOLVED LEADS. Neither was run down, and neither is excluded — they are recorded so the
 * verification owner can judge them, not so this file's reasoning can be inherited.
 *   - GENERAL CONSTRUCTION LAW §25-a (GCN/25-A), "Public holiday, Saturday or Sunday in statutes;
 *     extension of time where performance of act is due on Saturday, Sunday or public holiday". Its
 *     scope clause reaches this shape of deadline: "When any period of time, computed from a
 *     certain day, within which or after which OR BEFORE WHICH an act is authorized or required to
 *     be done, ends on a Saturday, Sunday or a public holiday, such act may be done on the next
 *     succeeding business day". A filing lead is a period before which an act must be done, so
 *     §25-a is not excluded by its own terms. What could NOT be established is whether a lead this
 *     engine counts BACKWARD from an event date (`subtractBusinessDays`) is a period that "ends on"
 *     a day in §25-a's sense, and if it is, what the "next succeeding business day" extension does
 *     to a "no later than" filing date — moving a filing deadline later is a substantive change no
 *     source consulted here authorizes. An earlier draft of this comment stated that §25-a "never
 *     reaches the arithmetic"; that was a legal conclusion the text does not clearly support, and
 *     it is withdrawn rather than left for the next reader to inherit.
 *   - NY PUBLIC OFFICERS LAW §62 (PBO/62), "Business in public offices on public holidays":
 *     "Holidays and Saturdays shall be considered as Sunday for all purposes relating to the
 *     transaction of business in the public offices of the state". It sits closer to an SLA filing
 *     than an employee leave calendar does, and it reaches state offices and county offices — not
 *     DOB, which is a city agency, so it cannot answer the question for all three rules on its own.
 *
 * WHAT DOB PUBLISHES ELSEWHERE, AND WHAT IT DOES NOT PUBLISH FOR TUP. This is not a third lead. The
 * two leads above are candidate authorities that might answer the question; this is not one of them,
 * it does not bear on what the TUP filing counter does, and nothing below should be read as a rule
 * that reaches TUP. It is recorded because it bounds what the TUP materials' silence can be taken
 * for. DOB publishes an explicit weekend-and-holiday rule for a backward-counted construction
 * notice in three places in Building Code Chapter 33 — verbatim, from DOB's own
 * published Chapter 33 (nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/
 * 2022BC_Chapter33_Con_DemoSafetyWBwm.pdf, retrieved 2026-07-26; the amlegal mirror at
 * codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-185903 carries the same section
 * but refuses automated retrieval):
 *   - §3306.3.1, demolition, notice to the department 24-48 hours before commencement: "If the
 *     notification date falls on a weekend or official holiday, the permit holder shall notify the
 *     department on the last business day before the commencement date."
 *   - §3304.3.1, soil and foundation work, the same 24-48 hour notice: "Should the notification date
 *     fall on a weekend or official holiday, the permit holder ... shall notify the department on
 *     the last business day before the commencement date." Its cancellation notice carries the
 *     mirror-image rule, rolling FORWARD to "the next business day after the intended commencement
 *     date" — so where DOB publishes such a rule it publishes the direction of the roll too.
 *   - §3314.4.1.5, adjustable suspended scaffold installation and removal, again 24-48 hours:
 *     "Should the notification date fall on a weekend or official holiday, the notification shall be
 *     made on the last business day before the commencement date of the installation or removal."
 * Against that, the TUP materials publish the 15-business-day lead and stop. Checked 2026-07-26:
 * the TUP page (nyc.gov/site/buildings/industry/tup.page), the TUP intake form and checklist
 * (nyc.gov/assets/buildings/pdf/tup-formchecklist.pdf) and the TUP service notice
 * (nyc.gov/assets/buildings/pdf/tup-sn.pdf) contain no definition of "business day", no weekend or
 * holiday rule, and no cross-reference to §3306.3.1 or to either of the others. The form and
 * checklist do not use the words "business day", "holiday" or "weekend" at all. Those are the
 * observables, and they are where this stops.
 *
 * WHAT THE OMISSION MEANS IS NOT ESTABLISHED, and no located source reaches it. Nothing in the TUP
 * materials, in Chapter 33, or anywhere else consulted says the omission was considered, and no
 * source speaks to DOB's intent at all. An innocent explanation sits inside the evidence above and
 * is complete on its own: all three analogues are counted in CLOCK HOURS, where no business-day unit
 * is in play, so their weekend rule supplies what an hour count lacks. If DOB has never published a
 * weekend-and-holiday rule for anything counted in BUSINESS DAYS — and nothing here shows that it
 * has — then the TUP omission needs no intent to explain it, because the question may simply never
 * have been addressed. Chapter 33 points the same way: it uses "business day" in all three rules and
 * never defines it, so even where DOB does publish a holiday rule it leaves undefined the same unit
 * THE DEEPER GAP above is about. So what this evidence does is narrow what the silence can be taken
 * for: it rules out the reading that DOB has no way of publishing such a rule, or no practice of it.
 * It does not show that the TUP omission was deliberate, and it does not establish what the TUP
 * counter does — §3306.3.1 governs a different notification and the TUP materials do not incorporate
 * it. An earlier draft of this paragraph said the absence "reads as a deliberate silence rather than
 * an oversight" and moved the record "from absence of evidence toward evidence of absence". That
 * inferred an agency's intent from the absence of text, which no source supports; it is withdrawn to
 * the observables above. The framing was specified in the brief this finding was recorded under and
 * was caught in review of PR #133, not by the brief — recorded here because this file has been
 * corrected twice for the same class of error (a consequence asserted past its sources) and a third
 * would be a pattern rather than a slip. The record is more complete than it was; the argument it
 * supports is weaker than that draft claimed, and the decision below is unchanged either way.
 *
 * TWO PASSES, NOT ONE, and both are on file. A second research pass on 2026-07-26 asked the question
 * this comment records as open — does an agency's published closure stop its filing counter — and
 * reached NOT PUBLISHED for both DOB and SLA, working from the DOB TUP page, the DOB closure
 * calendar, ABC Law §97 and §98, and 9 NYCRR Part 29. Both passes are recorded in
 * docs/VERIFICATION-SOURCES.md, Round 5, which is where the evidence lives and where the limits of
 * each pass are stated: the second pass's four sources were reported rather than re-fetched, with no
 * quoted text or retrieval metadata carried over, so they are an uncorroborated concurring result
 * and not fetched evidence on file. Read as such, the conclusion rests on two independent passes
 * rather than one. That pass treated POL §62 as a general lead; the narrower statement above stands
 * — §62 reaches state and county offices, not DOB.
 *
 * What would unblock this is not a better list of dates. It is a source establishing, per agency,
 * that the agency's published closure stops that agency's filing counter.
 *
 * MEANWHILE, AN APPROVED CRITERION CANNOT BE MET: F-201 AC 10 requires Scenario F's business-day
 * count "against the pinned calendar" and ARCHITECTURE AD-11 requires real business-day math
 * against it, and neither happens in production while this record is empty — the line renders
 * NOT_CALCULABLE instead. That is recorded as SPEC-CONFLICT #130, which also states the resolutions
 * and their costs. Publishing this list is one of them, so publication is an EXPECTED outcome here
 * and not a regression; `plan.test.ts` notifies when it happens and says the same thing.
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
