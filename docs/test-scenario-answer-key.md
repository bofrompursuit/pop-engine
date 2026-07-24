# PopEngine — Scenario Fixtures v3 (derived from ruleset nyc.v2.1)

**Status:** APPROVED (2026-07-22, ratified with `rules/nyc-rules.v2.1.json`; see `docs/BASELINE.md`). Now the green-gate acceptance suite. Individual regulatory facts still promote SOURCE_CONFIRMED → VERIFIED during the build via the ruleset's `verification` blocks (OPEN-QUESTIONS §2); that promotion is the verification owner's, per CONTRIBUTING Golden Rule 2.
**Supersedes:** the v1 answer key (six scenarios, R1–R13; recoverable at git `28e937d`) and the unapproved v2 draft suite (preserved at `docs/proposals/regulatory-scenarios-v2-draft.md`).
**Authority hierarchy:** approved primary source → published rule (`nyc-rules.v2.1.json`) → this fixture suite → engine output → UI copy. **This document is derived from the ruleset, not an independent authority.** If a fixture and the published ruleset disagree, the fixture is wrong; if the ruleset and a primary source disagree, the ruleset is wrong. Fix the lower authority.
**Evidence:** every regulatory fact traces via the ruleset's `evidence` refs to fetch-confirmed quotes in `VERIFICATION-SOURCES.md` (Rounds 1–2, 2026-07-22).
**Fixture clock:** `today = 2026-07-22` (Wednesday). All dates computed from it. Business-day math is actual-calendar (no holidays fall in any fixture window; the pinned holiday calendar is a RESEARCH item for other dates).

## Verdict model (approved 2026-07-22)

Top-level verdict stays four-state; per-finding deadline statuses (ON_TRACK / DEADLINE_APPROACHING / PUBLISHED_DEADLINE_MISSED / NOT_CALCULABLE / NOT_APPLICABLE) sit underneath:

| Verdict | Computed when | Demo copy |
|---|---|---|
| FEASIBLE | all dated findings ON_TRACK, no material unknowns | "On track" |
| FEASIBLE-AT-RISK | min slack < 14 days (labeled *internal planning buffer*, not an official threshold) | "At risk — apply within N days" |
| CONDITIONAL | a material unknown changes the outcome; branches shown | "Depends on: [fact]" |
| INFEASIBLE | a definitively-required finding is PUBLISHED_DEADLINE_MISSED | "Published deadline missed as scoped" — a missed filing window, **not** a claim of legal impossibility |

## Scenario A — "Bushwick Street Activation" (THE DEMO ANCHOR, re-anchored)

*Replaces the v1 anchor, whose universal 60-day SAPO lead was contradicted by primary sources (VS RF-2). Same story: commercial street activation, 35 days out; now classified.*

**Inputs:** brooklyn · location_type=street · obstructs_public_way=yes · sapo_event_type=street_event · **street_event_size=large** (multi-block activation) · headcount=75 · event_date=**2026-08-26** (35 days out) · open_to_public=yes · food_present=yes, food_vendor_count=1 · selling_anything=yes · amplified_sound=yes · no structures · no flame · no generator · no alcohol

**Expected findings:**
1. SAPO-STREET-LARGE-001 — Street Event Permit (Large), 45-day deadline = **2026-07-12, already passed** → PUBLISHED_DEADLINE_MISSED
2. NYPD-SOUND-001 — Sound Device Permit, $45 first day + $5/addl day, precinct, ≥5 days → ON_TRACK
3. DOHMH-VENDOR-PERMIT-001 — acceptable permit per vendor (TFSE $70/yr) → NOT_CALCULABLE (lead: confirm with agency)
4. DOHMH-ORGANIZER-NOTIFY-001 — organizer notifies DOHMH ≥30 days = by **2026-07-27** → DEADLINE_APPROACHING (5 days)
5. SAPO-INSURANCE-001 — $1M liability, City additional insured, before issuance

