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
9. **Moved computed deadline.** This criterion applies to a row the latest plan still raises, and only to one. A **dropped** row — kept and struck through by Acceptance Criterion 6 because the latest plan no longer raises the requirement — has no item in the latest plan, so there is no current date and no current deadline state for it to be compared against: the comparison below has one operand, not two. Such a row never carries a moved-deadline notice. It is not silent about anything as a result: the strike-through already says the requirement is no longer raised, and its dates remain the last plan's that did raise it, attributed to that plan, which is F-206 Acceptance Criterion 4's rule and not this one's to restate. Stated here because an implementation reading only the comparison would find no matching item and have to invent an answer.

   For a row the latest plan does raise, the comparison is of two `latest_apply_date`s, and they come from two different places. The **previous** one is on the plan item the row is persisted against, reached through `checklist_items.plan_item_id`: the plan the checklist was last converted or reviewed against. The **current** one is on the latest plan's item for the same requirement, found by matching the requirement across plans the way the checklist already matches it, on its set of rule ids. "Previous" and never "earlier": the two are in a known sequence but not a known order, because a recalculated deadline can land later than the one it replaces as readily as sooner, and calling it the earlier date would state a relationship the dates do not carry — the kind of claim this criterion exists to refuse, made inside its own copy. Two lookups against two plans, named separately here because reading the persisted item twice would compare a date with itself and never report a change. Neither date is copied into checklist storage and neither is read from the live rules file. Which plan's values the row DISPLAYS is not this criterion's rule and is unchanged by it: a still-required row displays the latest plan's recalculated dates, per F-206 Acceptance Criterion 4. This states the previous date; it does not reinstate it.

   Either side of the comparison can be absent, and an absent date does not mean one thing. The engine already separates the cases and the row reads its answer rather than inferring one from the null: `deadline_status` is `not_applicable` when no dated filing window applies at all — the rule publishes no deadline, or publishes `before_issuance`, which is listed with its parent permit and never dated independently — and `not_calculable` when a window does apply and no date could be produced for it, which is the state every `business_days_minimum` finding is in for as long as no holiday list is published for the pinned calendar (SPEC-CONFLICT #130), and also the state of a `research_required` lead time. Where the engine states why, it does so in `timeline_unresolved_reason` or `deadline_unknown_fields`; a `research_required` line has neither and carries "confirm with agency" instead.

   So the row compares **two** things, and the outcomes below are every combination of the two rather than a list of the situations anyone has thought of so far:

   - **The date** — the two `latest_apply_date`s. It moved when they differ, and one being absent while the other is not is a difference. Both absent is not.
   - **The deadline state** — what the row says about the deadline other than the date: the published deadline's own `type`, whether the finding is dated at all or is `not_calculable` or `not_applicable`, and `timeline_unresolved_reason` and `deadline_unknown_fields`. It moved when any of those differs. Two exclusions, both deliberate. `deadline_display` is not in it: that is published wording, and a ruleset rewording a note has not changed what applies. Neither is a move among `on_track`, `deadline_approaching` and `published_deadline_missed` while the date stands: those are one state here, because each plan computes them against its own `today`, so treating them as distinct would raise a notice every time the clock advanced past a threshold — which is the countdown doing its job, and Acceptance Criterion 5 already shows it where the work happens.

   |                    | state unchanged                | state moved                     |
   | ------------------ | ------------------------------ | ------------------------------- |
   | **date unchanged** | nothing moved; no notice       | the row states the state change |
   | **date moved**     | the row states the date change | the row states both             |

   The date change is stated in whichever of these shapes it takes:

   - **A date on both sides.** The row states that the deadline PopEngine computes for it has changed, naming both as the previous one and the current one.
   - **A date before, none now, and the current `deadline_status` is `not_calculable`.** A filing window still applies and PopEngine could not date it. The row says so, names the previous date, and carries the reason the finding gives — `timeline_unresolved_reason` or `deadline_unknown_fields` where there is one, the "confirm with agency" treatment Acceptance Criterion 5 already requires where there is not. A row an organizer has been working to a date must not fall silent at the moment that date becomes "confirm with agency".
   - **A date before, none now, and the current `deadline_status` is `not_applicable`.** Nothing failed: the requirement no longer carries a filing date of its own. The row says that, names the previous date, and must not describe it as a date that could not be computed — the two states mean different things to an organizer, and the published meaning is the one that survives.
   - **No date before, a date now.** The row states that a deadline is now computed for it, and names it.

   The state change is stated as what applied before and what applies now. Where the date did not move it is stated **on its own**, and the row must not describe a date as having changed, because none did — the date on screen is the one that was there, which is exactly why such a row would otherwise look untouched. That covers a requirement moving between `not_applicable` and `not_calculable`, the difference between no filing window applying and one applying that nobody can date yet; an unresolved reason changing while the status stays `not_calculable`, where a lead time no source publishes is a different answer from a published window whose arithmetic is waiting on a holiday list; and a requirement that keeps its computed date while its published deadline type changes underneath it. Where the date moved as well, both are stated and neither stands in for the other.

   Where the two plans pin different `ruleset_version`s, the row may additionally state that they were generated from different published rulesets and name both versions; it must not name that as the cause of the move, because one regeneration can pick up an intake edit and a ruleset change together, and nothing the row compares separates them. The notice is a per-row detail of the state Acceptance Criterion 6 flags, and clears with it: reviewing the checklist re-points the row at the latest plan, after which there are no longer two plans to compare.

   **In every one of those cases the notice must not say, imply, or link to anything about the organizer's filed application** — not that a filing needs amending, not that an agency should be contacted about it, not that a re-application may be required, not that any action is now expected of them, and equally not that nothing is required and the filing is unaffected. Both directions are claims, and neither is established by what the row can see.

   `latest_apply_date` is computed, and the inputs that move it are not all of one kind. A corrected published lead time, a boundary correction or a holiday calendar being published say nothing whatever about the organizer's event. A changed size or level input is the opposite: the event itself moved, and a filing already with an agency may well be affected by that — 50 RCNY 1-07 publishes an amendment procedure for exactly that situation for SAPO permits, and `docs/proposals/moved-filing-date-notice.md` §4 records that five of the seven requirements surveyed publish nothing comparable. What the row cannot do is tell those causes apart. It compares two dates and two deadline states; a regeneration can pick up an intake edit and a ruleset change together, which is the same reason a differing `ruleset_version` may not be named as the cause. So the honest statement is the narrow one: **a change in the deadline PopEngine computes does not by itself establish anything about a filed application, in either direction.** Where an organizer's event has genuinely changed, what that requires of an existing filing is a question about their event and their agency's published procedure, and F-202 has no approved criterion for answering it on a checklist row — that claim was proposed, and rejected, in resolving SPEC-CONFLICT #121.

## Edge Cases

- Checklist created twice: idempotent; second call returns the existing checklist rather than duplicating.
- Upload failure (S3 unreachable): item keeps state, user sees a retryable error; no orphan metadata row.
- Plan with zero trackable permit/insurance items (synthetic edge case, not Scenario B): checklist creation is offered but produces an empty state with read-only context shown ("nothing to track; keep confirmation notes here if you like").

## Answer-Key Scenarios Exercised

- A (demo path: rescoped plan → checklist).
- B (one conditional DOHMH permit item plus read-only context).
- C (gated item shows apply_after date on the checklist).
