# F-202 · Compliance Checklist & Status Tracker

**Status:** APPROVED (2026-07-25; moved-filing-date notice criteria added 2026-07-26, product-owner approved, resolving SPEC-CONFLICT #121) · **Reviewer/approver:** product owner + affected lane owners via the approval PR · **Owner:** see Lane below · see `docs/BASELINE.md`.
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
2. Statuses: not_started → in_progress → submitted → approved / rejected; any transition is allowed (agencies are messy), current status is always visible per item, and the event rollup counts current-plan items only. Retained items from an earlier plan are counted and labeled separately so the rollup never appears to omit visible rows.
3. Document upload accepts PDF/PNG/JPG up to 10 MB; the file lands in object storage; download works via signed URL; nothing binary in Postgres.
4. Notes persist per item.
5. Checklist shows each item's `latest_apply_date` (and `apply_after_date` when gated) so the deadline context lives where the work happens.
6. Regenerating the plan (rescope) prompts: existing checklist is kept but flagged "plan has changed; review items" with items no longer in the new plan struck through, new items appended. Nothing is silently deleted.
7. Demo path: Scenario A rescope → plan passes → checklist created → one status flipped and one document uploaded live.
8. The checklist response exposes each item's source plan `ruleset_version` and `snapshot_date` through its existing plan-item relationship. A retained row stays attributable to the last plan that raised it; the values are never copied from the live rules file or duplicated into checklist storage.
9. **Moved computed deadline.** A row compares two `latest_apply_date`s, and they come from two different places. The **earlier** one is on the plan item the row is persisted against, reached through `checklist_items.plan_item_id`: the plan the checklist was last converted or reviewed against. The **current** one is on the latest plan's item for the same requirement, found by matching the requirement across plans the way the checklist already matches it, on its set of rule ids. Two lookups against two plans, named separately here because reading the persisted item twice would compare a date with itself and never report a change. Neither date is copied into checklist storage and neither is read from the live rules file. Which plan's values the row DISPLAYS is not this criterion's rule and is unchanged by it: a still-required row displays the latest plan's recalculated dates, per F-206 Acceptance Criterion 4. This states the earlier date; it does not reinstate it.

   A requirement whose deadline the engine cannot compute carries no `latest_apply_date` at all — the state every `business_days_minimum` finding is in for as long as no holiday list is published for the pinned calendar (SPEC-CONFLICT #130) — so either side of the comparison can be absent, and all four combinations are covered:
   - **A date on both sides, and they differ.** The row states that the deadline PopEngine computes for it has changed, naming both as the earlier one and the current one.
   - **A date before, none now.** The row states that the date it previously computed no longer computes and names the earlier one; the item carries the uncomputable-deadline treatment Acceptance Criterion 5 already requires. A row an organizer has been working to a date must not fall silent at the moment that date becomes "confirm with agency".
   - **No date before, a date now.** The row states that a deadline is now computed for it, and names it.
   - **No date on either side, or the same date on both.** Nothing has moved, so no notice appears.

   Where the two plans pin different `ruleset_version`s, the row may additionally state that they were generated from different published rulesets and name both versions; it must not name that as the cause of the move, because one regeneration can pick up an intake edit and a ruleset change together and the two dates alone do not separate them. The notice is a per-row detail of the state Acceptance Criterion 6 flags, and clears with it: reviewing the checklist re-points the row at the latest plan, after which there are no longer two plans to compare.

   **In every one of those cases the notice must not say, imply, or link to anything about the organizer's filed application** — not that a filing needs amending, not that an agency should be contacted about it, not that a re-application may be required, not that any action is now expected of them. `latest_apply_date` is computed, so it moves whenever any input to it moves — a corrected published lead time, a changed size or level input, a boundary correction, a holiday calendar being published — and none of those is a fact about the organizer's event or about the application they filed, so a notice that reaches past the arithmetic tells someone to act on a filing that is exactly as valid as it was.

## Edge Cases

- Checklist created twice: idempotent; second call returns the existing checklist rather than duplicating.
- Upload failure (S3 unreachable): item keeps state, user sees a retryable error; no orphan metadata row.
- Plan with zero trackable permit/insurance items (synthetic edge case, not Scenario B): checklist creation is offered but produces an empty state with read-only context shown ("nothing to track; keep confirmation notes here if you like").

## Answer-Key Scenarios Exercised

- A (demo path: rescoped plan → checklist).
- B (one conditional DOHMH permit item plus read-only context).
- C (gated item shows apply_after date on the checklist).
