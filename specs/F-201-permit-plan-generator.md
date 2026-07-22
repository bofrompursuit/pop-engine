# F-201 · Permit Plan Generator

**Phase:** 1 (core, week 1) · **Lane:** Dev 1 · **Depends on:** F-101, `rules/nyc-rules.v1.json` (Phase 0) · **Feeds:** F-102, F-202, F-203, F-204

## User Story

As an independent organizer, I get the complete list of permits my specific event requires, with agency, lead time, fee, documents, and an official source for every line, so I stop guessing what the city wants.

## Inputs

- An `events` row (F-101 fields).
- `rules/nyc-rules.v1.json` (authoritative, loaded in-memory; AD-2).
- `today` (injected date; the engine never reads the clock; AD-6).

## Outputs

- One immutable `permit_plans` row (verdict via F-102, `ruleset_version`, `intake_snapshot`) + `permit_plan_items` rows: permit/insurance/advisory/note lines with agency, typed deadline, `latest_apply_date`, `apply_after_date` where gated, fee display, documents, portal, source URL, verified status, and the triggering answers.
- API: `POST /api/events/:id/plan` → plan + items; `GET /api/events/:id/plan` → latest.

## Acceptance Criteria — General

1. Every emitted line references the rule (R1–R13, A1–A3) and the intake answers that triggered it.
2. Every line renders source citation + last-verified date; `[VERIFY]`-faceted facts render their caveat ("confirm with agency"); no gap is ever filled with a guess.
3. Same event + same ruleset version + same `today` → byte-identical plan (determinism metric).
4. An empty permit set renders as an explicit "no city event permits required" result with triggered advisories (Scenario B), not an error or blank state.
5. Rule-evaluation failure returns an explicit error; a partial plan is never presented as complete.
6. The acceptance comparison counts `permit` + `insurance` items against the expected sets below; advisories/notes compare as expected-output text.

## Acceptance Criteria — The Six Scenarios (verbatim; the answer key wins every disagreement)

Fixtures pin `today = 2026-07-21` (the ruleset snapshot date). Event dates below are computed from the key's relative offsets. Preserve every `[VERIFY]` marker exactly.

### Scenario A — "Bushwick Sidewalk Pop-up" (THE DEMO ANCHOR) · event_date 2026-08-25 (35 days out)

Intake: brooklyn · sidewalk · 75 · food_format=served_sold · amplified_sound=true · structures=false · open_flame=false · alcohol=false · power_generator=false

**Expected permit set:**
1. SAPO Street Activity Permit — ~60-day lead [R1]
2. NYPD Sound Device Permit — $45, ≥5 days, local precinct [R3]
3. DOHMH food vendor permit (format-dependent) [R4]
4. $1M GL insurance, City as additional insured [R10]

**EXPECTED VERDICT: ✗ INFEASIBLE** — blocking permit: SAPO (60-day lead vs. 35-day runway).
**Expected rescope suggestions:** (a) move to private venue → drops SAPO + insurance; (b) push date ≥60 days out.
*(Engine note per OPEN-QUESTIONS I-10: at exactly 60 days the re-evaluation yields FEASIBLE-AT-RISK; internal recommendation is 60 + slack threshold.)*

### Scenario B — "Gallery Pop-up" (FALSE-POSITIVE TEST) · event_date 2026-08-11 (21 days out)

Intake: manhattan · private_venue · 60 · food_format=prepackaged_free · amplified_sound=false · structures=false · open_flame=false · alcohol=false · power_generator=false

**Expected permit set:** **NONE** (city event permits) [R13]
**Expected output notes:** venue certificate of occupancy governs capacity; below common place-of-assembly threshold `[VERIFY]`; prepackaged free food flagged as "confirm DOHMH exemption" `[VERIFY]` (advisory A1).
**EXPECTED VERDICT: ✓ FEASIBLE.**
*Test purpose: the system must be able to say "you need nothing." A judge WILL try this case.*

### Scenario C — "Prospect Park Community Day" (DEPENDENCY-CHAIN TEST) · event_date 2026-09-15 (56 days out)

Intake: brooklyn · park · 150 · food_format=none · amplified_sound=true · structures=false · open_flame=false · alcohol=false · power_generator=false

