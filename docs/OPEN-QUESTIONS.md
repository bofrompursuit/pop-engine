# PopEngine — Open Questions & Interpretation Register

**Status:** Living document. Everything here is either (a) an encoding interpretation the team should ratify, (b) a `[VERIFY]` fact blocking the demo, or (c) a decision still owned by the team. Settled project decisions live in `DESIGN.md` (Decisions of 2026-07-21) and `ARCHITECTURE.md` (AD-1 through AD-8); they are not repeated here.
**Last updated:** 2026-07-22. Decision-only items were resolved in review on 2026-07-22 (statuses below); items pending primary-source verification remain open.

## 1. Rules-Encoding Interpretations

Places where the answer key is silent or ambiguous and the encoding had to pick a behavior. Each is documented in the rules file's `interpretation_notes`.

| # | Interpretation taken | Why | Risk if wrong | Status |
|---|---|---|---|---|
| I-1 | R9's ≥15-business-day lead applies to the **SLA-temporary path only**, not the venue-license or caterer paths | Scenario F's CONDITIONAL verdict requires the license-holding branch to be feasible at 20 days out | If the lead really applies to all paths, Scenario F's expected verdict itself is wrong | **OPEN** — pending R9 source verification (§2.5) |
| I-2 | Business-day leads evaluate via the key's **calendar approximation** (15 business ≈ 21 calendar) | True business-day math is nondeterministic for relative-date fixtures and could flip Scenario F | Real-world accuracy off by ~1-2 days near boundaries | **RATIFIED 2026-07-22** |
| I-3 | "Varies" lead times (R4/R7/R8/R12) get the `unverified` deadline type: listed, "confirm lead time with agency," **excluded from verdict/slack arithmetic** | Scenarios A/D/E expect these items present without affecting verdicts | A truly long unverified lead could make a FEASIBLE verdict wrong; mitigated by the VERIFY task list | **RATIFIED 2026-07-22** |
| I-4 | Lead ranges compute `latest_apply_date` from the **max bound** (R6: 60, not 45) | Scenario E's "~75 days of slack" arithmetic = 135 − 60 | None for scenarios; conservative by construction | **RATIFIED 2026-07-22** |
| I-5 | R2's undefined 22–29-day band renders **FEASIBLE-AT-RISK** ("processing may not complete before event") | Only the 21-day floor is a defined cliff; the band is untested by scenarios | Over- or under-trust in the yellow state | **OPEN** — confirm against Parks guidance during §2 verification |
| I-6 | Park + headcount <20 + amplified sound: R3 fires **standalone**, its Parks dependency inert | The key's dependency note assumes a permitted parks event | If Parks permission is still prerequisite below 20 attendees, sequencing is wrong for this edge | **OPEN** — pending verification |
| I-7 | R7's "over 10x10 ft" encoded as derived **area > 100 sqft** | One evaluable predicate was needed; the threshold is `[VERIFY]` anyway | Either-dimension interpretation would change borderline cases | **OPEN** — folded into R7 verification (§2.1) |
| I-8 | R13 split into an **always-on private-venue advisory** plus an **emergent** "no permits required" finding | A single literal trigger cannot serve both Scenario B and Scenario F | None identified; pure encoding structure | **RATIFIED 2026-07-22** |
| I-9 | Alcohol in public space: **A3 advisory on the plan AND an inline intake warning** the moment alcohol + public location is selected | R9 covers private venues only; silence would be a dangerous false negative. Neither surface asserts any requirement | Team may later research real rules into v1.1 (see P-4) | **RESOLVED 2026-07-22** — intake warning added to F-101 spec |
| I-10 | Scenario A's rescope keeps the key's verbatim "push date ≥60 days out"; the engine's computed recommended date uses 60 + slack threshold (74 days) | The key's text and the slack model interact; acting on the computed date lands clean FEASIBLE | Demo copy must not promise "feasible" at exactly 60 | **RATIFIED 2026-07-22** |
| I-11 | Slack for dependency-gated items = `latest_apply − apply_after` (window width, upstream filed immediately) | Conservative: the real room once the gate opens (Scenario C: 21 days) | Affects `min_slack_days` display only | **RATIFIED 2026-07-22** |
| I-12 | R10/R11 ship in the day-one ruleset even though F-205 (dedicated insurance UI) is stretch | Scenarios A/C/D/E expect insurance lines from F-201; rules and UI are separate | None | **CONFIRMED 2026-07-22** |

