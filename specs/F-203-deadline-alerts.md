# F-203 · Deadline Alerts

**Phase:** 1 (core, week 2; happy path) · **Lane:** Dev 4 · **Depends on:** F-202 (scheduling happens at checklist creation) · **Feeds:** F-305/F-413 reuse the plumbing (post-MVP)

## User Story

As an independent organizer, I get an email/SMS before each filing deadline, including the ones that only unlock after another permit lands, so no agency window closes on me silently.

## Inputs

- `checklist_items` + their plan items' typed deadlines.
- Channels: SMTP (email), Twilio (SMS). Contact fields entered at checklist creation (no auth in MVP).

## Outputs

`alerts` rows, sent by the in-process poller (60s tick, ARCHITECTURE):

| alert_type | When scheduled |
|---|---|
| deadline_reminder | `latest_apply_date − 7 days` and `latest_apply_date − 1 day` per dated permit item |
| slack_warning | immediately at checklist creation when the plan verdict is FEASIBLE-AT-RISK ("apply within N days") |
| dependency_unlocked | at `apply_after_date` for gated items (Parks→NYPD) |

Reminder offsets (7/1) are config, not code.

## Acceptance Criteria

1. Materializing a checklist schedules the correct alert set from the plan's typed deadlines; findings with `research_required` deadlines schedule nothing (no invented dates) and are listed in the checklist as "confirm lead time with agency."
2. The poller sends due alerts within 2 minutes of `send_at`, marks sent/failed, and retries failures on later ticks. Every alert row carries a `recipient` and an `idempotency_key`; a crash between send and mark-sent cannot double-send, and regeneration cancels obsolete pending alerts (status `cancelled`) rather than deleting them.
3. Hard floors are never softened: reminder copy for Parks-derived deadlines states "applications within 21 days of the event are not accepted."
4. Dependency alerts fire in sequence: for Scenario C's fixture, the sound-permit alert is gated on the Parks timeline, and copy names the dependency ("your Parks permit decision window has passed; file your NYPD sound permit at the precinct now").
5. Email path works end-to-end live. SMS: if Twilio A2P approval is in hand, live send; otherwise the in-product labeled simulation (DESIGN.md fallback; decision deadline end of week 1 per OPEN-QUESTIONS P-2).
6. `POST /api/events/:id/alerts/test` fires one real alert immediately (demo utility, visibly labeled "test").
7. Rescheduling: plan regeneration + checklist review recomputes pending alerts; sent alerts are never re-sent.

## Phase 1 Scope Cut

Happy path only. Escalations, digests, team reminders, per-user preferences: Phase 2 (F-203 full, per ROADMAP).

## Edge Cases

- `send_at` already past at scheduling time (e.g. checklist created inside the 7-day window): send the reminder immediately once, don't drop it.
- Event date edited after scheduling: pending alerts recomputed on regeneration; stale pending alerts for removed items are cancelled.
- Twilio/SMTP outage: alerts stay pending with failure count; poller keeps retrying; nothing is lost.

## Answer-Key Scenarios Exercised

- C (dependency_unlocked sequencing).
- D (slack_warning: "apply within 10 days").
- A-rescoped (standard deadline_reminders on the private-venue plan).
