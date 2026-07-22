# F-202 · Compliance Checklist & Status Tracker

**Phase:** 1 (core, week 2) · **Lane:** Dev 3 · **Depends on:** F-201 · **Feeds:** F-203 (alert scheduling), F-204 (portal links render on checklist items)

## User Story

As an independent organizer, I turn my permit plan into a living checklist where I track each application's status and keep its documents, so execution has one home instead of seven agency portals.

## Inputs

- Latest `permit_plans` + `permit_plan_items` for the event.
- User actions: status changes, notes, file uploads.

## Outputs

- `POST /api/events/:id/checklist` → `checklist_items` rows (one per permit/insurance plan item; advisories render as read-only context, not trackable tasks). Creation also schedules F-203 alerts.
- `PATCH /api/checklist-items/:id` → status/notes update.
- `POST /api/checklist-items/:id/documents` → upload streamed to S3-compatible storage; metadata row in `documents`.
- `GET /api/documents/:id/url` → short-lived signed download URL.

## Acceptance Criteria

1. One click converts the latest plan into a checklist; each item stays linked to its plan item (and thus rule, deadline, citation, portal).
2. Statuses: not_started → in_progress → submitted → approved / rejected; any transition is allowed (agencies are messy), current status always visible per item and rolled up per event.
3. Document upload accepts PDF/PNG/JPG up to 10 MB; the file lands in object storage; download works via signed URL; nothing binary in Postgres.
4. Notes persist per item.
5. Checklist shows each item's `latest_apply_date` (and `apply_after_date` when gated) so the deadline context lives where the work happens.
6. Regenerating the plan (rescope) prompts: existing checklist is kept but flagged "plan has changed; review items" with items no longer in the new plan struck through, new items appended. Nothing is silently deleted.
7. Demo path: Scenario A rescope → plan passes → checklist created → one status flipped and one document uploaded live.

## Edge Cases

- Checklist created twice: idempotent; second call returns the existing checklist rather than duplicating.
- Upload failure (S3 unreachable): item keeps state, user sees a retryable error; no orphan metadata row.
- Plan with zero permit items (Scenario B): checklist creation is offered but produces an empty state with the advisories shown ("nothing to track; keep confirmation notes here if you like").

## Answer-Key Scenarios Exercised

- A (demo path: rescoped plan → checklist).
- B (empty-checklist state).
- C (gated item shows apply_after date on the checklist).