**EXPECTED VERDICT: ✗ INFEASIBLE (as scoped)** — blocking finding: SAPO Street Event (Large); copy: "the published 45-day filing deadline passed on July 12."
**Expected rescopes (each a full re-evaluation):**
- (a) **size=medium** → 30-day deadline = 2026-07-27 → FEASIBLE-AT-RISK, "apply within 5 days" (DOHMH notification also lands 07-27)
- (b) **size=small** → 14-day deadline = 2026-08-12 (ON_TRACK) but DOHMH notification still 5 days out → FEASIBLE-AT-RISK, "notify DOHMH within 5 days"
- (c) **private venue** → SAPO + insurance findings drop; venue-occupancy advisory + DOHMH findings remain
**Demo notes:** the size-classification question IS the demo beat ("what counts as Large? that's why nobody can navigate this"). The rescope to (a) shows the deadline ladder live. Size *criteria* are not published on fetched pages (VS Round 2, unresolved) — the intake asks the user to classify per SAPO guidance, and `unknown` renders CONDITIONAL listing all three deadlines.

## Scenario B — "Gallery Pop-up" (FALSE-POSITIVE / LOW-BURDEN TEST)

**Inputs:** manhattan · private_venue · headcount=60 · event_date=2026-08-12 (21 days out) · open_to_public=yes · food_present=yes (prepackaged snacks, free), food_vendor_count=1 (the gallery itself) · selling_anything=no · amplified_sound=no · no structures/flame/generator/alcohol

**Expected findings:**
1. ADV-VENUE-OCCUPANCY-001 — CoO/legal use governs capacity; 60 < 75 assembly threshold [thresholds source-confirmed]
2. DOHMH-VENDOR-PERMIT-001 — MAY apply: prepackaged free distribution to an invited public is *inside* Health Code Art. 88 scope (no general free-prepackaged exemption; VS RF-4) → NOT_CALCULABLE, "confirm with DOHMH"
3. DOHMH-ORGANIZER-NOTIFY-001 — the 30-day notification date (2026-07-13) is already past **if** DOHMH treats the host as a food-service operator → surfaced inside the conditional, not as a definitive miss
4. No SAPO, no sound permit, no assembly permit, no insurance findings.

**EXPECTED VERDICT: ⚠ CONDITIONAL — LOW IDENTIFIED PERMIT BURDEN.** Copy: "No street, park, sound, or assembly permits identified from your answers. Confirm: (1) the venue's occupancy/permitted use; (2) whether DOHMH food-service requirements apply to your free prepackaged snacks."
**Test purpose:** the near-empty result stays trustworthy: the system says "almost nothing," names exactly what to confirm, and refuses to overclaim "nothing required." (v1 expected a flat NONE; corrected per Art. 88.)

## Scenario C — "Prospect Park Community Day" (DEPENDENCY-CHAIN TEST — strongest carryover)

**Inputs:** brooklyn · park · headcount=150 · event_date=2026-09-16 (56 days out) · open_to_public=yes · no food · selling_anything=no · amplified_sound=yes · nothing else

**Expected findings:**
1. PARKS-EVENT-001 — Special Event Permit, $25; hard floor 21 days (latest 2026-08-26); processing 21–30 days → ON_TRACK
2. NYPD-SOUND-001 — Sound Device Permit → ON_TRACK, gated
3. NYPD-SOUND-PARKS-DEP-001 — Parks amplified-sound permission first; strict sequencing unconfirmed → rendered as sequenced timeline: apply Parks now → decision ~day 21–30 → pursue sound permit → buffer
4. PARKS-INSURANCE-NOTE-001 — "determined by borough office at review," never hard-required

**EXPECTED VERDICT: ✓ FEASIBLE.** Timeline renders the dependency chain; the sequencing caveat appears as a note, not a verdict change.
**Test purpose:** sequenced deadlines. (150 > 20, so the exactly-20 OFFICIAL_CONFLICT rule stays dormant; a separate unit fixture pins headcount=20.)

## Scenario D — "Queens Block Party" (TIGHT-BUT-FEASIBLE + ELIGIBILITY TEST)

