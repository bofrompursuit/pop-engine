# F-101 · Event Intake Questionnaire

**Phase:** 1 (core, week 1) · **Lane:** Dev 2 · **Depends on:** events schema (Phase 0) · **Feeds:** everything (single source of truth)

## User Story

As an independent organizer, I describe my event once in plain language, in under 2 minutes, so PopEngine can tell me which permits I need and whether my date works.

## Inputs

Form fields, mapping 1:1 to `events` columns (ARCHITECTURE.md):

| Field | Type | Notes |
|---|---|---|
| name | text | event title |
| borough | enum: manhattan, brooklyn, queens, bronx, staten_island | |
| location_type | enum: street, sidewalk, plaza, park, private_venue | |
| street_event_kind | enum: residential_block_party, other | shown only when location_type = street |
| location_name | text | free text |
| headcount | integer > 0 | |
| event_date | date, future | |
| food_format | enum: none, prepackaged_free, free_sampling, served_sold, catered_private | plain-language labels in UI |
| amplified_sound | boolean | |
| structures | boolean | |
| structure_length_ft / structure_width_ft | integers, shown only when structures = true | may be left blank ("I don't know") |
| open_flame | boolean | |
| alcohol | boolean | |
| venue_has_liquor_license | enum: yes, no, unknown | shown only when alcohol = true AND location_type = private_venue; "I don't know" maps to unknown |
| power_generator | boolean | |

## Outputs

- `POST /api/events` → created event row; validation errors returned per-field.
- `PATCH /api/events/:id` → updated row; response flags any existing plan as stale (recalculate, don't patch).

## Acceptance Criteria

1. All six answer-key scenarios are enterable exactly as specified in F-201's fixture table; entering each produces an event row with the mapped field values.
2. Conditional fields appear only when relevant: street_event_kind (street), structure dimensions (structures = true), venue_has_liquor_license (alcohol + private venue).
3. "I don't know" is accepted for venue_has_liquor_license (stored as `unknown`) and structure dimensions (stored NULL); unknowns are never silently defaulted.
4. Contradiction checks block submission with a specific message, never silently resolve:
   - structure dimensions entered while structures = false
   - venue_has_liquor_license set while alcohol = false or venue is public
   - event_date in the past
   - headcount ≤ 0
5. Coverage warning (OPEN-QUESTIONS I-9, resolved 2026-07-22): selecting alcohol = true with a public location_type (street/sidewalk/plaza/park) shows an inline, non-blocking warning: "Alcohol in public space is not covered by this ruleset version; requirements will not be evaluated. Confirm with the relevant agency." The plan additionally carries advisory A3. Neither surface asserts any requirement.
6. Intake completes in under 2 minutes for a first-time user (rehearsal-timed, PRD metric).
7. Works on mobile and desktop viewports.
8. Editing any field after a plan exists marks the plan stale in the UI and offers one-click regeneration.

## Edge Cases

- headcount exactly 20 in a park: triggers R2 (`gte 20`); 19 does not. Boundary test both.
- structures = true with blank dimensions: accepted; downstream R7 evaluates unknown → conditional plan item (do not force entry).
- catered_private is selectable only when location_type = private_venue (public-space catering isn't a modeled concept; prevents junk input).
- Rapid PATCH before plan generation completes: last write wins; plan always generated from a read of current row.

## Answer-Key Scenarios Exercised

All six (A–F) as input fixtures; see F-201 for the fixture table. Scenario F specifically exercises the unknown path; Scenario D exercises street_event_kind.
