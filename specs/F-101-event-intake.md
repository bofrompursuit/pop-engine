# F-101 · Event Intake Questionnaire

**Status:** APPROVED (2026-07-24 by the product owner; see `docs/BASELINE.md`). Reviewer not yet recorded — governance §7 also asks for one.
**Phase:** 1 (core, week 1) · **Lane:** Dev 2 · **Depends on:** events schema (Phase 0), ruleset nyc.v2.1 ratified (BASELINE.md) · **Feeds:** everything (single source of truth)
**Updated:** 2026-07-22 for the nyc.v2.1 baseline.

## User Story

As an independent organizer, I describe my event once in plain language, so PopEngine can tell me which permits my specific event requires and whether my date works.

## Inputs

The field list, enums, and asked-when conditions come from the ruleset's `intake_fields` registry (`rules/nyc-rules.v2.1.json`) — **the registry is authoritative; do not duplicate or drift from it.** Field groups (mirrored by the `events` table in ARCHITECTURE.md):

1. **Identity:** name, borough, location_type, location_name
2. **SAPO classification** (public-way locations only): obstructs_public_way; sapo_event_type; street_event_size OR plaza_level + plaza_multiple_blocks; has_amusement_ride (block parties)
3. **Scale + date:** headcount, capacity (optional), event_date
4. **Audience + food:** event_open_to_public; food_present → food_vendor_count, private-function exception (non-public events); selling_anything
5. **Sound:** amplified_sound → sound_audible_from_public_way (private venues only)
6. **Structures:** structure_types multi-select → per-type dimensions (tent area/duration, stage height/area), structure_over_10ft_tall
7. **Flame + power:** open_flame_or_cooking multi-select; generator_present → gasoline/diesel gallons, kW; battery_system_kwh
8. **Alcohol + assembly** (private venues): alcohol → venue_license_covers_event_area; venue_has_assembly_approval (headcount ≥ 75)

## Outputs

- `POST /api/events` → created event row (revision_counter = 1); per-field validation errors.
- `PATCH /api/events/:id` → updated row; server bumps `revision_counter` and marks any existing plan stale.

## Acceptance Criteria

1. All six fixture scenarios (`docs/test-scenario-answer-key.md` v3) are enterable exactly as specified; each produces an event row with the mapped values.
2. Conditional fields appear only when triggered: SAPO classification only for obstructing public-way events; street size only for street events; plaza level only for plazas; dimensions only for selected structure types; audibility only for private-venue sound; license/assembly questions only when relevant. A typical event answers 10–15 questions.
3. "I don't know" is accepted wherever the registry declares an `unknown` value (street_event_size, plaza_level, sound_audible_from_public_way, venue_license_covers_event_area, venue_has_assembly_approval, structure_over_10ft_tall, obstructs_public_way) and stored as `unknown`, never silently defaulted. Numeric fields on a selected structure/generator may be left blank (stored NULL → engine evaluates unknown).
4. Contradiction checks block submission with a specific message, never silently resolve:
   - dimensions entered for an unselected structure type
   - sapo_event_type = block_party while selling_anything or alcohol is true → warn inline that this conflicts with block-party eligibility (submission allowed; the plan will show PROHIBITED_OR_INELIGIBLE)
   - generator specs without generator_present; license/assembly answers without their trigger conditions
   - event_date in the past; headcount ≤ 0
5. Coverage warning (inline, non-blocking): alcohol + public location renders "Alcohol in public space is not covered by this ruleset version; requirements will not be evaluated. Confirm with the relevant agency." The plan additionally carries ADV-ALCOHOL-PUBLIC-001.
6. Intake completes in under 2 minutes for a typical event (rehearsal-timed; PRD metric).
7. Works on mobile and desktop viewports.
8. Editing any field after a plan exists bumps `revision_counter` server-side, marks the plan stale in the UI, and offers one-click regeneration.

## Edge Cases

- headcount exactly 20 in a park: stored as-is; the engine renders the OFFICIAL_CONFLICT finding (fixture in the answer key). 19/20/21 boundary is an engine test, not an intake concern.
- structure selected with blank dimensions: accepted; downstream conditional finding requests them (do not force entry).
- tent_area_sqft exactly 400: accepted; the boundary CONDITIONAL is the engine's job.
- sapo_event_type = other_sapo_class: accepted; plan renders the coverage advisory with reference deadlines.
- Rapid PATCH before plan generation completes: last write wins; the plan pins the `revision_counter` it evaluated.

## Fixture Scenarios Exercised

All six (A–F) as input fixtures. A exercises street size classification; D exercises block-party fields; E exercises plaza level, structures, and generator specs; F exercises all three unknown branch facts.