**Inputs:** queens · street · obstructs_public_way=yes · sapo_event_type=block_party · has_amusement_ride=no · headcount=200 · event_date=2026-09-30 (70 days out) · open_to_public=yes · no public food service (neighbors' own grills; food_present=no) · selling_anything=no · amplified_sound=yes · open_flame_or_cooking=[charcoal_wood] · no alcohol

**Expected findings:**
1. SAPO-BLOCK-PARTY-001 — Block Party Permit, 60-day deadline = **2026-08-01** → DEADLINE_APPROACHING (10 days); community-board recommendation note
2. SAPO-BLOCK-PARTY-SPONSOR-001 — block-association membership + neighbor permission → confirm
3. NYPD-SOUND-001 — Sound Device Permit → ON_TRACK
4. FDNY-FUEL-001 — Fuel Permit for charcoal (NOT an open-flame permit; v1 corrected) → NOT_CALCULABLE, confirm lead
5. **No insurance finding** — block party without a ride is exempt (50 RCNY §1-08(b); v1's R10 line removed)

**EXPECTED VERDICT: ✓ FEASIBLE-AT-RISK** — "apply within 10 days" (14-day internal buffer, labeled as PopEngine policy).
**Fixture guard:** `selling_anything=no` and `alcohol=no` are load-bearing — a block party with either becomes PROHIBITED_OR_INELIGIBLE via SAPO-BLOCK-PARTY-ELIG-001 (separate unit fixture). `food_present=no` is deliberate: neighbors grilling their own food is not public food service; do not "enrich" this fixture.

## Scenario E — "Plaza Brand Activation" (MAX-COMPLEXITY TEST)

**Inputs:** manhattan · plaza · obstructs_public_way=yes · sapo_event_type=plaza_event · **plaza_level=a** · plaza_multiple_blocks=no · headcount=300 · event_date=**2026-12-04** (135 days out) · open_to_public=yes · food_present=yes (free sampling), food_vendor_count=2 · selling_anything=no · amplified_sound=yes · structure_types=[tent_canopy], tent_area_sqft=**400** (20×20), tent_days_in_place=1, structure_over_10ft_tall=unknown · generator_present=yes (gasoline 5 gal, 50 kW) · battery none · no alcohol

**Expected findings:**
1. SAPO-PLAZA-001 — Plaza Event Permit, Level A single-block = 45-day deadline (2026-10-20) → ON_TRACK (~90 days slack)
2. SAPO-INSURANCE-001 — $1M liability, City additional insured
3. NYPD-SOUND-001 — Sound Device Permit → ON_TRACK
4. DOHMH-VENDOR-PERMIT-001 (2 vendors; sampling is food service — no separate "sampling permit" class exists; v1 corrected) → NOT_CALCULABLE lead
5. DOHMH-ORGANIZER-NOTIFY-001 — notify by 2026-11-04 → ON_TRACK
6. FDNY-GENERATOR-001 — 5 gal gasoline > 2.5 → permit; lead NOT_CALCULABLE (v1's universal 45–60d removed)
7. DEP-GENERATOR-REG-001 — 50 kW ≥ 40 → DEP registration
8. DOB-TENT-001 — **CONDITIONAL at the boundary**: 400 sq ft is not "more than 400"; render "confirm footprint calculation with DOB"; structure_over_10ft_tall=unknown keeps DOB-TALL-STRUCTURE-001 conditional too

**EXPECTED VERDICT: ⚠ CONDITIONAL — ALL DATED DEADLINES ON TRACK.** Copy: "Every published deadline clears with ~90 days of slack; two items need confirmation (tent footprint at the 400 sq ft boundary; FDNY lead times)."
**Test purpose:** volume + boundary honesty: eight findings, one coherent timeline, and the engine refuses to guess at an exact-boundary trigger.

## Scenario F — "Rooftop Launch Party" (CONDITIONAL-BRANCH TEST, expanded)

**Inputs:** manhattan · private_venue (rooftop) · headcount=90 · event_date=**2026-08-11** (20 days out) · open_to_public=no (invite-only) · food catered, nothing sold (food_present=yes, food_affinity_private_exception_claimed=unknown) · selling_anything=no · amplified_sound=yes, sound_audible_from_public_way=**unknown** · alcohol=yes, venue_license_covers_event_area=**unknown** · venue_has_assembly_approval=**unknown**

**Expected findings:**
1. DOB-ASSEMBLY-001 — 90 ≥ 75 **on a roof terrace** counts against the indoor threshold → PACO/TPA consideration, branch on venue_has_assembly_approval (TPA: "earlier than 10 days" per DOB code notes — wording variance flagged; min $250 + late surcharge)
2. Alcohol branch on venue_license_covers_event_area:
   - yes → SLA-VENUE-LICENSE-001: no new permit; confirm the license covers the exact rooftop area
   - no → SLA-ONEDAY-001: 15 business days required; **only 14 business days remain to 2026-08-11** (actual count, no holidays in window) → PUBLISHED_DEADLINE_MISSED on this branch; SLA-CATERING-001 same window (and requires real food + a currently licensed caterer)
3. NYPD-SOUND-001 — conditional on sound_audible_from_public_way: yes → permit in scope (§10-108(b)(3)); no → ADV-NOISE-CODE-001 advisory (noise code still applies) — a rooftop DJ is NOT automatically exempt (v1 corrected)
4. DOHMH-EXEMPTION-001 — invite-only + catered → private-function exemption may apply; confirm

**EXPECTED VERDICT: ⚠ CONDITIONAL** — branch table rendered: [license covers rooftop + assembly approval in place] → feasible path; [no license coverage] → infeasible path (SLA window missed by one business day); [sound audible from street] → add sound permit. Three follow-up questions, not one (v1 corrected).
**Test purpose:** the hardest behavior: verdicts hinging on multiple user-confirmable facts, with real business-day math.

## Boundary & Unit Fixtures (engine test suite, beyond the six)

- headcount 20 in a park → PARKS-EVENT-EXACTLY-20-001 OFFICIAL_CONFLICT rendering; 21 → permit required; 19 → nothing.
- Block party + selling_anything → PROHIBITED_OR_INELIGIBLE; block party + ride → insurance finding appears.
- tent_area_sqft 401 → DOB-TENT-001 REQUIRED; 400 → CONDITIONAL; 399 → nothing (absent other triggers).
- stage 2.0 ft / 120 sqft → no DOB-STAGE-001 (needs > 2 ft); 2.5 ft / 119 sqft → no; 2.5 ft / 120 sqft → yes.
- generator 2.5 gal gasoline → no FDNY permit (needs > 2.5); 2.6 → yes; 39.9 kW → no DEP registration; 40 kW → yes (inclusive).
- battery 20 kWh → no; 20.1 kWh → yes.
- street_event_size=unknown → CONDITIONAL listing the 14/30/45-day ladder.
- sapo_event_type=other_sapo_class → ADV-SAPO-OTHER-CLASS-001 coverage advisory with reference deadlines (incl. the Single Block Festival OFFICIAL_CONFLICT).
- obstructs_public_way=no on a sidewalk → SAPO-SCOPE-001 no-new-requirement note.

## v1 → v3 Correction Ledger (what changed and why)

| v1 assertion | v3 treatment | Basis |
|---|---|---|
| Universal ~60-day SAPO lead (R1) | Per-class deadlines: street 14/30/45/up-to-60 by size; plaza by level; block party 60 | VS Round 2 #1, #3 |
| Scenario A INFEASIBLE via 60-day lead | Re-anchored: Large street event misses its 45-day deadline; size classification explicit | VS Round 2 #1 |
| R10 insurance for all street events | Block party without ride exempt; press/rally exempt; hardship waiver exists | VS §4 |
| R7 tent "over 10x10 ft" | DOB triggers: >400 sq ft, ≥30 days, stage >2 ft & ≥120 sqft, prop/truss >10 ft, >10 ft tall; 10x10 was NY State parks | VS §1, Round 2 #7 |
| R8 one "open-flame permit" for grills | FDNY Fuel Permit (charcoal/propane) split from Open Flame Permit (sterno/candles, $210) | VS §2 |
| R6 universal 45–60d lead, any generator | Thresholds: >2.5 gal gas / >10 gal diesel / >20 kWh battery; DEP registration ≥40 kW; lead RESEARCH_REQUIRED | VS Round 2 #10 |
| (absent from v1) | DOHMH 30-day organizer notification + vendor list + private-property contract — new requirement class | VS Round 2 #9 |
| R5 TUA any-sale (reconcile note) | Kept as OFFICIAL_CONFLICT leaning any-sale (3 unhedged pages vs 1 hedged FAQ); the external critique's 500+-only reading rejected | VS Round 2 #12 |
| R13 flat "no city permits" for private venues | Conditional low-burden result + occupancy/assembly/food/sound confirmations | VS §6, RF-4/RF-5 |
| Sound permit never on private property | In scope when audible on a public way (§10-108(b)(3)); fully-indoor non-projecting exempt, noise code applies | VS §10 |
| "The key wins" | This suite is derived from the ruleset; primary source > rule > fixture > engine > UI | Governance §2 (corrected ordering) |
