// F-203 deadline alerts, against the real schema. Each `describe` names the acceptance criterion
// it covers; the edge cases from the spec have their own block at the end.
//
// Two clocks are in play and the suite keeps them apart on purpose. Scenario plans are evaluated
// against the answer key's clock (`FIXTURE_TODAY`), so their alerts are dated in that future and
// no tick can send them — which is what makes the scheduling assertions stable. The poller is
// driven instead by plans written directly with dates in the real past, so "due" is true on any
// machine at any time rather than only while the wall clock sits in a particular week.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parseEngineRuleset, parseIntakeContract } from "@pop-engine/engine";
import type { EngineRuleset, HolidayCalendar, IntakeContract } from "@pop-engine/engine";
import {
  FIXTURE_TODAY,
  SCENARIO_INTAKE_FIXTURES,
  fixtureSubmission,
} from "@pop-engine/engine/fixtures";
import {
  AlertDeliveryError,
  createResendEmailSender,
  createSimulatedSmsSender,
  sendersFromEnv,
  unconfiguredEmailSender,
  PROVIDER_TIMEOUT_MS,
  SIMULATED_SMS_LABEL,
  type AlertMessage,
  type AlertSenders,
} from "./alert-delivery";
import {
  simulatedDeliveries,
  createAlertPoller,
  createAlertScheduler,
  failedDeliveries,
  ALERT_POLLER_CONNECTIONS,
  DELIVERY_BOUND_MS,
  MAX_ALERTS_PER_TICK,
  POLL_INTERVAL_MS,
  type AlertScheduler,
} from "./alerts";
import { createApp } from "./app";
import { instantAtLocalHour, todayInJurisdiction } from "./calendar";
import { createPlanService } from "./plan";
import { deadlineReminderOffsets, loadRuleset, rulesFilePath } from "./ruleset";
import type { DocumentStorage } from "./storage";

const databaseUrl = process.env.DATABASE_URL ?? "";

const storage: DocumentStorage = {
  put: async () => undefined,
  signedDownloadUrl: async () => "https://storage.test/unused",
  remove: async () => undefined,
};

/**
 * A provider that remembers every message and, like Resend, treats a repeated `Idempotency-Key` as
 * the same send. That last part is the whole point: it is what a re-send after a lost mark-sent
 * lands on, so the fake has to model it or the crash test proves nothing.
 */
type FakeProvider = {
  readonly senders: AlertSenders;
  /** One entry per DELIVERED message, deduplicated by idempotency key. */
  readonly delivered: AlertMessage[];
  /** Every attempt, including ones the provider deduplicated away. */
  readonly attempts: AlertMessage[];
  fail: string | null;
  /** Fails only for this destination, so one dead address can be modelled beside a live one. */
  failFor: string | null;
  /** Runs before each send resolves, for modelling a provider that takes measurable time. */
  beforeSend: (() => Promise<void>) | null;
};

const fakeProvider = (): FakeProvider => {
  const delivered: AlertMessage[] = [];
  const attempts: AlertMessage[] = [];
  const provider: FakeProvider = {
    senders: {} as AlertSenders,
    delivered,
    attempts,
    fail: null,
    failFor: null,
    beforeSend: null,
  };
  const send = (simulated: boolean) => async (message: AlertMessage) => {
    attempts.push(message);
    if (provider.beforeSend !== null) await provider.beforeSend();
    if (provider.fail !== null) throw new AlertDeliveryError(provider.fail);
    if (provider.failFor === message.recipient) {
      throw new AlertDeliveryError(`email provider rejected the send with status 550`);
    }
    if (!delivered.some((sent) => sent.idempotencyKey === message.idempotencyKey)) {
      delivered.push(message);
    }
    return {
      simulated,
      label: simulated ? SIMULATED_SMS_LABEL : null,
      provider: simulated ? "simulated" : "fake",
    };
  };
  return Object.assign(provider, {
    senders: { email: send(false), sms: send(true) } satisfies AlertSenders,
  });
};

const scenario = (id: string): Record<string, unknown> => {
  const fixture = SCENARIO_INTAKE_FIXTURES.find((candidate) => candidate.scenario === id);
  if (fixture === undefined) throw new Error(`no fixture ${id}`);
  return fixtureSubmission(fixture);
};

type AlertRow = {
  id: string;
  checklist_item_id: string | null;
  alert_type: string;
  channel: string;
  recipient: string;
  idempotency_key: string;
  send_at: Date;
  status: string;
  sent_at: Date | null;
  failure_count: number;
  next_attempt_at: Date | null;
  payload: {
    subject?: string;
    body?: string;
    delivery?: { simulated: boolean; label: string | null };
    last_error?: string;
    test?: boolean;
    controlling_apply_by?: string;
  };
};

