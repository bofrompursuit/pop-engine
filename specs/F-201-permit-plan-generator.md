# F-201 · Permit Plan Generator

**Status:** APPROVED (2026-07-24) · **Reviewer/approver:** product owner · **Owner:** see Lane below · see `docs/BASELINE.md`.
**Phase:** 1 (core, week 1) · **Lane:** Dev 1 · **Depends on:** F-101, ruleset nyc.v2.2 ratified (BASELINE.md) · **Feeds:** F-102, F-202, F-203, F-204
**Updated:** 2026-07-22 for the nyc.v2.2 baseline.

## User Story

As an independent organizer, I get the complete list of requirements my specific event triggers, with the agency, deadline, fee, portal, and official source the ruleset publishes for each one, so I stop guessing what the city wants.

## Inputs

- An `events` row (F-101 fields) + its `revision_counter`.
- `rules/nyc-rules.v2.2.json` (authoritative, loaded in-memory at boot; AD-2/AD-9).
- `today` and the pinned holiday calendar (injected; the engine never reads the clock; AD-6/AD-11).

## Outputs

- One immutable `permit_plans` row (verdict via F-102, `ruleset_version`, `event_revision`, `intake_snapshot`) + `permit_plan_items` findings: kind (permit / insurance / notification / registration / eligibility / prohibition / dependency / advisory / note), disposition (required / may_be_required / prohibited_or_ineligible / advisory / no_new_requirement), agency, typed deadline + `latest_apply_date` + deadline_status, fee display, portal, complete source snapshots + verification status, every contributing rule ID, and the triggering answers.
- `agency` is present on findings whose kind directs the organizer to act with a body (permit, insurance, notification, registration, eligibility, prohibition, dependency) and is boot-validated for those kinds. `advisory`, `note` and `classification` findings describe a condition rather than a filing and may carry none (#77); the engine never infers one from a rule ID or title.
- A finding's kind is the kind of the finding emitted, which equals the rule's kind for every rule except `classification`. A `classification` rule (`SAPO-SCOPE-001`) persists as kind `note` with disposition `no_new_requirement`, keeping its rule ID in `rule_ids` for provenance; `classification` is never a persisted finding kind (#73).
- API: `POST /api/events/:id/plan` → plan + findings; `GET /api/events/:id/plan` → latest.

## Acceptance Criteria — General

1. Every finding references its rule ID and the intake answers that triggered it; dedupe-merged findings retain every contributing rule.
2. Every finding renders source citation + verification status. RESEARCH_REQUIRED renders "confirm with agency"; OFFICIAL_CONFLICT renders **both readings with both sources** (never silently resolved); COVERAGE_GAP advisories assert nothing.
3. Same event revision + same ruleset version + same `today` + same calendar → byte-identical **evaluation result** (verdict, finding set, and every computed date and status). Persistence identity is excluded: each generation is a new immutable `permit_plans` row, so `id` and `generated_at` differ by design (`ARCHITECTURE.md` permit_plans). Determinism is asserted on the engine output and the plan snapshot, not on the row's identity columns.
4. The near-empty result is first-class: "no new city event requirement identified from your answers" plus triggered advisories and named confirmations (Scenario B). Over-prescribing and overclaiming emptiness are both failure modes.
5. Rule-evaluation failure returns an explicit error; a partial plan is never presented as complete; a failure never yields a "no requirement" result.
6. Boot validation: the api refuses to start if the ruleset fails schema check (33 rules + 4 advisories, all trigger fields declared).

## Acceptance Criteria — Fixture Suite

**The acceptance suite lives in `docs/test-scenario-answer-key.md` (v3): six scenarios (A–F) plus the boundary/unit fixture list. It is derived from the ruleset and pinned to `today = 2026-07-22`. This spec deliberately does not duplicate the expected outputs — the fixture doc is the single copy.** Requirements:

7. All six scenarios pass: expected finding sets match exactly (kind + disposition + finding), 0 false omissions, 0 false additions, verdicts and rescope results match.
8. All boundary fixtures pass: park headcount 19/20/21; block party ± sales/ride; tent 399/400/401 sq ft; stage 2.0/2.5 ft × 119/120 sq ft; generator 2.5/2.6 gal; 39.9/40 kW; battery 20/20.1 kWh; street size unknown; other_sapo_class advisory; obstructs_public_way = no.
9. Scenario A's three rescopes are produced by full re-evaluation (size=medium → AT-RISK 5 days; size=small → AT-RISK on the DOHMH notification; private venue → SAPO + insurance drop), never by static text.
10. Scenario F's business-day computation counts actual business days (14 remaining vs 15 required) against the pinned calendar.

## Edge Cases

- OFFICIAL_CONFLICT rules (PARKS-TUA-001, PARKS-EVENT-EXACTLY-20-001) render as MAY_BE_REQUIRED with the conflict text; they never flip a verdict to INFEASIBLE on their own.
- Eligibility conflicts (block party + sales) render PROHIBITED_OR_INELIGIBLE with rescope guidance; the permit finding still lists so the user sees both.
- `research_required` deadlines are excluded from verdict/slack arithmetic but always listed.
- Uncollected/inapplicable branch fields evaluate per the registry's asked-when scoping; a field never asked is not a material unknown.

## Fixture Scenarios Exercised

All six + the boundary list, as the automated acceptance suite (Dev 1's lane gate and the green-gate criterion in DESIGN.md).
