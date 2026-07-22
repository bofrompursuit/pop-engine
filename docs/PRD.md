# PopEngine — PRD (Canonical Single Source of Truth)

**Build name:** PopEngine
**Owner:** Naquan McKune, Jason Zeng, Adedoyin Ahoton, Bo Moldenhauer
**Date:** July 21, 2026
**Status:** Canonical single source of truth. All earlier phases of this PRD are superseded in full by this document.
**Scope of this document:** the full product vision. The iron-clad MVP (permit planning) carries detailed, demo-observable requirements; everything else is planned scope, phased in `ROADMAP.md`. Completing the full vision by the capstone demo is explicitly not a commitment.
**Companion docs:** `ROADMAP.md` (phases + features) · `DESIGN.md` (lanes, gates, demo plan) · `ARCHITECTURE.md` (technical design, forthcoming) · `test-scenario-answer-key.md` (MVP ground truth) · `rules/nyc-rules.v1.json` (rules seed data, forthcoming).
**Permit facts:** every permit fact in this document traces to `test-scenario-answer-key.md`. Facts the key marks `[VERIFY]` stay `[VERIFY]` here. No permit fact is ever invented.

---

## 1. PROBLEM

Independent pop-up and event organizers in New York City must navigate a permit maze spread across at least seven agencies (SAPO, NYC Parks, NYPD for sound and crowd control, DOT, FDNY, DOB, and the Health Department), each with its own portal, lead time, fees, and requirements. A single activation touching a sidewalk, serving food, and playing music can require four separate permits with lead times ranging from 5 days to 60+ days, and no system tells the organizer which permits apply or whether their timeline is even feasible. Organizers discover missing permits late, causing cancellations, fines, or events pushed months out.

### Supporting Context

- Reporting from THE CITY (March 2026) documents organizers pressuring City Hall to simplify the process: thousands of groups stage events in public space yearly, and organizers with a decade of experience describe the system as a maze with no clear starting point. *(thecity.nyc, 2026-03-10)*
- The process is structurally fragmented: DOT Open Streets applications run through Survey123 while SAPO, NYPD, Parks, and Media & Entertainment use E-Apply. A civic proposal (Neighborhood Commons) formally asks the city to unify them, which has not happened. *(neighborhoodcommons.nyc)*
- Real lead-time spread, per official and practitioner sources: SAPO street activity permits require ~60 days; Parks special event permits (20+ guests) take 3–6 weeks with site diagrams; NYPD precinct sound permits need 5+ days; venue/liquor coordination requires 15 business days; tents over 10x10, open flame, and public food each trigger additional agency permits. *(nyc.gov/sapo; practitioner guides)*
- Today this navigation is sold as human expertise: NYC event-production agencies market permit navigation as a core professional service, noting that major event permits require 3–6 months of lead time and that requirements shift seasonally and by neighborhood. *(ideko.com)*

### 1a. Opportunity

Give independent organizers, in two minutes, what currently requires a production agency or years of trial and error: a complete, source-cited permit plan for their specific event, with a feasibility check on their date. Compress "weeks of figuring out who to call" into a generated checklist with deadlines, and make PopEngine the system of record for executing it. From that trust foundation, the product grows outward across the whole organizer lifecycle: execution tracking, promotion, event-day operations, and post-event intelligence that makes the next event easier than the last.

#### Market Opportunity

- Thousands of groups apply for NYC public-event permits annually (THE CITY, 2026), before counting private-venue pop-ups that still trigger sound, food, tent, or fire permits.
- The only alternatives are production agencies (priced for brand activations, not independents) and static blog guides that cannot evaluate a specific event. The bottom of the market has no software.
- NYC-first is a feature, not a limitation: rules are jurisdiction-specific, so depth in one city beats shallow national coverage, and the model extends city-by-city (F-207).

### 1b. Users & Needs