describe.skipIf(databaseUrl === "")("F-203 deadline alerts", () => {
  let pool: Pool;
  let ruleset: EngineRuleset;
  let intakeContract: IntakeContract;
  let reminderOffsets: number[];
  const createdEventIds: string[] = [];

  // The answer key's fixtures are dated in windows with no contested holidays (AD-11), so the
  // calendar is injected rather than the missing-list guard relaxed.
  const fixtureCalendar = (calendarId: string): HolidayCalendar => ({
    id: calendarId,
    holidays: [],
  });

  const schedulerWith = (now?: () => Date): AlertScheduler =>
    createAlertScheduler({
      reminderDaysBefore: reminderOffsets,
      slackWarningDays: ruleset.slackWarningDays,
      jurisdiction: ruleset.jurisdiction,
      now,
    });

  const appWith = (provider: FakeProvider, today = FIXTURE_TODAY) =>
    createApp({
      database: pool,
      intakeContract,
      today: () => today,
      planService: createPlanService(pool, ruleset, fixtureCalendar, () => today),
      // The scheduler reads the real clock to decide whether a filing date has passed, so the
      // scenario suites pin it to the answer key's day exactly as the plan service is pinned.
      // Without that, every assertion below about a fixture's alert set would start changing on
      // the day the wall clock overtook the fixture's dates.
      checklist: {
        database: pool,
        storage,
        scheduleAlerts: schedulerWith(() => new Date(`${today}T13:00:00Z`)),
      },
      alerts: { database: pool, senders: provider.senders },
    });

  const createEvent = async (submission: Record<string, unknown>): Promise<string> => {
    const response = await request(appWith(fakeProvider())).post("/api/events").send(submission);
    expect(response.status).toBe(201);
    const eventId = response.body.event.id as string;
    createdEventIds.push(eventId);
    return eventId;
  };

  /** An event with a plan and a checklist, alerts scheduled against the supplied contacts. */
  const materialize = async (
    eventId: string,
    contacts: Record<string, unknown> = { contactEmail: "organizer@example.test" },
    today = FIXTURE_TODAY,
  ) => {
    const app = appWith(fakeProvider(), today);
    expect((await request(app).post(`/api/events/${eventId}/plan`)).status).toBe(201);
    // The plan the organizer was shown, read off a GET exactly as the browser does before it
    // submits: a review records WHICH plan was read, so the api refuses to choose one itself.
    const shown = (await request(app).get(`/api/events/${eventId}/checklist`)).body
      .planId as string;
    const response = await request(app)
      .post(`/api/events/${eventId}/checklist`)
      .send({ planId: shown, ...contacts });
    return response;
  };

  const alertsOf = async (eventId: string): Promise<AlertRow[]> => {
    const { rows } = await pool.query<AlertRow>(
      `SELECT a.* FROM alerts AS a WHERE a.event_id = $1 ORDER BY a.send_at, a.alert_type, a.channel`,
      [eventId],
    );
    return rows;
  };

  /** The rule ids behind the checklist item an alert hangs off, for readable assertions. */
  const ruleIdsFor = async (checklistItemId: string): Promise<string[]> => {
    const { rows } = await pool.query<{ rule_ids: string[] }>(
      `SELECT item.rule_ids FROM checklist_items AS checklist
         JOIN permit_plan_items AS item ON item.id = checklist.plan_item_id
        WHERE checklist.id = $1`,
      [checklistItemId],
    );
    return rows[0]?.rule_ids ?? [];
  };

  const describeAlerts = async (eventId: string): Promise<string[]> => {
    const rows = await alertsOf(eventId);
    return Promise.all(
      rows.map(async (row) => {
        const rules =
          row.checklist_item_id === null
            ? "plan"
            : (await ruleIdsFor(row.checklist_item_id)).join("+");
        return `${row.send_at.toISOString().slice(0, 10)} ${row.alert_type} ${rules} ${row.channel} ${row.status}`;
      }),
    );
  };

  /** A calendar day in the jurisdiction, offset from the real clock the scheduler reads. */
  const dayFromToday = (days: number): string => {
    const day = new Date(`${todayInJurisdiction("US-NY-NYC")}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
  };

  /**
   * A plan written directly, dated relative to the real clock rather than to a fixed year.
   *
   * The poller needs alerts that are genuinely due wherever this runs, and the fixture scenarios
   * are dated against the answer key's clock. A back-dated plan was the first attempt and was
   * wrong for a reason worth keeping written down: alerts are only scheduled for filing dates that
   * are still ahead, so a 2020 deadline now correctly schedules nothing. The shape that IS due is
   * the spec's own edge case — a checklist created inside the reminder window — so that is what
   * this builds: the filing date is today, which is still a day an organizer can file on, and
   * every published offset counts back from it to a day that has already gone.
   */
  const insertDuePlan = async (
    eventId: string,
    options: {
      latestApplyDate?: string | null;
      planToday?: string;
      applyAfterDate?: string | null;
      disposition?: string;
      verdict?: string;
      minSlackDays?: number | null;
      conflictText?: string | null;
      /**
       * Re-point this existing task at the new plan's item instead of creating another, which is
       * what `materialize` does on a regeneration. A test about identity ACROSS plans has to do
       * it: a fresh task per plan gives every alert a fresh key, so no key can ever collide and
       * the collision under test cannot happen.
       */
      reuseChecklistItemId?: string;
      /**
       * A SECOND dated requirement with more slack than the first, for the case where the
       * requirement that produced minSlackDays expires while a later one stays open.
       */
      laterDated?: { latestApplyDate: string; slackDays: number };
    } = {},
  ): Promise<{ planId: string; checklistItemId: string }> => {
    const {
      latestApplyDate = dayFromToday(0),
      planToday = todayInJurisdiction("US-NY-NYC"),
      applyAfterDate = null,
      disposition = "required",
      verdict = "feasible",
      minSlackDays = null,
      conflictText = null,
      reuseChecklistItemId,
      laterDated,
    } = options;
    const planId = randomUUID();
    const itemId = randomUUID();
    const checklistItemId = reuseChecklistItemId ?? randomUUID();
    await pool.query(
      `INSERT INTO permit_plans (id, event_id, event_revision, ruleset_version, snapshot_date,
                                 verdict, verdict_detail, intake_snapshot, generated_at)
       VALUES ($1, $2, 1, $3, $4, $6, $5::jsonb, '{}'::jsonb, current_timestamp)`,
      [
        planId,
        eventId,
        ruleset.rulesetVersion,
        ruleset.snapshotDate,
        JSON.stringify({
          today: planToday,
          minSlackDays,
          finding_renderings: [
            {
              rule_ids: ["NYPD-SOUND-001"],
              notes: [],
              note_text: null,
              conflict_text: conflictText,
              deadline_display: "file at least 5 days before use",
              // The engine's own per-finding slack, which is what identifies the requirement the
              // plan's minSlackDays came from. Null here would make the fixture incoherent: a
              // verdict quoting a number no finding claims.
              slack_days: minSlackDays,
              deadline_unknown_fields: [],
              timeline_unresolved_reason: null,
              portal_instructions: null,
            },
            ...(applyAfterDate === null
              ? []
              : [
                  {
                    rule_ids: ["PARKS-EVENT-001"],
                    notes: [],
                    note_text: null,
                    conflict_text: null,
                    deadline_display: "apply at least 21 days ahead",
                    slack_days: null,
                    deadline_unknown_fields: [],
                    timeline_unresolved_reason: null,
                    portal_instructions: null,
                  },
                ]),
            ...(laterDated === undefined
              ? []
              : [
                  {
                    rule_ids: ["PARKS-EVENT-001"],
                    notes: [],
                    note_text: null,
                    conflict_text: null,
                    deadline_display: "apply at least 21 days ahead",
                    slack_days: laterDated.slackDays,
                    deadline_unknown_fields: [],
                    timeline_unresolved_reason: null,
                    portal_instructions: null,
                  },
                ]),
          ],
        }),
        verdict,
      ],
    );
    const laterItemId = randomUUID();
    if (laterDated !== undefined) {
      // A second dated requirement, later and with more slack than the one the verdict quotes.
      await pool.query(
        `INSERT INTO permit_plan_items (id, plan_id, rule_ids, triggered_by, permit_name, agency,
                                        latest_apply_date, sources, kind, disposition,
                                        deadline_status, verification_status)
         VALUES ($1, $2, ARRAY['PARKS-EVENT-001'], '[]'::jsonb, 'Special Event Permit',
                 'NYC Parks', $3, '[]'::jsonb, 'permit', 'required', 'on_track',
                 'SOURCE_CONFIRMED')`,
        [laterItemId, planId, laterDated.latestApplyDate],
      );
      // It becomes a task like any other dated permit, so it really does schedule reminders.
      await pool.query(
        "INSERT INTO checklist_items (id, plan_item_id, cohort_position) VALUES ($1, $2, 1)",
        [randomUUID(), laterItemId],
      );
    }
    if (applyAfterDate !== null) {
      // The upstream half of the dependency. An unlock alert is only scheduled when the plan
      // carries the requirement the gated one waits on — `DEPENDENCY_SEQUENCING_BINDINGS` names
      // both ends, and an unlock that cannot name its dependency is not scheduled at all.
      await pool.query(
        `INSERT INTO permit_plan_items (id, plan_id, rule_ids, triggered_by, permit_name, agency,
                                        latest_apply_date, deadline, sources, kind, disposition,
                                        deadline_status, verification_status)
         VALUES ($1, $2, ARRAY['PARKS-EVENT-001'], '[]'::jsonb, 'Special Event Permit',
                 'NYC Parks', $3, $4::jsonb, '[]'::jsonb, 'permit', 'required', 'on_track',
                 'SOURCE_CONFIRMED')`,
        [
          randomUUID(),
          planId,
          latestApplyDate,
          JSON.stringify({
            type: "composite",
            hardFloorDays: 21,
            processingRangeDays: [21, 30],
            display: "apply at least 21 days ahead",
            qualification: null,
            boundary: "inclusive",
          }),
        ],
      );
      // The sequencing detail itself, which is a plan item like the two it sits between and is
      // where the unlock alert's third verification state comes from. It becomes no checklist
      // task, so it schedules nothing of its own — it is read, not alerted on.
      await pool.query(
        `INSERT INTO permit_plan_items (id, plan_id, rule_ids, triggered_by, permit_name, agency,
                                        sources, kind, disposition, deadline_status,
                                        verification_status)
         VALUES ($1, $2, ARRAY['NYPD-SOUND-PARKS-DEP-001'], '[]'::jsonb, 'Sound after Parks',
                 'NYPD', '[]'::jsonb, 'dependency', 'required', 'on_track', 'RESEARCH_REQUIRED')`,
        [randomUUID(), planId],
      );
    }
    await pool.query(
      `INSERT INTO permit_plan_items (id, plan_id, rule_ids, triggered_by, permit_name, agency,
                                      latest_apply_date, apply_after_date, sources, kind,
                                      disposition, deadline_status, verification_status)
       VALUES ($1, $2, ARRAY['NYPD-SOUND-001'], '[]'::jsonb, 'Sound Device Permit', 'NYPD', $3, $4,
               '[]'::jsonb, 'permit', $5, 'on_track', 'SOURCE_CONFIRMED')`,
      [itemId, planId, latestApplyDate, applyAfterDate, disposition],
    );
    await pool.query(
      // The re-point `materialize` performs on a regeneration: the task survives, and only the
      // plan item it points at changes.
      `INSERT INTO checklist_items (id, plan_item_id, cohort_position) VALUES ($1, $2, 0)
       ON CONFLICT (id) DO UPDATE SET plan_item_id = EXCLUDED.plan_item_id`,
      [checklistItemId, itemId],
    );
    return { planId, checklistItemId };
  };

  /**
   * An event whose alerts are due right now. `offsets` is narrowed to one in the tests that count
   * provider attempts, so the count is about the poller rather than about how many offsets the
   * ruleset happens to publish.
   */
  const schedulePastDue = async (eventId: string, offsets = reminderOffsets): Promise<number> => {
    // Offsets that all land behind today, against a filing date that is still ahead: every alert
    // this writes is due immediately, and none of them names a date that has passed.
    const { planId } = await insertDuePlan(eventId);
    const client = await pool.connect();
    try {
      const summary = await createAlertScheduler({
        reminderDaysBefore: offsets,
        slackWarningDays: ruleset.slackWarningDays,
        jurisdiction: ruleset.jurisdiction,
      })(client, eventId, planId, { email: "organizer@example.test", phone: null });
      return summary.scheduled;
    } finally {
      client.release();
    }
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    ruleset = parseEngineRuleset(JSON.parse(await readFile(rulesFilePath(), "utf8")));
    const published = await loadRuleset();
    intakeContract = parseIntakeContract(published.document);
    reminderOffsets = deadlineReminderOffsets(published);
  });

  /**
   * A tick sends everything due in the database, not everything due for one event, so an alert
   * one test left pending would be picked up by the next test's poller and counted there. Due
   * leftovers are retired between tests; future-dated ones are what the scheduling tests assert
   * on and are left alone.
   */
  afterEach(async () => {
    await pool.query(
      `UPDATE alerts SET status = 'cancelled'
        WHERE status IN ('pending', 'failed') AND send_at <= current_timestamp`,
    );
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      await pool.query("DELETE FROM alerts WHERE event_id = ANY($1)", [createdEventIds]);
      // Before the events they key on: contacts are event-scoped (migration 009).
      await pool.query("DELETE FROM event_alert_contacts WHERE event_id = ANY($1)", [
        createdEventIds,
      ]);
      await pool.query(
        `DELETE FROM checklist_items WHERE plan_item_id IN (
           SELECT item.id FROM permit_plan_items AS item
             JOIN permit_plans AS plan ON plan.id = item.plan_id
            WHERE plan.event_id = ANY($1))`,
        [createdEventIds],
      );
      await pool.query(
        `DELETE FROM permit_plan_items WHERE plan_id IN (
           SELECT id FROM permit_plans WHERE event_id = ANY($1))`,
        [createdEventIds],
      );
      await pool.query("DELETE FROM checklist_acknowledgements WHERE event_id = ANY($1)", [
        createdEventIds,
      ]);
      await pool.query("DELETE FROM permit_plans WHERE event_id = ANY($1)", [createdEventIds]);
      await pool.query("DELETE FROM events WHERE id = ANY($1)", [createdEventIds]);
    }
    await pool.end();
  });

  describe("AC 1 — materializing a checklist schedules the plan's alert set", () => {
    it("schedules a reminder per published offset for every dated permit, and nothing else", async () => {
      const eventId = await createEvent(scenario("C"));
      const response = await materialize(eventId);

      expect(response.status).toBe(201);
      expect(response.body.alerts).toMatchObject({
        cancelled: 0,
        channels: ["email"],
        reason: null,
      });
      // Two Parks reminders, two NYPD reminders, one dependency unlock.
      expect(response.body.alerts.scheduled).toBe(5);
      expect((await describeAlerts(eventId)).sort()).toEqual(
        [
          // Parks: latest_apply 2026-08-26, offsets 7 and 1.
          "2026-08-19 deadline_reminder PARKS-EVENT-001 email pending",
          "2026-08-25 deadline_reminder PARKS-EVENT-001 email pending",
          // NYPD is gated on the Parks decision window (AC 4), then reminds against its own date.
          "2026-08-12 dependency_unlocked NYPD-SOUND-001 email pending",
          "2026-09-04 deadline_reminder NYPD-SOUND-001 email pending",
          "2026-09-10 deadline_reminder NYPD-SOUND-001 email pending",
        ].sort(),
      );
    });

    it("schedules the offsets the ruleset publishes rather than a hardcoded pair", async () => {
      // The artifact is the contract (F-203 Outputs: config, not code).
      expect(reminderOffsets).toEqual([7, 1]);
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      const parks = (await alertsOf(eventId)).filter(
        (row) => row.alert_type === "deadline_reminder",
      );
      const parksDays = await Promise.all(
        parks.map(async (row) => ({
          rules: (await ruleIdsFor(row.checklist_item_id ?? "")).join("+"),
          day: row.send_at.toISOString().slice(0, 10),
        })),
      );
      expect(
        parksDays
          .filter((row) => row.rules === "PARKS-EVENT-001")
          .map((row) => row.day)
          .sort(),
      ).toEqual(["2026-08-19", "2026-08-25"]);
    });

    it("schedules nothing for a finding whose deadline the engine declines to date", async () => {
      // Scenario D carries FDNY-FUEL-001, a research_required lead time: no agency publishes one,
      // so there is no date to schedule against and none is invented.
      const eventId = await createEvent(scenario("D"));
      const response = await materialize(eventId);

      const undated = response.body.items.filter(
        (item: { latestApplyDate: string | null }) => item.latestApplyDate === null,
      );
      expect(undated.length).toBeGreaterThan(0);
      // The published "confirm the lead time with the agency" rendering, whatever the rule words it
      // as — FDNY names itself. The point is that the row says confirm, and carries no date.
      expect(undated[0].deadlineDisplay).toMatch(/confirm with/);
      const scheduledFor = await Promise.all(
        (await alertsOf(eventId))
          .filter((row) => row.checklist_item_id !== null)
          .map((row) => ruleIdsFor(row.checklist_item_id ?? "")),
      );
      expect(scheduledFor.flat()).not.toContain("FDNY-FUEL-001");
    });

    it("fires the slack warning immediately when the plan is at risk, labeled as PopEngine policy", async () => {
      const eventId = await createEvent(scenario("D"));
      await materialize(eventId);

      const warning = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      expect(warning?.checklist_item_id).toBeNull();
      // The answer key pins Scenario D at "apply within 10 days", and that phrase is intact: the
      // number is the verdict's and is not recomputed. What is added is the date it was measured
      // from, because a bare count decays and this subject is read whenever the alert arrives.
      // `specs/F-102` AC 5 is about the VERDICT's rendering and is satisfied by
      // `apps/web/app/plan/verdict-copy.ts`, which is untouched.
      expect(warning?.payload.subject).toContain("apply within 10 days");
      expect(warning?.payload.subject).toBe("At risk — apply within 10 days of 2026-07-22");
      expect(warning?.payload.body).toContain(
        "14-day threshold is PopEngine's internal planning buffer, not an official threshold",
      );
      expect(warning?.send_at.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("says what the slack number is, rather than calling it time remaining", async () => {
      const eventId = await createEvent(scenario("D"));
      await materialize(eventId);

      const warning = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      // The number is a minimum across findings, measured from the plan's evaluation date — not
      // the distance from today, and for a gated finding not a distance at all.
      expect(warning?.payload.body).toContain(
        "the narrowest slack across its dated requirements is 10 days, measured from the plan's " +
          "evaluation date 2026-07-22",
      );
      expect(warning?.payload.body).not.toContain("days away");
      // Scenario D has no gated filing, so the window-width qualifier would be noise.
      expect(warning?.payload.body).not.toContain("width of the window");
    });

    it("does not describe gated slack as time until filing", async () => {
      // The reviewer's case: a filing window nine days wide that cannot be entered for another
      // three weeks. "Nine days away" would tell the organizer they have three weeks less runway
      // than they do.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(30),
        applyAfterDate: dayFromToday(21),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const warning = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      expect(warning?.payload.body).toContain(
        "the number is the WIDTH of the window it can be filed in, not time remaining and not " +
          "measured from any date",
      );
      expect(warning?.payload.body).not.toContain("days away");
      // AND THE FIRST LINE NO LONGER CONTRADICTS IT. It used to say the number was measured from
      // the plan's evaluation date and then correct itself two lines later, so the body disagreed
      // with itself in exactly the case the qualification exists to describe.
      expect(warning?.payload.body).not.toContain("measured from the plan's evaluation date");
    });

    it("does not warn twice when an identical plan is regenerated", async () => {
      // The slack warning used to carry the plan's UUID, which is minted fresh by every generation,
      // so regenerating an IDENTICAL plan produced a second immediately-due warning to the same
      // address while the first sat there already sent. That is a different attempt to one
      // destination, which is what AC 7 forbids in the words this PR gave it.
      const eventId = await createEvent(scenario("C"));
      const atRisk = { verdict: "feasible_at_risk", minSlackDays: 9, latestApplyDate: dayFromToday(30) };
      const warn = async (options: Record<string, unknown>) => {
        const { planId } = await insertDuePlan(eventId, options);
        const client = await pool.connect();
        try {
          await schedulerWith()(client, eventId, planId, {
            email: "organizer@example.test",
            phone: null,
          });
        } finally {
          client.release();
        }
      };

      await warn(atRisk);
      const first = (await alertsOf(eventId)).filter((row) => row.alert_type === "slack_warning");
      expect(first).toHaveLength(1);
      // Sent, so a second row would be a second delivery rather than a rewrite of a pending one.
      await pool.query("UPDATE alerts SET status = 'sent', sent_at = clock_timestamp() WHERE id = $1", [
        first[0]?.id,
      ]);

      // A new plan row, same event, same risk. Nothing an organizer would read as new.
      await warn(atRisk);

      const after = (await alertsOf(eventId)).filter((row) => row.alert_type === "slack_warning");
      expect(after).toHaveLength(1);
      expect(after[0]?.id).toBe(first[0]?.id);
      expect(after[0]?.status).toBe("sent");
    });

    it("does not warn a second time when the slack value changes", async () => {
      // The product owner's decision, and it reverses what this test used to assert. Keying the
      // identity on the number looked like "warn again only when the risk changed" and is not:
      // ungated slackDays is measured from the PLAN'S EVALUATION DATE, so regenerating an
      // unchanged, still-at-risk event a week later yields a smaller number and a fresh identity.
      // That re-warns on most regenerations, which is close to the plan-UUID defect it replaced.
      //
      // What settles it is what the alert is. The copy says the threshold is PopEngine's internal
      // buffer and not an official one, and the warning names no agency deadline; the deadline
      // reminders fire on their own dates regardless. So a suppressed duplicate cannot let a filing
      // deadline pass unnoticed, and the repeat is what AC 7 forbids.
      //
      // The trade is real and is named in the code beside the identity: an organizer whose buffer
      // genuinely worsens is not warned twice, and that case wants a designed escalation rather
      // than an identity that happens to change.
      const eventId = await createEvent(scenario("C"));
      const warn = async (minSlackDays: number) => {
        const { planId } = await insertDuePlan(eventId, {
          verdict: "feasible_at_risk",
          minSlackDays,
          latestApplyDate: dayFromToday(30),
        });
        const client = await pool.connect();
        try {
          await schedulerWith()(client, eventId, planId, {
            email: "organizer@example.test",
            phone: null,
          });
        } finally {
          client.release();
        }
      };

      // The first warning is sent, so a second ROW would be a second delivery to one destination
      // rather than a rewrite of something still pending.
      await warn(9);
      const first = (await alertsOf(eventId)).filter((row) => row.alert_type === "slack_warning");
      expect(first).toHaveLength(1);
      expect(String(first[0]?.payload.body)).toContain("9 days");
      await pool.query(
        "UPDATE alerts SET status = 'sent', sent_at = clock_timestamp() WHERE id = $1",
        [first[0]?.id],
      );

      await warn(2);

      const after = (await alertsOf(eventId)).filter((row) => row.alert_type === "slack_warning");
      expect(after).toHaveLength(1);
      expect(after[0]?.id).toBe(first[0]?.id);
      expect(after[0]?.status).toBe("sent");
      // NOT vacuous: the row is still the one that was sent, carrying the copy it was sent with.
      // A suppression that worked by never producing the second warning at all would leave the same
      // count, so the body is asserted too — under the previous identity a second row exists here
      // saying 2 days, and this line is what refuses it.
      expect(String(after[0]?.payload.body)).toContain("9 days");
    });

    it("does not warn about slack on a plan that is not at risk", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      expect((await alertsOf(eventId)).some((row) => row.alert_type === "slack_warning")).toBe(
        false,
      );
    });

    it("schedules no reminder for a filing date the plan's own clock has already passed", async () => {
      // Scenario A's SAPO street permit closed on 2026-07-12, ten days before the fixture clock.
      // A countdown to it would read "file by" a day that has gone.
      const eventId = await createEvent(scenario("A"));
      await materialize(eventId);
      const scheduledFor = await Promise.all(
        (await alertsOf(eventId))
          .filter((row) => row.checklist_item_id !== null)
          .map((row) => ruleIdsFor(row.checklist_item_id ?? "")),
      );
      expect(scheduledFor.flat()).not.toContain("SAPO-STREET-LARGE-001");
      expect(scheduledFor.flat()).toContain("NYPD-SOUND-001");
    });

    it("reads filing dates against the day scheduling happens, not the day the plan was evaluated", async () => {
      // A plan generated five weeks ago and converted today. Its filing date closed a week ago.
      // The plan's own `today` still sits behind that date, so a guard reading the plan's clock
      // sees a deadline that is comfortably ahead and schedules a reminder that is immediately
      // due and says "file by" a day that has gone.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        planToday: dayFromToday(-35),
        latestApplyDate: dayFromToday(-7),
      });

      const client = await pool.connect();
      try {
        const summary = await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
        expect(summary.scheduled).toBe(0);
      } finally {
        client.release();
      }
      expect(await alertsOf(eventId)).toEqual([]);
    });

    it("sends nothing anywhere when no contact was entered, and says so", async () => {
      const eventId = await createEvent(scenario("C"));
      const response = await materialize(eventId, {});

      expect(response.body.alerts).toMatchObject({
        scheduled: 0,
        channels: [],
        reason: "no contact was supplied for this event, so no alerts were scheduled",
      });
      expect(await alertsOf(eventId)).toEqual([]);
    });

    it("schedules on every channel a contact was entered for", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId, {
        contactEmail: "organizer@example.test",
        contactPhone: "+15555550123",
      });
      const rows = await alertsOf(eventId);
      expect(new Set(rows.map((row) => row.channel))).toEqual(new Set(["email", "sms"]));
      expect(rows.filter((row) => row.channel === "sms")).toHaveLength(5);
      // AD-13: every row carries the destination and its own key.
      expect(rows.every((row) => row.recipient !== "" && row.idempotency_key !== "")).toBe(true);
      expect(new Set(rows.map((row) => row.idempotency_key)).size).toBe(rows.length);
    });

    it("refuses a contact that is not an address", async () => {
      const eventId = await createEvent(scenario("C"));
      const response = await materialize(eventId, { contactEmail: "not-an-address" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("contactEmail must be an email address");
      expect(await alertsOf(eventId)).toEqual([]);
    });

    it("refuses a contact phone that is empty", async () => {
      const eventId = await createEvent(scenario("C"));
      const response = await materialize(eventId, { contactPhone: "   " });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("contactPhone must be a non-empty string");
    });
  });

  describe("AC 3 — a hard floor is never softened", () => {
    it("states the Parks floor and the published deadline text in the reminder itself", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);

      const rows = await alertsOf(eventId);
      const parks: AlertRow[] = [];
      for (const row of rows) {
        if (row.checklist_item_id === null) continue;
        if ((await ruleIdsFor(row.checklist_item_id)).includes("PARKS-EVENT-001")) parks.push(row);
      }
      expect(parks).toHaveLength(2);
      for (const alert of parks) {
        expect(alert.payload.body).toContain(
          "Applications within 21 days of the event are not accepted.",
        );
        // The agency's own words, quoted from the rule rather than paraphrased.
        expect(alert.payload.body).toContain(
          "apply at least 21 days ahead (applications inside 21 days are not accepted); processing 21–30 days",
        );
      }
    });

    it("states the verification state on every reminder, not only where prose mentions it", async () => {
      // AGENTS.md keeps the verification states visible END TO END, and a notification is an end.
      // Copying an OFFICIAL_CONFLICT rule's prose covered one status and left the ordinary
      // confirmed case saying nothing at all, which is the case where silence reads as settled.
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);

      const rows = await alertsOf(eventId);
      const reminders = rows.filter((row) => row.alert_type === "deadline_reminder");
      expect(reminders.length).toBeGreaterThan(0);
      for (const alert of reminders) {
        const ruleIds = await ruleIdsFor(alert.checklist_item_id ?? "");
        // The state the plan item stored, humanised the way the checklist row humanises it.
        const stored = await pool.query<{ verification_status: string }>(
          `SELECT item.verification_status
             FROM checklist_items AS checklist
             JOIN permit_plan_items AS item ON item.id = checklist.plan_item_id
            WHERE checklist.id = $1`,
          [alert.checklist_item_id],
        );
        const expected = (stored.rows[0]?.verification_status ?? "").replace(/_/g, " ");
        expect(expected).not.toBe("");
        expect(alert.payload.body, `reminder for ${ruleIds.join("+")}`).toContain(
          `Verification: ${expected}`,
        );
      }
      // Scenario C's permits are SOURCE_CONFIRMED, which is exactly the case that used to be silent.
      expect(
        reminders.some((row) => row.payload.body?.includes("Verification: SOURCE CONFIRMED")),
      ).toBe(true);
    });

    it("carries the published qualification beside the date it qualifies", async () => {
      // A deadline's number is not the whole published answer. DOB-ASSEMBLY-001 states the unit,
      // the bound and what remains unestablished in the deadline's own `qualification` and the
      // verification's, and `findings.ts` flattens both into `notes` with nothing marking which
      // is which. A builder reading only `deadline_display` dropped them, so the reminder gave a
      // computed date as though the lead were settled.
      //
      // The expected strings are READ FROM THE PUBLISHED RULE rather than written here. The first
      // version quoted v2.7's wording, and v2.8 rewrote it: the assertion broke while the code was
      // still correct, which is a test pinning prose instead of behaviour.
      const rule = ruleset.rules.find((candidate) => candidate.id === "DOB-ASSEMBLY-001");
      const qualification = rule?.deadline?.qualification;
      const verificationQualification = rule?.verificationQualification;
      expect(typeof qualification).toBe("string");
      expect(typeof verificationQualification).toBe("string");

      // Scenario F, which the rule's own `exercised_by_scenarios` names.
      const eventId = await createEvent(scenario("F"));
      await materialize(eventId);

      const assembly: AlertRow[] = [];
      for (const row of await alertsOf(eventId)) {
        if (row.checklist_item_id === null) continue;
        if ((await ruleIdsFor(row.checklist_item_id)).includes("DOB-ASSEMBLY-001")) {
          assembly.push(row);
        }
      }
      expect(assembly.length).toBeGreaterThan(0);
      for (const alert of assembly) {
        // Quoted from the rule, not summarised by this repo.
        expect(alert.payload.body).toContain(qualification as string);
        expect(alert.payload.body).toContain(verificationQualification as string);
      }
    });

    it("keeps a may-be-required line conditional instead of turning it into a filing order", async () => {
      // A park event that sells: PARKS-TUA-001 fires, and it is dated, MAY_BE_REQUIRED, and
      // carries a published OFFICIAL_CONFLICT about whether it is triggered at all. An imperative
      // "file by" over that converts the ruleset's own uncertainty into a PopEngine requirement.
      const eventId = await createEvent({ ...scenario("C"), selling_anything: true });
      await materialize(eventId);

      const rows = await alertsOf(eventId);
      const tua: AlertRow[] = [];
      for (const row of rows) {
        if (row.checklist_item_id === null) continue;
        if ((await ruleIdsFor(row.checklist_item_id)).includes("PARKS-TUA-001")) tua.push(row);
      }
      expect(tua).toHaveLength(2);
      for (const alert of tua) {
        expect(alert.payload.subject).toMatch(/may be required — file by .* if it applies$/);
        expect(alert.payload.body).toContain("may be required for your event. If it applies");
        // The published conflict travels with the date rather than being dropped beside it.
        expect(alert.payload.body).toContain("OFFICIAL CONFLICT on the trigger");
        expect(alert.payload.body).toContain("confirm with the Revenue Division");
      }
    });

    it("still gives a settled requirement the plain filing instruction", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      const rows = await alertsOf(eventId);
      const parks: AlertRow[] = [];
      for (const row of rows) {
        if (row.checklist_item_id === null) continue;
        if ((await ruleIdsFor(row.checklist_item_id)).includes("PARKS-EVENT-001")) parks.push(row);
      }
      expect(parks[0]?.payload.subject).toBe("File your Special Event Permit by 2026-08-26");
      expect(parks[0]?.payload.body).toContain(
        "Special Event Permit (NYC Parks): file by 2026-08-26.",
      );
    });

    it("labels the reminder timing as PopEngine's, never as the agency's", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      const bodies = (await alertsOf(eventId))
        .filter((row) => row.alert_type === "deadline_reminder")
        .map((row) => row.payload.body ?? "");
      expect(bodies).toHaveLength(4);
      for (const body of bodies) {
        expect(body).toMatch(
          /PopEngine sends this reminder \d+ days? before the filing date\. That reminder schedule is PopEngine policy, not an agency deadline\./,
        );
      }
    });
  });

  describe("AC 4 — dependency alerts fire in sequence", () => {
    it("gates the sound permit on the Parks timeline and names the dependency in the copy", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);

      const rows = await alertsOf(eventId);
      const unlock = rows.find((row) => row.alert_type === "dependency_unlocked");
      expect(unlock).toBeDefined();
      expect(await ruleIdsFor(unlock?.checklist_item_id ?? "")).toEqual(["NYPD-SOUND-001"]);
      // apply_after = today + the Parks rule's own earliest decision (21 days), 2026-07-22 → 08-12.
      expect(unlock?.send_at.toISOString().slice(0, 10)).toBe("2026-08-12");
      // Names both ends of the dependency and says what the date is: the EARLIEST a decision could
      // come back, from the upstream rule's own published range. Not that one has come back.
      expect(unlock?.payload.body).toContain(
        "2026-08-12 is the earliest a decision on your Special Event Permit (NYC Parks) could " +
          "come back, from its published 21–30 day processing range. That date has arrived. It " +
          "is not confirmation that a decision has been made.",
      );
      expect(unlock?.payload.body).toContain(
        "Confirm the outcome with NYC Parks before you file your Sound Device Permit (NYPD).",
      );
      expect(unlock?.payload.body).not.toContain("decision window has passed");
      // NEITHER READING IS ASSERTED, and both halves of that are the finding. The alert must not
      // say a decision arrived, because the date is the soonest one COULD, and it must not say the
      // organizer may not file yet, because the published rule marks the sequencing itself
      // RESEARCH_REQUIRED and closing a window on an unconfirmed sequence would invent a blocker.
      expect(unlock?.payload.body).not.toContain("can now pursue");
      expect(unlock?.payload.subject).not.toContain("can now pursue");
      expect(String(unlock?.payload.body)).not.toMatch(/do not file|cannot file|must wait/i);
      // The published filing route, and the published caveat: the ordering itself is not confirmed.
      expect(unlock?.payload.body).toContain("File at the precinct where the device will be used");
      expect(unlock?.payload.body).toContain(
        "A strict issued-before-filed sequence is not confirmed by located primary text",
      );
    });

    it("names the sequence on a reminder that lands exactly on the expected decision day", async () => {
      // The boundary. A gated window exactly one reminder offset wide puts the unlock and the
      // reminder on the same day, and `sendOn < openOn` dropped the sequencing note on precisely
      // the case where the two arrive together and the organizer most needs to be told which one
      // waits on the other. The window OPENS that day; it does not close the day before.
      const eventId = await createEvent(scenario("C"));
      const offset = reminderOffsets[0] ?? 7;
      const { planId } = await insertDuePlan(eventId, {
        latestApplyDate: dayFromToday(30),
        applyAfterDate: dayFromToday(30 - offset),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const rows = await alertsOf(eventId);
      const unlock = rows.find((row) => row.alert_type === "dependency_unlocked");
      const reminder = rows.find(
        (row) =>
          row.alert_type === "deadline_reminder" &&
          row.send_at.getTime() === unlock?.send_at.getTime(),
      );
      expect(reminder).toBeDefined();
      expect(String(reminder?.payload.body)).toContain("This filing is sequenced after your");
    });

    it("names the sequence on a reminder that lands before the upstream decision is expected", async () => {
      // ~28 days of runway: the sound permit's own filing date is 2026-08-14, so its seven-day
      // reminder falls on 08-07 — five days before 08-12, the earliest the Parks decision could
      // come back. Without the sequence the organizer is told to file, and only later told they
      // can pursue it.
      const eventId = await createEvent({ ...scenario("C"), event_date: "2026-08-19" });
      await materialize(eventId);

      const gated: AlertRow[] = [];
      for (const row of await alertsOf(eventId)) {
        if (row.alert_type !== "deadline_reminder" || row.checklist_item_id === null) continue;
        if ((await ruleIdsFor(row.checklist_item_id)).includes("NYPD-SOUND-001")) gated.push(row);
      }
      const early = gated.find((row) => row.send_at.toISOString().slice(0, 10) === "2026-08-07");
      const late = gated.find((row) => row.send_at.toISOString().slice(0, 10) === "2026-08-13");

      expect(early?.payload.body).toContain(
        "This filing is sequenced after your Special Event Permit (NYC Parks), whose decision is " +
          "expected no earlier than 2026-08-12.",
      );
      // Not moved and not dropped: `apply_after_date` is the earliest a decision could come back,
      // and the dependency rule says a strict issued-before-filed order is unconfirmed, so
      // clamping the reminder to it would assert a bar on filing early that nothing publishes.
      expect(early?.payload.body).toContain("Filing before then may still be possible");
      expect(early?.payload.body).toContain("file by 2026-08-14");
      // The later reminder is past the gate, so the sequence is no longer news.
      expect(late?.payload.body).not.toContain("This filing is sequenced after");
    });

    it("puts the unlock before the gated permit's own reminders", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      const rows = await alertsOf(eventId);
      const unlock = rows.find((row) => row.alert_type === "dependency_unlocked");
      const gated: AlertRow[] = [];
      for (const row of rows) {
        if (row.alert_type !== "deadline_reminder" || row.checklist_item_id === null) continue;
        if ((await ruleIdsFor(row.checklist_item_id)).includes("NYPD-SOUND-001")) gated.push(row);
      }
      expect(gated).toHaveLength(2);
      for (const reminder of gated) {
        expect(unlock?.send_at.getTime()).toBeLessThan(reminder.send_at.getTime());
      }
    });
  });

  describe("AC 2 — the poller sends what is due, marks it, and retries what failed", () => {
    it("sends a due alert, marks it sent, and records how it was delivered", async () => {
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId);
      const provider = fakeProvider();

      const summary = await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      expect(summary.sent).toBeGreaterThanOrEqual(2);
      const rows = await alertsOf(eventId);
      expect(rows.every((row) => row.status === "sent")).toBe(true);
      expect(rows.every((row) => row.sent_at !== null)).toBe(true);
      expect(rows[0]?.payload.delivery).toMatchObject({ simulated: false });
      expect(provider.delivered.map((message) => message.recipient)).toContain(
        "organizer@example.test",
      );
    });

    it("marks a failed send failed, counts it, and sends it on a later tick", async () => {
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId);
      const provider = fakeProvider();
      provider.fail = "email provider unreachable: socket hang up";
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });

      const failedTick = await poller.tick();
      expect(failedTick.failed).toBeGreaterThanOrEqual(2);
      const afterFailure = await alertsOf(eventId);
      expect(afterFailure.every((row) => row.status === "failed")).toBe(true);
      expect(afterFailure.every((row) => row.failure_count === 1)).toBe(true);
      expect(afterFailure[0]?.payload.last_error).toContain("socket hang up");

      provider.fail = null;
      await poller.tick();
      const afterRetry = await alertsOf(eventId);
      expect(afterRetry.every((row) => row.status === "sent")).toBe(true);
      // Nothing was lost and nothing was duplicated by the retry.
      expect(afterRetry).toHaveLength(afterFailure.length);
    });

    it("does not send twice when the process dies between the send and the mark", async () => {
      const eventId = await createEvent(scenario("C"));
      expect(await schedulePastDue(eventId, [1])).toBe(1);
      const provider = fakeProvider();

      // The failure a crash looks like from here: the provider took the message and the row never
      // got marked. Everything else about the transaction is real.
      // A pool of its own, because the sabotage below patches a connection and a patched
      // connection goes back into the pool it came from.
      const doomed = new Pool({ connectionString: databaseUrl });
      const crashing = Object.create(pool) as Pool;
      // The scan runs on the shared pool, bound rather than inherited: `Pool.query` reaches for
      // `this.connect` with a callback, and the promise-only override below would strand it.
      crashing.query = pool.query.bind(pool) as Pool["query"];
      // The connection dies after the provider already has the message: every write that would
      // have recorded the outcome fails, exactly as a process that stopped existing would.
      crashing.connect = (async () => {
        const client = await doomed.connect();
        const query = client.query.bind(client);
        client.query = ((...args: unknown[]) =>
          typeof args[0] === "string" && args[0].includes("UPDATE alerts")
            ? Promise.reject(new Error("connection terminated unexpectedly"))
            : query(...(args as Parameters<typeof query>))) as typeof client.query;
        return client;
      }) as Pool["connect"];

      const crashed = await createAlertPoller({
        jurisdiction: ruleset.jurisdiction,
        database: crashing,
        senders: provider.senders,
      }).tick();
      await doomed.end();
      expect(crashed.sent).toBe(0);
      // The row is untouched, so it is still due.
      expect((await alertsOf(eventId)).every((row) => row.status === "pending")).toBe(true);
      expect(provider.delivered).toHaveLength(1);

      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      expect((await alertsOf(eventId)).every((row) => row.status === "sent")).toBe(true);
      // Two attempts, one delivery: the repeated attempt carried the same key, and the provider
      // recognised it (AD-13).
      expect(provider.attempts).toHaveLength(2);
      expect(provider.attempts[0]?.idempotencyKey).toBe(provider.attempts[1]?.idempotencyKey);
      expect(provider.delivered).toHaveLength(1);
    });

    it("hands the same alert to only one of two concurrent ticks", async () => {
      const eventId = await createEvent(scenario("C"));
      expect(await schedulePastDue(eventId, [1])).toBe(1);
      const provider = fakeProvider();
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });

      await Promise.all([poller.tick(), poller.tick()]);

      // One row, one attempt: the loser of the `FOR UPDATE SKIP LOCKED` claim finds nothing.
      expect(provider.attempts).toHaveLength(1);
      expect((await alertsOf(eventId)).every((row) => row.status === "sent")).toBe(true);
    });

    it("serves a fresh alert even when a full batch of dead destinations is due", async () => {
      // The starvation shape: enough permanently-failing alerts to fill the scan on their own,
      // every one of them due earlier than the alert behind them. Ordering by due time alone
      // re-selects exactly this batch on every tick, forever, so the fresh alert is never claimed
      // even while the provider is delivering perfectly well to everyone else.
      const eventId = await createEvent(scenario("C"));
      expect(await schedulePastDue(eventId, [1])).toBe(1);
      // Staged after scheduling, not before: reconciliation cancels anything pending the current
      // plan does not call for, so a backlog written first would be cancelled rather than queued.
      await pool.query(
        `INSERT INTO alerts (id, event_id, alert_type, channel, recipient, idempotency_key,
                             send_at, status, failure_count, payload)
         SELECT gen_random_uuid(), $1::uuid, 'deadline_reminder', 'email', 'dead@example.test',
                -- Every one of them due LONGER ago than the fresh alert above, which is what puts
                -- them all ahead of it under a due-time ordering.
                $2::text || ':starve:' || n, current_timestamp - ((n + 2) || ' days')::interval,
                'failed', 1, '{"subject":"queued","body":"queued"}'::jsonb
           FROM generate_series(1, 100) AS n`,
        [eventId, eventId],
      );
      const provider = fakeProvider();
      provider.failFor = "dead@example.test";

      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      const fresh = (await alertsOf(eventId)).filter(
        (row) => row.recipient === "organizer@example.test",
      );
      expect(fresh).toHaveLength(1);
      expect(fresh[0]?.status).toBe("sent");
    });

    it("sends across events concurrently instead of serialising the whole batch", async () => {
      // A per-request timeout bounds one send. It does not bound a batch: due alerts at ten
      // seconds each add up in a row while everything behind them misses AC 2's two-minute bound,
      // and the poller looks busy rather than broken.
      const events = await Promise.all(
        Array.from({ length: 6 }, async () => {
          const eventId = await createEvent(scenario("C"));
          await schedulePastDue(eventId, [1]);
          return eventId;
        }),
      );
      const provider = fakeProvider();
      let inFlight = 0;
      let peakInFlight = 0;
      provider.beforeSend = async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 80));
        inFlight -= 1;
      };

      const startedAt = Date.now();
      const summary = await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();
      const elapsed = Date.now() - startedAt;

      expect(summary.sent).toBe(events.length);
      expect(peakInFlight).toBe(events.length);
      // Six sends of 80ms are 480ms in a row and one wave otherwise.
      expect(elapsed).toBeLessThan(400);
    });

    it("sends one event's own alerts in parallel, not behind each other", async () => {
      // One checklist can have several reminders due at once — four dated items across two
      // channels is eight slots. While ownership of the event was taken exclusively, they queued
      // behind each other however idle the other workers were, and at a timing-out provider that
      // is minutes for a single organizer. Ownership is event-scoped; delivery is not.
      const eventId = await createEvent(scenario("C"));
      expect(await schedulePastDue(eventId, [7, 6, 5, 4, 3, 2])).toBe(6);
      const provider = fakeProvider();
      let inFlight = 0;
      let peakInFlight = 0;
      provider.beforeSend = async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 80));
        inFlight -= 1;
      };

      const startedAt = Date.now();
      const summary = await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();
      const elapsed = Date.now() - startedAt;

      expect(summary.sent).toBe(6);
      expect(peakInFlight).toBe(6);
      // Six sends of 80ms are 480ms one after another and one wave otherwise.
      expect(elapsed).toBeLessThan(400);
    });

    it("stops claiming once the tick budget is spent, and leaves the rest due", async () => {
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [7, 6, 5, 4, 3, 2, 1, 14]);
      const provider = fakeProvider();
      // A clock that reports the budget spent once the first wave has been claimed, so the bound
      // is exercised without spending thirty real seconds on it.
      let reads = 0;
      const clock = (): number => {
        reads += 1;
        return reads <= 5 ? 0 : 30_000;
      };

      const summary = await createAlertPoller({
        jurisdiction: ruleset.jurisdiction,
        database: pool,
        senders: provider.senders,
        clock,
      }).tick();

      expect(summary.abandoned).toBeGreaterThan(0);
      expect(summary.sent + summary.abandoned).toBe(8);
      // Abandoned means untouched, not failed: the rows never left the queue, so they are still
      // due and carry no attempt against them.
      const untouched = (await alertsOf(eventId)).filter((row) => row.status === "pending");
      expect(untouched).toHaveLength(summary.abandoned);
      expect(untouched.every((row) => row.failure_count === 0)).toBe(true);
    });

    it("records sent_at when the provider finished, not when the transaction opened", async () => {
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [1]);
      const provider = fakeProvider();
      provider.beforeSend = () => new Promise((resolve) => setTimeout(resolve, 300));
      const { rows } = await pool.query<{ now: Date }>("SELECT clock_timestamp() AS now");
      const beforeTick = rows[0]?.now as Date;

      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      const alert = (await alertsOf(eventId))[0];
      // `current_timestamp` is the transaction's start, which is before the send; the row would be
      // audited as delivered 300ms earlier than it was, and that gap is exactly what a check of
      // AC 2's two-minute bound measures.
      expect((alert?.sent_at as Date).getTime() - beforeTick.getTime()).toBeGreaterThanOrEqual(250);
    });

    it("stops a dead backlog consuming every scan, so a later alert is served at once", async () => {
      // The reviewer's case. A backlog of dead destinations kept its original `send_at`, so it
      // stayed due forever and was re-attempted on every scan; at ten seconds a send it filled
      // each one, and an alert that became due behind it waited scan after scan. `failure_count`
      // ordering ranks rows WITHIN a scan and cannot remove them from it — that is what the retry
      // time does.
      const dead = await createEvent(scenario("C"));
      await schedulePastDue(dead, [7, 6, 5, 4]);
      const provider = fakeProvider();
      provider.failFor = "organizer@example.test";
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });

      // Two passes: the first attempt, then the immediate retry a blip deserves.
      await poller.tick();
      await poller.tick();
      expect((await alertsOf(dead)).every((row) => row.failure_count === 2)).toBe(true);
      const attemptsOnBacklog = provider.attempts.length;

      // A deliverable alert arrives afterwards, on another event.
      const live = await createEvent(scenario("C"));
      await schedulePastDue(live, [1]);
      provider.failFor = "nobody@example.test";

      await poller.tick();

      // Sent on the very next scan: the dead rows are backed off and no longer in the batch.
      expect((await alertsOf(live)).every((row) => row.status === "sent")).toBe(true);
      expect(provider.attempts.length).toBe(attemptsOnBacklog + 1);
      // And nothing was lost — the backlog is still there, still failed, still counted.
      expect((await alertsOf(dead)).every((row) => row.status === "failed")).toBe(true);
    });

    it("leaves an alert that is not due yet alone", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      const provider = fakeProvider();

      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      expect(provider.attempts).toHaveLength(0);
      expect((await alertsOf(eventId)).every((row) => row.status === "pending")).toBe(true);
    });

    it("keeps draining without waiting out the interval when a tick left work behind", async () => {
      // The budget bounds ONE tick. Waiting the full interval after a tick that ran out of budget
      // would turn that into a bound on throughput, which is how a large due set misses AC 2's
      // two-minute delivery bound by design rather than by failure. The interval is how often to
      // look when there is nothing to do, not how fast work may be done when there is.
      const eventId = await createEvent(scenario("C"));
      expect(await schedulePastDue(eventId, [7, 6, 5, 4, 3, 2])).toBe(6);
      const provider = fakeProvider();
      provider.beforeSend = () => new Promise((resolve) => setTimeout(resolve, 30));
      // A clock running 200x fast, so the 30-second budget expires a few sends into every tick and
      // the test still finishes in well under a second. Real durations, accelerated readings.
      const base = Date.now();
      const clock = (): number => (Date.now() - base) * 200;
      const poller = createAlertPoller({
        jurisdiction: ruleset.jurisdiction,
        database: pool,
        senders: provider.senders,
        // Far longer than this test will wait: anything delivered after the first tick proves the
        // drain re-ran on its own rather than on the timer.
        intervalMs: 60_000,
        clock,
      });

      poller.start();
      await new Promise((resolve) => setTimeout(resolve, 700));
      poller.stop();

      const rows = await alertsOf(eventId);
      expect(rows).toHaveLength(6);
      expect(rows.every((row) => row.status === "sent")).toBe(true);
    });

    it("keeps ticking on a schedule and can be stopped", async () => {
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId);
      const provider = fakeProvider();
      const poller = createAlertPoller({
        jurisdiction: ruleset.jurisdiction,
        database: pool,
        senders: provider.senders,
        intervalMs: 5,
      });

      poller.start();
      poller.start(); // idempotent: a second start must not run two timers
      await new Promise((resolve) => setTimeout(resolve, 100));
      poller.stop();
      poller.stop();

      expect(provider.delivered).toHaveLength(2);
      expect((await alertsOf(eventId)).every((row) => row.status === "sent")).toBe(true);
    });
  });

  describe("AC 7 — regeneration recomputes pending alerts and never re-sends a sent one", () => {
    it("cancels what the new plan no longer calls for, keeps what it still does, and leaves sent alerts alone", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      const before = await alertsOf(eventId);
      // A reminder that has already gone out. Its filing date is about to move, so the recomputed
      // set will not contain it — which is exactly the row AC 7 says must not be touched.
      const sentAlready = before.find((row) => row.alert_type === "deadline_reminder");
      await pool.query(
        "UPDATE alerts SET status = 'sent', sent_at = current_timestamp WHERE id = $1",
        [sentAlready?.id],
      );

      // The organizer moves the event, so every filing date moves with it.
      const patch = await request(appWith(fakeProvider()))
        .patch(`/api/events/${eventId}`)
        .send({ event_date: "2026-10-16" });
      expect(patch.status).toBe(200);
      const response = await materialize(eventId);
      expect(response.status).toBe(200);

      const after = await alertsOf(eventId);
      const byKey = new Map(after.map((row) => [row.idempotency_key, row]));
      // The alert that already went out is untouched: still sent, never re-sent, never cancelled.
      expect(byKey.get(sentAlready?.idempotency_key ?? "")?.status).toBe("sent");
      // The three other reminders of the old timeline are cancelled rather than deleted.
      const oldReminders = before.filter(
        (row) => row.alert_type === "deadline_reminder" && row.id !== sentAlready?.id,
      );
      expect(oldReminders).toHaveLength(3);
      for (const row of oldReminders) {
        expect(byKey.get(row.idempotency_key)?.status).toBe("cancelled");
      }
      // The dependency unlock is unmoved and untouched: it is dated from the plan's clock and the
      // upstream processing range, neither of which the event date changed.
      const unlock = before.find((row) => row.alert_type === "dependency_unlocked");
      expect(byKey.get(unlock?.idempotency_key ?? "")?.status).toBe("pending");
      // Four recomputed reminders, plus the unmoved unlock.
      expect(after.filter((row) => row.status === "pending")).toHaveLength(5);
      expect(response.body.alerts).toMatchObject({ scheduled: 4, cancelled: 3 });
    });

    it("does not suppress a new reminder that lands on a sent reminder's day", async () => {
      // The published offsets are 7 and 1, so a filing date that moves by exactly six days puts
      // the NEW seven-day reminder on the day the OLD one-day reminder already occupies. Keyed on
      // the send day alone they are the same alert, and since a sent row is correctly left
      // immutable, the reminder carrying the corrected filing date was dropped in silence.
      const eventId = await createEvent(scenario("C"));
      const contacts = { email: "organizer@example.test", phone: null };
      const first = await insertDuePlan(eventId, { latestApplyDate: dayFromToday(30) });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, first.planId, contacts);
        const collisionDay = dayFromToday(29);
        const sentAlready = (await alertsOf(eventId)).find(
          (row) => row.send_at.toISOString().slice(0, 10) === collisionDay,
        );
        expect(sentAlready).toBeDefined();
        await pool.query(
          "UPDATE alerts SET status = 'sent', sent_at = clock_timestamp() WHERE id = $1",
          [sentAlready?.id],
        );

        // The organizer moves the event out by six days, so every filing date moves with it.
        // Same task, new plan — the regeneration shape, and the only one where two plans' alerts
        // can share a key at all.
        const second = await insertDuePlan(eventId, {
          latestApplyDate: dayFromToday(36),
          reuseChecklistItemId: first.checklistItemId,
        });
        await schedulerWith()(client, eventId, second.planId, contacts);

        const onCollisionDay = (await alertsOf(eventId)).filter(
          (row) => row.send_at.toISOString().slice(0, 10) === collisionDay,
        );
        expect(onCollisionDay).toHaveLength(2);
        expect(onCollisionDay.filter((row) => row.status === "sent")).toHaveLength(1);
        const fresh = onCollisionDay.find((row) => row.status === "pending");
        // The point of the new reminder: it carries the corrected filing date.
        expect(fresh?.payload.body).toContain(`file by ${dayFromToday(36)}`);
      } finally {
        client.release();
      }
    });

    it("re-reviewing the same plan schedules nothing new and cancels nothing", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      const first = await alertsOf(eventId);

      const second = await materialize(eventId);

      expect(second.body.alerts).toMatchObject({ scheduled: 0, cancelled: 0 });
      expect(await alertsOf(eventId)).toHaveLength(first.length);
    });

    it("keeps using the contact already on file when a later review supplies none", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId, { contactEmail: "organizer@example.test" });

      const second = await materialize(eventId, {});

      expect(second.body.alerts.channels).toEqual(["email"]);
      expect(
        (await alertsOf(eventId)).every((row) => row.recipient === "organizer@example.test"),
      ).toBe(true);
    });

    it("keeps a contact entered against a plan that scheduled nothing", async () => {
      // Scenario B's only dated finding cannot be dated at all, so the first checklist schedules
      // no alerts. With the contact living on the alert rows there was nowhere to put it, and a
      // later rescope that DID produce a dated requirement resolved no channel and silently
      // scheduled nothing — for an organizer who had entered their address.
      const eventId = await createEvent(scenario("B"));
      const first = await materialize(eventId, { contactEmail: "organizer@example.test" });
      expect(first.body.alerts.scheduled).toBe(0);
      expect(await alertsOf(eventId)).toEqual([]);

      // The contact survives the fact that nothing was written to send.
      expect(first.body.alertContacts).toEqual({ email: "organizer@example.test", phone: null });
      const planId = (await insertDuePlan(eventId, { latestApplyDate: dayFromToday(30) })).planId;
      const client = await pool.connect();
      try {
        // A later review that re-states nothing about contacts still finds one.
        const summary = await schedulerWith()(client, eventId, planId, {});
        expect(summary.channels).toEqual(["email"]);
        expect(summary.scheduled).toBeGreaterThan(0);
      } finally {
        client.release();
      }
      expect(
        (await alertsOf(eventId)).every((row) => row.recipient === "organizer@example.test"),
      ).toBe(true);
    });

    it("never treats a test send's destination as the organizer's address", async () => {
      // The demo utility takes a recipient for one message. Reading contacts back off the alert
      // log made that tester's address the event's, and every real deadline alert went there.
      const eventId = await createEvent(scenario("C"));
      const provider = fakeProvider();
      await request(appWith(provider))
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "email", recipient: "tester@example.test" });

      const response = await materialize(eventId, {});

      expect(response.body.alertContacts).toEqual({ email: null, phone: null });
      expect(response.body.alerts).toMatchObject({ scheduled: 0, channels: [] });
    });

    it("gives a corrected address a clean start rather than the old one's punishment", async () => {
      // The other half of making a contact correctable. The row keeps its identity across a
      // recipient change, so the failure evidence carried over — and that evidence was about an
      // address that is no longer there. The corrected destination was ordered behind fresh
      // alerts, and its FIRST failure read the retained count and jumped straight to the maximum
      // backoff.
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId, { contactEmail: "typo@example.test" });
      const before = await alertsOf(eventId);
      expect(before.length).toBeGreaterThan(0);
      // Three attempts against the typo, which is enough to reach the longest backoff step.
      await pool.query(
        `UPDATE alerts SET status = 'failed', failure_count = 3,
                           next_attempt_at = clock_timestamp() + interval '15 minutes'
          WHERE event_id = $1`,
        [eventId],
      );

      await materialize(eventId, { contactEmail: "organizer@example.test" });

      // Round 11 changed HOW this holds and not WHETHER it does. The destination is part of the
      // row key now, so the corrected address does not inherit a row at all — it gets its own,
      // which starts at zero with no backoff by definition. The assertion is scoped to those rows
      // because the superseded ones are still here on purpose, cancelled and carrying their
      // evidence, which is the audit fact the test below this one covers.
      const corrected = (await alertsOf(eventId)).filter(
        (row) => row.recipient === "organizer@example.test",
      );
      expect(corrected.length).toBeGreaterThan(0);
      // Ordered as fresh: `ORDER BY failure_count, send_at, id` puts a non-zero count behind every
      // untried alert, so a corrected address would have queued behind them.
      expect(corrected.every((row) => row.failure_count === 0)).toBe(true);
      // And eligible now, rather than serving out a backoff the old address earned.
      expect(corrected.every((row) => row.next_attempt_at === null)).toBe(true);
      expect(corrected.every((row) => row.status === "pending")).toBe(true);
    });

    it("keeps the evidence when a review changes nothing about the destination", async () => {
      // The mirror of the same rule, and the reason the reset is conditional rather than blanket.
      // This upsert runs on EVERY checklist review, so clearing unconditionally would let an
      // organizer wipe a genuinely dead address's backoff simply by pressing review, putting it
      // back at the head of the batch — the monopolisation migration 010 exists to stop.
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId, { contactEmail: "dead@example.test" });
      await pool.query(
        `UPDATE alerts SET status = 'failed', failure_count = 3,
                           next_attempt_at = clock_timestamp() + interval '15 minutes'
          WHERE event_id = $1`,
        [eventId],
      );

      // Same address, reviewed again.
      await materialize(eventId, { contactEmail: "dead@example.test" });

      const after = await alertsOf(eventId);
      expect(after.every((row) => row.failure_count === 3)).toBe(true);
      expect(after.every((row) => row.next_attempt_at !== null)).toBe(true);
    });

    it("applies a corrected address to alerts that have not gone out", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId, { contactEmail: "typo@example.test" });
      // One row has already gone, and one has already failed against the bad address.
      const before = await alertsOf(eventId);
      await pool.query(
        "UPDATE alerts SET status = 'sent', sent_at = clock_timestamp() WHERE id = $1",
        [before[0]?.id],
      );
      await pool.query("UPDATE alerts SET status = 'failed', failure_count = 1 WHERE id = $1", [
        before[1]?.id,
      ]);

      await materialize(eventId, { contactEmail: "organizer@example.test" });

      const rows = await alertsOf(eventId);
      const after = new Map(rows.map((row) => [row.id, row]));
      // The sent row is the record of where a message actually went, and does not move.
      expect(after.get(before[0]?.id ?? "")?.recipient).toBe("typo@example.test");
      // Round 11: the correction reaches the same alerts, by superseding them rather than by
      // rewriting them. Every row that was still to go is now cancelled and still says where it
      // was addressed, and the same alerts exist again against the corrected address.
      for (const row of before.slice(1)) {
        expect(after.get(row.id)?.recipient).toBe("typo@example.test");
        expect(after.get(row.id)?.status).toBe("cancelled");
      }
      const queued = rows.filter((row) => row.status === "pending");
      expect(queued.every((row) => row.recipient === "organizer@example.test")).toBe(true);
      // INCLUDING THE ONE THAT WAS ALREADY SENT, which is the consequence worth stating out loud
      // rather than discovering. AC 7 says a sent alert is never re-sent, and with the destination
      // in the key that reads as never re-sent TO THE SAME DESTINATION. A reminder that went to a
      // typo did not reach the organizer, and refusing to deliver it to the address they just
      // corrected would mean a correction can never repair anything already attempted — in a
      // feature whose whole purpose is that a filing deadline does not pass unnoticed. The sent row
      // itself is still immutable, and the same message can still never go twice to one address.
      expect(queued.length).toBe(before.length);
    });

    it("never rewrites where an attempt was already made", async () => {
      // THE AUDIT FACT A WHOLE TABLE EXISTS TO PROTECT. `event_alert_contacts` was justified on
      // the distinction between where this event's alerts GO — per-event, correctable — and where
      // one MESSAGE went — per-row, immutable. The upsert then rewrote `recipient` in place, which
      // is that argument's own sentence pointing the other way.
      //
      // The damage is worst exactly where the row is least sure of itself: Resend accepts a
      // request, the api times out before it sees the response, the row is marked failed although
      // a message may have reached the old address. Rewriting the recipient there leaves the only
      // record of that attempt naming an address it was never sent to.
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId, { contactEmail: "typo@example.test" });
      const attempted = (await alertsOf(eventId))[0];
      await pool.query(
        `UPDATE alerts SET status = 'failed', failure_count = 1,
                           payload = payload || '{"last_error":"provider timed out"}'::jsonb
          WHERE id = $1`,
        [attempted?.id],
      );

      await materialize(eventId, { contactEmail: "organizer@example.test" });

      const rows = new Map((await alertsOf(eventId)).map((row) => [row.id, row]));
      const preserved = rows.get(attempted?.id ?? "");
      // Where the attempt went, what it cost, and why it failed: all still true afterwards.
      expect(preserved?.recipient).toBe("typo@example.test");
      expect(preserved?.failure_count).toBe(1);
      expect(preserved?.payload.last_error).toBe("provider timed out");
      // And it stops retrying, because nobody intends to send it any more. Cancelled is the word
      // this file already uses for that, rather than a new state for the same fact.
      expect(preserved?.status).toBe("cancelled");
    });

    it("gives the provider a new identity when the address is corrected", async () => {
      // THE LAST LAYER THE CORRECTION COULD STILL BE DEFEATED AT, and the only one outside this
      // database. Round 7 made the contact correctable, round 9 stopped the corrected address
      // inheriting the old one's failures, and the request still reached Resend under the key of
      // the message it replaced — so the provider was entitled to answer with its stored result
      // for the original, or to reject the altered one. The corrected address received nothing.
      //
      // The window is reproduced exactly as reported: the provider ACCEPTS and records the key,
      // the api never sees the response and marks the row failed. The fake dedupes on the key the
      // way Resend does, which is what makes this test able to fail at all.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId);
      const scheduleTo = async (email: string) => {
        const client = await pool.connect();
        try {
          await schedulerWith()(client, eventId, planId, { email, phone: null });
        } finally {
          client.release();
        }
      };
      await scheduleTo("typo@example.test");
      const provider = fakeProvider();
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });

      await poller.tick();
      expect(provider.delivered.some((sent) => sent.recipient === "typo@example.test")).toBe(true);

      // The api timed out after the provider accepted: the mark-sent is lost, the key is not.
      await pool.query(
        `UPDATE alerts SET status = 'failed', sent_at = NULL, failure_count = 1,
                           next_attempt_at = NULL
          WHERE event_id = $1`,
        [eventId],
      );

      await scheduleTo("organizer@example.test");
      await poller.tick();

      // Reusing the key, the fake deduplicates this away and nothing reaches the new address —
      // which is precisely what the organizer would have experienced.
      expect(provider.delivered.some((sent) => sent.recipient === "organizer@example.test")).toBe(
        true,
      );
    });

    it("keeps one identity across retries to an unchanged address", async () => {
      // The half that must NOT change, and the reason the new key is derived rather than random.
      // AC 2's crash requirement rests on the provider seeing the same key twice and delivering
      // once; a key that rotated on every attempt would turn every lost mark-sent into a second
      // message. This passes before the change as well as after — it is here to catch a fix that
      // over-rotates, not as evidence for the one above.
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);
      const provider = fakeProvider();
      provider.fail = "email provider unreachable: ECONNREFUSED";
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });

      await poller.tick();
      await poller.tick();

      const keys = new Set(provider.attempts.map((attempt) => attempt.idempotencyKey));
      expect(provider.attempts.length).toBeGreaterThan(1);
      expect(keys.size).toBe(1);
    });

    it("keeps warning about a failed channel when a review changes nothing", async () => {
      // Round 9's consequence, and it landed on the one surface an organizer actually reads.
      // Retaining failure_count and next_attempt_at while flipping the status to pending told
      // `failedDeliveries` there was nothing to report — no new attempt had been made, the same
      // dead address was still in backoff, and the warning disappeared because the row stopped
      // using the word for what it knew.
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId, { contactEmail: "dead@example.test" });
      await pool.query(
        `UPDATE alerts SET status = 'failed', failure_count = 2,
                           next_attempt_at = clock_timestamp() + interval '15 minutes'
          WHERE event_id = $1`,
        [eventId],
      );
      const warned = await failedDeliveries(pool, eventId);
      expect(warned).toHaveLength(1);

      // Save pressed, nothing changed.
      await materialize(eventId, { contactEmail: "dead@example.test" });

      expect(await failedDeliveries(pool, eventId)).toEqual(warned);
    });

    it("stops warning once the address itself is corrected", async () => {
      // The mirror, and what keeps the status honest in the other direction: a fresh destination
      // has no attempts against it, so there is no failure to report. Same rule as the count and
      // the backoff, applied to the word.
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId, { contactEmail: "typo@example.test" });
      await pool.query(
        `UPDATE alerts SET status = 'failed', failure_count = 2 WHERE event_id = $1`,
        [eventId],
      );
      expect(await failedDeliveries(pool, eventId)).toHaveLength(1);

      await materialize(eventId, { contactEmail: "organizer@example.test" });

      expect(await failedDeliveries(pool, eventId)).toEqual([]);
    });

    it("does not unlock a window whose filing deadline has already passed", async () => {
      // Materializing an older plan: the reminder guard correctly skips a filing date behind us,
      // and this scheduled the unlock anyway. The poller then sent "You can now pursue" about a
      // window the same plan reports as missed, so the notification contradicted the checklist on
      // one requirement and the notification was the surface that was wrong.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        latestApplyDate: dayFromToday(-3),
        applyAfterDate: dayFromToday(-10),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const rows = await alertsOf(eventId);
      expect(rows.some((row) => row.alert_type === "dependency_unlocked")).toBe(false);
    });

    it("still unlocks a gated item that has no filing deadline at all", async () => {
      // The criterion this pins is the one most likely to be "fixed" by someone reading the guard
      // above. A null latest_apply_date is not an expired one: the pinned holiday list is
      // deliberately unpublished, so null is the NORMAL state for every business_days_minimum
      // finding, and reading it as expired would suppress unlocks across most of the live ruleset
      // while looking like correctness.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        latestApplyDate: null,
        applyAfterDate: dayFromToday(3),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const rows = await alertsOf(eventId);
      expect(rows.some((row) => row.alert_type === "dependency_unlocked")).toBe(true);
      // And no reminder, because there is no filing date to count back from. Nothing is invented.
      expect(rows.some((row) => row.alert_type === "deadline_reminder")).toBe(false);
    });

    it("still unlocks while the filing deadline is ahead", async () => {
      // The guard is about a date that has gone, not about a gate that opened in the past: an
      // organizer converting a plan a week late is exactly who the unlock is for, as long as they
      // can still file. Here to stop the fix above being written as "no past apply_after_date".
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        latestApplyDate: dayFromToday(7),
        applyAfterDate: dayFromToday(-10),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const rows = await alertsOf(eventId);
      expect(rows.some((row) => row.alert_type === "dependency_unlocked")).toBe(true);
    });

    it("carries all three verification states on an unlock alert", async () => {
      // AGENTS.md keeps these states visible END TO END and a notification is an end. The reminder
      // builder was fixed for that; this builder was not, so the one alert that asserts a SEQUENCE
      // between two agencies arrived with no verification state at all.
      //
      // The third line is the one a single status cannot carry. The sequencing rule publishes
      // RESEARCH_REQUIRED on the order itself — issued-before-filed is not confirmed — and "You
      // can now pursue" reads as a start date the agencies agree on. Without it, the unconfirmed
      // part of the claim is the part the organizer cannot see.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        latestApplyDate: dayFromToday(7),
        applyAfterDate: dayFromToday(3),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const unlock = (await alertsOf(eventId)).find(
        (row) => row.alert_type === "dependency_unlocked",
      );
      const body = unlock?.payload.body ?? "";
      expect(body).toContain("Verification of your Sound Device Permit (NYPD): SOURCE CONFIRMED");
      expect(body).toContain(
        "Verification of your Special Event Permit (NYC Parks): SOURCE CONFIRMED",
      );
      expect(body).toContain("Verification of the sequencing between them: RESEARCH REQUIRED");
    });

    it("does not announce a second unlock when regeneration recomputes the same gate", async () => {
      // `apply_after_date` is the plan's own `today` plus the upstream processing range, so it
      // moves every time the plan is regenerated on a later day even though the event, the
      // requirement and the upstream have not changed. Keyed on that date, the sent unlock did not
      // conflict with the recomputed one and the organizer was told a second time that they may
      // now pursue something they had already been told was open.
      const eventId = await createEvent(scenario("C"));
      const contacts = { email: "organizer@example.test", phone: null };
      const first = await insertDuePlan(eventId, {
        latestApplyDate: dayFromToday(40),
        applyAfterDate: dayFromToday(21),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, first.planId, contacts);
        const unlock = (await alertsOf(eventId)).find(
          (row) => row.alert_type === "dependency_unlocked",
        );
        expect(unlock).toBeDefined();
        await pool.query(
          "UPDATE alerts SET status = 'sent', sent_at = clock_timestamp() WHERE id = $1",
          [unlock?.id],
        );

        // Regenerated a week later: the gate is recomputed from the new clock and lands elsewhere.
        const second = await insertDuePlan(eventId, {
          latestApplyDate: dayFromToday(40),
          applyAfterDate: dayFromToday(28),
          reuseChecklistItemId: first.checklistItemId,
        });
        await schedulerWith()(client, eventId, second.planId, contacts);

        const unlocks = (await alertsOf(eventId)).filter(
          (row) => row.alert_type === "dependency_unlocked",
        );
        // One unlock per gated requirement, ever. It stays sent and no second one is queued.
        expect(unlocks).toHaveLength(1);
        expect(unlocks[0]?.status).toBe("sent");
      } finally {
        client.release();
      }
    });

    it("moves an unsent unlock to the recomputed date rather than leaving it on the old one", async () => {
      // The other half of dropping the date from the identity: the row keeps its identity while
      // its date changes, so reconciliation has to move the row it already owns.
      const eventId = await createEvent(scenario("C"));
      const contacts = { email: "organizer@example.test", phone: null };
      const first = await insertDuePlan(eventId, {
        latestApplyDate: dayFromToday(40),
        applyAfterDate: dayFromToday(21),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, first.planId, contacts);
        const second = await insertDuePlan(eventId, {
          latestApplyDate: dayFromToday(40),
          applyAfterDate: dayFromToday(28),
          reuseChecklistItemId: first.checklistItemId,
        });
        await schedulerWith()(client, eventId, second.planId, contacts);

        const unlocks = (await alertsOf(eventId)).filter(
          (row) => row.alert_type === "dependency_unlocked",
        );
        expect(unlocks).toHaveLength(1);
        expect(unlocks[0]?.status).toBe("pending");
        expect(unlocks[0]?.send_at.toISOString().slice(0, 10)).toBe(dayFromToday(28));
      } finally {
        client.release();
      }
    });

    it("does not send an alert a regeneration rescheduled between the scan and the claim", async () => {
      // The scan-to-claim window, seen from the other side of the same race the event lock was
      // introduced for. An unlock keeps its identity across a recomputed `apply_after_date` — that
      // is what stops it announcing itself twice — so reconciliation rewrites `send_at` on a row
      // that stays pending and keeps the id the scan already picked up. Claiming on status alone
      // then sends a rescheduled alert at the old moment: "you can now pursue this" days early.
      const eventId = await createEvent(scenario("C"));
      const contacts = { email: "organizer@example.test", phone: null };
      const plan = await insertDuePlan(eventId, {
        latestApplyDate: dayFromToday(40),
        applyAfterDate: dayFromToday(-1),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, plan.planId, contacts);
      } finally {
        client.release();
      }
      const unlock = (await alertsOf(eventId)).find(
        (row) => row.alert_type === "dependency_unlocked",
      );
      expect(unlock?.send_at.getTime()).toBeLessThan(Date.now());

      const provider = fakeProvider();
      // The regeneration lands between the scan and the claim: same row, same identity, a gate
      // that has moved into the future.
      const racing = Object.create(pool) as Pool;
      racing.connect = pool.connect.bind(pool) as Pool["connect"];
      racing.query = (async (text: string, values?: unknown[]) => {
        const result = await pool.query(text as never, values as never);
        if (typeof text === "string" && text.includes("ORDER BY failure_count")) {
          const later = await insertDuePlan(eventId, {
            latestApplyDate: dayFromToday(40),
            applyAfterDate: dayFromToday(9),
            reuseChecklistItemId: plan.checklistItemId,
          });
          const reviewer = await pool.connect();
          try {
            await schedulerWith()(reviewer, eventId, later.planId, contacts);
          } finally {
            reviewer.release();
          }
        }
        return result;
      }) as Pool["query"];

      await createAlertPoller({ jurisdiction: ruleset.jurisdiction, database: racing, senders: provider.senders }).tick();

      const after = (await alertsOf(eventId)).find(
        (row) => row.alert_type === "dependency_unlocked",
      );
      // Still the one row, still pending, now waiting for the date the plan actually computed.
      expect(after?.id).toBe(unlock?.id);
      expect(after?.status).toBe("pending");
      expect(after?.send_at.toISOString().slice(0, 10)).toBe(dayFromToday(9));
      expect(provider.attempts.map((message) => message.subject)).not.toContain(
        after?.payload.subject,
      );
    });

    it("does not deliver an obsolete alert while a checklist review is cancelling it", async () => {
      // The reconciler and the poller both reach for the same row. Locking the alert row alone put
      // the cancellation in a queue BEHIND the claim: it woke to a row that had become `sent` and
      // skipped it, having waited for exactly the delivery it existed to prevent.
      const eventId = await createEvent(scenario("C"));
      const contacts = { email: "organizer@example.test", phone: null };
      const first = await insertDuePlan(eventId, { latestApplyDate: dayFromToday(0) });
      const review = await pool.connect();
      const provider = fakeProvider();
      try {
        const client = await pool.connect();
        try {
          await schedulerWith()(client, eventId, first.planId, contacts);
        } finally {
          client.release();
        }
        expect((await alertsOf(eventId)).every((row) => row.status === "pending")).toBe(true);

        // A checklist review, holding the event exactly as `POST /checklist` does, mid-flight.
        await review.query("BEGIN");
        await review.query("SELECT id FROM events WHERE id = $1 FOR UPDATE", [eventId]);

        await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

        // Nothing went out: the review owns the event, and the alerts it is about to reconcile are
        // not delivered out from under it.
        expect(provider.attempts).toHaveLength(0);
        await review.query(
          `UPDATE alerts SET status = 'cancelled' WHERE event_id = $1 AND status IN ('pending', 'failed')`,
          [eventId],
        );
        await review.query("COMMIT");
      } finally {
        review.release();
      }

      expect((await alertsOf(eventId)).every((row) => row.status === "cancelled")).toBe(true);
      // And once the review is done the poller is free again, with nothing left to send.
      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();
      expect(provider.attempts).toHaveLength(0);
    });

    it("brings a cancelled alert back when the requirement returns", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      const original = await alertsOf(eventId);
      await request(appWith(fakeProvider()))
        .patch(`/api/events/${eventId}`)
        .send({ event_date: "2026-10-16" });
      await materialize(eventId);
      expect(
        (await alertsOf(eventId)).filter((row) => row.status === "cancelled").length,
      ).toBeGreaterThan(0);

      // Undo the move: the original dates are back, so the alerts scheduled for them are too.
      await request(appWith(fakeProvider()))
        .patch(`/api/events/${eventId}`)
        .send({ event_date: "2026-09-16" });
      await materialize(eventId);

      const revived = new Map((await alertsOf(eventId)).map((row) => [row.idempotency_key, row]));
      for (const row of original) {
        expect(revived.get(row.idempotency_key)?.status).toBe("pending");
      }
    });
  });

  describe("AC 6 — the test-alert endpoint", () => {
    it("fires one real alert immediately, labeled a test", async () => {
      const eventId = await createEvent(scenario("C"));
      const provider = fakeProvider();

      const response = await request(appWith(provider))
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "email", recipient: "organizer@example.test" });

      expect(response.status).toBe(201);
      expect(response.body.alert.status).toBe("sent");
      expect(response.body.alert.payload.test).toBe(true);
      expect(response.body.alert.payload.subject).toBe("[TEST] PopEngine alert test");
      expect(provider.delivered).toHaveLength(1);
      expect(provider.delivered[0]?.body).toContain("TEST ALERT");
      expect(provider.delivered[0]?.body).toContain(
        "states no deadline, requirement or agency position",
      );
      // The recipient is not echoed back: the caller supplied it, and it is contact data.
      expect(response.body.alert.recipient).toBeUndefined();
    });

    it("reports success when the poller delivered the test row first", async () => {
      // The test row is written due immediately, so the poller can claim it in the gap before the
      // endpoint sends it. The endpoint's own claim then returns nothing out of SKIP LOCKED — not
      // because the alert failed, but because someone else was already delivering it.
      const eventId = await createEvent(scenario("C"));
      const provider = fakeProvider();
      const racing = Object.create(pool) as Pool;
      racing.connect = pool.connect.bind(pool) as Pool["connect"];
      racing.query = (async (text: string, values?: unknown[]) => {
        const result = await pool.query(text as never, values as never);
        if (typeof text === "string" && text.includes("INSERT INTO alerts")) {
          // Exactly the race, made deterministic: the poller takes the row before the endpoint
          // gets to it, and delivers it.
          await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();
        }
        return result;
      }) as Pool["query"];

      const response = await request(
        createApp({
          database: pool,
          intakeContract,
          today: () => FIXTURE_TODAY,
          alerts: { database: racing, senders: provider.senders },
        }),
      )
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "email", recipient: "organizer@example.test" });

      expect(response.status).toBe(201);
      expect(response.body.alert.status).toBe("sent");
      // Delivered once, by the poller. The endpoint reports the row, not its own part in it.
      expect(provider.delivered).toHaveLength(1);
    });

    it("waits out a poller that is still mid-send rather than calling it a failure", async () => {
      // The narrower half of the same race: the poller holds the row and has not finished. A
      // single look sees `pending` and would report a test that is on its way as undeliverable.
      const eventId = await createEvent(scenario("C"));
      const holder = await pool.connect();
      const claiming = Object.create(pool) as Pool;
      claiming.connect = pool.connect.bind(pool) as Pool["connect"];
      claiming.query = (async (text: string, values?: unknown[]) => {
        const result = await pool.query(text as never, values as never);
        if (typeof text === "string" && text.includes("INSERT INTO alerts")) {
          await holder.query("BEGIN");
          await holder.query("SELECT id FROM alerts WHERE event_id = $1 FOR UPDATE", [eventId]);
          setTimeout(() => {
            void (async () => {
              await holder.query(
                "UPDATE alerts SET status = 'sent', sent_at = clock_timestamp() WHERE event_id = $1",
                [eventId],
              );
              await holder.query("COMMIT");
              holder.release();
            })();
          }, 250);
        }
        return result;
      }) as Pool["query"];

      const response = await request(
        createApp({
          database: pool,
          intakeContract,
          today: () => FIXTURE_TODAY,
          alerts: { database: claiming, senders: fakeProvider().senders },
        }),
      )
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "email", recipient: "organizer@example.test" });

      expect(response.status).toBe(201);
      expect(response.body.alert.status).toBe("sent");
    });

    it("does not call a test undelivered because a review held the event", async () => {
      // `sendOne` reports `skipped` when a checklist review or an intake edit holds the event row.
      // The poller learned to retry that in round 13; this endpoint treated it as a final outcome,
      // answered 502 and reported a failure without ever attempting delivery. It is a demo path,
      // and a demo that reports a failure that did not happen is worse than most real bugs.
      //
      // The lock is taken AFTER the row is inserted, which is the only interleaving that reaches
      // the skip: taken before, the insert's own foreign-key check waits on the event row and the
      // request simply blocks until the review commits. A review that starts while a test send is
      // being delivered is the ordinary case, and it is this one.
      const eventId = await createEvent(scenario("C"));
      const reviewer = await pool.connect();
      const inserting = Object.create(pool) as Pool;
      inserting.connect = pool.connect.bind(pool) as Pool["connect"];
      inserting.query = (async (text: string, values?: unknown[]) => {
        const result = await pool.query(text as never, values as never);
        if (typeof text === "string" && text.includes("INSERT INTO alerts")) {
          await reviewer.query("BEGIN");
          await reviewer.query("SELECT id FROM events WHERE id = $1 FOR UPDATE", [eventId]);
          setTimeout(() => {
            void reviewer.query("COMMIT");
          }, 300);
        }
        return result;
      }) as Pool["query"];

      try {
        const response = await request(
          createApp({
            database: pool,
            intakeContract,
            today: () => FIXTURE_TODAY,
            alerts: { database: inserting, senders: fakeProvider().senders },
          }),
        )
          .post(`/api/events/${eventId}/alerts/test`)
          .send({ channel: "email", recipient: "organizer@example.test" });

        expect(response.status).toBe(201);
        expect(response.body.alert.status).toBe("sent");
      } finally {
        reviewer.release();
      }
    });

    it("waits as long as a send is allowed to take before calling a test undelivered", async () => {
      // The retry budget used to be a flat 600ms while the same delivery path allows a request to
      // stay in flight for ten seconds. A poller that won the claim and then succeeded after a
      // second produced a 502 moments before the successful send committed — the endpoint giving
      // up sooner than the thing it is waiting for is allowed to take.
      const eventId = await createEvent(scenario("C"));
      const holder = await pool.connect();
      const claiming = Object.create(pool) as Pool;
      claiming.connect = pool.connect.bind(pool) as Pool["connect"];
      claiming.query = (async (text: string, values?: unknown[]) => {
        const result = await pool.query(text as never, values as never);
        if (typeof text === "string" && text.includes("INSERT INTO alerts")) {
          await holder.query("BEGIN");
          await holder.query("SELECT id FROM alerts WHERE event_id = $1 FOR UPDATE", [eventId]);
          // Well past the old 600ms budget, and well inside what a provider request may take.
          setTimeout(() => {
            void (async () => {
              await holder.query(
                "UPDATE alerts SET status = 'sent', sent_at = clock_timestamp() WHERE event_id = $1",
                [eventId],
              );
              await holder.query("COMMIT");
              holder.release();
            })();
          }, 1_500);
        }
        return result;
      }) as Pool["query"];

      const response = await request(
        createApp({
          database: pool,
          intakeContract,
          today: () => FIXTURE_TODAY,
          alerts: { database: claiming, senders: fakeProvider().senders },
        }),
      )
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "email", recipient: "organizer@example.test" });

      expect(response.status).toBe(201);
      expect(response.body.alert.status).toBe("sent");
    }, 20_000);

    it("reports a delivery failure instead of claiming a send", async () => {
      const eventId = await createEvent(scenario("C"));
      const provider = fakeProvider();
      provider.fail = "email provider rejected the send with status 422";

      const response = await request(appWith(provider))
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "email", recipient: "organizer@example.test" });

      expect(response.status).toBe(502);
      expect(response.body.alert.status).toBe("failed");
      expect(response.body.alert.failureCount).toBe(1);
    });

    it("renders an SMS test as a labeled simulation rather than claiming delivery", async () => {
      const eventId = await createEvent(scenario("C"));

      const response = await request(appWith(fakeProvider()))
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "sms", recipient: "+15555550123" });

      expect(response.status).toBe(201);
      expect(response.body.alert.payload.delivery).toMatchObject({
        simulated: true,
        label: SIMULATED_SMS_LABEL,
      });
    });

    it("survives a later regeneration rather than being cancelled with the plan's alerts", async () => {
      const eventId = await createEvent(scenario("C"));
      const provider = fakeProvider();
      provider.fail = "provider down";
      await request(appWith(provider))
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "email", recipient: "organizer@example.test" });

      await materialize(eventId);

      const test = (await alertsOf(eventId)).find((row) => row.payload.test === true);
      expect(test?.status).toBe("failed");
    });

    it("answers in JSON when the request fails outright", async () => {
      const failing = Object.create(pool) as Pool;
      failing.query = (() =>
        Promise.reject(new Error("connection terminated unexpectedly"))) as Pool["query"];
      const response = await request(
        createApp({
          database: pool,
          intakeContract,
          today: () => FIXTURE_TODAY,
          alerts: { database: failing, senders: fakeProvider().senders },
        }),
      )
        .post(`/api/events/${randomUUID()}/alerts/test`)
        .send({ channel: "email", recipient: "organizer@example.test" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "alert request failed" });
    });

    it("rejects a request that names no valid channel, recipient or event", async () => {
      const eventId = await createEvent(scenario("C"));
      const app = appWith(fakeProvider());

      expect((await request(app).post("/api/events/not-a-uuid/alerts/test").send({})).status).toBe(
        400,
      );
      expect(
        (
          await request(app)
            .post(`/api/events/${eventId}/alerts/test`)
            .send({ channel: "carrier-pigeon" })
        ).body.error,
      ).toBe("channel must be one of email, sms");
      expect(
        (
          await request(app)
            .post(`/api/events/${eventId}/alerts/test`)
            .send({ channel: "email", recipient: " " })
        ).body.error,
      ).toBe("recipient must be a non-empty string");
      expect(
        (
          await request(app)
            .post(`/api/events/${randomUUID()}/alerts/test`)
            .send({ channel: "email", recipient: "organizer@example.test" })
        ).status,
      ).toBe(404);
      expect(
        (await request(app).post(`/api/events/${eventId}/alerts/test`).send("[]").type("json"))
          .status,
      ).toBe(400);
    });
  });

  describe("a channel that tried to send and failed is reported as such", () => {
    it("counts alerts whose attempt failed, per channel, and says nothing about why", async () => {
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [7, 1]);
      const provider = fakeProvider();
      provider.fail = "email provider rejected the send with status 550";

      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      const failures = await failedDeliveries(pool, eventId);
      expect(failures).toEqual([{ channel: "email", failedCount: 2 }]);
      // The provider's words stay on the row for an operator; they can name a recipient.
      expect(JSON.stringify(failures)).not.toContain("550");
    });

    it("reports nothing when alerts exist but none has been attempted", async () => {
      // The distinction the rows DO support: pending is "not due yet", not "failed". Reporting a
      // zero here, or anything at all, would be inventing evidence out of an absence.
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      expect((await alertsOf(eventId)).every((row) => row.status === "pending")).toBe(true);

      expect(await failedDeliveries(pool, eventId)).toEqual([]);
    });

    it("stops reporting a failure once the alert gets through", async () => {
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [1]);
      const provider = fakeProvider();
      provider.fail = "email provider unreachable: ECONNREFUSED";
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });
      await poller.tick();
      expect(await failedDeliveries(pool, eventId)).toEqual([{ channel: "email", failedCount: 1 }]);

      provider.fail = null;
      await poller.tick();

      // Delivered on the retry, so it is no longer a failure to report — the count follows the
      // rows rather than remembering a state they have left.
      expect(await failedDeliveries(pool, eventId)).toEqual([]);
    });

    it("does not count a demo test send as a text message for the event", async () => {
      // The mirror of the failed-delivery exclusion, in the other direction. There, counting a demo
      // told an organizer their reminders were failing when they were not. Here it tells them
      // PopEngine recorded a text-message alert for their event when the only SMS was the demo
      // they explicitly asked for.
      const eventId = await createEvent(scenario("C"));
      const provider = fakeProvider();
      const response = await request(
        createApp({
          database: pool,
          intakeContract,
          today: () => FIXTURE_TODAY,
          alerts: { database: pool, senders: provider.senders },
        }),
      )
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "sms", recipient: "+15550000000" });
      expect(response.status).toBe(201);
      // The demo really was a simulated SMS, so this is the row that would be miscounted.
      expect(response.body.alert.status).toBe("sent");

      expect(await simulatedDeliveries(pool, eventId)).toEqual([]);
    });

    it("does not count a demo test send against the organizer's own alerts", async () => {
      // A test fired at a deliberately bogus address is an operator action against no deadline.
      // Counting it would tell an organizer their reminders are failing when they are not.
      const eventId = await createEvent(scenario("C"));
      const provider = fakeProvider();
      provider.fail = "email provider rejected the send with status 422";
      const response = await request(appWith(provider))
        .post(`/api/events/${eventId}/alerts/test`)
        .send({ channel: "email", recipient: "tester@example.test" });
      expect(response.status).toBe(502);

      expect(await failedDeliveries(pool, eventId)).toEqual([]);
    });
  });

  describe("AC 5 — a simulated send is visible as one", () => {
    it("reports the SMS simulation label on the checklist an organizer reads", async () => {
      // AGENTS.md permits the simulation only while it is labeled. The label lived on the alert
      // row and nothing an organizer can reach read it back, so in the A2P-pending configuration
      // every SMS was recorded `sent` and looked delivered from every surface a person uses.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId);
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, { email: null, phone: "+15555550123" });
      } finally {
        client.release();
      }
      const provider = fakeProvider();
      const before = await request(appWith(provider)).get(`/api/events/${eventId}/checklist`);
      expect(before.body.simulatedAlertDeliveries).toEqual([]);

      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      const after = await request(appWith(provider)).get(`/api/events/${eventId}/checklist`);
      expect(after.body.simulatedAlertDeliveries).toEqual([
        { channel: "sms", label: SIMULATED_SMS_LABEL, sentCount: 2 },
      ]);
    });

    it("says nothing when every send was live", async () => {
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId);
      await createAlertPoller({ jurisdiction: ruleset.jurisdiction, database: pool, senders: fakeProvider().senders }).tick();

      const response = await request(appWith(fakeProvider())).get(
        `/api/events/${eventId}/checklist`,
      );
      expect(response.body.simulatedAlertDeliveries).toEqual([]);
    });
  });

  describe("spec edge cases", () => {
    it("says a catch-up reminder is late rather than claiming its configured timing", async () => {
      // A checklist created inside the window sends the seven-day reminder immediately — which is
      // correct, and means it is NOT going out seven days before anything. Saying it is would be a
      // claim about PopEngine's own behaviour that the row itself contradicts.
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [7]);

      const alert = (await alertsOf(eventId))[0];
      expect(alert?.payload.body).toContain(
        "This is PopEngine's 7 days-before reminder, sent now because your checklist was created " +
          "after that day had already passed.",
      );
      expect(alert?.payload.body).not.toContain("PopEngine sends this reminder 7 days before");
      // The policy label survives the rewording: that part is required whatever the timing.
      expect(alert?.payload.body).toContain("not an agency deadline");
    });

    it("keeps the plain wording on a reminder that will go out on its own day", async () => {
      const eventId = await createEvent(scenario("C"));
      await materialize(eventId);
      const reminder = (await alertsOf(eventId)).find(
        (row) => row.alert_type === "deadline_reminder",
      );
      expect(reminder?.payload.body).toContain("PopEngine sends this reminder");
      expect(reminder?.payload.body).not.toContain("sent now because your checklist");
    });

    it("sends a reminder whose send_at has already passed once, instead of dropping it", async () => {
      // A checklist created inside the reminder window: the filing date is still ahead, the
      // reminder day is behind.
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId);
      const rows = await alertsOf(eventId);
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.send_at.getTime() < Date.now())).toBe(true);
      const provider = fakeProvider();

      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });
      await poller.tick();
      await poller.tick();

      expect(provider.attempts).toHaveLength(2);
      expect((await alertsOf(eventId)).every((row) => row.status === "sent")).toBe(true);
    });

    it("delivers inside the bound when a review holds the event during a tick", async () => {
      // THE BOUND, NOT THE MECHANISM. `SKIP LOCKED` returns nothing while a checklist review or an
      // intake edit holds the event row, and the poller banked that as a completed alert. The row
      // then waited a full 60-second interval, and with the interval's own wait ahead of the tick a
      // perfectly healthy provider could deliver outside AC 2's two-minute window. A review that
      // overlaps a tick is ordinary use, so this is reachable today rather than eventually.
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);
      const due = await alertsOf(eventId);
      expect(due).toHaveLength(1);
      const provider = fakeProvider();
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });

      // A review in progress: the event row is held exactly as `checklist.ts` holds it.
      const reviewer = await pool.connect();
      let summary;
      // The bound is measured from when the tick began, because these fixture alerts are
      // deliberately back-dated: `send_at` is days behind, so lateness against it measures the
      // fixture rather than the poller. What AC 2 constrains here is how long the poller takes once
      // the alert is claimable, and the failure being tested is a wait of one full interval.
      const tickStartedAt = Date.now();
      try {
        await reviewer.query("BEGIN");
        await reviewer.query("SELECT id FROM events WHERE id = $1 FOR UPDATE", [eventId]);
        const ticking = poller.tick();
        // The review commits while the tick is running, which is the ordinary case.
        await new Promise((resolve) => setTimeout(resolve, 300));
        await reviewer.query("COMMIT");
        summary = await ticking;
      } finally {
        reviewer.release();
      }

      // ONE tick delivered it. Without the fix the tick returns having sent nothing and the alert
      // waits for the next interval.
      expect(summary.sent).toBe(1);
      const [delivered] = await alertsOf(eventId);
      expect(delivered?.status).toBe("sent");
      const tookMs = (delivered?.sent_at?.getTime() ?? 0) - tickStartedAt;
      expect(tookMs).toBeLessThan(DELIVERY_BOUND_MS);
      // And the sharper statement, which is the actual defect: it did not wait out an interval.
      expect(tookMs).toBeLessThan(POLL_INTERVAL_MS);
    });

    it("does not deliver an alert whose plan the event has been edited past", async () => {
      // THE WORST OF THEM, and different in kind from every other alert defect on this PR. The
      // others were an alert missing, arriving twice, or arriving with a state left out. This one
      // arrives on time, looking correct, carrying a filing date the current event does not have.
      // Editing an event increments revision_counter and nothing else, so until the organizer
      // regenerates AND reviews, the alert rows still point through their checklist items at the
      // old plan.
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);
      const provider = fakeProvider();
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });

      // The organizer edits the event. Nothing else happens: no regeneration, no review.
      await pool.query("UPDATE events SET revision_counter = revision_counter + 1 WHERE id = $1", [
        eventId,
      ]);

      const summary = await poller.tick();

      expect(summary.sent).toBe(0);
      expect(provider.attempts).toHaveLength(0);
      // HELD, NOT CANCELLED: the spec gives the cancelling to regeneration (AC 2 and the Edge
      // Cases row), so the poller declines to send and leaves the row for the review to decide.
      expect((await alertsOf(eventId)).every((row) => row.status === "pending")).toBe(true);
    });

    it("delivers again once the review has caught the plan up", async () => {
      // The other half: holding is not dropping. Once the checklist is reviewed against a plan
      // evaluated at the current revision, the same alerts are deliverable again. Without this the
      // fix would be indistinguishable from switching the organizer's reminders off.
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);
      await pool.query("UPDATE events SET revision_counter = revision_counter + 1 WHERE id = $1", [
        eventId,
      ]);
      const provider = fakeProvider();
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });
      expect((await poller.tick()).sent).toBe(0);

      // The review: the plan the alerts hang off now names the event's current revision.
      await pool.query(
        `UPDATE permit_plans SET event_revision = (SELECT revision_counter FROM events WHERE id = $1)
          WHERE event_id = $1`,
        [eventId],
      );

      expect((await poller.tick()).sent).toBe(1);
      expect(provider.delivered).toHaveLength(1);
    });

    it("does not deliver a plan-level slack warning once the event has moved on", async () => {
      // The hole in last round's scope, and the argument that put it there was half wrong. A slack
      // warning has no checklist item, so the staleness JOIN cannot see it, and it was left out on
      // the grounds that it goes out seconds after being written. That holds only while delivery
      // works. A warning whose send FAILS sits in backoff for as long as the outage lasts, so the
      // real sequence is: the send fails, the organizer edits the event, delivery recovers before
      // they regenerate, and the OLD plan's slack figure goes out.
      //
      // Still a correctness fix rather than the severe one: this states a risk figure and an
      // evaluation date, never an agency deadline, so it cannot deliver a wrong filing date.
      const eventId = await createEvent(scenario("C"));
      // Far enough out that no reminder is due, so only the warning is in play here.
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(30),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }
      const warning = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      expect(warning).toBeDefined();
      // The send failed, which is what gives the edit a window to land in.
      await pool.query("UPDATE alerts SET status = 'failed', failure_count = 1 WHERE id = $1", [
        warning?.id,
      ]);

      await pool.query("UPDATE events SET revision_counter = revision_counter + 1 WHERE id = $1", [
        eventId,
      ]);

      const provider = fakeProvider();
      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      expect(provider.attempts).toHaveLength(0);
      const after = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      // Held for the review to decide, exactly as the checklist-backed rows are.
      expect(after?.status).toBe("failed");
    });

    it("delivers the slack warning again once its plan names the current revision", async () => {
      // Holding is not dropping, the same half this needed for the checklist-backed case.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(30),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }
      await pool.query("UPDATE events SET revision_counter = revision_counter + 1 WHERE id = $1", [
        eventId,
      ]);
      const provider = fakeProvider();
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });
      expect((await poller.tick()).sent).toBe(0);

      await pool.query(
        `UPDATE permit_plans SET event_revision = (SELECT revision_counter FROM events WHERE id = $1)
          WHERE event_id = $1`,
        [eventId],
      );
      // The review rewrites the payload, revision included, which is what makes it current again.
      const reviewing = await pool.connect();
      try {
        await schedulerWith()(reviewing, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        reviewing.release();
      }

      expect((await poller.tick()).sent).toBe(1);
      expect(provider.delivered).toHaveLength(1);
    });

    it(
      "delivers inside the bound when a whole tick was skipped",
      async () => {
        // Round 13 taught the tick that a skipped alert is not a completed one. This is the same
        // distinction one layer up, at the poller: a tick where EVERY due alert was skipped comes
        // back with no sends, and the respawn guard read that as "nothing to do" and waited out
        // the interval. So an alert falling due just after an idle scan waited nearly a full
        // interval for the tick, was skipped, and then waited another whole interval before a
        // healthy provider was ever asked. Past AC 2 with nothing failing.
        //
        // THE BOUND IS THE ASSERTION. The interval is pinned at its default here, so the only way
        // to land inside AC 2's window is the follow-up scan; waiting for the timer would blow the
        // deadline by itself.
        const eventId = await createEvent(scenario("C"));
        await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);
        const provider = fakeProvider();
        const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });
        const reviewer = await pool.connect();
        const startedAt = Date.now();
        try {
          // Held past the tick's own retry window, so the tick ends having attempted nothing.
          await reviewer.query("BEGIN");
          await reviewer.query("SELECT id FROM events WHERE id = $1 FOR UPDATE", [eventId]);
          poller.start();
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          await reviewer.query("COMMIT");

          await vi.waitFor(
            async () => {
              const [row] = await alertsOf(eventId);
              expect(row?.status).toBe("sent");
            },
            { timeout: 20_000, interval: 250 },
          );
        } finally {
          poller.stop();
          reviewer.release();
        }

        const [delivered] = await alertsOf(eventId);
        const tookMs = (delivered?.sent_at?.getTime() ?? 0) - startedAt;
        expect(tookMs).toBeLessThan(DELIVERY_BOUND_MS);
        // The sharper statement: it did not wait for the next scheduled scan.
        expect(tookMs).toBeLessThan(POLL_INTERVAL_MS);
      },
      30_000,
    );

    it("does not warn about slack once every filing date has passed", async () => {
      // The stale-plan class again, keyed on DATES rather than on revision. Nothing was edited, so
      // the plan is revision-current and round 14's predicate cannot see this. A plan generated
      // while feasible-at-risk and materialized only after its filing dates have gone still queued
      // an immediate "apply within N days" over a window that had closed.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(-3),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const rows = await alertsOf(eventId);
      expect(rows.some((row) => row.alert_type === "slack_warning")).toBe(false);
      // The reminder loop already refused the past date, which is what left this branch alone.
      expect(rows.some((row) => row.alert_type === "deadline_reminder")).toBe(false);
    });

    it("does not warn when the requirement the number describes has expired", async () => {
      // Round 17 asked whether ANY window is open. The number in the copy comes from ONE
      // requirement, so on a plan with several dated ones the requirement that PRODUCED the
      // minimum can expire while a later one holds the guard true, and the warning goes out
      // counting down a deadline already missed.
      //
      // Here the controlling requirement had 9 days of slack and its filing date has gone; a
      // second requirement with 40 days of slack is still open. "Apply within 9 days" describes
      // the expired one.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(-3),
        laterDated: { latestApplyDate: dayFromToday(40), slackDays: 40 },
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const rows = await alertsOf(eventId);
      expect(rows.some((row) => row.alert_type === "slack_warning")).toBe(false);
      // Not vacuous: the later requirement really is open, so the round 17 guard passes here and
      // reminders for it really are scheduled. Only the warning is withheld.
      expect(rows.some((row) => row.alert_type === "deadline_reminder")).toBe(true);
    });

    it("warns when the requirement the number describes is the one still open", async () => {
      // The mirror, so the narrowing cannot be rewritten as "never warn on a plan with a passed
      // date". Here the controlling requirement is the one that is still ahead.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(9),
        laterDated: { latestApplyDate: dayFromToday(40), slackDays: 40 },
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      expect((await alertsOf(eventId)).some((row) => row.alert_type === "slack_warning")).toBe(true);
    });

    it("still warns about slack while a filing date is ahead", async () => {
      // The other half, so the guard cannot be written as "never warn on an old plan".
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(30),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      expect((await alertsOf(eventId)).some((row) => row.alert_type === "slack_warning")).toBe(true);
    });

    it("does not deliver a reminder for a filing date that passed during an outage", async () => {
      // The system already holds this opinion: `plannedAlerts` refuses to CREATE a reminder for a
      // filing date that has gone. The claim never asked the same question, so an outage spanning
      // the deadline left the row eligible and the poller delivered "file by <a day that has
      // passed>" on recovery. One question, two answers, and the one that shipped never asked.
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);
      const before = await alertsOf(eventId);
      expect(before).toHaveLength(1);
      // The provider was down while the deadline went by.
      await pool.query("UPDATE alerts SET status = 'failed', failure_count = 2 WHERE id = $1", [
        before[0]?.id,
      ]);
      await pool.query(
        `UPDATE permit_plan_items SET latest_apply_date = current_date - 5
          WHERE plan_id IN (SELECT plan_id FROM permit_plan_items WHERE id IN (
            SELECT plan_item_id FROM checklist_items WHERE id = $1))`,
        [before[0]?.checklist_item_id],
      );
      const provider = fakeProvider();

      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      expect(provider.attempts).toHaveLength(0);
      // Cancelled rather than held: unlike a stale plan, no future review can revive this, because
      // the scheduler refuses to re-create an alert for a window that has shut. Leaving it pending
      // would also report it to the organizer as a delivery still being retried.
      expect((await alertsOf(eventId))[0]?.status).toBe("cancelled");
    });

    it("still delivers a reminder whose filing date is ahead", async () => {
      // The mirror, so the guard cannot be written as "never deliver a failed reminder".
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);
      await pool.query("UPDATE alerts SET status = 'failed', failure_count = 2 WHERE event_id = $1", [
        eventId,
      ]);
      const provider = fakeProvider();

      await createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction }).tick();

      expect(provider.delivered).toHaveLength(1);
      expect((await alertsOf(eventId))[0]?.status).toBe("sent");
    });

    it("does not anchor a gated slack figure to a date", async () => {
      // A REGRESSION FROM ROUND 19, and this file's own argument refutes it. Anchoring "apply
      // within N days" to a date is right when N counts down from that date. It is wrong when N is
      // a WIDTH: F-102 fixes gated slack as latest_apply minus apply_after, so anchoring it
      // instructs the organizer to act by a day that may fall before the window even opens. That
      // is a filing date no source publishes, in the one line most organizers read.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(30),
        applyAfterDate: dayFromToday(21),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const warning = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      expect(warning?.payload.subject).toBe("At risk — the narrowest filing window is 9 days wide");
      // The anchor is the specific harm: it is what turns a width into a deadline.
      expect(String(warning?.payload.subject)).not.toContain("apply within");
      // No date anywhere in it: an anchor is what turns the width into a deadline.
      expect(String(warning?.payload.subject)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("does not cancel a held stale-plan alert on the old plan's date", async () => {
      // Two of my own fixes disagreed. Round 14 HOLDS a stale-plan alert so the review can decide
      // it; round 19's sweep then cancelled it using the obsolete plan's filing date, deciding it
      // was withdrawn before regeneration had established whether its replacement is required, and
      // taking the failure evidence off the organizer's screen on the way.
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);
      const before = await alertsOf(eventId);
      await pool.query("UPDATE alerts SET status = 'failed', failure_count = 1 WHERE id = $1", [
        before[0]?.id,
      ]);
      // The old plan's filing date has passed AND the event has been edited past that plan.
      await pool.query(
        `UPDATE permit_plan_items SET latest_apply_date = current_date - 5
          WHERE id IN (SELECT plan_item_id FROM checklist_items WHERE id = $1)`,
        [before[0]?.checklist_item_id],
      );
      await pool.query("UPDATE events SET revision_counter = revision_counter + 1 WHERE id = $1", [
        eventId,
      ]);
      const provider = fakeProvider();

      await createAlertPoller({
        database: pool,
        senders: provider.senders,
        jurisdiction: ruleset.jurisdiction,
      }).tick();

      expect(provider.attempts).toHaveLength(0);
      // Held for the review, not cancelled by the poller on a date that belongs to the old event.
      expect((await alertsOf(eventId))[0]?.status).toBe("failed");
    });

    it("cancels a reminder whose filing date passed yesterday, with no grace day", async () => {
      // Round 19 compared against UTC yesterday because the poller had no jurisdiction, which meant
      // a "file by yesterday" reminder stayed eligible for a further day and an outage recovery
      // delivered copy already known to be stale. The jurisdiction clock is the one index.ts
      // already uses for `today`, so there is no trade to make here.
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);
      const before = await alertsOf(eventId);
      await pool.query("UPDATE alerts SET status = 'failed', failure_count = 1 WHERE id = $1", [
        before[0]?.id,
      ]);
      await pool.query(
        `UPDATE permit_plan_items SET latest_apply_date = $2::date
          WHERE id IN (SELECT plan_item_id FROM checklist_items WHERE id = $1)`,
        [before[0]?.checklist_item_id, dayFromToday(-1)],
      );
      const provider = fakeProvider();

      await createAlertPoller({
        database: pool,
        senders: provider.senders,
        jurisdiction: ruleset.jurisdiction,
      }).tick();

      expect(provider.attempts).toHaveLength(0);
      expect((await alertsOf(eventId))[0]?.status).toBe("cancelled");
    });

    it("makes a reminder created inside its own window due now rather than in the past", async () => {
      // AC 2 measures delivery from `send_at`. Persisting the original offset day for a checklist
      // materialized INSIDE the reminder window put that instant days behind, so the row failed the
      // two-minute bound by arithmetic before the poller had done anything: an empty queue and a
      // healthy provider still recorded it late. The spec's edge case says it goes out immediately,
      // and this is what immediately means.
      const startedAt = Date.now();
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId, [reminderOffsets[0] ?? 7]);

      const [reminder] = await alertsOf(eventId);
      expect(reminder?.alert_type).toBe("deadline_reminder");
      expect(reminder?.send_at.getTime()).toBeGreaterThanOrEqual(startedAt - 1_000);
      expect(reminder?.send_at.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
      // The intended slot still decides identity and copy: it is a catch-up and still says so.
      expect(String(reminder?.payload.body)).toContain(
        "sent now because your checklist was created after that day had already passed",
      );
    });

    it("calls an ungated controlling minimum a countdown even when the plan has a gated row", async () => {
      // THE CASE THE PROXY GETS WRONG. `planHasGatedFiling` is true if ANY row is gated; the
      // question is whether the row that PRODUCED the number is. A park event with a closer
      // ordinary filing deadline has both, and the copy then called an ungated countdown a window
      // width. Here the controlling minimum is 5 days from an UNGATED requirement, while a gated
      // one sits behind it at 40.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 40,
        latestApplyDate: dayFromToday(30),
        applyAfterDate: dayFromToday(21),
        laterDated: { latestApplyDate: dayFromToday(5), slackDays: 5 },
      });
      await pool.query(
        `UPDATE permit_plans SET verdict_detail = jsonb_set(verdict_detail, '{minSlackDays}', '5')
          WHERE id = $1`,
        [planId],
      );
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const warning = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      // The controlling requirement is ungated, so the number IS a countdown and is anchored.
      expect(warning?.payload.subject).toBe(`At risk — apply within 5 days of ${todayInJurisdiction("US-NY-NYC")}`);
      expect(String(warning?.payload.body)).toContain("measured from the plan's evaluation date");
      expect(String(warning?.payload.body)).not.toContain("WIDTH of the window");
    });

    it("cancels a slack warning whose controlling window shut during an outage", async () => {
      // The sweep excluded this by TYPE, because a plan-level warning has no checklist item to join
      // through. So an immediate warning that failed during an outage, whose window shut before
      // delivery recovered, was still selected by the due query and went out saying "apply within N
      // days" that scheduling would now refuse to create. The type filter was a way of not asking
      // the question; the warning now carries its own controlling date so it can be asked.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(9),
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }
      const warning = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      expect(warning).toBeDefined();
      await pool.query("UPDATE alerts SET status = 'failed', failure_count = 1 WHERE id = $1", [
        warning?.id,
      ]);
      // The outage outlasted the window the number counted down to.
      await pool.query(
        `UPDATE alerts SET payload = payload || jsonb_build_object('controlling_apply_by', $2::text)
          WHERE id = $1`,
        [warning?.id, dayFromToday(-1)],
      );
      const provider = fakeProvider();

      await createAlertPoller({
        database: pool,
        senders: provider.senders,
        jurisdiction: ruleset.jurisdiction,
      }).tick();

      expect(provider.attempts).toHaveLength(0);
      const after = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      expect(after?.status).toBe("cancelled");
    });

    it(
      "does not make a full batch wait an interval for the rest",
      async () => {
        // THE THIRD TIME THIS SHAPE HAS BITTEN, so the fix is the distinction rather than the case.
        // The scan is capped, so a tick that fills its batch has NOT reached the end of the work —
        // but with every send succeeding it reported no shortfall at all, `start` read that as a
        // finished tick, and the overflow waited a whole interval. Round 16 was the same missing
        // distinction with an all-skipped tick. The summary now says whether it drained the queue,
        // so both cases and any future one collapse into one question.
        const eventId = await createEvent(scenario("C"));
        const overflow = 97;
        await pool.query(
          `INSERT INTO alerts (id, event_id, alert_type, channel, recipient, idempotency_key,
                               send_at, status, payload)
           SELECT gen_random_uuid(), $1, 'slack_warning', 'email', 'organizer@example.test',
                  $2 || ':batch:' || step, current_timestamp - interval '1 minute', 'pending',
                  '{"subject":"s","body":"b"}'::jsonb
             FROM generate_series(1, $3) AS step`,
          [eventId, `${eventId}`, overflow],
        );
        const provider = fakeProvider();
        const poller = createAlertPoller({
          database: pool,
          senders: provider.senders,
          jurisdiction: ruleset.jurisdiction,
        });
        const startedAt = Date.now();

        poller.start();
        try {
          await vi.waitFor(
            async () => {
              const { rows } = await pool.query<{ pending: string }>(
                "SELECT count(*)::text AS pending FROM alerts WHERE event_id = $1 AND status <> 'sent'",
                [eventId],
              );
              expect(rows[0]?.pending).toBe("0");
            },
            { timeout: 30_000, interval: 250 },
          );
        } finally {
          poller.stop();
        }

        // The whole set went out without waiting for the next scheduled scan, which is the bound
        // the overflow used to miss with a healthy provider and an otherwise empty queue.
        expect(Date.now() - startedAt).toBeLessThan(POLL_INTERVAL_MS);
        expect(provider.delivered.length).toBe(overflow);
      },
      45_000,
    );

    it("reports a full batch as not drained", async () => {
      // The statement the poller now reads, asserted directly so the classification is pinned and
      // not only its consequence.
      const eventId = await createEvent(scenario("C"));
      await pool.query(
        `INSERT INTO alerts (id, event_id, alert_type, channel, recipient, idempotency_key,
                             send_at, status, payload)
         SELECT gen_random_uuid(), $1, 'slack_warning', 'email', 'organizer@example.test',
                $2 || ':full:' || step, current_timestamp - interval '1 minute', 'pending',
                '{"subject":"s","body":"b"}'::jsonb
           FROM generate_series(1, 97) AS step`,
        [eventId, `${eventId}`],
      );
      const provider = fakeProvider();

      const summary = await createAlertPoller({
        database: pool,
        senders: provider.senders,
        jurisdiction: ruleset.jurisdiction,
      }).tick();

      expect(summary.sent).toBeGreaterThan(0);
      expect(summary.abandoned).toBe(0);
      // Everything it claimed succeeded, and it still did not reach the end.
      expect(summary.drained).toBe(false);
    });

    it("sizes a first pass to the budget left after the polling delay", async () => {
      // THE BOUND, IN TIME, not the formula restated. AC 2 runs from `send_at`; the tick's clock
      // starts at the tick. An alert that fell due just after a scan has already spent a whole
      // polling interval before anything looks at it, so a pass sized against the FULL bound hands
      // the provider a budget the alert no longer has. Ninety-five email sends timing out at ten
      // seconds each is eleven waves, and the healthy one behind them started about 170 seconds
      // from its own send_at with every counter reporting health.
      //
      // What must hold is that a full first pass, at the provider's worst case, fits inside what
      // REMAINS of the bound. This is that sentence in milliseconds, and it fails for any cap that
      // breaks it rather than for one particular arithmetic.
      const concurrency = ALERT_POLLER_CONNECTIONS - 1;
      const worstCaseFirstPassMs = Math.ceil(MAX_ALERTS_PER_TICK / concurrency) * PROVIDER_TIMEOUT_MS;

      expect(worstCaseFirstPassMs).toBeLessThanOrEqual(DELIVERY_BOUND_MS - POLL_INTERVAL_MS);
      // And it is not trivially small: a cap of nothing would satisfy the line above.
      expect(MAX_ALERTS_PER_TICK).toBeGreaterThanOrEqual(concurrency);
    });

    it("delivers more than one pass worth without waiting an interval", async () => {
      // The smaller cap costs no throughput, because a scan that comes back at its limit reports
      // not-drained and the rescan is immediate. Passes before and after the cap change and is
      // here to catch a cap reduction that quietly halves delivery rate, not as evidence for it.
      const eventId = await createEvent(scenario("C"));
      const overflow = MAX_ALERTS_PER_TICK + 5;
      await pool.query(
        `INSERT INTO alerts (id, event_id, alert_type, channel, recipient, idempotency_key,
                             send_at, status, payload)
         SELECT gen_random_uuid(), $1, 'slack_warning', 'email', 'organizer@example.test',
                $2 || ':budget:' || step, current_timestamp - interval '1 minute', 'pending',
                '{"subject":"s","body":"b"}'::jsonb
           FROM generate_series(1, $3) AS step`,
        [eventId, `${eventId}`, overflow],
      );
      const provider = fakeProvider();
      const poller = createAlertPoller({
        database: pool,
        senders: provider.senders,
        jurisdiction: ruleset.jurisdiction,
      });
      const startedAt = Date.now();

      poller.start();
      try {
        await vi.waitFor(
          async () => {
            const { rows } = await pool.query<{ pending: string }>(
              "SELECT count(*)::text AS pending FROM alerts WHERE event_id = $1 AND status <> 'sent'",
              [eventId],
            );
            expect(rows[0]?.pending).toBe("0");
          },
          { timeout: 20_000, interval: 250 },
        );
      } finally {
        poller.stop();
      }

      expect(Date.now() - startedAt).toBeLessThan(POLL_INTERVAL_MS);
      expect(provider.delivered.length).toBe(overflow);
    }, 30_000);

    it("reports an empty scan as drained, so the rescan cannot spin", async () => {
      // The interaction to confirm rather than assume: a smaller cap fills more scans, and a full
      // scan respawns immediately. An empty one must not, or the poller would chase itself.
      const provider = fakeProvider();

      const summary = await createAlertPoller({
        database: pool,
        senders: provider.senders,
        jurisdiction: ruleset.jurisdiction,
      }).tick();

      expect(summary.sent + summary.failed).toBe(0);
      expect(summary.abandoned).toBe(0);
      expect(summary.drained).toBe(true);
    });

    it("keeps a tied slack warning alive until every controlling window has closed", async () => {
      // The same tie as the copy's, resolved the OTHER way, and both are the same rule: break it in
      // the direction that cannot harm the organizer. For copy that means never asserting a
      // deadline the sources do not publish. Here it means never silencing a warning that is still
      // true. Taking the earliest tied date cancelled the warning the moment the first requirement
      // expired, while another controlling window was still open — and the next scheduling pass
      // would recreate exactly what had just been cancelled, so after a long outage the at-risk
      // alert simply disappeared.
      //
      // BOTH must be open when the warning is written, or there is no tie to break: a requirement
      // that has already closed is not a controlling candidate at all.
      const eventId = await createEvent(scenario("C"));
      const { planId } = await insertDuePlan(eventId, {
        verdict: "feasible_at_risk",
        minSlackDays: 9,
        latestApplyDate: dayFromToday(1),
        laterDated: { latestApplyDate: dayFromToday(20), slackDays: 9 },
      });
      const client = await pool.connect();
      try {
        await schedulerWith()(client, eventId, planId, {
          email: "organizer@example.test",
          phone: null,
        });
      } finally {
        client.release();
      }

      const warning = (await alertsOf(eventId)).find((row) => row.alert_type === "slack_warning");
      expect(warning).toBeDefined();
      // The LAST of the tied dates, which is the day the number stops being true of anything. With
      // the earliest, tomorrow's expiry would cancel a warning whose other controlling window has
      // nineteen days left.
      expect(warning?.payload.controlling_apply_by).toBe(dayFromToday(20));
    });

    it("keeps retrying through a provider outage without losing an alert", async () => {
      const eventId = await createEvent(scenario("C"));
      await schedulePastDue(eventId);
      const provider = fakeProvider();
      provider.fail = "email provider unreachable: ECONNREFUSED";
      const poller = createAlertPoller({ database: pool, senders: provider.senders, jurisdiction: ruleset.jurisdiction });

      // The first retry is immediate: one failure is usually a blip, and waiting on it would spend
      // the delivery budget on a provider that is probably fine.
      await poller.tick();
      await poller.tick();

      const outage = await alertsOf(eventId);
      expect(outage.every((row) => row.status === "failed")).toBe(true);
      expect(outage.every((row) => row.failure_count === 2)).toBe(true);

      // From the second failure the row steps out of the batch for a while, so a destination that
      // will never accept anything stops consuming every scan. Nothing is dropped — the row is
      // still there, still failed, still carrying its count.
      await poller.tick();
      expect((await alertsOf(eventId)).every((row) => row.failure_count === 2)).toBe(true);

      // And it comes straight back the moment it is eligible again, which is what the spec's
      // outage edge case asks for: the poller keeps retrying and nothing is lost.
      await pool.query("UPDATE alerts SET next_attempt_at = NULL WHERE event_id = $1", [eventId]);
      provider.fail = null;
      await poller.tick();
      expect((await alertsOf(eventId)).every((row) => row.status === "sent")).toBe(true);
    });
  });
});

describe("the day an alert is sent on", () => {
  it("sends in the jurisdiction's morning rather than at UTC midnight", () => {
    // A deadline is a calendar day in the city that publishes it. 09:00 in New York is 13:00Z in
    // summer and 14:00Z in winter, and neither is the previous evening — which UTC midnight is.
    expect(instantAtLocalHour("US-NY-NYC", "2026-08-19", 9).toISOString()).toBe(
      "2026-08-19T13:00:00.000Z",
    );
    expect(instantAtLocalHour("US-NY-NYC", "2026-01-19", 9).toISOString()).toBe(
      "2026-01-19T14:00:00.000Z",
    );
  });

  it("refuses a jurisdiction with no mapped clock rather than assuming UTC", () => {
    expect(() => instantAtLocalHour("US-CA-LA", "2026-08-19", 9)).toThrow(
      'no local time zone is mapped for jurisdiction "US-CA-LA"',
    );
  });
});

// The delivery adapters need no database: they are the seam between the poller and a provider.
describe("F-203 delivery channels (AC 5)", () => {
  const message: AlertMessage = {
    recipient: "organizer@example.test",
    subject: "File your Special Event Permit by 2026-08-26",
    body: "…",
    idempotencyKey: "event:item:deadline_reminder:email:2026-08-19",
  };

  it("sends email through Resend and hands it the idempotency key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sender = createResendEmailSender({
      apiKey: "re_test",
      from: "PopEngine <noreply@example.test>",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response("{}", { status: 200 });
      }) as unknown as typeof globalThis.fetch,
    });

    expect(await sender(message)).toEqual({ simulated: false, label: null, provider: "resend" });
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect((calls[0]?.init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      message.idempotencyKey,
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: "PopEngine <noreply@example.test>",
      to: ["organizer@example.test"],
      subject: message.subject,
      text: message.body,
    });
  });

  it("treats a provider rejection as a retryable failure and echoes no provider body", async () => {
    const sender = createResendEmailSender({
      apiKey: "re_test",
      from: "PopEngine <noreply@example.test>",
      fetch: (async () =>
        new Response(JSON.stringify({ message: "organizer@example.test is suppressed" }), {
          status: 422,
        })) as unknown as typeof globalThis.fetch,
    });

    const error = await sender(message).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AlertDeliveryError);
    expect((error as Error).message).toBe("email provider rejected the send with status 422");
    // The provider's body can echo the recipient; it is contact data and does not go in a log.
    expect((error as Error).message).not.toContain("organizer@example.test");
  });

  it("abandons a provider that accepts the connection and never answers", async () => {
    // The poller sends sequentially with the row's transaction open, so an unbounded request does
    // not stall one alert — it stalls every alert behind it, past the two-minute delivery bound.
    const sender = createResendEmailSender({
      apiKey: "re_test",
      from: "PopEngine <noreply@example.test>",
      timeoutMs: 25,
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          // What a real half-open socket does under an abort signal: nothing, until the abort.
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })) as unknown as typeof globalThis.fetch,
    });

    const started = Date.now();
    const error = await sender(message).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AlertDeliveryError);
    expect((error as Error).message).toBe("email provider did not respond within 25ms");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("treats an unreachable provider as a retryable failure", async () => {
    const sender = createResendEmailSender({
      apiKey: "re_test",
      from: "PopEngine <noreply@example.test>",
      fetch: (async () => {
        throw new Error("socket hang up");
      }) as unknown as typeof globalThis.fetch,
    });

    await expect(sender(message)).rejects.toThrow("email provider unreachable: socket hang up");
  });

  it("fails rather than simulating when email is not configured", async () => {
    await expect(unconfiguredEmailSender()(message)).rejects.toThrow(AlertDeliveryError);
  });

  it("renders SMS as a labeled simulation while A2P registration is outstanding", async () => {
    const seen: AlertMessage[] = [];
    const delivery = await createSimulatedSmsSender((sent) => seen.push(sent))(message);

    expect(delivery).toEqual({
      simulated: true,
      label: SIMULATED_SMS_LABEL,
      provider: "simulated",
    });
    expect(SIMULATED_SMS_LABEL).toContain("not delivered");
    expect(seen).toEqual([message]);
  });

  it("picks live email only when both credentials are present, and always simulates SMS", async () => {
    const unconfigured = sendersFromEnv({});
    await expect(unconfigured.email(message)).rejects.toThrow("RESEND_API_KEY");
    await expect(sendersFromEnv({ RESEND_API_KEY: "re_test" }).email(message)).rejects.toThrow(
      "RESEND_API_KEY",
    );
    expect((await unconfigured.sms(message)).simulated).toBe(true);

    // Configured means a live sender rather than the refusing one. It is not called here: the
    // live adapter is covered above against an injected fetch, and this suite makes no network
    // requests.
    const configured = sendersFromEnv({ RESEND_API_KEY: "re_test", SMTP_FROM: "a@b.test" });
    expect(configured.email).not.toBe(unconfigured.email);
    expect((await configured.sms(message)).simulated).toBe(true);
  });
});
