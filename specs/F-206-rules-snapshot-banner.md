# F-206 · Rules Snapshot Banner

**Phase:** 1 (core, week 1) · **Lane:** Dev 2 · **Depends on:** F-201 output · **Feeds:** trust; the demo states the snapshot date on screen

## User Story

As an independent organizer, I can see when the rules behind my plan were last verified and where each requirement comes from, so I can trust the output and know its shelf life.

## Inputs

- `GET /api/rules/meta` → `{ruleset_version, snapshot_date}` from the loaded rules file.
- Per-line immutable `sources` snapshot (citation + every URL), primary `source_url`, `verification_status` (the badge value; canonical, NOT NULL, constrained), and `last_verified_date` on `permit_plan_items`. (The nullable `verified_status` column is a deprecated duplicate, do not use it; see ARCHITECTURE and issue #76.)

## Outputs

- A banner on every plan view: "Rules snapshot nyc.v2.3 · published July 25, 2026". Never "verified as of" — a snapshot date means published-on, not all-facts-verified-on.
- Per-line citation + verification-status rendering with click-through to the official source.

## Acceptance Criteria

1. The banner renders on every plan and checklist view, populated from stored data and never from hardcoded copy. AC 4 names which stored data: a view with a plan in context reads that plan's row, so this criterion is about never hand-writing the version or date into the markup, not about reading the live file.
2. Every plan line shows its source citation and verification status; RESEARCH_REQUIRED renders "confirm with agency" visibly (not hidden in a tooltip), and OFFICIAL_CONFLICT lines render both readings with both sources.
3. Clicking a citation opens the source URL; lines whose portal/source URL is still unresolved render the citation text without a dead link.
4. The plan's pinned `ruleset_version` **and `snapshot_date`** are shown (both from `permit_plans`, not from the live file), so an old plan viewed after a rules update displays the version that produced it and the publication date that version carried. The two travel together: showing a pinned version beside the live file's date would render a pair that never existed. `GET /api/rules/meta` remains the live file's values and is for surfaces with no plan in context; it is not the plan banner's source.
   **Legacy plans:** a plan generated before migration 002 has a null `snapshot_date`. The banner renders the pinned version and says the publication date was not recorded for that plan — it never falls back to the live file's date, which would pair a pinned version with a date it never carried, and it is never backfilled, because the plan does not record which artifact it read and a derived date would assert provenance nothing witnessed. The version alone is still the honest answer to "which rules produced this".
5. Demo check: the banner is visible in every screen of the demo path (DESIGN.md demo plan step 5 includes a live citation click-through).

## Edge Cases

- Live ruleset version ≠ plan's pinned version (post-MVP rule update): banner shows the plan's version plus "a newer ruleset exists; regenerate to update". (Cheap now; required later by F-503/F-713.)
- Missing source URL on a line (should be impossible given rules-file validation): render citation text, log loudly.

## Answer-Key Scenarios Exercised

All six indirectly (every plan line carries citations); Scenario B exercises caveat rendering (assembly-threshold and DOHMH-exemption confirmations); Scenario D or the exactly-20 fixture exercises OFFICIAL_CONFLICT rendering.
