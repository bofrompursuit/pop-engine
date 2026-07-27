// F-203 deadline alerts: what gets scheduled when a checklist is materialized, and the in-process
// poller that sends it (ARCHITECTURE "Alert Scheduling (no Redis)", AD-1, AD-4).
//
// Three things this file is careful about, because getting any of them wrong is a regulatory
// failure rather than a bug:
//
// 1. NOTHING IS INVENTED. An alert is scheduled from a date the engine computed, or it is not
//    scheduled at all. A finding whose deadline is `research_required`, or whose business-day
//    window cannot be computed against an unpublished holiday calendar, has no
//    `latest_apply_date` — so it gets no reminder, and the checklist keeps listing it as "confirm
//    with agency" (spec AC 1). There is no fallback date anywhere in this file.
// 2. THE OFFSETS ARE POPENGINE POLICY. `config.alert_offsets.deadline_reminder.days_before` is a
//    product decision, and the ruleset's own note says alert copy must never present an offset as
//    an agency deadline. Every reminder therefore states both: the agency's published deadline
//    text verbatim, and separately that the reminder timing is ours. Same treatment
//    `slack_warning_days` already gets ("internal planning buffer, NOT an official threshold").
// 3. A HARD FLOOR IS NEVER SOFTENED (AC 3). A composite deadline's floor is a cliff, so reminder
//    copy for one carries the floor sentence as well as the date.

