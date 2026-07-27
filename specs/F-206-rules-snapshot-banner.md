# F-206 · Rules Snapshot Banner

**Status:** APPROVED (2026-07-25; Acceptance Criterion 4's mixed-checklist clause amended 2026-07-26, product-owner approved, resolving SPEC-CONFLICT #115) · **Reviewer/approver:** product owner + affected lane owners via the approval PR · **Owner:** see Lane below · see `docs/BASELINE.md`.
**Phase:** 1 (core, week 1) · **Lane:** Dev 2 · **Depends on:** F-201 output for plan views; F-202 Acceptance Criterion 8 before checklist integration · **Feeds:** trust; the demo states the snapshot date on screen

## User Story

As an independent organizer, I can see which published rules snapshot produced my plan, each requirement's verification state, and where it comes from, so I can judge the output and know its shelf life.

## Inputs

- `GET /api/rules/meta` → `{ruleset_version, snapshot_date}` from the loaded rules file.
- Per-line immutable `sources` snapshot (citation + every URL), primary `source_url`, `verification_status` (the badge value; canonical, NOT NULL, constrained), and nullable `last_verified_date` on `permit_plan_items`. A date is stored only when every contributing published rule provides one; a finding merged from multiple rules uses the earliest contributing date, otherwise it stores null. (The nullable `verified_status` column is a deprecated duplicate, do not use it; see ARCHITECTURE and issue #76.)

## Outputs

- A banner on every plan view: "Rules snapshot nyc.v2.8 · published July 26, 2026". Never "verified as of" — a snapshot date means published-on, not all-facts-verified-on.
- Per-line verification-status rendering plus either citation click-through or the explicit source-not-established COVERAGE_GAP state.
- Per-line "last verified" date only when the immutable plan item stored one; never substitute the ruleset snapshot date.

## Acceptance Criteria

1. The banner renders on every plan and checklist view, populated from stored data and never from hardcoded copy. A checklist's top banner names its current plan. If a retained row comes from a different snapshot, that row also shows its originating `ruleset_version` and `snapshot_date`; rows from the current snapshot do not repeat the banner. AC 4 names which stored data: a view with a plan in context reads that plan's row, so this criterion is about never hand-writing the version or date into the markup, not about reading the live file.
2. Every plan line shows its verification status. A source-bearing line shows its citation; a source-less COVERAGE_GAP line visibly says no source is published instead of inventing one. RESEARCH_REQUIRED renders "confirm with agency" visibly (not hidden in a tooltip), and OFFICIAL_CONFLICT lines render both readings with both sources.
3. Clicking a citation opens the source URL; lines whose portal/source URL is still unresolved render the citation text without a dead link.
4. The plan's pinned `ruleset_version` **and `snapshot_date`** are shown (both from `permit_plans`, not from the live file), so an old plan viewed after a rules update displays the version that produced it and the publication date that version carried. The two travel together: showing a pinned version beside the live file's date would render a pair that never existed. `GET /api/rules/meta` remains the live file's values and is for surfaces with no plan in context; it is not the plan banner's source.
   **Legacy plans:** a plan generated before migration 002 has a null `snapshot_date`. The banner renders the pinned version and says the publication date was not recorded for that plan — it never falls back to the live file's date, which would pair a pinned version with a date it never carried, and it is never backfilled, because the plan does not record which artifact it read and a derived date would assert provenance nothing witnessed. The version alone is still the honest answer to "which rules produced this".
   **Mixed checklists:** each row reads the source plan exposed by F-202 Acceptance Criterion 8, and never the live rules file. Which plan that is depends on whether the latest plan still raises the requirement, because a row's provenance names the plan its displayed values came from: the pair has to be one that existed.
   - A **dropped** row, struck through because the latest plan no longer raises it, keeps the dates of the last plan that did and is attributed to that plan, which is its persisted plan item. Never the checklist's current plan.
   - A **still-required** row is attributed to the latest plan. That plan raised it too, since a surviving requirement is raised by every plan that includes it, and it is the plan whose recalculated dates the row displays (PRD principle 6). Attributing it to the persisted item instead would print a version beside recalculated dates it never produced, which is the pair this criterion forbids.

   Written as two cases because conflating them produced SPEC-CONFLICT #115. The earlier wording said a retained row is _never_ attributed to the current plan, which is true of a dropped row and false of a still-required one, and that was the only sentence the two readings actually collided on. F-202 Acceptance Criterion 8 is unchanged and agrees once read on its own terms: its "last plan that raised it" is the latest plan for a requirement that survives, and its purpose clause, never copied from the live rules file and never duplicated into checklist storage, guards the same thing this criterion does. Its "through its existing plan-item relationship" describes where the values are found, not a rule that provenance must lag them. In both cases above the values and the provenance are read off one object, so neither can print a pair that never existed.

5. A missing `last_verified_date` renders no date and no implied verification date; snapshot publication date and per-line verification date remain distinct.
6. Demo check: the banner is visible in every screen of the demo path (DESIGN.md demo plan step 5 includes a live citation click-through).

## Edge Cases

- Live ruleset version ≠ plan's pinned version (post-MVP rule update): banner shows the plan's version plus "a newer ruleset exists; regenerate to update". (Cheap now; required later by F-503/F-713.)
- Citation present but source URL unresolved: render citation text without a link.
- Source-less COVERAGE_GAP: render the status plus "source not yet established", with no citation link.

## Answer-Key Scenarios Exercised

All six indirectly (every source-bearing plan line carries citations; a source-less COVERAGE_GAP carries its explicit no-source state); Scenario B exercises caveat rendering (assembly-threshold and DOHMH-exemption confirmations); Scenario D or the exactly-20 fixture exercises OFFICIAL_CONFLICT rendering.