- **Primary users:** Independent event organizers, including pop-up market runners, community arts organizers, and small brand founders, who stage 1–20 events per year without an ops team or agency. *(Persona model: the small-organization founders profiled in THE CITY's March 2026 reporting.)*
- **Secondary users:** Event attendees who check in on-site and expect a fast, app-less experience.

#### Key User Needs

- As an **independent organizer**, I need to know *which* permits my specific event requires, because the requirements are scattered across seven agencies and I don't know what I don't know.
- As an **independent organizer**, I need to know *immediately* whether my event date is feasible given permit lead times, because discovering a 60-day requirement 30 days out kills the event.
- As an **independent organizer**, I need one timeline tracking every application, fee, and document deadline, because each agency runs its own portal and nothing aggregates my obligations.
- As an **event attendee**, I need an instant, zero-friction mobile check-in, because long lines and form-heavy sign-ups destroy the event experience.

#### Later Personas (post-MVP hypotheses, not validated)

- **First-time organizer:** needs plain-language questions, definitions, and warnings about unsupported complexity (Phase 2+).
- **Small-organization operations lead:** needs collaboration, document storage, assignment, and exportable plans (F-213, F-702–F-704).
- **Event operations contractor:** needs multi-client workspaces, event duplication, and status reporting (F-503, F-702).

### 1c. Competitive Landscape

| Bucket | Who | What they do | Why the gap remains |
|---|---|---|---|
| City portals | SAPO E-Apply, DOT Survey123, Parks, NYPD precinct forms | Accept applications | Submission, not navigation: assume you already know which permits you need; no cross-agency view |
| Human services | IDEKO and NYC production agencies, event planners | Expert permit navigation as a service | Priced for brand activations; unavailable to independents |
| Static content | citylaws.org, venue/planner blog guides, nyc.gov info pages | Explain the rules generically | Cannot evaluate a specific event or generate a plan; no deadlines, no tracking |
| Event software | Eventeny, Eventbrite, Luma, Partiful | Ticketing, vendor management, RSVPs, check-in | None generates jurisdiction-aware permit requirements; document features are passive upload/storage |

**The empty intersection:** software ✕ organizer-side ✕ generative (event parameters → permit plan) ✕ NYC jurisdiction depth. No product found occupies it; the incumbents are human consultants and nyc.gov itself.

## 2. PROPOSED SOLUTION

PopEngine is a web-based platform that turns an event description into a compliant execution plan. The organizer answers a short questionnaire (borough, location type, headcount, date, food, amplified sound, structures, open flame, alcohol, power) and PopEngine generates the complete permit plan: every required permit and agency, official lead times and fees, required documents, and a timeline computed backward from the event date, with an immediate feasibility verdict. The plan becomes a live checklist with deadline alerts and portal deep links through event day. The full product extends the same Event record across the organizer lifecycle: promotion and RSVPs, app-less QR check-in, and post-event intelligence.

### 2a. Value Proposition

Independent NYC event organizers who can't afford production agencies use PopEngine, a permit navigation and event execution platform, to know in two minutes exactly which permits their event needs and whether their date is feasible. Unlike city portals (submission only), agencies (unaffordable), and blog guides (generic), it generates a source-cited, deadline-tracked plan for their specific event.

### 2b. Top 3 MVP Value Props

- **The Vitamin (must-have baseline):** Live checklist, document tracker, and portal links for the generated plan: statuses, uploads, deadline alerts per permit. *(F-202, F-203, F-204)*
- **The Painkiller (solves core pain):** The permit navigator itself: a short intake producing a complete, source-cited permit plan with agencies, lead times, fees, and required documents. *(F-101, F-201)*
- **The Steroid (the magic moment):** The instant feasibility verdict. Enter a sidewalk event 30 days out and PopEngine flags "SAPO requires ~60 days: this date is infeasible as scoped," then shows what changes (private venue, no street footprint) would make it work. *(F-102)*

### 2c. Product Principles

1. **Source before assertion.** Every regulatory conclusion traces to a versioned rule and its official source.
2. **Unknown is better than wrong.** The system says "confirm with agency" or asks for the missing fact; it never guesses. Over-prescribing permits destroys trust as surely as omitting them.
3. **Deterministic compliance decisions.** Permit determinations come from versioned rules evaluated deterministically, never from unconstrained AI reasoning. AI (F-6xx) drafts and extracts; rules decide.
4. **Explain every recommendation.** What applies, why, which answer triggered it, what it costs, when it's due, and what could change the result.
5. **Filing eligibility is not approval.** Being inside a filing window never gets presented as a guaranteed permit.
6. **Recalculate, don't patch.** When the event changes, the whole plan is re-evaluated against the rules.
7. **Rules are versioned product data.** Rule updates are data changes, not code changes; every plan records the ruleset version that produced it.
8. **Mobile web first.** Attendees must never be forced to download an app store application to participate on-site, and organizers can run their event from a phone browser.

### 2d. Goals & Non-Goals

#### Goals

- Generate a complete, correct permit plan from event parameters in under 2 minutes, with every requirement citing its official source.
- Detect and flag infeasible event dates at intake, with actionable alternatives.
- Provide one unified deadline timeline across all required agencies, tracked to submission via checklist, alerts, and portal links.
- Grow the same Event record into promotion, check-in, and post-event intelligence (planned scope, Phases 1.5+).

#### Non-Goals

- **Auto-submission to city portals** (agencies require direct applicant filing; PopEngine deep-links to the correct portal with a prepared document package).
- **Guaranteed approval** (PopEngine reports published filing requirements; approval remains agency discretion).
- **Legal advice** (published requirements with citations and last-verified dates; no edge-case interpretation).
- **Jurisdictions beyond NYC in the MVP** (rules architecture supports additional cities post-MVP; F-207).
- **Native iOS/Android apps** (mobile web / PWA only).
- **Foot-traffic sensing or hardware integrations** (attendance analytics derive from check-ins only).
- **In-house payment processing** (ticketing via integration/export only; F-308).
- **Unreviewed AI-generated rules** (no rule becomes authoritative without human review; F-606/F-714).

### 2e. Success Metrics

#### MVP (all observable in a live demo; no real-event denominators)

| Goal | Signal | Metric | Target |
| :- | :- | :- | :- |
| Complete plan generation | Demo events produce correct plans | Required permits identified vs. hand-verified answer key across 6 test scenarios | 100% of required permits, 0 false omissions |
| Trustworthy output | Every requirement is verifiable | Plan line items citing an official source + last-verified date | 100% |
| Feasibility detection | Infeasible dates caught at intake | Scenarios with impossible timelines flagged, with reason | 100% of seeded cases, <5 sec |
| Determinism | Same input, same output | Re-running any scenario against the same ruleset version | Identical plan, 100% |
| Speed | Organizer gets answers fast | Intake start to rendered plan | <2 minutes |
| Check-in flow *(stretch: only if F-401 ships)* | Attendee friction stays near zero | QR scan to completed 2-field check-in | <20 seconds, no app install |

#### Post-MVP metric directions (qualitative until real usage exists; no invented targets)

- Organizer-reported time saved vs. manual research; corrections required per generated plan.
- Repeat usage: share of organizers who plan a second event.
- Plan-to-execution conversion: share of plans turned into tracked checklists and submitted applications.
- Rules freshness: share of rules within their verification window.

## 3. REQUIREMENTS — MVP CORE (iron-clad; Phase 1)

The seven features below must be complete, real, and demoable. No mocks in this path. Acceptance detail lives in `/specs`; the six answer-key scenarios are the acceptance tests for F-201/F-102 verbatim.

### F-101 · Event Intake Questionnaire [P0]

- User completes intake: borough, location type (street / sidewalk / plaza / park / private venue), headcount, event date, food (served/sold, format), amplified sound (Y/N), structures/tents (Y/N + size), open flame (Y/N), alcohol (Y/N), generator/battery power (Y/N).
  - *Note: alcohol and power extend the intake beyond the earlier 8-field draft; answer-key Scenarios E (generator → R6) and F (alcohol → R9) require them as engine inputs. The answer key wins.*
- Branching facts allow "I don't know" (e.g., "does your venue hold a liquor license?"); unknowns are recorded and propagate to the verdict (F-102), never silently defaulted.
- Contradictory inputs are challenged, not silently resolved (e.g., tent dimensions without a tent; private indoor venue plus street closure).
- Intake works on mobile and desktop; completes in under 2 minutes.

### F-201 · Permit Plan Generator [P0]

- System evaluates `rules/nyc-rules.v1.json` (R1–R13) against the intake and returns every applicable requirement: permit name, issuing agency, lead time, fee, required documents, and the rule + triggering answers that produced it.
- Every line cites its official source and last-verified date. Facts the rules data marks `[VERIFY]` render as "confirm with agency"; the system never fills gaps with guesses.
- The system can output "no city event permits required" with the governing caveats (Scenario B); an empty permit set is a first-class, trustworthy result.
- The ruleset version used is stored with the generated plan; re-running the same event on the same version is deterministic.
- A rule-evaluation error fails visibly; a partial plan is never presented as complete.

### F-102 · Feasibility Verdict [P0]

- System computes the timeline backward from the event date across all required permits and renders one of four verdicts: **FEASIBLE / FEASIBLE-AT-RISK / CONDITIONAL / INFEASIBLE**.
- INFEASIBLE names the specific blocking permit and suggests rescopes (e.g., Scenario A: SAPO 60-day lead vs. 35-day runway → private venue or push date). Suggested rescopes are re-evaluated as new scenarios, never presented as pre-approved.
- FEASIBLE-AT-RISK renders when slack falls below the warning threshold (e.g., Scenario D: 10 days of slack → "apply within 10 days"). Threshold is configurable data, not code.
- CONDITIONAL renders when the verdict hinges on a fact the user must confirm (Scenario F: venue liquor license), naming the fact and both outcomes.
- Timeline honors distinct deadline types: published minimums, hard floors (Parks' 21-day cutoff is a cliff, not a gradient), business-day rules (R9: 15 business days), and sequenced dependencies (parks: Parks permit with sound permission first, then NYPD sound permit; R3 dependency rule).

### F-206 · Rules Snapshot Banner [P0]

- "Rules verified as of [date]" renders in-product on every plan, with the ruleset version.
- Each plan line's citation is clickable through to its official source.

### F-202 · Compliance Checklist & Status Tracker [P0]

- One click converts the plan into a live checklist: per-permit status (not started / in progress / submitted / approved / rejected), document upload, notes.
- Checklist items stay linked to their plan lines (and thus rules + sources).

### F-203 · Deadline Alerts [P0]

- Email/SMS (Twilio) alerts fire on computed deadlines, including dependency-sequenced ones (Parks before NYPD sound) and slack warnings.
- Deadline types stay distinct end-to-end; a hard floor is never softened into a recommendation.
- Demo fallback if SMS registration (A2P) is not approved in time: email alerts live, SMS simulated in-product and labeled as such (per `DESIGN.md` fallback rules).

### F-204 · Portal Deep Links + Prepared Packages [P0]

- Every permit links to its correct application portal (E-Apply / Survey123 / precinct filing instructions / FDNY Business) with its prepared document list.
- Portal URLs are verified facts: each carries `[VERIFY]` until confirmed against the official source by the verification owner.
- The UI never implies PopEngine submits the application (non-goal).

## 4. REQUIREMENTS — DEMO STRETCH (Phase 1.5; built only after the green gate)

- **F-401 · App-less QR Check-in [P1]:** attendee scans a physical QR code, gets a mobile-web page, completes a 2-field check-in (name, email/SMS) in under 20 seconds, no app install. The team's founding check-in concept; first stretch priority.
- **F-402 · Live Ops Dashboard [P1]:** real-time check-in counts + capacity gauge vs. F-101 headcount. Check-ins only; never presented as live occupancy (that requires F-410).
- **F-301 · Public Event Page [P1]:** auto-generated from the intake (title, date, venue, description, RSVP button, map) at a shareable URL.
- **F-302 · RSVP / Guest List [P1]:** capacity-aware RSVPs; guest list exports to check-in.
- **F-205 · Insurance Requirement Detector [P1]:** street events flag $1M GL with City as additional insured (R10, scope `[VERIFY]`); parks events render "insurance determined by borough office at review" (R11), never hard-required. *(R10/R11 ship in the day-one ruleset regardless: Scenarios A/C/D/E expect insurance lines from F-201. F-205 is the dedicated UI surfacing, not the rules themselves.)*

## 5. REQUIREMENTS — PLANNED SCOPE (Phases 2–4; outlined for delegation, specs written when scheduled)

Phasing lives in `ROADMAP.md`. Requirement statements here are directional, one line each.

### Execution Hardening (Phase 2)

- **F-107** — User can save an incomplete intake and resume later.
- **F-208** — User can track each application: number, submitted date, agency status, revision requests, inspection, decision, approval conditions.
- **F-209** — User can track estimated/invoiced/paid fees and required vs. submitted documents, including final permits and expirations.
- **F-212** — User can export deadlines, inspections, and milestones to external calendars.
- **F-303** — User can print QR poster/flyer assets pointing at the event page.
- **F-304** — User can generate AI-drafted announcement copy (IG, email, SMS) from intake data, edit, and copy out; no social publishing.
- **F-305** — RSVPs receive scheduled reminders (T-7, T-1, day-of with directions).
- **F-403** — Check-in doubles as opt-in lead capture; entry, marketing-email, and SMS consent are separate; marketing consent is never required for entry.
- **F-404** — User can view attendees across events, flag repeats, and export CSV.
- **F-405** — User gets an auto-generated day-of runbook: permit numbers, load-in checklist, emergency contacts, staff assignments.
- **F-701** — Users have accounts (the capstone demo runs single-tenant without auth).
- **F-203 (full)** — alert escalations, digests, and team reminders.

### Differentiation & Depth (Phase 3)

- **F-103** — User can compare two event scopes side-by-side: permit burden + earliest feasible dates.
- **F-104** — User can roll up permit fees and entered line items against a target budget.
- **F-105** — User keeps a personal venue shortlist whose type tags feed F-101.
- **F-106** — Given a target month, user gets earliest feasible dates per scope (inverse of F-102).
- **F-210/F-211/F-213/F-214** — insurance certificate tracking; site-plan preparation; team task assignment; vendor/contractor compliance tracking.
- **F-306/F-307/F-309** — waitlist auto-promotion; custom registration fields; light event-page branding.
- **F-406/F-407** — post-event P&L (actuals vs. F-104); one-page post-mortem feeding the next event's estimates.
- **F-409–F-413** — offline-tolerant check-in; entry/exit occupancy + re-entry; staff roles + credentialed entry; incident log; consent-gated emergency messaging.
- **F-501/F-502/F-503** — permit performance analytics; historical event comparison; event templates with requirements recalculated (never copied) against the current ruleset.
- **F-702/F-703/F-704** — workspaces; roles & permissions; activity history.

### Platform, AI & Expansion (Phase 4)

- **F-207 (activated)** — city #2 ships as a new rules file + verification pass, not new code.
- **F-108** — address geocoding + park/plaza/precinct/authority resolution with confidence and manual correction.
- **F-109** — coverage states (fully/partially supported, unsupported, ambiguous, awaiting information); required once intake goes open-ended.
- **F-308 / F-408** — ticketing integration/export; inventory low-stock alerts (manual counts or Square webhook; deliberately last).
- **F-601–F-606** — AI assist under the AI policy (`DESIGN.md`): free-text intake, document extraction, email ingestion, update reconciliation, correspondence drafting, rule research. AI proposes; rules decide; users confirm.
- **F-710–F-715** — rules administration: editor, source manager, test runner, version diff, atomic publish/rollback, reported-issue queue. Until then: rules JSON in git, answer key as test runner, PRs as review.

## 6. RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|---|---|---|
| Incorrect regulatory determination | Critical | Deterministic rules; answer-key acceptance tests; `[VERIFY]` discipline (primary sources only, one owner); "confirm with agency" over guessing |
| Rules drift (seasonal/administrative change, documented by IDEKO) | High | Source + last-verified date on every line; snapshot banner (F-206); ruleset versioning; re-verification before demo |
| Users read the plan as an approval guarantee | High | "Filing eligibility is not approval" principle; explicit disclaimer wording in plan output |
| Scope dilution in a 2-week build | High | Iron-clad core + green gate (`DESIGN.md`); stretch is cut, never mocked |
| Twilio A2P/SMS registration delays | Medium | Registration starts day 1 (Phase 0); email-first alerts; labeled SMS simulation as demo fallback |
| AI output treated as authority (future phases) | Critical | AI policy: extraction is proposed data, user-confirmed; rules published only via review (F-714) |

## 7. APPENDIX

- **Technical Stack:** React / Next.js (frontend), Node.js / Express (backend), PostgreSQL (main database + rules tables), Twilio (SMS deadline alerts). *(Redis removed from MVP: check-in volume at demo scale doesn't require a queue layer; re-add post-MVP if needed.)*
- **Rules Engine:** NYC permit logic encoded as data (conditions → permit requirements), not hardcoded. Each rule stores requirement, agency, lead time (typed: minimum / hard floor / business-day), fee, dependencies, source URL, verified status, and last-verified date. Seed data: `rules/nyc-rules.v1.json`, mirroring answer key Part 1. This makes the "extend to other cities" claim credible and keeps rule updates a data change.
- **Known Risk & Mitigation:** Permit rules change seasonally and administratively *(IDEKO practitioner guidance)*. Every output cites source + verification date; the demo states its rules snapshot date on screen (F-206).
- **Demo Script Anchor (Scenario A):** Bushwick sidewalk pop-up, 75 people, DJ, food vendor, 5 weeks out. The plan generates; feasibility fails on SAPO's 60-day lead; PopEngine proposes a private-venue rescope; the new plan passes; a checklist is created with portal links. Full demo sequence in `DESIGN.md`.

## Sources

- THE CITY, "Getting NYC Event Permits Is a Mess" (Mar 10, 2026): thecity.nyc/2026/03/10/permit-streets-party-concert-application-sapo/
- SAPO official scope + E-Apply: nyc.gov/sapo
- Practitioner lead-time guide: nyc-event-venues.com/the-society-brief/navigating-nycs-event-permits-what-you-need-to-know
- IDEKO agency permit-navigation service: ideko.com/insights/behind-the-permits-navigating-nycs-complex-approval-processes
- Neighborhood Commons unified-permitting proposal: neighborhoodcommons.nyc/Unified-Digital-and-Analog-Permit-Applications
- Manhattan barricade/crowd-control permit paths: us.citylaws.org/ny/manhattan/manhattan-event-barricade-and-crowd-control-permits
