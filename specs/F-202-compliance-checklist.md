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
9. **Moved computed deadline.** A row compares two `latest_apply_date`s, and they come from two different places. The **previous** one is on the plan item the row is persisted against, reached through `checklist_items.plan_item_id`: the plan the checklist was last converted or reviewed against. The **current** one is on the latest plan's item for the same requirement, found by matching the requirement across plans the way the checklist already matches it, on its set of rule ids. "Previous" and never "earlier": the two are in a known sequence but not a known order, because a recalculated deadline can land later than the one it replaces as readily as sooner, and calling it the earlier date would state a relationship the dates do not carry — the kind of claim this criterion exists to refuse, made inside its own copy. Two lookups against two plans, named separately here because reading the persisted item twice would compare a date with itself and never report a change. Neither date is copied into checklist storage and neither is read from the live rules file. Which plan's values the row DISPLAYS is not this criterion's rule and is unchanged by it: a still-required row displays the latest plan's recalculated dates, per F-206 Acceptance Criterion 4. This states the previous date; it does not reinstate it.

   Either side of the comparison can be absent, and an absent date does not mean one thing. The engine already separates the cases and the row reads its answer rather than inferring one from the null: `deadline_status` is `not_applicable` when no dated filing window applies at all — the rule publishes no deadline, or publishes `before_issuance`, which is listed with its parent permit and never dated independently — and `not_calculable` when a window does apply and no date could be produced for it, which is the state every `business_days_minimum` finding is in for as long as no holiday list is published for the pinned calendar (SPEC-CONFLICT #130), and also the state of a `research_required` lead time. Where the engine states why, it does so in `timeline_unresolved_reason` or `deadline_unknown_fields`; a `research_required` line has neither and carries "confirm with agency" instead. So:
   - **A date on both sides, and they differ.** The row states that the deadline PopEngine computes for it has changed, naming both as the previous one and the current one.
   - **A date before, none now, and the current `deadline_status` is `not_calculable`.** A filing window still applies and PopEngine could not date it. The row says so, names the previous date, and carries the reason the finding gives — `timeline_unresolved_reason` or `deadline_unknown_fields` where there is one, the "confirm with agency" treatment Acceptance Criterion 5 already requires where there is not. A row an organizer has been working to a date must not fall silent at the moment that date becomes "confirm with agency".
   - **A date before, none now, and the current `deadline_status` is `not_applicable`.** Nothing failed: the requirement no longer carries a filing date of its own. The row says that, names the previous date, and must not describe it as a date that could not be computed — the two states mean different things to an organizer, and the published meaning is the one that survives.
   - **No date before, a date now.** The row states that a deadline is now computed for it, and names it.
   - **No date on either side.** No date to name is not the same as nothing having changed, and this case must not be read as a no-op. While both sides are undated, what the row has to say about the deadline is carried by the published deadline's own `type`, by `deadline_status`, and by the reason fields the engine fills when it cannot produce a date — `timeline_unresolved_reason` and `deadline_unknown_fields`. Where any of those differs between the two plan items, the meaning has moved although the date has not, and the row states that it has, naming what applied before and what applies now. It states no date, because there is none to state.

     Two shapes this takes, both material to an organizer and both invisible if the case were treated as a no-op. A requirement can move between `not_applicable` and `not_calculable` — between no filing window applying at all and a window applying that PopEngine cannot date, which is the difference between having no deadline and having one nobody can put a date on yet. And the unresolved reason itself can change while `deadline_status` stays `not_calculable`: a lead time no source publishes is a different answer from a published window whose arithmetic is waiting on a holiday list, and a row that showed the first and now means the second has changed what it is asking of the person reading it.

   - **The same date on both sides, with the same deadline type, status and reason.** Nothing has moved, so no notice appears.

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