**Expected permit set:**
1. NYC Parks Special Event Permit — $25, 30-day processing, 21-day hard floor [R2]
2. NYPD Sound Device Permit — $45, ≥5 days, filed at precinct **AFTER** Parks permit grants amplified-sound permission [R3 + dependency]
3. Insurance: "determined by borough office" note — not hard-required [R11]

**EXPECTED VERDICT: ✓ FEASIBLE** — timeline renders the dependency: apply Parks immediately → Parks decision ~day 30 → file sound permit → buffer.

### Scenario D — "Queens Block Party" (TIGHT-BUT-FEASIBLE TEST) · event_date 2026-09-29 (70 days out)

Intake: queens · street · street_event_kind=residential_block_party · 200 · food_format=none · amplified_sound=true · structures=false · open_flame=true · alcohol=false · power_generator=false

*(Fixture comment, per OPEN-QUESTIONS P-5: food_format=none is deliberate. Charcoal grills without food "served/sold to the public" is the only reading consistent with the key's expected set, which has no DOHMH line. Do not "fix" this fixture.)*

**Expected permit set:**
1. SAPO Block Party Permit — ~60-day lead; community board review [R1]
2. NYPD Sound Device Permit — $45, ≥5 days [R3]
3. FDNY open-flame/cooking permit [R8] `[VERIFY class + lead]`
4. $1M GL insurance [R10] `[VERIFY applicability to block parties]`

**EXPECTED VERDICT: ✓ FEASIBLE — WITH WARNING:** 10-day slack on the SAPO lead; engine renders "at risk: apply within 10 days."

### Scenario E — "Plaza Brand Activation" (MAX-COMPLEXITY TEST) · event_date 2026-12-03 (135 days out)

Intake: manhattan · plaza · 300 · food_format=free_sampling · amplified_sound=true · structures=true (20 × 20) · open_flame=false · alcohol=false · power_generator=true

**Expected permit set:**
1. SAPO Street Activity/Plaza Permit — ~60 days [R1]
2. Tent/structure permit (>10x10) — DOB/FDNY [R7] `[VERIFY]`
3. FDNY generator permit — 45–60 days + site inspection [R6]
4. DOHMH sampling permit [R4] `[VERIFY class for free sampling]`
5. NYPD Sound Device Permit — $45, ≥5 days [R3]
6. $1M GL insurance, City additional insured [R10]

**EXPECTED VERDICT: ✓ FEASIBLE** — longest-lead items (SAPO 60d / FDNY generator up to 60d) both clear with ~75 days of slack.
*Test purpose: six parallel obligations rendered as one coherent backward-computed timeline without collapsing into noise.*

### Scenario F — "Rooftop Launch Party" (CONDITIONAL-VERDICT TEST) · event_date 2026-08-10 (20 days out)

Intake: manhattan · private_venue · 90 · food_format=catered_private · amplified_sound=true · alcohol=true · venue_has_liquor_license=unknown · structures=false · open_flame=false · power_generator=false

**Expected permit set:**
1. Alcohol path: venue liquor license OR licensed caterer OR SLA temporary permit — ≥15 business days (~21 calendar) [R9]
2. Place-of-assembly consideration at 90 indoors [R13 → `VERIFY` threshold]
3. No SAPO/Parks (no public-space footprint); no NYPD sound permit expected on private property — noise code still applies; engine outputs advisory, not permit `[VERIFY]` (advisory A2)

**EXPECTED VERDICT: ⚠ CONDITIONAL** — feasible ONLY IF venue already holds liquor license + assembly-compliant occupancy; infeasible if SLA temporary permit path is needed (15 business days ≈ 21 calendar > 20-day runway).
*Test purpose: verdicts that depend on facts the user must confirm.*

## Edge Cases

- Boundary: park + headcount 19 → no R2, no R11; park + 20 → both.
- park + headcount < 20 + amplified: R3 fires standalone, dependency inert (OPEN-QUESTIONS I-6).
- structures = true, dimensions NULL → R7 evaluates unknown → conditional item requesting dimensions.
- alcohol + public space → advisory A3 (coverage gap), no permit asserted.
- Ruleset file fails schema validation at boot → API refuses to start (loud), never serves plans from a bad ruleset.

## Answer-Key Scenarios Exercised

All six, as the automated acceptance suite (Dev 1's lane gate and the green-gate criterion in DESIGN.md).