import { createHash, randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { DEPENDENCY_SEQUENCING_BINDINGS } from "@pop-engine/engine";
import type { Deadline, Disposition, VerificationStatus } from "@pop-engine/engine";
import {
  ALERT_CHANNELS,
  AlertDeliveryError,
  PROVIDER_TIMEOUT_MS,
  type AlertChannel,
  type AlertDelivery,
  type AlertSenders,
} from "./alert-delivery";
import { instantAtLocalHour, todayInJurisdiction } from "./calendar";
import { calendarDateFrom, renderingKey, type FindingRendering } from "./plan";

/** Mirrors the `alerts.alert_type` CHECK in migration 001. */
export const ALERT_TYPES = ["deadline_reminder", "slack_warning", "dependency_unlocked"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Mirrors the `alerts.status` CHECK in migration 001. */
export const ALERT_STATUSES = ["pending", "sent", "failed", "cancelled"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/**
 * The local hour a dated alert is sent at. An engineering choice, not a published one: agency
 * deadlines are calendar days, and a day has to become an instant somewhere. Morning in the
 * jurisdiction's own timezone is the working day the reminder names.
 */
const SEND_HOUR_LOCAL = 9;

/** ARCHITECTURE: "an in-process poller in Express ticks every 60s". AC 2 allows 2 minutes. */
export const POLL_INTERVAL_MS = 60_000;

/** AC 2: "the poller sends due alerts within 2 minutes of `send_at`". Named so it can be reasoned with. */
export const DELIVERY_BOUND_MS = 120_000;

/**
 * How long a failed alert waits before it is eligible again.
 *
 * Not a cap on retries — the spec's outage edge case is explicit that nothing is dropped and the
 * poller keeps trying. It is a cap on how much of the batch a destination that will never accept
 * anything is allowed to consume. The first retry is immediate, because one failure is usually a
 * blip and delaying it would itself spend the delivery budget; from the second it grows fast,
 * because by then the evidence says otherwise.
 */
const RETRY_BACKOFF = `CASE
       WHEN alerts.failure_count + 1 <= 1 THEN interval '0'
       WHEN alerts.failure_count + 1 = 2 THEN interval '1 minute'
       WHEN alerts.failure_count + 1 = 3 THEN interval '5 minutes'
       ELSE interval '15 minutes'
     END`;

/**
 * How many sends are in flight at once, and how long a tick may keep starting new ones.
 *
 * TWO REQUIREMENTS CONSTRAIN EACH OTHER HERE AND BOTH ARE REAL. A dead provider must not stall the
 * poller (the previous round's finding), and a healthy one must clear the due set inside AC 2's
 * two-minute bound (this one). Bounding the batch fixed the first and, on its own, broke the
 * second: a cap on how much a tick processes is also a cap on throughput, so a large enough due
 * set missed the bound by design rather than by failure. The arithmetic, written down because the
 * temptation is to raise a number until it happens to work:
 *
 *   At concurrency C with per-send duration d, a tick starts C × ⌊B/d⌋ sends before the budget B
 *   stops it. A FAILING send costs d = `PROVIDER_TIMEOUT_MS`; a healthy one costs a fraction of a
 *   second. So the same tick that clears the `MAX_ALERTS_PER_TICK` scan in a couple of seconds
 *   against a live provider gets through C × 3 against a dead one.
 *
 * The fix is not a bigger C. It is that the poller no longer waits out the interval when it knows
 * work is left: a tick that abandons rows re-runs immediately (`start`), so the interval became a
 * floor for an IDLE poller instead of a ceiling on a busy one. Throughput stops being
 * "C × ⌊B/d⌋ per I" and becomes "C/d, continuously", which is the same quantity the provider
 * itself can absorb.
 *
 *   HEALTHY (d ≈ 0.2s, C = 8): ~40 alerts a second sustained. The scan cap, not the clock, is what
 *   a tick hits, and the backlog drains at the rate the provider accepts work.
 *   FULLY DEAD (d = 10s, C = 8): 24 attempts per ~40-second tick, back-to-back — nothing is
 *   delivered because nothing can be, and the spec's outage edge case governs: retry, lose
 *   nothing.
 *   PARTIAL OUTAGE, which is the case that matters: a deliverable alert behind K untried dead ones
 *   is reached after K/C × d ≈ K × 1.25s, so the two-minute bound holds for K up to ~96. Past that
 *   it is a single-tick transient, not a standing condition, because `failure_count` ordering puts
 *   every attempted dead row behind every untried one from the next scan onward.
 *
 * NONE OF THOSE FIGURES DEPEND ON HOW THE DUE SET IS DISTRIBUTED ACROSS EVENTS, and that is a
 * correction rather than a restatement. While ownership was taken exclusively, C applied across
 * events only: one checklist's own reminders queued behind each other, so an event with N due
 * alerts took N × d however idle the other seven workers were — four dated items on two channels
 * is sixteen slots, which at a timing-out provider is 160 seconds for one organizer. With the
 * event held in SHARED mode the workers stop excluding each other and N alerts for one event cost
 * exactly what N alerts spread over N events cost: N/C × d. The same sixteen now take 0.4s
 * healthy, or 20s with every one of them timing out, inside a single budget.
 *
 * MAXIMUM SUSTAINABLE DUE-RATE: ~40 alerts/second with a live provider, whether they belong to one
 * event or forty. One checklist schedules on the order of ten alerts and they are spread across
 * calendar days, so the instantaneous due set is single or double digits — three orders of
 * magnitude of headroom.
 *
 * WORST-CASE TICK is unchanged at `TICK_BUDGET_MS` + `PROVIDER_TIMEOUT_MS` = 40 seconds, and the
 * budget's job has changed rather than gone: it no longer exists to fit inside the interval (the
 * `runningTick` guard is what guarantees that) but to force a re-scan often enough that the
 * `failure_count` ordering stays current and newly-cancelled rows stop being sent.
 *
 * C is eight against the poller's OWN pool (`index.ts`), not the API's. Sharing the API's ten
 * connections was what pinned it at four; a dedicated pool removes the coupling, so the API keeps
 * every connection it had while a provider times out.
 */
const SEND_CONCURRENCY = 8;
const TICK_BUDGET_MS = 30_000;

/**
 * How many due alerts one scan will claim — DERIVED, because choosing it independently of the
 * concurrency and the timeout is what let the code claim coverage it did not have.
 *
 * The last of N simultaneously-due alerts waits `N × T / C` when every send times out. At C = 8
 * and T = 10s a scan of 100 therefore needed 125 seconds to reach its final row, past the bound
 * before any polling delay is added — the cap said 100 and the arithmetic supported 96. Tying them
 * together means the number cannot drift from what it can deliver again: raise the concurrency or
 * shorten the timeout and this rises with them.
 */
const MAX_ALERTS_PER_TICK = Math.floor(
  (SEND_CONCURRENCY * DELIVERY_BOUND_MS) / PROVIDER_TIMEOUT_MS,
);

/** What the poller's own pool has to hold: every concurrent send, plus the scan that feeds them. */
export const ALERT_POLLER_CONNECTIONS = SEND_CONCURRENCY + 1;

/**
 * How long the test endpoint waits for a poller that claimed its row first.
 *
 * Derived from the delivery timeout rather than picked, because those are the same wait: the
 * endpoint is waiting for exactly one provider request, and it does not matter which side of the
 * process issued it. A fixed 600ms was shorter than a send is allowed to take, so a poller that
 * won the claim and then succeeded in a second produced a 502 moments before the send committed.
 */
const TEST_ALERT_CLAIM_WAIT_MS = 200;
const TEST_ALERT_CLAIM_ATTEMPTS = Math.ceil(PROVIDER_TIMEOUT_MS / TEST_ALERT_CLAIM_WAIT_MS) + 2;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Queryable = {
  query<Row extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
};

/**
 * Where an event's alerts go. Entered at checklist creation and no earlier — there is no auth in
 * the MVP (AD-5), so there is no account to read an address off (spec Inputs).
 *
 * Deliberately not persisted on `events`: that schema is the four-lane contract and a column on it
 * needs all-lane approval (AGENTS.md). The alert rows already carry `recipient` because AD-13 put
 * it there, so they are the record, and a regeneration that supplies no contact reads the
 * addresses back off the alerts already scheduled for the event.
 */
export type AlertContacts = { readonly email: string | null; readonly phone: string | null };

export const NO_CONTACTS: AlertContacts = { email: null, phone: null };

/**
 * A change to those contacts, where `undefined` means "the request said nothing about this" and
 * `null` means "clear it". The two are different instructions and collapsing them deletes data:
 * every checklist review that omits a field would wipe whatever is stored for it.
 */
export type AlertContactsUpdate = {
  readonly email?: string | null;
  readonly phone?: string | null;
};

export type AlertScheduleSummary = {
  /** New rows written by this call. */
  readonly scheduled: number;
  /** Pending or failed rows the recomputed set no longer contains (AC 7). */
  readonly cancelled: number;
  readonly channels: readonly AlertChannel[];
  /** Set when nothing could be scheduled, so a caller can say why rather than showing zero. */
  readonly reason: string | null;
};

/**
 * Recompute an event's alerts against the plan a checklist was just materialized from.
 *
 * Called inside the materialization transaction, so a checklist and its alerts land together or
 * not at all.
 */
export type AlertScheduler = (
  client: PoolClient,
  eventId: string,
  planId: string,
  contacts: AlertContactsUpdate,
) => Promise<AlertScheduleSummary>;

export type AlertSchedulerSettings = {
  /** `config.alert_offsets.deadline_reminder.days_before`, validated at boot by `ruleset.ts`. */
  readonly reminderDaysBefore: readonly number[];
  /** `config.slack_warning_days.value`, named in slack-warning copy as PopEngine's own buffer. */
  readonly slackWarningDays: number;
  /** The jurisdiction whose calendar day a send hour belongs to. */
  readonly jurisdiction: string;
  readonly now?: () => Date;
};

type PlanAlertRow = {
  checklist_item_id: string | null;
  rule_ids: string[];
  permit_name: string | null;
  agency: string | null;
  deadline: Deadline | null;
  latest_apply_date: Date | string | null;
  apply_after_date: Date | string | null;
  portal_name: string | null;
  portal_url: string | null;
  disposition: Disposition;
  verification_status: VerificationStatus;
};

type PlannedAlert = {
  readonly alertType: AlertType;
  readonly checklistItemId: string | null;
  readonly sendAt: Date;
  readonly subject: string;
  readonly body: string;
  /**
   * What makes this alert the same alert across regenerations. Combined with the channel into the
   * row's `idempotency_key`, which is what keeps a sent alert from being sent again (AC 7).
   */
  readonly identity: string;
};

const isoDate = (value: Date | string | null): string | null =>
  value === null ? null : calendarDateFrom(value);

/**
 * The published deadline text and portal instructions the plan stored per finding. Reminder copy
 * quotes them rather than restating them, so an organizer reads the agency's own words.
 */
async function renderingsForPlan(
  database: Queryable,
  planId: string,
): Promise<Map<string, FindingRendering>> {
  const { rows } = await database.query<{ finding_renderings: FindingRendering[] | null }>(
    "SELECT verdict_detail->'finding_renderings' AS finding_renderings FROM permit_plans WHERE id = $1",
    [planId],
  );
  return new Map(
    (rows[0]?.finding_renderings ?? []).map((rendering) => [
      renderingKey(rendering.rule_ids),
      rendering,
    ]),
  );
}

type PlanVerdictRow = {
  verdict: string;
  verdict_detail: { minSlackDays?: number | null };
  today: string;
};

async function planVerdict(database: Queryable, planId: string): Promise<PlanVerdictRow | null> {
  const { rows } = await database.query<PlanVerdictRow>(
    `SELECT verdict, verdict_detail, verdict_detail->>'today' AS today
       FROM permit_plans WHERE id = $1`,
    [planId],
  );
  return rows[0] ?? null;
}

/**
 * The plan's requirements with the checklist row each became, in filing order.
 *
 * A LEFT JOIN because only permit and insurance lines become tasks (F-202): an advisory has no
 * checklist row, and an alert about a line the organizer is not tracking is noise. Rows with no
 * task are skipped rather than scheduled against a null `checklist_item_id`, which is reserved for
 * the plan-level slack warning.
 */
async function planAlertRows(database: Queryable, planId: string): Promise<PlanAlertRow[]> {
  const { rows } = await database.query<PlanAlertRow>(
    `SELECT checklist.id AS checklist_item_id, item.rule_ids, item.permit_name, item.agency,
            item.deadline, item.latest_apply_date, item.apply_after_date, item.portal_name,
            item.portal_url, item.disposition, item.verification_status
       FROM permit_plan_items AS item
       LEFT JOIN checklist_items AS checklist ON checklist.plan_item_id = item.id
      WHERE item.plan_id = $1
      ORDER BY item.latest_apply_date NULLS LAST, item.permit_name, item.rule_ids`,
    [planId],
  );
  return rows;
}

const requirementLabel = (row: PlanAlertRow): string => row.permit_name ?? row.rule_ids.join(", ");

const withAgency = (row: PlanAlertRow): string =>
  row.agency === null ? requirementLabel(row) : `${requirementLabel(row)} (${row.agency})`;

/** The filing route, published as a portal, an instruction, or both. */
function filingRoute(row: PlanAlertRow, rendering: FindingRendering | undefined): string[] {
  const lines: string[] = [];
  if (row.portal_name !== null) {
    lines.push(
      row.portal_url === null ? row.portal_name : `${row.portal_name} — ${row.portal_url}`,
    );
  }
  if (rendering?.portal_instructions != null) lines.push(rendering.portal_instructions);
  return lines;
}

/**
 * AC 3. A composite deadline's `hard_floor_days` is a cliff the ruleset states applications inside
 * are not accepted, so a reminder that only counts down to a date would soften it by omission.
 * Both the floor sentence and the rule's own published display string travel with every reminder
 * for such a deadline; the number comes from the rule, never from this file.
 */
function hardFloorSentence(deadline: Deadline | null): string | null {
  if (deadline === null || deadline.type !== "composite") return null;
  return `Applications within ${deadline.hardFloorDays} days of the event are not accepted.`;
}

/**
 * The one sentence that keeps a PopEngine reminder from reading as an agency requirement. The
 * ruleset's `alert_offsets` note requires it in these words' substance: "PopEngine reminder policy,
 * NOT an agency deadline; UI and alert copy must never present an offset as one."
 *
 * `late` is the case the first version got wrong. An offset only describes when the reminder is
 * SENT if the checklist existed on that day. Create one three days before filing and the 7-day
 * reminder goes out immediately — three days before, while the words claimed seven. The offset is
 * still the honest name for which reminder this is, so it stays; what changes is that the sentence
 * stops asserting a delivery time it can see is untrue.
 */
const offsetPolicyNote = (days: number, late: boolean): string => {
  const slot = `${days} ${days === 1 ? "day" : "days"}`;
  return late
    ? `This is PopEngine's ${slot}-before reminder, sent now because your checklist was created ` +
        `after that day had already passed. The reminder schedule is PopEngine policy, not an ` +
        `agency deadline.`
    : `PopEngine sends this reminder ${slot} before the filing date. That reminder schedule is ` +
        `PopEngine policy, not an agency deadline.`;
};

/**
 * What a reminder must say when it arrives before the gated item's window is expected to open.
 *
 * THE ORDERING PROBLEM IS REAL AND THE OBVIOUS FIX REPEATS LAST ROUND'S MISTAKE. With ~26–32 days
 * of runway the 7-day reminder for a gated permit falls before `apply_after_date`, so an
 * organizer is told to file and only later told they can pursue it. Two messages, contradictory
 * order.
 *
 * The tempting repair is to move the reminder to `apply_after_date`, or drop it. Both assert that
 * the date is a gate on FILING, and it is not: it is today plus the EARLIEST end of the upstream's
 * published processing range — the soonest a decision could come back. The dependency rule's own
 * verification block says a strict issued-before-filed sequence is NOT confirmed by located
 * primary text, and `proposals.ts` §7 says the same in as many words: "never as a prohibition on
 * filing sooner". This is the identical misreading that put "your decision window has passed"
 * into the unlock copy last round, arriving from the other side — there it turned an expected
 * date into an observed outcome, here it would turn it into a bar on acting early.
 *
 * So the reminder keeps its date and gains the sequence it sits inside. The organizer learns both
 * things at once instead of learning them in a contradictory order, and PopEngine still asserts
 * nothing about the ordering that the rule declines to confirm.
 */
const sequenceNote = (upstream: PlanAlertRow, openOn: string): string =>
  `This filing is sequenced after your ${withAgency(upstream)}, whose decision is expected no ` +
  `earlier than ${openOn}. Filing before then may still be possible — the order is not confirmed ` +
  `by published text, so confirm it with the agency.`;

/**
 * Whether the plan says this requirement applies, or only that it might.
 *
 * A dated finding is not the same as a settled one. `MAY_BE_REQUIRED` is what the engine assigns
 * when a trigger came back `unknown` or a rule publishes the hedge itself, and the date beside it
 * is the deadline that would apply IF it applies. An imperative "file by" over that turns the
 * ruleset's uncertainty into a requirement PopEngine invented, which is the failure AGENTS.md
 * names: an unresolved state stays visible end to end.
 */
const isSettledRequirement = (row: PlanAlertRow): boolean => row.disposition === "required";

/**
 * A published enum token as an organizer reads it. The same transformation the checklist row
 * applies, so one requirement does not arrive named two ways on two surfaces.
 */
const humanizeToken = (token: string): string => token.replace(/_/g, " ");

function reminderCopy(
  row: PlanAlertRow,
  rendering: FindingRendering | undefined,
  applyBy: string,
  daysBefore: number,
  timing: {
    readonly late: boolean;
    readonly pendingUpstream: PlanAlertRow | null;
    readonly openOn: string | null;
  },
): { subject: string; body: string } {
  const settled = isSettledRequirement(row);
  const body = [
    settled
      ? `${withAgency(row)}: file by ${applyBy}.`
      : `${withAgency(row)} may be required for your event. If it applies, file by ${applyBy}.`,
    rendering?.deadline_display == null
      ? null
      : `Published deadline: ${rendering.deadline_display}`,
    hardFloorSentence(row.deadline),
    // THE VERIFICATION STATE, on every reminder rather than only where prose happens to mention
    // it. AGENTS.md keeps SOURCE_CONFIRMED, OFFICIAL_CONFLICT, RESEARCH_REQUIRED and COVERAGE_GAP
    // visible END TO END, and a notification is an end: it is the copy an organizer acts on, and
    // for a reminder that arrives by SMS it may be the only place they read the requirement at
    // all. Carrying the conflict prose covered exactly one status and left the ordinary confirmed
    // case saying nothing, which is the case where silence reads as "this is settled" — true for
    // SOURCE_CONFIRMED and wrong for the rest. The checklist row already shows the same token
    // (`checklist-item.tsx`), humanised the same way, so the two surfaces agree.
    `Verification: ${humanizeToken(row.verification_status)}`,
    // EVERY PUBLISHED NOTE, because the qualification IS one of them and nothing here can tell
    // which. `findings.ts` builds this array as the rule's own notes, then the DEADLINE's
    // `qualification`, then the VERIFICATION's, then "confirm with agency" where it applies — all
    // flattened, with no marker separating the caveat about a date from a note about anything
    // else. Reading only `deadline_display` therefore dropped the caveat silently, and dropped it
    // hardest exactly where it matters most: DOB-ASSEMBLY-001 publishes no display string at all,
    // so its reminder stated a computed calendar date with no hint that the published lead may be
    // ten BUSINESS days and that the wording is unpinned. A date presented without the doubt the
    // ruleset attaches to it is a resolved requirement PopEngine invented (AGENTS.md: an
    // unresolved state stays visible end to end).
    //
    // Quoted, never summarised. Picking which notes "belong to" the deadline would be this file
    // deciding which published qualifications an organizer needs, which is the ruleset's call.
    ...(rendering?.notes ?? []),
    // Both readings of an OFFICIAL_CONFLICT rule, verbatim. PARKS-TUA-001 is dated and carries a
    // published conflict about whether it is triggered at all; a reminder that quotes the date and
    // drops the conflict renders an unresolved requirement as a resolved one.
    rendering?.conflict_text ?? null,
    timing.pendingUpstream === null || timing.openOn === null
      ? null
      : sequenceNote(timing.pendingUpstream, timing.openOn),
    ...filingRoute(row, rendering),
    offsetPolicyNote(daysBefore, timing.late),
  ].filter((line): line is string => line !== null);
  return {
    subject: settled
      ? `File your ${requirementLabel(row)} by ${applyBy}`
      : `${requirementLabel(row)} may be required — file by ${applyBy} if it applies`,
    body: body.join("\n"),
  };
}

/**
 * AC 4. The gated requirement's window opens at `apply_after_date`, which the engine computed from
 * the upstream rule's own published processing range. The copy names the dependency — both ends of
 * it — and carries the dependency rule's published caveat, because that rule's verification block
 * says a strict issued-before-filed order is NOT confirmed. Announcing the sequence as settled
 * would assert something no source states.
 *
 * WHAT THIS DATE IS, precisely, because the obvious sentence is wrong. `apply_after_date` is
 * today plus the EARLIEST end of the upstream's published processing range — the soonest a
 * decision could come back, not the day one did. F-203's own AC 4 sketches the copy as "your
 * Parks permit decision window has passed", and that sentence asserts an agency outcome nothing
 * observed: on day 21 of a published 21–30 day range, the decision may well still be pending.
 * The spec text is UI copy and the rule's processing range is published data, and AGENTS.md
 * ranks published rule above UI copy when they disagree, so the criterion's substance is kept —
 * the alert fires on the gated date and names the dependency at both ends — and its example
 * sentence is not.
 */
function dependencyCopy(
  gated: PlanAlertRow,
  upstream: PlanAlertRow,
  dependency: PlanAlertRow | undefined,
  gatedRendering: FindingRendering | undefined,
  dependencyNote: string | null,
  openOn: string,
): { subject: string; body: string } {
  const range =
    upstream.deadline?.type === "composite" ? upstream.deadline.processingRangeDays : null;
  const body = [
    `${openOn} is the earliest a decision on your ${withAgency(upstream)} could come back` +
      (range === null ? "" : `, from its published ${range[0]}–${range[1]} day processing range`) +
      `. You can now pursue your ${withAgency(gated)}.`,
    // THREE VERIFICATION STATES, because this alert is a claim about three published things and
    // the reminder's single line does not cover it. AGENTS.md keeps those states visible END TO
    // END and a notification is an end; the reminder builder was fixed for that and this builder
    // was not, so the one alert that asserts a SEQUENCE between two agencies was the one arriving
    // with no verification state at all.
    //
    // The third line is the one that matters most and the one a single-status shape cannot carry.
    // `NYPD-SOUND-PARKS-DEP-001` publishes RESEARCH_REQUIRED on the sequencing itself: a strict
    // issued-before-filed order is NOT confirmed. "You can now pursue" reads as a start date the
    // agencies agree on, and without this line the unconfirmed part of the claim is the part the
    // organizer cannot see. Every token is read off the plan item, never named here.
    `Verification of your ${withAgency(gated)}: ${humanizeToken(gated.verification_status)}`,
    `Verification of your ${withAgency(upstream)}: ${humanizeToken(upstream.verification_status)}`,
    dependency === undefined
      ? null
      : `Verification of the sequencing between them: ` +
        `${humanizeToken(dependency.verification_status)}`,
    ...filingRoute(gated, gatedRendering),
    dependencyNote,
  ].filter((line): line is string => line !== null);
  return { subject: `You can now pursue your ${requirementLabel(gated)}`, body: body.join("\n") };
}

/**
 * AC 1's slack warning, fired at checklist creation rather than on a date. The threshold is named
 * as PopEngine's own, exactly as `config.slack_warning_days` requires and as the plan verdict copy
 * already does.
 *
 * WHAT `minSlackDays` IS NOT: a countdown. The engine takes the minimum of every dated finding's
 * `slackDays`, and that field means two different things depending on the finding. Ungated, it is
 * the distance from the PLAN'S evaluation date to the filing date — not from today, and the two
 * differ by however long the organizer waited before materializing. Gated, `findings.ts` replaces
 * it with `latest_apply − apply_after`: the WIDTH of the window the item can be filed in. A park
 * event 35 days out has nine days of gated slack and cannot pursue the sound permit for another
 * 21, so "the soonest filing date is nine days away" — the sentence this used to send — told the
 * organizer they had three weeks less runway than they do, and in the other direction it can tell
 * them they have more. Neither reading survives being called "days away", so the copy now says
 * what the number is and points at the dates that ARE the countdown.
 *
 * "apply within N days" stays in the subject: that phrasing is fixed for FEASIBLE-AT-RISK by the
 * answer key's verdict model and `specs/F-102`, and `apps/web/app/plan/verdict-copy.ts` already
 * renders it. Restating it differently here would put two vocabularies on one verdict.
 */
const slackWarningCopy = (
  minSlackDays: number,
  slackWarningDays: number,
  evaluatedOn: string,
  planHasGatedFiling: boolean,
): { subject: string; body: string } => ({
  subject: `At risk — apply within ${minSlackDays} days`,
  body: [
    `Your plan is FEASIBLE-AT-RISK: the narrowest slack across its dated requirements is ` +
      `${minSlackDays} days, measured from the plan's evaluation date ${evaluatedOn}.`,
    planHasGatedFiling
      ? `One of those requirements waits on another agency's decision. For that one the number ` +
        `above is the width of the window it can be filed in, not the time remaining — its own ` +
        `start and filing dates are on your checklist.`
      : null,
    `The ${slackWarningDays}-day threshold is PopEngine's internal planning buffer, not an ` +
      `official threshold.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n"),
});

/**
 * Every alert this plan calls for, before channels are applied.
 *
 * Scheduling reads dates only. A requirement with no `latest_apply_date` — a `research_required`
 * lead time, or a business-day window with no published holiday calendar — contributes nothing
 * here, which is spec AC 1 and the reason there is no `?? today` anywhere below.
 */
async function plannedAlerts(
  client: PoolClient,
  planId: string,
  settings: AlertSchedulerSettings,
  now: Date,
): Promise<PlannedAlert[]> {
  const plan = await planVerdict(client, planId);
  if (plan === null) return [];
  const rows = await planAlertRows(client, planId);
  const renderings = await renderingsForPlan(client, planId);
  const byRuleId = new Map(rows.map((row) => [row.rule_ids[0] ?? "", row]));
  // THE DAY SCHEDULING HAPPENS, not the day the plan was evaluated. A plan pins `today` at
  // generation, and an organizer can generate one on Monday and convert it on Friday: read against
  // the plan's clock, a filing date that closed on Wednesday still looks like it is ahead, and the
  // guard below would schedule a reminder that is immediately due and reads "file by" a day that
  // has gone — the exact output the guard exists to prevent. The plan's own clock is still the
  // right answer for what the plan CALCULATED (it is what the slack figure was measured from, and
  // the copy says so); it is the wrong answer for what has happened since.
  const schedulingToday = todayInJurisdiction(settings.jurisdiction, now);
  const planned: PlannedAlert[] = [];

  for (const row of rows) {
    if (row.checklist_item_id === null) continue;
    const rendering = renderings.get(renderingKey(row.rule_ids));
    const applyBy = isoDate(row.latest_apply_date);

    const openOn = isoDate(row.apply_after_date);
    const binding = DEPENDENCY_SEQUENCING_BINDINGS.find(
      (candidate) => candidate.gatedRuleId === (row.rule_ids[0] ?? ""),
    );
    const upstream = binding === undefined ? undefined : byRuleId.get(binding.upstreamRuleId);

    // A filing date already behind is not something to remind anyone to meet. The reminder would
    // read "file by <a day that has passed>", which is the one thing a missed window must never be
    // dressed up as. The checklist still shows the missed status.
    if (applyBy !== null && applyBy >= schedulingToday) {
      for (const daysBefore of settings.reminderDaysBefore) {
        const sendOn = shiftDays(applyBy, -daysBefore);
        const { subject, body } = reminderCopy(row, rendering, applyBy, daysBefore, {
          // Its day has already gone, so it goes out on the next tick and says so.
          late: sendOn < schedulingToday,
          // Named only while the upstream decision is still ahead of this reminder. Once the
          // window has opened the sequence is no longer news, and the unlock alert has said it.
          pendingUpstream: openOn !== null && sendOn < openOn ? (upstream ?? null) : null,
          openOn,
        });
        planned.push({
          alertType: "deadline_reminder",
          checklistItemId: row.checklist_item_id,
          // Already past at scheduling time — a checklist created inside the reminder window —
          // sends on the next tick rather than being dropped (spec edge case).
          sendAt: instantAtLocalHour(settings.jurisdiction, sendOn, SEND_HOUR_LOCAL),
          subject,
          body,
          // THE OFFSET IS PART OF WHICH REMINDER THIS IS, and the send day alone does not carry
          // it. The published offsets are 7 and 1, so a regeneration that moves a filing date by
          // exactly their difference lands the new 7-day reminder on the day the old 1-day
          // reminder already occupies. Same item, same type, same day — the same key. If the old
          // one had been sent, the conflict clause correctly refuses to touch a sent row, and the
          // new reminder carrying the CORRECTED filing date was silently dropped on the floor.
          identity: `${row.checklist_item_id}:deadline_reminder:${daysBefore}:${sendOn}`,
        });
      }
    }

    // A FILING DEADLINE THAT HAS PASSED CLOSES THE UNLOCK TOO, and the reminder guard above was
    // not enough on its own. Materializing an older plan after the gated item's latest apply date
    // correctly skips the reminder and then scheduled this anyway, on a day already behind, so the
    // next tick sent "You can now pursue" about a window the same plan reports as missed. Two
    // surfaces contradicting each other on one requirement, with the notification the one that is
    // wrong.
    //
    // A NULL latest apply date is allowed through, deliberately. That is a gated requirement with
    // no published filing deadline at all — nothing has closed, so there is nothing to contradict,
    // and suppressing it would drop a true alert to guard against a state that cannot arise. The
    // guard is about a date that has gone, not about the absence of one.
    const filingStillOpen = applyBy === null || applyBy >= schedulingToday;

    // No binding or no upstream row means nothing published names what this waits on, and an
    // unlock alert that cannot name its dependency is not the alert AC 4 asks for.
    if (openOn !== null && binding !== undefined && upstream !== undefined && filingStillOpen) {
      const { subject, body } = dependencyCopy(
        row,
        upstream,
        byRuleId.get(binding.dependencyRuleId),
        rendering,
        renderings.get(renderingKey([binding.dependencyRuleId]))?.note_text ?? null,
        openOn,
      );
      planned.push({
        alertType: "dependency_unlocked",
        checklistItemId: row.checklist_item_id,
        sendAt: instantAtLocalHour(settings.jurisdiction, openOn, SEND_HOUR_LOCAL),
        subject,
        body,
        // NO DATE IN THIS ONE, and that is the difference between it and a reminder. A reminder is
        // one of several per requirement and its day is what tells them apart; an unlock is a
        // single announcement per gated requirement — "the window you were waiting on is open" —
        // and it can only be true once.
        //
        // `apply_after_date` is today plus the upstream processing range, so it moves every time
        // the plan is regenerated on a later day, even when the event, the requirement and the
        // upstream have not changed at all. Keyed on that date, a regeneration minted a second
        // unlock whose predecessor was already sent and therefore correctly untouchable, and the
        // organizer was told a second time that they may now pursue something they had already
        // been told was open.
        identity: `${row.checklist_item_id}:dependency_unlocked`,
      });
    }
  }

  const minSlackDays = plan.verdict_detail.minSlackDays;
  if (plan.verdict === "feasible_at_risk" && typeof minSlackDays === "number") {
    // Whether any dated requirement in this plan waits on another agency, which decides whether
    // the number above can be read as a countdown at all.
    const planHasGatedFiling = rows.some(
      (row) => row.apply_after_date !== null && row.latest_apply_date !== null,
    );
    const { subject, body } = slackWarningCopy(
      minSlackDays,
      settings.slackWarningDays,
      plan.today,
      planHasGatedFiling,
    );
    planned.push({
      alertType: "slack_warning",
      checklistItemId: null,
      // "Immediately at checklist creation" (spec Outputs): due the moment it is written.
      sendAt: now,
      subject,
      body,
      // Keyed on the plan rather than on `send_at`, which is the clock and changes on every call.
      // One warning per plan: re-materializing the same plan must not warn twice, and a
      // regeneration is a different plan and does warn again.
      identity: `plan:${planId}:slack_warning`,
    });
  }

  return planned;
}

/** A calendar day shifted by whole days, in UTC so no timezone can move the day itself. */
function shiftDays(day: string, days: number): string {
  const shifted = new Date(`${day}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The row's identity, per ARCHITECTURE's `{event_id}:{checklist_item_id}:{alert_type}:{send_at}`
 * with three deviations the schema forces and the example (an "e.g.") does not cover: the channel
 * is part of it, because `idempotency_key` is UNIQUE and the same alert on email and SMS is two
 * rows; the plan-level slack warning is keyed on its plan instead of a send time it shares with the
 * clock; and the DESTINATION is part of it, which is the third and is explained below.
 *
 * ONE ROW PER ALERT PER DESTINATION, because `alerts.recipient` is an audit fact and a row cannot
 * hold two of them. `event_alert_contacts` exists on exactly this distinction: where this event's
 * alerts GO is per-event and correctable, and where one MESSAGE went is per-row and immutable. The
 * upsert then rewrote `recipient` in place, which is that argument's own sentence pointing the
 * other way — a row that had already been attempted came out claiming the attempt targeted an
 * address it was never sent to. Resend accepts a request, the api times out before it sees the
 * response, the row is marked failed although a message may have reached the OLD address, and
 * correcting the contact rewrote the only record of where that attempt went.
 *
 * Putting the destination in the key means a correction cannot rewrite anything: the corrected
 * request finds no row to conflict with and INSERTs its own, and the row that was attempted keeps
 * its recipient, its count and its error for good. The reconciler below then cancels it in the same
 * statement it already used for every other superseded alert, because its key is no longer in the
 * set the plan calls for. Cancelled is the right word rather than a new one — PopEngine intended to
 * send it and no longer does, which is what that status has always meant here (AC 2). A SENT row is
 * matched by neither the upsert nor the cancel, so the record of a delivered message is untouched.
 *
 * HASHED, NOT WRITTEN IN. The key is stored on every row and travels to the provider in a header,
 * and an email address or a phone number in it would be contact data in two more places for no
 * gain (AGENTS.md: do not log unredacted contact data). A digest changes exactly when the
 * destination changes, which is all the key needs from it.
 *
 * No migration: this changes what goes IN the column, not the column or its UNIQUE constraint.
 * Existing rows keep their keys and are superseded by the reconciler on the next review like any
 * other stale alert, so there is nothing to backfill.
 */
const idempotencyKey = (
  eventId: string,
  identity: string,
  channel: AlertChannel,
  recipient: string,
): string =>
  `${eventId}:${identity}:${channel}:` +
  createHash("sha256").update(recipient).digest("hex").slice(0, 12);

/**
 * The key handed to the PROVIDER: the row's key plus a digest of the COPY that would be delivered.
 *
 * An idempotency key means "this is the same request as before, do not do it twice", and the row's
 * key does not mean that on its own — it means "this is the same alert on the same channel to the
 * same destination". An alert keeps that identity across regenerations while its subject and body
 * are recomputed, so a payload the organizer would read as a different message reached Resend under
 * the key of the one it replaced, and Resend was entitled to answer with its stored response for
 * the original. A moved filing date is exactly that case: same requirement, same destination, new
 * sentence, and the new sentence is the one that matters.
 *
 * NARROWED THIS ROUND, and the narrowing is the point rather than an omission. The digest used to
 * cover the recipient too, because the recipient could change under a fixed row key. It cannot any
 * more: the destination is part of the row key, so a corrected address is a different row with a
 * different key before this function is reached. Covering it here as well would be a second
 * mechanism for a case the first already decides, and two mechanisms for one case is how they drift
 * apart. This one now has exactly one job: the copy.
 *
 * Same copy, same key, so the crash-window protection AD-13 rests on is unchanged in strength — a
 * lost mark-sent retries under the identical key and the provider delivers once.
 *
 * No column and no migration: the value is derived from the row at send time, so there is no second
 * place for it to fall out of step with what is being sent.
 */
const providerKey = (row: DueAlertRow): string => {
  const copy = [row.payload.subject ?? "", row.payload.body ?? ""].join("\u0000");
  return `${row.idempotency_key}:${createHash("sha256").update(copy).digest("hex").slice(0, 16)}`;
};

/**
 * The addresses to schedule to: what the organizer just entered, falling back to what this event's
 * existing alerts were already addressed to. The fallback is what makes a regeneration keep
 * working — F-202's "review items" is the same idempotent POST, and it should not need the contact
 * details re-typed to keep the reminders alive.
 */
/**
 * Store what the organizer just entered, and return where this event's alerts go.
 *
 * A field the request did not mention is left alone; a field it sent as null is cleared. That
 * distinction is why `AlertContactsUpdate` keeps `undefined` and `null` apart — collapsing them
 * would make every checklist review that omits a phone number silently delete the one on file.
 */
async function resolveContacts(
  client: PoolClient,
  eventId: string,
  supplied: AlertContactsUpdate,
): Promise<AlertContacts> {
  const setsEmail = supplied.email !== undefined;
  const setsPhone = supplied.phone !== undefined;
  if (setsEmail || setsPhone) {
    await client.query(
      `INSERT INTO event_alert_contacts (event_id, email, phone)
         VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO UPDATE
         SET email = CASE WHEN $4 THEN EXCLUDED.email ELSE event_alert_contacts.email END,
             phone = CASE WHEN $5 THEN EXCLUDED.phone ELSE event_alert_contacts.phone END,
             updated_at = current_timestamp`,
      [eventId, supplied.email ?? null, supplied.phone ?? null, setsEmail, setsPhone],
    );
  }
  const { rows } = await client.query<{ email: string | null; phone: string | null }>(
    "SELECT email, phone FROM event_alert_contacts WHERE event_id = $1",
    [eventId],
  );
  return { email: rows[0]?.email ?? null, phone: rows[0]?.phone ?? null };
}

/** Where this event's alerts go, for a caller that is only reading. */
export async function alertContacts(database: Queryable, eventId: string): Promise<AlertContacts> {
  const { rows } = await database.query<{ email: string | null; phone: string | null }>(
    "SELECT email, phone FROM event_alert_contacts WHERE event_id = $1",
    [eventId],
  );
  return { email: rows[0]?.email ?? null, phone: rows[0]?.phone ?? null };
}

const recipientFor = (contacts: AlertContacts, channel: AlertChannel): string | null =>
  channel === "email" ? contacts.email : contacts.phone;

export function createAlertScheduler(settings: AlertSchedulerSettings): AlertScheduler {
  const clock = settings.now ?? (() => new Date());

  return async (client, eventId, planId, supplied) => {
    const contacts = await resolveContacts(client, eventId, supplied);
    const channels = ALERT_CHANNELS.filter((channel) => recipientFor(contacts, channel) !== null);
    const planned =
      channels.length === 0 ? [] : await plannedAlerts(client, planId, settings, clock());

    let scheduled = 0;
    const keys: string[] = [];
    for (const alert of planned) {
      for (const channel of channels) {
        // Non-null: `channels` is filtered on exactly this.
        const recipient = recipientFor(contacts, channel) ?? "";
        const key = idempotencyKey(eventId, alert.identity, channel, recipient);
        keys.push(key);
        const { rows } = await client.query<{ inserted: boolean }>(
          `INSERT INTO alerts (id, event_id, checklist_item_id, alert_type, channel, recipient,
                               idempotency_key, send_at, status, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9::jsonb)
           ON CONFLICT (idempotency_key) DO UPDATE
             -- SAME ALERT, SAME DESTINATION, RECOMPUTED — and the destination is now part of what
             -- "same" means, because it is part of the key. A pending row takes the new copy; a row
             -- cancelled by an earlier regeneration comes back if the requirement did. A SENT row is
             -- matched by the WHERE and left exactly as it is: AC 7's "sent alerts are never
             -- re-sent". send_at moves with the payload, because an alert keeps its identity while
             -- its date changes: the unlock is keyed on the requirement rather than on the day it
             -- fires, so a regeneration that recomputes that day has to move the row it already owns
             -- instead of leaving it pointing at the old one.
             --
             -- RECIPIENT IS NOT SET HERE, AND NOTHING ELSE NEEDS TO KEY ON IT EITHER. This clause
             -- used to rewrite it, and to reset failure_count and next_attempt_at whenever it
             -- changed, because a correction had to reach a row that already existed. It does not
             -- any more: a corrected address hashes to a different key, so it INSERTs a fresh row
             -- that starts at count 0 with no backoff by definition, and the row it replaces is
             -- cancelled by the reconciler below and keeps every fact its attempts established.
             -- Three mechanisms became one, and the two that went were not merely still-correct —
             -- they were unreachable, since a row this statement conflicts with now necessarily has
             -- the same recipient as the one being scheduled.
             --
             -- WHAT SURVIVES IS THE STATUS, and only the half of it that was never about the
             -- recipient. A failed row whose review changed nothing must keep saying failed, or
             -- failedDeliveries stops counting it and the organizer's warning disappears with no
             -- new attempt made and the same dead address still in backoff. A cancelled row coming
             -- back must go to pending. The recipient half of that condition is gone with the rest.
             --
             -- Kept on the status rather than derived from failure_count in failedDeliveries: a row
             -- that failed twice and then sent keeps a non-zero count forever, so a derived warning
             -- would outlive the problem, and excluding sent rows to fix that just rebuilds status
             -- out of two columns. One meaning for one word.
             --
             -- Every other reader already accepts 'failed' and is unaffected: the poller's scan and
             -- claim both match ('pending', 'failed'), the reconciler's cancel matches both, and
             -- this clause's own WHERE matches both. Checked rather than assumed.
             SET payload = EXCLUDED.payload, send_at = EXCLUDED.send_at,
                 status = CASE WHEN alerts.status = 'failed' THEN 'failed' ELSE 'pending' END
             WHERE alerts.status IN ('pending', 'cancelled', 'failed')
           -- xmax = 0 is true only for a row this statement inserted, which is what separates a
           -- newly scheduled alert from one that already existed and was recomputed in place.
           RETURNING xmax = 0 AS inserted`,
          [
            randomUUID(),
            eventId,
            alert.checklistItemId,
            alert.alertType,
            channel,
            recipient,
            key,
            alert.sendAt.toISOString(),
            JSON.stringify({ subject: alert.subject, body: alert.body }),
          ],
        );
        if (rows[0]?.inserted === true) scheduled += 1;
      }
    }

    // Everything still waiting to go out that the recomputed set no longer contains: a requirement
    // the regeneration dropped, a date it moved, or — since the destination is part of the key — an
    // address the organizer corrected. Cancelled, never deleted; the row is the record that
    // PopEngine intended to send it, and for one that was attempted it is the record of where the
    // attempt went (AC 2, AC 7). `failed` is included because a failed row is still queued for the
    // next tick, and an alert nobody intends to send must stop retrying whether it is obsolete or
    // superseded. This one statement is now the whole of what a contact correction does to the
    // alerts that were already there.
    const { rowCount } = await client.query(
      `UPDATE alerts SET status = 'cancelled'
        WHERE event_id = $1
          AND status IN ('pending', 'failed')
          AND NOT (idempotency_key = ANY($2::text[]))
          AND coalesce(payload->>'test', 'false') <> 'true'`,
      [eventId, keys],
    );

    return {
      scheduled,
      cancelled: rowCount ?? 0,
      channels,
      reason:
        channels.length === 0
          ? "no contact was supplied for this event, so no alerts were scheduled"
          : null,
    };
  };
}

type DueAlertRow = {
  id: string;
  channel: AlertChannel;
  recipient: string;
  idempotency_key: string;
  payload: { subject?: string; body?: string };
};

/**
 * Send one claimed alert and record what happened, in the transaction that claimed it.
 *
 * The claim is `FOR UPDATE SKIP LOCKED`, so two ticks (or two api instances) cannot both hold the
 * same row. Marking happens inside the same transaction as the send, so the only window left is a
 * crash between the provider accepting the message and the COMMIT — after which the row is still
 * pending and the next tick sends the same `idempotency_key` again. That is why the key goes to
 * the provider (AD-13): this side cannot distinguish "never sent" from "sent, mark lost", and the
 * provider can.
 */
async function deliverClaimed(
  client: PoolClient,
  row: DueAlertRow,
  senders: AlertSenders,
): Promise<{ status: "sent" | "failed"; delivery: AlertDelivery | null; error: string | null }> {
  try {
    const delivery = await senders[row.channel]({
      recipient: row.recipient,
      subject: row.payload.subject ?? "",
      body: row.payload.body ?? "",
      idempotencyKey: providerKey(row),
    });
    await client.query(
      // `clock_timestamp()`, not `current_timestamp`: the latter is the TRANSACTION's start, and
      // this transaction opened before the provider was called. A send that took ten seconds would
      // be audited as having happened ten seconds earlier than it did, which is measured against
      // `send_at` to check AC 2's two-minute bound — so the one number that says whether the bound
      // was met would be the number flattering it.
      `UPDATE alerts
          SET status = 'sent', sent_at = clock_timestamp(), payload = payload || $2::jsonb
        WHERE id = $1`,
      [row.id, JSON.stringify({ delivery })],
    );
    return { status: "sent", delivery, error: null };
  } catch (error) {
    const message =
      error instanceof AlertDeliveryError ? error.message : "delivery failed for an unknown reason";
    if (!(error instanceof AlertDeliveryError))
      console.error(`alert ${row.id} delivery failed`, error);
    // Failed, counted, and left for the next tick. Nothing is lost while a provider is down
    // (spec edge case); the count is what distinguishes a blip from an address that never works.
    await client.query(
      `UPDATE alerts
          SET status = 'failed',
              failure_count = failure_count + 1,
              next_attempt_at = clock_timestamp() + (${RETRY_BACKOFF}),
              payload = payload || $2::jsonb
        WHERE id = $1`,
      [row.id, JSON.stringify({ last_error: message })],
    );
    return { status: "failed", delivery: null, error: message };
  }
}

/**
 * Claim one alert by id and send it. Returns null when another worker got there first or the row
 * stopped being due (cancelled by a regeneration between the scan and the claim).
 */
async function sendOne(
  database: Pool,
  alertId: string,
  senders: AlertSenders,
): Promise<{
  status: "sent" | "failed";
  delivery: AlertDelivery | null;
  error: string | null;
} | null> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    // THE EVENT ROW IS WHO OWNS THE EVENT'S ALERTS, and it is taken before the alert itself.
    //
    // Checklist review already locks this row for its whole transaction, and reconciliation runs
    // inside it. Without taking it here the two collided on the alert row instead, and the alert
    // row is the wrong place to collide: the reconciler's cancel matches `pending`/`failed`, so
    // when it queued behind a claim the poller was holding, it woke up to a row that had become
    // `sent` and skipped it — having waited for precisely the delivery it existed to prevent. The
    // organizer's regenerated plan cancelled everything except the stale alert that was already
    // going out (AC 7).
    //
    // SKIP LOCKED rather than waiting, because a review in progress is about to decide this
    // alert's fate: not sending it costs one tick, and the row is either cancelled or still there
    // afterwards. The reverse order — a send already in flight when a review starts — is not a
    // race at all: that alert was current when it left, and the review's own lock wait bounds it
    // at one `PROVIDER_TIMEOUT_MS`.
    //
    // SHARED, NOT EXCLUSIVE, and that one word is what separates the claim boundary from the send
    // boundary. Taking it exclusively made the event the unit of concurrency too: two workers on
    // two alerts of the same event collided with each other, so an event's alerts had to be sent
    // one at a time and a checklist with several due reminders serialised behind itself. But the
    // poller's workers do not need to exclude EACH OTHER — they need to exclude the two writers
    // that can invalidate an alert mid-flight, and both of those (`events.ts` on an intake edit,
    // `checklist.ts` on a review) take this row FOR UPDATE. `FOR SHARE` conflicts with exactly
    // those and with nothing else, so ownership stays event-scoped while sending goes back to
    // being alert-scoped.
    //
    // It also strengthens the guarantee it was introduced for. A reviewer must now wait out every
    // in-flight send for its event before it can hold the row exclusively, so by the time its
    // cancellation runs there is no claim left for it to queue behind — the case that started
    // this cannot arise rather than being handled.
    const { rows: owner } = await client.query(
      `SELECT event.id FROM events AS event
         JOIN alerts ON alerts.event_id = event.id
        WHERE alerts.id = $1
        FOR SHARE OF event SKIP LOCKED`,
      [alertId],
    );
    if (owner[0] === undefined) {
      await client.query("ROLLBACK");
      return null;
    }
    // DUE IS RE-ASKED HERE, not inherited from the scan. Between the two, a regeneration can
    // commit and move this row: an unlock alert keeps its identity across a recomputed
    // `apply_after_date` (that is what stops it announcing itself twice), so reconciliation
    // rewrites `send_at` on a row that stays pending and keeps the id the scan already picked up.
    // Claiming on status alone would then deliver a rescheduled alert at the old moment — telling
    // an organizer a window is open days before the plan says it is.
    //
    // The event lock above is what makes this recheck meaningful rather than another race: it is
    // held before this reads, so what it reads is a state no review is midway through changing.
    // The lock supplies the safe point; the predicate is still needed to use it.
    const { rows } = await client.query<DueAlertRow>(
      `SELECT id, channel, recipient, idempotency_key, payload
         FROM alerts
        WHERE id = $1 AND status IN ('pending', 'failed') AND send_at <= current_timestamp
          AND (next_attempt_at IS NULL OR next_attempt_at <= current_timestamp)
        FOR UPDATE SKIP LOCKED`,
      [alertId],
    );
    const row = rows[0];
    if (row === undefined) {
      await client.query("ROLLBACK");
      return null;
    }
    const outcome = await deliverClaimed(client, row, senders);
    await client.query("COMMIT");
    return outcome;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type AlertTickSummary = {
  readonly sent: number;
  readonly failed: number;
  /** Due alerts the tick's time budget stopped it claiming. They stay due for the next tick. */
  readonly abandoned: number;
};

export type AlertPoller = {
  /** One pass over everything due. Exposed so tests drive the poller without waiting on a timer. */
  tick(): Promise<AlertTickSummary>;
  start(): void;
  stop(): void;
};

export function createAlertPoller(dependencies: {
  readonly database: Pool;
  readonly senders: AlertSenders;
  readonly intervalMs?: number;
  /** Injected so a test can drive the tick budget without spending it in real time. */
  readonly clock?: () => number;
}): AlertPoller {
  const { database, senders } = dependencies;
  const clock = dependencies.clock ?? (() => Date.now());
  let timer: NodeJS.Timeout | null = null;
  let runningTick: Promise<AlertTickSummary> | null = null;
  let stopped = false;

  const tick = async (): Promise<AlertTickSummary> => {
    // Ids first, then one transaction per alert. One transaction for the whole batch would hold
    // every send under a single COMMIT, so a crash midway would re-send everything already
    // delivered in it; per row, only the row in flight is ever in doubt.
    //
    // FEWEST FAILURES FIRST, and only then oldest-due first. The scan is capped, so the ordering
    // decides who is served when more is due than one tick can take — and ordering by `send_at`
    // alone made that "whoever has been failing longest", permanently. A row that cannot be
    // delivered keeps its original `send_at` and stays eligible, so a full batch of dead
    // destinations was re-selected every tick and nothing behind them was ever claimed, however
    // long the queue grew and however well the provider was working for everyone else.
    //
    // `failure_count` is what breaks that: every attempt moves a failing row further back, so all
    // untried rows are served before any once-failed one, and no alert can be starved by another
    // alert's bad address. Retries still happen on every tick that has room, which is what the
    // spec's outage edge case asks for — nothing is dropped, it just stops being served first.
    const { rows } = await database.query<{ id: string }>(
      // `next_attempt_at` is what finally removes a dead destination from the batch rather than
      // only demoting it. `failure_count` ordering was the previous answer and cannot be the whole
      // one: it ranks rows within a scan, so a backlog that fails keeps being re-scanned and
      // re-attempted, and at ten seconds a send it consumes every scan indefinitely.
      `SELECT id FROM alerts
        WHERE status IN ('pending', 'failed')
          AND send_at <= current_timestamp
          AND (next_attempt_at IS NULL OR next_attempt_at <= current_timestamp)
        ORDER BY failure_count, send_at, id
        LIMIT ${MAX_ALERTS_PER_TICK}`,
    );
    if (rows.length === MAX_ALERTS_PER_TICK) {
      // At the cap, so there may be more due than the delivery bound covers. Said out loud
      // because the alternative is a scan that silently serves a prefix of the queue.
      console.warn(
        `alert poll filled its ${MAX_ALERTS_PER_TICK}-row scan; alerts beyond it wait for the ` +
          `next scan and may exceed the ${DELIVERY_BOUND_MS}ms delivery bound`,
      );
    }
    let sent = 0;
    let failed = 0;
    let abandoned = 0;

    // ONE FLAT QUEUE OF ALERTS. This was grouped by event for a while, because ownership of an
    // event's alerts is taken on the event row and two workers on one event collided over it —
    // which made the event the unit of concurrency and serialised a checklist's own reminders
    // behind each other. `sendOne` now takes that row in SHARED mode, so workers no longer exclude
    // each other and the grouping has nothing left to prevent. Claim boundary: the event. Send
    // boundary: the alert. They were only ever the same thing by accident of lock mode.
    const queue = rows.map(({ id }) => id);
    const startedAt = clock();
    const worker = async (): Promise<void> => {
      for (;;) {
        // Checked before claiming rather than after, so the budget bounds when the LAST request
        // starts. Anything left in the queue is untouched — not claimed, not marked — so it is
        // still due, and the next tick takes it with no state to unwind. `stopped` gets the same
        // treatment: a poller that has been shut down must stop TAKING work immediately rather
        // than finishing a scan it began, so at most the sends already in flight outlive the stop.
        if (stopped || clock() - startedAt >= TICK_BUDGET_MS) {
          abandoned += queue.length;
          queue.length = 0;
          return;
        }
        const id = queue.shift();
        if (id === undefined) return;
        // A row whose own transaction could not even record an outcome — the database went away
        // mid-send — must not take the rest of the batch down with it. It stays as it was, which
        // means it is still due on the next tick.
        const outcome = await sendOne(database, id, senders).catch((error: unknown) => {
          console.error(`alert ${id} could not be recorded`, error);
          return null;
        });
        if (outcome === null) continue;
        if (outcome.status === "sent") sent += 1;
        else failed += 1;
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SEND_CONCURRENCY, queue.length) }, () => worker()),
    );
    if (abandoned > 0) {
      // Said out loud, because the alternative is a tick that quietly did a fraction of its work.
      console.warn(
        `alert poll stopped after ${TICK_BUDGET_MS}ms with ${abandoned} due alerts unclaimed; ` +
          `they stay due and are taken by the next tick`,
      );
    }
    return { sent, failed, abandoned };
  };

  return {
    tick,
    start() {
      if (timer !== null) return;
      stopped = false;
      const run = (): void => {
        // One tick at a time. The budget already keeps a tick inside the interval, but a timer
        // that fires regardless would turn any breach of that into two scans competing for the
        // same rows and the same connections — the pile-up this is all meant to prevent.
        if (timer === null || runningTick !== null) return;
        runningTick = tick();
        void runningTick
          .then((summary) => {
            // A tick that ran out of budget with rows still due does NOT wait out the interval.
            // Waiting is what turned a bound on one tick into a bound on throughput, and it is
            // idle time the due set is not getting: the interval is how often to LOOK when there
            // is nothing to do, not how fast work may be done when there is.
            //
            // Only when the tick actually moved something, so a tick that abandons everything
            // without sending — a budget already spent before the first claim — waits for the
            // timer instead of respawning itself into a hot loop.
            if (summary.abandoned > 0 && summary.sent + summary.failed > 0) setImmediate(run);
          })
          .catch((error: unknown) => console.error("alert poll failed", error))
          .finally(() => {
            runningTick = null;
          });
      };
      timer = setInterval(run, dependencies.intervalMs ?? POLL_INTERVAL_MS);
      // Anything already due at boot is due now, not one interval from now. A restart is the one
      // moment a backlog is most likely, since nothing has been sending while the process was down.
      run();
      // The poller must never be the reason the process stays up.
      timer.unref();
    },
    stop() {
      // The flag as well as the timer: clearing the timer stops the NEXT tick, and a tick already
      // running would otherwise work through its whole batch after the caller believes the poller
      // is off — still claiming rows and still sending them.
      stopped = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}

export type AlertsDependencies = {
  readonly database: Pool;
  readonly senders: AlertSenders;
};

/**
 * Send the test alert and report what the ROW says, not what this request did.
 *
 * A test alert is written due immediately, so the poller can claim it in the gap before the send
 * — and then the claim here returns null out of `SKIP LOCKED` having done nothing, because
 * someone else was already doing it. Answering off that produced "test alert could not be
 * delivered" for a message that was delivered, which is the one thing a delivery-check utility
 * must never say.
 *
 * The claim is retried rather than only re-read, because losing it means one of two things and
 * they need different handling: the poller is mid-send (the row settles to `sent` shortly, so
 * looking again answers it) or the poller already tried and failed it (the row is claimable
 * again, so trying again is what actually sends it). Bounded, because a demo utility may not hang
 * on a request.
 */
async function deliverTestAlert(
  database: Pool,
  alertId: string,
  senders: AlertSenders,
): Promise<AlertView | null> {
  for (let attempt = 0; attempt < TEST_ALERT_CLAIM_ATTEMPTS; attempt += 1) {
    const outcome = await sendOne(database, alertId, senders);
    const view = await alertView(database, alertId);
    if (outcome !== null || view?.status === "sent") return view;
    await new Promise((resolve) => setTimeout(resolve, TEST_ALERT_CLAIM_WAIT_MS));
  }
  return alertView(database, alertId);
}

/**
 * AC 6's demo utility. One real alert, immediately, through the same delivery path a scheduled
 * alert takes — and labeled a test in the copy itself, so nobody reading the message has to know
 * which endpoint produced it.
 *
 * It carries `alert_type = 'deadline_reminder'` because migration 001 constrains the column to the
 * three published types and a fourth would need an ordered forward migration widening that CHECK
 * (ruleset note, F-203 Outputs). `payload.test` is what marks it, and it is what keeps a later
 * regeneration from cancelling it.
 */
const TEST_ALERT_COPY = {
  subject: "[TEST] PopEngine alert test",
  body:
    "TEST ALERT — this message was sent from PopEngine's demo utility to prove the alert channel " +
    "works. It is not a filing reminder and states no deadline, requirement or agency position.",
};

export function createAlertsRouter(dependencies: AlertsDependencies): Router {
  const { database, senders } = dependencies;
  const router = Router();

  router.post("/events/:id/alerts/test", (req, res, next) => {
    void (async () => {
      const eventId = req.params.id ?? "";
      if (!UUID.test(eventId)) {
        res.status(400).json({ error: "event id must be a uuid" });
        return;
      }
      const body: unknown = req.body;
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        res.status(400).json({ error: "body must be a JSON object" });
        return;
      }
      const { channel, recipient } = body as { channel?: unknown; recipient?: unknown };
      if (!isAlertChannel(channel)) {
        res.status(400).json({ error: `channel must be one of ${ALERT_CHANNELS.join(", ")}` });
        return;
      }
      if (typeof recipient !== "string" || recipient.trim() === "") {
        res.status(400).json({ error: "recipient must be a non-empty string" });
        return;
      }

      const { rows } = await database.query<{ id: string }>("SELECT id FROM events WHERE id = $1", [
        eventId,
      ]);
      if (rows[0] === undefined) {
        res.status(404).json({ error: `event ${eventId} not found` });
        return;
      }

      const alertId = randomUUID();
      await database.query(
        `INSERT INTO alerts (id, event_id, alert_type, channel, recipient, idempotency_key,
                             send_at, status, payload)
         VALUES ($1, $2, 'deadline_reminder', $3, $4, $5, current_timestamp, 'pending', $6::jsonb)`,
        [
          alertId,
          eventId,
          channel,
          recipient.trim(),
          // A test is a new send every time it is asked for, so its key is unique per request
          // rather than derived from a plan.
          `${eventId}:test:${alertId}`,
          JSON.stringify({ ...TEST_ALERT_COPY, test: true }),
        ],
      );

      const view = await deliverTestAlert(database, alertId, senders);
      if (view?.status !== "sent") {
        res.status(502).json({ error: "test alert could not be delivered", alert: view });
        return;
      }
      res.status(201).json({ alert: view });
    })().catch(next);
  });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    console.error("alert request failed", error);
    res.status(500).json({ error: "alert request failed" });
  });

  return router;
}

const isAlertChannel = (value: unknown): value is AlertChannel =>
  typeof value === "string" && (ALERT_CHANNELS as readonly string[]).includes(value);

/**
 * A channel that reported "sent" without delivering anything, and the label saying so.
 *
 * AGENTS.md forbids presenting a simulation as complete "unless the spec explicitly permits it and
 * the UI labels it". F-203 permits the SMS simulation; the labeling half was only half done. The
 * alert row carried the label and nothing an organizer can reach ever read it back, so in the
 * A2P-pending configuration — which is the configuration the repo's own artifacts select — every
 * SMS was recorded `sent` and looked delivered from every surface a person uses.
 *
 * This is the read that closes that. It rides on the checklist response because that is the
 * product flow the alerts belong to and it already exists; a dedicated endpoint would be one the
 * spec does not ask for. It reports what happened, so it stays empty until something is actually
 * simulated, and it goes to nothing on its own the day a live sender replaces the simulation.
 */
export type SimulatedDelivery = {
  readonly channel: AlertChannel;
  readonly label: string;
  readonly sentCount: number;
};

export async function simulatedDeliveries(
  database: Queryable,
  eventId: string,
): Promise<SimulatedDelivery[]> {
  const { rows } = await database.query<{ channel: AlertChannel; label: string; count: number }>(
    `SELECT channel, payload->'delivery'->>'label' AS label, count(*)::int AS count
       FROM alerts
      WHERE event_id = $1
        AND status = 'sent'
        AND (payload->'delivery'->>'simulated') = 'true'
        AND payload->'delivery'->>'label' IS NOT NULL
      GROUP BY channel, payload->'delivery'->>'label'
      ORDER BY channel`,
    [eventId],
  );
  return rows.map((row) => ({ channel: row.channel, label: row.label, sentCount: row.count }));
}

/**
 * A channel whose alerts tried to send and did not, counted from what the rows observed.
 *
 * F-203 exists so a filing deadline does not pass unnoticed, and an alert that silently fails to
 * deliver is exactly that failure. Nothing an organizer can see reported it: the simulation notice
 * is an SMS fact and says nothing about email, and inferring email health from it was the overclaim
 * that notice had to have removed.
 *
 * WHAT THIS COUNTS, AND WHAT IT REFUSES TO SAY. Only `status = 'failed'`: an alert that was
 * attempted and whose latest attempt failed. It does not count `pending` rows, because "not
 * attempted yet" is not a failure — most pending alerts are simply not due. And an empty result is
 * reported as empty, never as "the channel is working": zero failures can equally mean nothing has
 * been attempted, and turning that silence into a reassurance would be the same error one field
 * over. The absence of evidence is not rendered at all.
 *
 * NO CAUSE, ONLY COUNT AND CHANNEL. `payload.last_error` carries provider text that can name a
 * recipient or expose internals, so it stays in the row for an operator and never reaches a page.
 *
 * Test sends are excluded. A demo alert fired at a deliberately bogus address is an operator
 * action against no deadline, and counting it would tell an organizer their own reminders are
 * failing when they are not. Same predicate the reconciler already uses to leave test rows alone.
 */
export type FailedDelivery = {
  readonly channel: AlertChannel;
  /** Alerts on this channel whose most recent attempt failed. Never zero: absent instead. */
  readonly failedCount: number;
};

export async function failedDeliveries(
  database: Queryable,
  eventId: string,
): Promise<FailedDelivery[]> {
  const { rows } = await database.query<{ channel: AlertChannel; count: number }>(
    `SELECT channel, count(*)::int AS count
       FROM alerts
      WHERE event_id = $1
        AND status = 'failed'
        AND coalesce(payload->>'test', 'false') <> 'true'
      GROUP BY channel
      ORDER BY channel`,
    [eventId],
  );
  return rows.map((row) => ({ channel: row.channel, failedCount: row.count }));
}

export type AlertView = {
  id: string;
  alertType: AlertType;
  channel: AlertChannel;
  status: AlertStatus;
  sendAt: string;
  sentAt: string | null;
  failureCount: number;
  payload: Record<string, unknown>;
};

/**
 * One alert as a client sees it. The recipient is deliberately not echoed: it is contact data, and
 * the caller supplied it (AGENTS.md "do not log unredacted contact data").
 */
async function alertView(database: Queryable, alertId: string): Promise<AlertView | null> {
  const { rows } = await database.query<{
    id: string;
    alert_type: AlertType;
    channel: AlertChannel;
    status: AlertStatus;
    send_at: Date;
    sent_at: Date | null;
    failure_count: number;
    payload: Record<string, unknown>;
  }>(
    `SELECT id, alert_type, channel, status, send_at, sent_at, failure_count, payload
       FROM alerts WHERE id = $1`,
    [alertId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    alertType: row.alert_type,
    channel: row.channel,
    status: row.status,
    sendAt: row.send_at.toISOString(),
    sentAt: row.sent_at?.toISOString() ?? null,
    failureCount: row.failure_count,
    payload: row.payload,
  };
}

/**
 * The contact fields a checklist creation may carry. Both optional: a checklist is still worth
 * creating without them, and the response says no alerts were scheduled rather than pretending
 * some were.
 */
export function parseContacts(
  body: unknown,
): { contacts: AlertContactsUpdate } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { contacts: {} };
  const { contactEmail, contactPhone } = body as {
    contactEmail?: unknown;
    contactPhone?: unknown;
  };
  if (contactEmail !== undefined && contactEmail !== null) {
    if (typeof contactEmail !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      return { error: "contactEmail must be an email address" };
    }
  }
  if (contactPhone !== undefined && contactPhone !== null) {
    if (typeof contactPhone !== "string" || contactPhone.trim() === "") {
      return { error: "contactPhone must be a non-empty string" };
    }
  }
  // A key the body never carried stays absent, so "said nothing" survives all the way to the
  // store and only "sent null" clears anything. An empty string is how a browser form reports a
  // field the organizer cleared, and that IS an instruction to clear it.
  return {
    contacts: {
      ...(contactEmail === undefined ? {} : { email: contactEmail as string | null }),
      ...(contactPhone === undefined
        ? {}
        : { phone: contactPhone === null ? null : (contactPhone as string).trim() }),
    },
  };
}
