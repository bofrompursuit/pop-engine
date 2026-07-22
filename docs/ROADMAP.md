# PopEngine — Roadmap (Canonical)

**Status:** Canonical.
**Companion docs:** `PRD.md` (requirements) · `DESIGN.md` (lifecycle model, lanes, gates, demo plan, dependency graph) · `test-scenario-answer-key.md` (MVP ground truth).
**Feature IDs:** F-xxx IDs are permanent shared vocabulary; once assigned, an ID's meaning never changes. Full ID policy in `DESIGN.md`.

## Phase 0 — Foundation (days 1–2, all hands)

Prerequisites, not features:

- Agree the `events` schema (the team's single integration point) — approved by all four devs before any lane codes.
- Seed `rules/nyc-rules.v1.json` from the answer key Part 1 (13 rules, statuses verbatim).
- Repo scaffold, deploy target, Twilio account + A2P registration started.

## Phase 1 — MVP Core (capstone; iron-clad, no mocks)

The permit-planning spine. Must pass all 6 answer-key scenarios; "iron-clad" is defined in `DESIGN.md`.

**Week 1:**

- **F-101 · Event Intake Questionnaire** — borough, location type, headcount, date, food, sound, structures + size, open flame; contradiction checks; "I don't know" allowed on branching facts.
- **F-201 · Permit Plan Generator** — rules-engine output: permits, agencies, lead times, fees, documents, source citations + last-verified dates; ruleset version stored per plan.
- **F-102 · Feasibility Verdict** — backward-computed timeline; FEASIBLE / FEASIBLE-AT-RISK / CONDITIONAL / INFEASIBLE + rescope suggestions; unknown facts propagate to CONDITIONAL.
- **F-206 · Rules Snapshot Banner** — "rules verified as of [date]" in-product; per-line citations; ruleset version visible.

**Week 2:**

- **F-202 · Compliance Checklist & Status Tracker** — per-permit status, document upload, notes; generated from F-201.
- **F-203 · Deadline Alerts** — email/SMS (Twilio) on computed deadlines; deadline types stay distinct (published minimum, hard floor, business-day, dependency-gated).
- **F-204 · Portal Deep Links + Prepared Packages** — each permit links to its correct portal (E-Apply / Survey123 / precinct / FDNY Business) with its document list.

## Phase 1.5 — Demo Stretch (only after the green gate)

In order of retention; anything unfinished is dropped from the demo, never mocked:

- **F-401 · App-less QR Check-in** — scan → 2-field mobile-web check-in (<20s, no install).
- **F-402 · Live Ops Dashboard** — real-time check-in counts + capacity gauge (check-ins only, never occupancy).
- **F-301 · Public Event Page** — auto-generated from intake; shareable URL with RSVP button.
- **F-302 · RSVP / Guest List** — capacity-aware; exports to check-in.
- **F-205 · Insurance Requirement Detector** — flags $1M GL + City-as-additional-insured where required; "borough office determines" note for parks.

## Phase 2 — Execution Hardening (post-capstone)

- **F-107 · Save & Resume** — save an incomplete intake/event and return later.
- **F-208 · Application Status Tracking** — application number, submitted date, agency status, revisions, inspection, decision, conditions.
- **F-209 · Fee & Document Ledger** — estimated/invoiced/paid fees; required vs. submitted documents; final permits + expirations.
- **F-212 · Calendar Export & Sync** — deadlines, inspections, milestones to external calendars.
- **F-303 · QR Marketing Assets** — printable QR poster/flyer for the event page; reuses F-401's QR infra.
- **F-304 · Announcement Composer** — AI-drafted event copy (IG caption, email, SMS) from intake data; composer, not publisher.
- **F-305 · Reminder Campaigns** — scheduled email/SMS to RSVPs (T-7, T-1, day-of); reuses F-203's Twilio plumbing.
- **F-403 · Lead Capture & Consent** — check-in doubles as opt-in lead collection; entry/marketing/SMS consent kept separate.
- **F-404 · Attendee CRM & Export** — attendee list across events; CSV export; repeat-attendee flag.
- **F-405 · Day-of Runbook** — auto-generated event-day sheet: permit numbers, load-in checklist, contacts, staff assignments.
- **F-701 · Authentication** — user accounts (MVP demo runs single-tenant without auth).
- **F-203 (full)** — alert escalations, digests, team reminders.

## Phase 3 — Differentiation & Depth

- **F-103 · Scope Comparator** — side-by-side permit burden + earliest feasible date for two configurations.
- **F-104 · Budget Estimator** — permit fees + user-entered line items vs. target budget.
- **F-105 · Venue Shortlist** — personal candidate-venue list feeding F-101 (not a marketplace).
- **F-106 · Date Advisor** — given a target month, earliest feasible dates per scope; inverse of F-102.
- **F-210 · Insurance Certificate Tracking** — policy, coverage, additional-insured, certificate status, expiration.
- **F-211 · Site Plan Preparation** — site-plan checklist, dimensions, uploads, versions.
- **F-213 · Team Task Assignment** — assign requirements/tasks to workspace members.
- **F-214 · Vendor & Contractor Compliance** — vendor contacts, insurance, permits, arrival times, contract status.
- **F-306 · Waitlist** — auto-promote when capacity frees.
- **F-307 · Custom Registration Fields** — organizer-defined extra RSVP fields.
- **F-309 · Organizer Branding** — limited event-page branding.
- **F-406 · Post-Event P&L** — actuals vs. F-104 budget; revenue, cost rollup, margin.
- **F-407 · Post-Mortem Report** — attendance vs. RSVP, leads, P&L, permit timeline adherence; feeds next event's F-104.
- **F-409 · Offline-Tolerant Check-in** — tolerate connectivity loss; sync later.
- **F-410 · Entry/Exit Occupancy & Re-entry** — both-direction counting; only then may the dashboard show occupancy.
- **F-411 · Staff Roles & Credentialed Entry** — role-limited check-in controls; vendor/performer entry categories.
- **F-412 · Incident Log** — timestamped incidents with attachments.
- **F-413 · Emergency Messaging** — organizer-triggered attendee comms, consent-gated.
- **F-501 · Permit Performance Analytics** — late submissions, revisions, unexpected requirements, delays across events.
- **F-502 · Historical Event Comparison** — permit burden, cost, prep time, attendance across similar events.
- **F-503 · Event Templates & Reuse** — duplicate a past event; requirements recalculated against the current ruleset, never copied.
- **F-702 · Workspaces** — organizations grouping events + members.
- **F-703 · Roles & Permissions** — owner/admin/organizer/contributor/check-in staff/viewer/rules admin.
- **F-704 · Activity History** — answer changes, recalculations, rule version changes, uploads, status changes.

## Phase 4 — Platform, AI & Expansion

- **F-207 · Multi-Jurisdiction Rules Architecture (activated)** — city #2 as a data import, not a rewrite. (Architecture requirement from day 1; activation is Phase 4.)
- **F-108 · Location & Authority Resolution** — geocoding; park/plaza/precinct/community-board identification; confidence + manual correction.
- **F-109 · Coverage-State Classification** — fully/partially supported, unsupported, ambiguous, awaiting-information states (required once intake goes open-ended via F-601).
- **F-308 · Ticketing Integration** — integrate/export to established providers; no in-house payments.
- **F-408 · Inventory Low-Stock Alerts** — manual counts or Square webhook (deliberately last).
- **F-601 · Free-Text Event Intake** — description → proposed structured answers; user confirms before evaluation.
- **F-602 · Document Extraction** — application number, deadline, fee, status from uploads; user confirms.
- **F-603 · Email Ingestion** — match agency correspondence to the right event/application.
- **F-604 · Update Reconciliation** — detect when a later document changes a deadline, fee, or status.
- **F-605 · Agency Correspondence Drafting** — draft, never auto-send.
- **F-606 · Rule Research Assistant** — internal: flag possible source changes for human review.
- **F-710 · Rule Editor** — draft/edit rules as data.
- **F-711 · Source Manager** — source metadata, excerpts, archives, broken-link detection.
- **F-712 · Rule Test Runner** — run affected scenarios before publishing a rule change.
- **F-713 · Ruleset Version Comparison** — diff two ruleset versions.
- **F-714 · Publish & Rollback** — atomic ruleset publication; restore prior version.
- **F-715 · Reported-Issue Queue** — users flag wrong/missing/outdated requirements.
- Square/POS integrations.
