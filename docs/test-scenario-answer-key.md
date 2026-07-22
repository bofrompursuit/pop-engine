# PopEngine — Test Scenario Answer Key (v1)

**Rules snapshot date:** July 21, 2026
**Status legend:** `[VERIFIED]` = confirmed against official/primary source · `[VERIFY]` = drawn from secondary source, needs primary-source confirmation before demo

## How to Use This Document

This is the ground truth the rules engine is graded against (Success Metric #1: 100% of required permits, 0 false omissions, across 6 scenarios). Build the engine to reproduce these outputs. Every `[VERIFY]` row must be confirmed against the linked official source and promoted to `[VERIFIED]` before the demo — one teammate owns that task. If the engine and this key disagree, the key wins until a primary source says otherwise.

## Part 1 — Rules Table Seed Data

Each row: TRIGGER CONDITION → PERMIT | AGENCY | LEAD TIME | FEE | SOURCE | STATUS

- **R1.** Event on street, sidewalk, or pedestrian plaza (any) → Street Activity Permit | SAPO (Mayor's Office CECM) | ~60 days | varies by event type | nyc.gov/sapo + practitioner guides | `[VERIFIED — scope; VERIFY exact fee schedule per event type]`
- **R2.** Event in a park with 20+ attendees → Special Event Permit | NYC Parks | 30 days processing; **HARD FLOOR: applications within 21 days of event are NOT accepted** | $25 nonrefundable | nycgovparks.org/permits/special-events/faq + nyceventpermits.nyc.gov/parks | `[VERIFIED]`
- **R3.** Amplified sound (public space) → Sound Device Permit | NYPD, filed in person at local precinct | ≥5 days before event | $45 (certified check/money order) | nyc.gov NYPD permits page | `[VERIFIED]`
  - **DEPENDENCY RULE:** in parks, the Parks permit WITH amplified-sound permission must be obtained FIRST; sound permit is filed after. Engine must sequence deadlines accordingly.
- **R4.** Food served/sold to the public → DOHMH permit (Temporary Food Service / vendor permits; food trucks need Mobile Food Vending permit + auto insurance copy) | DOHMH | lead time varies | varies | nycgovparks.org special event guide | `[VERIFY — exact permit class + lead time per food format]`
- **R5.** Selling items (food or merchandise) at a Parks event → Temporary Use Authorization (TUA) (explicitly required for vending; FAQ ties TUA to events over 500 attendance — reconcile) | NYC Parks Revenue Division | apply with event permit | varies | nycgovparks.org FAQ + Fort Tryon guidance | `[VERIFY — attendance threshold vs. any-vending trigger]`
- **R6.** Generator or battery power → FDNY permit + site inspection | FDNY (via FDNY Business online) | 45–60 days | fee applies | nycgovparks.org special event guide | `[VERIFIED — lead time; VERIFY fee amount]`
- **R7.** Tent or temporary structure over 10x10 ft → structure permit | DOB and/or FDNY | varies | varies | practitioner guide (nyc-event-venues.com) | `[VERIFY — issuing agency + exact sq-ft threshold + lead time]`
- **R8.** Open flame / cooking devices (grills, sterno, propane) → FDNY open-flame/cooking permit; propane restricted in parks; no BBQ on beaches | FDNY | varies | varies | nycgovparks.org BBQ guidance + practitioner guide | `[VERIFY — permit class + lead time for street/block-party grilling]`
- **R9.** Alcohol served at a private venue event → venue's existing liquor license OR licensed caterer OR SLA temporary permit; coordinate ≥15 business days out | NY State Liquor Authority / venue | ≥15 business days | varies | practitioner guide | `[VERIFY — which SLA instrument applies per format]`
- **R10.** Street events: commercial general liability insurance, $1M per occurrence, City of New York named as additional insured | requirement attached to SAPO-class permits | obtain before permit issuance | premium varies | Open Culture / SAPO program requirements | `[VERIFY — whether required for ALL SAPO event types]`
- **R11.** Parks events: insurance/bond NOT automatically required — borough permit office determines case-by-case | NYC Parks | n/a | n/a | nycgovparks.org FAQ | `[VERIFIED]`
  - **ENGINE NOTE:** output should say "insurance determined by borough office at review" — do NOT hard-require it for parks scenarios.
- **R12.** Procession/parade/race on streets → Parade Permit | NYPD (E-Apply); + SAPO if touching a plaza; + Parks if touching a park | varies | varies | nyc.gov NYPD permits page | `[VERIFIED — scope]` *(Out of MVP scenario set; included for completeness.)*
- **R13.** Private indoor venue, no public-space footprint, no amplified-sound-in-public, no food sales, no structures → NO city event permits required; venue's certificate of occupancy / place-of-assembly status governs capacity | n/a | `[VERIFIED by rule logic — VERIFY place-of-assembly threshold (commonly 75+ indoors) before asserting in UI copy]`

## Part 2 — The Six Scenarios

### Scenario A — "Bushwick Sidewalk Pop-up" (THE DEMO ANCHOR)
**Inputs:** Brooklyn · sidewalk (public) · 75 attendees · DJ (amplified) · 1 food vendor (hot food, sold) · no tent · no open flame · event date **35 days out**
**Expected permit set:**
1. SAPO Street Activity Permit — ~60-day lead [R1]
2. NYPD Sound Device Permit — $45, ≥5 days, local precinct [R3]
3. DOHMH food vendor permit (format-dependent) [R4]
4. $1M GL insurance, City as additional insured [R10]

**EXPECTED VERDICT: ✗ INFEASIBLE** — blocking permit: SAPO (60-day lead vs. 35-day runway).
**Expected rescope suggestions:** (a) move to private venue → drops SAPO + insurance; (b) push date ≥60 days out.
**DEMO NOTE:** this is the live magic moment. Rehearse it.

### Scenario B — "Gallery Pop-up" (FALSE-POSITIVE TEST)
**Inputs:** Manhattan · private venue (gallery) · 60 attendees · unamplified acoustic set · prepackaged snacks, free, no sales · no structures · 21 days out
**Expected permit set:** **NONE** (city event permits) [R13]
**Expected output notes:** venue certificate of occupancy governs capacity; below common place-of-assembly threshold `[VERIFY]`; prepackaged free food flagged as "confirm DOHMH exemption" `[VERIFY]`.
**EXPECTED VERDICT: ✓ FEASIBLE.**
**Engine test purpose:** the system must be able to say "you need nothing" — over-prescribing permits is a failure mode that destroys trust. A judge WILL try this case.

### Scenario C — "Prospect Park Community Day" (DEPENDENCY-CHAIN TEST)
**Inputs:** Brooklyn · public park · 150 attendees · amplified speeches + music · no sales, no food · no structures · 56 days out
**Expected permit set:**
1. NYC Parks Special Event Permit — $25, 30-day processing, 21-day hard floor [R2]
2. NYPD Sound Device Permit — $45, ≥5 days, filed at precinct **AFTER** Parks permit grants amplified-sound permission [R3 + dependency]
3. Insurance: "determined by borough office" note — not hard-required [R11]

**EXPECTED VERDICT: ✓ FEASIBLE** — timeline renders the dependency: apply Parks immediately → Parks decision ~day 30 → file sound permit → buffer.
**Engine test purpose:** sequenced deadlines (permit B unlocks after permit A), not just parallel lead times.

### Scenario D — "Queens Block Party" (TIGHT-BUT-FEASIBLE TEST)
**Inputs:** Queens · residential street closure · 200 attendees · DJ (amplified) · charcoal grills (open flame) · no tent · 70 days out
**Expected permit set:**
1. SAPO Block Party Permit — ~60-day lead; community board review [R1]
2. NYPD Sound Device Permit — $45, ≥5 days [R3]
3. FDNY open-flame/cooking permit [R8] `[VERIFY class + lead]`
4. $1M GL insurance [R10] `[VERIFY applicability to block parties]`

**EXPECTED VERDICT: ✓ FEASIBLE — WITH WARNING:** 10-day slack on the SAPO lead; engine should render "at risk: apply within 10 days."
**Engine test purpose:** the yellow state. Feasibility is not binary; slack thresholds (e.g., <14 days slack = warning) make the verdict feel intelligent.

### Scenario E — "Plaza Brand Activation" (MAX-COMPLEXITY TEST)
**Inputs:** Manhattan · pedestrian plaza · 300 attendees · amplified · food sampling (free) · 20x20 tent · generator · 135 days out
**Expected permit set:**
1. SAPO Street Activity/Plaza Permit — ~60 days [R1]
2. Tent/structure permit (>10x10) — DOB/FDNY [R7] `[VERIFY]`
3. FDNY generator permit — 45–60 days + site inspection [R6]
4. DOHMH sampling permit [R4] `[VERIFY class for free sampling]`
5. NYPD Sound Device Permit — $45, ≥5 days [R3]
6. $1M GL insurance, City additional insured [R10]

**EXPECTED VERDICT: ✓ FEASIBLE** — longest-lead items (SAPO 60d / FDNY generator up to 60d) both clear with ~75 days of slack.
**Engine test purpose:** volume — six parallel obligations rendered as one coherent backward-computed timeline without collapsing into noise.

### Scenario F — "Rooftop Launch Party" (CONDITIONAL-VERDICT TEST)
**Inputs:** Manhattan · private rooftop venue · 90 attendees · DJ (amplified, private property) · alcohol served · no food sales (catered) · 20 days out
**Expected permit set:**
1. Alcohol path: venue liquor license OR licensed caterer OR SLA temporary permit — ≥15 business days (~21 calendar) [R9]
2. Place-of-assembly consideration at 90 indoors [R13 → `VERIFY` threshold]
3. No SAPO/Parks (no public-space footprint); no NYPD sound permit expected on private property — noise code still applies; engine outputs advisory, not permit `[VERIFY]`

**EXPECTED VERDICT: ⚠ CONDITIONAL** — feasible ONLY IF venue already holds liquor license + assembly-compliant occupancy; infeasible if SLA temporary permit path is needed (15 business days ≈ 21 calendar > 20-day runway).
**Engine test purpose:** verdicts that depend on facts the user must confirm — the engine asks "does your venue hold a liquor license?" and branches. The hardest and most impressive behavior in the set.

## Part 3 — Verification Task List (assign one owner)

Every `[VERIFY]` row, in priority order (demo-critical first):
1. R7 tent threshold + agency (Scenario E depends on it)
2. R8 open-flame permit class + lead (Scenario D)
3. R4 DOHMH permit classes: sold hot food vs. free sampling vs. prepackaged-free (Scenarios A, B, E)
4. R10 insurance scope: all SAPO event types or program-specific (Scenarios A, D, E)
5. R9 SLA instrument per format (Scenario F)
6. R13 place-of-assembly threshold (Scenarios B, F)
7. R1 SAPO fee schedule by event type (display detail)
8. R5 TUA trigger reconciliation (blocks any future vending scenario)

**Method:** primary sources only (nyc.gov, Rules of the City of New York, agency pages). Record source URL + date checked in the rules table. Anything unresolvable by primary source gets rendered in the product as "confirm with agency" — honesty is a feature.

## Notes for the Engine Build

- The interesting rules aren't the permits — they're the **21-day Parks hard floor** (a cliff, not a gradient), the **Parks→NYPD dependency** (sequenced deadlines), and the **slack-based warning state** (Scenario D). These three behaviors are what make the demo feel like software instead of a lookup table.
- **Verdict states:** FEASIBLE / FEASIBLE-AT-RISK / CONDITIONAL (user fact required) / INFEASIBLE (named blocking permit + rescope options). Four states, all demoable.
- **Snapshot honesty:** render "Rules verified as of [date]" in the UI. It converts the known risk into visible rigor.
