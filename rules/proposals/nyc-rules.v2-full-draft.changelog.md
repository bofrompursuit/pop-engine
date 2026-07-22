# PopEngine NYC Ruleset v2 — Migration Notes

**Generated:** 2026-07-22  
**Input:** `nyc-rules.v1.json`  
**Output:** `nyc-rules.v2.json`  
**Ruleset:** `nyc.v2`  
**Schema:** `popengine-rules/v2`

## Summary

The original 13 broad rules were replaced with 59 granular rules and 4 safety/coverage advisories. The update removes universal assumptions that were contradicted by official sources and introduces threshold, classification, conflict, and unknown-state behavior.

## Material corrections

- SAPO is no longer modeled as a universal 60-day permit. Street Event deadlines are 14, 30, or 45 days; other SAPO classes have separate deadlines.
- Single Block Festival timing is marked `OFFICIAL_CONFLICT` because current CECM pages disagree.
- Parks events above 20 attendees are definite; exactly 20 is conditional because official pages disagree. Amplified sound or equipment can independently require a Parks application for smaller groups.
- NYPD sound requirements now include private-property sound audible on an adjacent public street, park, or place.
- Food rules now separately model vendor permits and the organizer's 30-day DOHMH notification.
- Generator rules use gasoline, diesel, outdoor-battery, and power thresholds. The unverified 45–60 day universal lead was removed.
- Temporary structure rules use DOB's official area, height, compound-size, and duration thresholds.
- Fuel permits and open-flame permits are separate FDNY categories.
- Assembly rules use the verified 75-person indoor/rooftop and 200-person outdoor thresholds, with TPA deadline and fee logic.
- SLA deadlines use actual business-day calculations and exact per-point-of-sale fees.
- SAPO insurance includes the explicit block-party-without-a-ride exception.

## Engine changes required

The v2 ruleset expects:

- Tri-state condition evaluation.
- Operators: `eq`, `bool`, `in`, `gt`, `gte`, `lt`, `lte`, `contains`, `contains_any`, and `is_null`.
- `dedupe_key` merging.
- `branch_field` and path evaluation.
- Actual New York business-day calendar math.
- Deadline types that may be excluded from verdict arithmetic.
- Official conflict, conditional, research-required, and coverage-gap statuses.
- Versioned historical plans.
- More detailed intake fields and derived classification values.

## Deliberately unresolved

1. **Single Block Festival deadline:** official CECM pages conflict between 90 days and December 31 of the preceding year.
2. **Parks threshold at exactly 20 attendees:** NYC Parks and NYC311 currently use different wording.
3. **FDNY/DOB exact lead times and fees:** permit categories and thresholds are verified, but no universal event lead was encoded without a primary-source basis.
4. **Exact SAPO insurance certificate wording:** the $1 million minimum and block-party exception are encoded; permit-class certificate-holder/additional-insured wording still needs confirmation.

## Validation performed

- JSON parses successfully.
- No duplicate rule or advisory IDs.
- Every trigger references a declared intake or derived field.
- Every trigger operator is declared in `engine_operators`.
- Every source URL is structurally valid.
- Every verification status is declared in `status_legend`.