## 2. `[VERIFY]` Items Blocking the Demo (owner: Dev 4; primary sources only) — ALL OPEN

**Candidate primary sources for every item below were collected on 2026-07-22: see `VERIFICATION-SOURCES.md`.** That dossier's Red Flags section lists seven findings where primary text appears to contradict encoded facts (including the R7 tent threshold and R1's universal 60-day lead, which touch Scenarios E and A); triage those with the team before the green gate.

From answer key Part 3, priority order preserved, plus items added by this refinement:

1. **R7** tent threshold + issuing agency (Scenario E) — also resolves interpretation I-7.
2. **R8** open-flame permit class + lead time (Scenario D).
3. **R4** DOHMH permit classes: sold hot food vs. free sampling vs. prepackaged-free (Scenarios A, B, E) — also covers advisory A1.
4. **R10** insurance scope: all SAPO event types or program-specific (Scenarios A, D, E).
5. **R9** SLA instrument per format (Scenario F) — also resolves interpretation I-1.
6. **R13** place-of-assembly threshold (Scenarios B, F) — the ~75 value drives advisory wording only until verified.
7. **R1** SAPO fee schedule by event type (display detail).
8. **R5** TUA trigger reconciliation: any-vending vs. 500+ attendance (blocks future vending scenarios).
9. **Portal URLs**: SAPO E-Apply entry point, FDNY Business URL (R6), DOHMH application path (R4), confirmation that `nyceventpermits.nyc.gov/parks` is the Parks application entry point (R2).
10. **A2**: confirm no NYPD sound permit is required for amplified sound on private property (Scenario F note).
11. **R2** site-diagram document requirement (currently practitioner-sourced, marked VERIFY in the rules file).

## 3. Intake & Schema Decisions

| # | Question | Decision | Status |
|---|---|---|---|
| S-1 | Add `selling_merchandise` to the intake? | Deferred to Phase 2; revisit when R5's threshold is reconciled | **RESOLVED 2026-07-22** |
| S-2 | `street_event_kind` taxonomy | Ship the two-value enum (residential_block_party, other); expand after R1 fee-schedule verification surfaces the full SAPO type list | **RESOLVED 2026-07-22** |
| S-3 | Food-truck distinction in intake | Deferred; add a `food_vendor_type` follow-up in Phase 2 | **RESOLVED 2026-07-22** |
| S-4 | `events` schema sign-off | All four devs approve the migration PR before any lane codes (Phase 0, day 1) | **OPEN** — requires the full team |
| S-5 | TypeScript vs. plain JavaScript | **TypeScript** across the monorepo; the engine package's exported types are the client/server contract (ARCHITECTURE AD-8) | **RESOLVED 2026-07-22** |

## 4. Product & Delivery Decisions

| # | Question | Decision | Status |
|---|---|---|---|
| P-1 | Digital entry pass priority | Stays P2 as an F-401 extension; revisit post-capstone | **RESOLVED 2026-07-22** |
| P-2 | Twilio A2P 10DLC timing | Policy set: email alerts live in the demo + labeled SMS simulation, UNLESS A2P approval lands by day 5, in which case SMS goes live | **POLICY SET 2026-07-22** — track the approval date |
| P-3 | Slack warning threshold value | Stays 14 days (`config.slack_warning_days`) | **RESOLVED 2026-07-22** |
| P-4 | Public-space alcohol handling | Advisory + intake warning for MVP (see I-9); researching the actual rules is a Phase 2 ruleset task | **RESOLVED 2026-07-22** (research task remains Phase 2) |
| P-5 | Demo scenario fixture dates | Pinned in the F-201 spec (`today = 2026-07-21`, computed event dates, Scenario D fixture comment) | **RESOLVED 2026-07-22** |

## 5. Process Note

Every `[VERIFY]` promotion follows the answer key's method: primary sources only (nyc.gov, Rules of the City of New York, agency pages), record source URL + date checked, update the rules file's `verification` block, and leave `status_verbatim` untouched except by the verification owner. Anything unresolvable renders in-product as "confirm with agency." Honesty is a feature.
