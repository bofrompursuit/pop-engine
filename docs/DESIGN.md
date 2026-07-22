# PopEngine — Delivery Design (Canonical)

**Status:** Canonical companion to `ROADMAP.md`. Covers how the team builds: lifecycle model, ID policy, quality gates, lanes, dependencies, and the demo plan. Technical design (schema, rules engine, API) lives in `ARCHITECTURE.md`.

## Decisions of 2026-07-21

1. **The iron-clad MVP is permit planning:** F-101, F-201, F-102, F-206, F-202, F-203, F-204. Complete, real (no mocks), demoable. Everything else is a nice-to-have.
2. **The demo is a permit-planning deep dive**, not a four-stage traversal. Stretch features appear only if actually built. This replaces the earlier degradation order ("F-301/302 degrade before F-401 gets cut"); check-in is now stretch, not guaranteed.
3. **Lean-plus rigor** adopted into the core: intake contradiction checks (F-101), "I don't know" propagating to CONDITIONAL (F-101 + F-102), ruleset version stored with every plan (F-201/F-206), distinct deadline types in the rules schema (rules JSON + F-203). Location/authority resolution and coverage states are post-MVP (F-108, F-109).
4. **The roadmap covers the full product vision.** Phases 2+ exist for delegation and direction, not capstone deadlines.

## Feature ID Policy

F-xxx IDs are permanent shared vocabulary across PRD, roadmap, specs, branches, and PRs.

- Once assigned, an ID's meaning never changes, and IDs are never reused.
- New features get new, non-colliding IDs; `ROADMAP.md` is the authoritative ID registry.
- Closely related capabilities are absorbed into existing IDs rather than split: run-of-show lives in F-405 (day-of runbook); consent separation lives in F-403 (lead capture & consent).

## Lifecycle Model (the spine of the architecture)

An **EVENT** is the core entity. It moves through four stages, and every stage-scoped feature attaches to exactly one:

- **STAGE 1 — IDEATE:** concept, venue, date, budget, feasibility (F-101–F-109)
- **STAGE 2 — COMPLY:** permits, documents, deadlines, insurance (F-201–F-214)
- **STAGE 3 — MARKET:** event page, promotion, RSVPs, reminders (F-301–F-309)
- **STAGE 4 — OPERATE & ADMINISTER:** check-in, day-of ops, leads, money, post-mortem (F-401–F-413)

Three horizontal domains sit beside the stages: **Cross-Event Intelligence** (F-5xx), **AI Assist** (F-6xx), **Platform & Rules Administration** (F-7xx).

**Architectural implication:** one Event record with stage-scoped modules, not four apps. The permit plan (Stage 2) is generated FROM the intake (Stage 1); the event page (Stage 3) is generated FROM the same intake; check-in (Stage 4) writes back to the same record. One source of truth, four views.

## AI Policy (governs F-6xx)

AI may draft and extract; it may never make the authoritative permit determination or publish a rule. Deterministic evaluation (F-201) is the only source of regulatory output. Every AI-extracted value is user-confirmed before it enters rule evaluation.

## Definition of Iron-Clad (Phase 1 quality bar)

- Deterministic engine output: same event + same ruleset → same plan, every time.
- Every plan line cites an official source and last-verified date.
- 6/6 answer-key scenarios pass: 100% of required permits, zero false omissions, correct verdicts.
- Zero fabricated permit facts; gaps render as "confirm with agency," never guesses.
- All demo-critical [VERIFY] rows (answer key Part 3) resolved against primary sources by the verification owner before the demo.
- Nothing in the core path is mocked, seeded, or hardcoded to look like engine output.

## Green Gate (end of day 8)

All 6 scenarios pass end-to-end through the real UI. Stretch work (Phase 1.5) may not begin before the gate is green. If the gate slips, stretch is cut entirely — the core always wins.

Permitted demo fallbacks for stretch features: seeded RSVP data, simulated email send shown in-product. Never permitted: hardcoded permit plans presented as engine output, fake source citations, hardcoded verdicts.

## Team Lanes (Phase 0–1.5)

One integration point (the `events` schema — agreed by all four devs before any lane codes); four lanes with minimal merge conflicts:

- **Dev 1 — Rules engine + verdict:** F-201, F-102; owns `rules/nyc-rules.v1.json` fidelity to the answer key. Verify: 6/6 scenarios pass as automated tests.
- **Dev 2 — Intake + plan UI:** F-101 (incl. contradiction checks, "I don't know"), F-206, plan rendering. Verify: Scenario A renders end-to-end with citations + snapshot banner.
- **Dev 3 — Checklist + portals:** F-202, F-204. Verify: plan converts to checklist; every permit links to its portal with its document list.
- **Dev 4 — Alerts + platform:** F-203, DB migrations, deploy, demo environment; **owns the [VERIFY] verification task list** (answer key Part 3, primary sources only). Verify: a seeded deadline fires a real email/SMS; all demo-critical [VERIFY] rows resolved.

Stretch assignments after the green gate: Dev 4 → F-401/F-402 (QR + dashboard), Dev 3 → F-301/F-302, Dev 1 → F-205, Dev 2 → demo polish.

## Dependency Graph (build-order constraints)

- F-101 → everything (single source of truth)
- F-201 → F-102, F-202, F-203, F-204, F-205, F-208, F-405; ruleset versioning (F-201) → F-503, F-712, F-713, F-714
- F-301 → F-302 → F-401 → F-402/F-403 → F-404, F-407; F-302 → F-306/F-307
- F-104 → F-406 → F-407 → F-501/F-502
- F-701 → F-702 → F-703/F-704 → F-213
- Twilio plumbing: built once for F-203, reused by F-305, F-413
- QR infra: built once for F-401, reused by F-303
- F-601 (open-ended intake) → F-109 becomes necessary (coverage envelope)

## Demo Plan (permit-planning deep dive)

1. **Scenario A (anchor):** Bushwick sidewalk pop-up, 35 days out → intake → INFEASIBLE, SAPO named as blocker → rescope to private venue → plan passes → checklist → portal links.
2. **Scenario B (the judge test):** gallery event → "no city event permits required" with the confirm-notes. The system that can say "nothing" is the system you trust.
3. **Scenario D (the yellow state):** block party, 70 days out → FEASIBLE-AT-RISK, "apply within 10 days."
4. **Scenario F (the branch):** rooftop party → CONDITIONAL, hinging on the venue's liquor license.
5. Rules snapshot banner + a source citation click-through, live.
6. If stretch is green: RSVP a seeded guest, then live QR check-in on audience phones.

## Rules Administration (until F-710–F-715 exist)

Performed manually: the rules JSON is versioned in git, the answer key is the test runner, and PRs are the review workflow.

## Spec-Driven Development

- One spec per F-id in `/specs`, core first, in build order: F-101, F-201, F-102, F-206, F-202, F-203, F-204; then stretch: F-205, F-301, F-302, F-401, F-402. Phases 2+ get specs when scheduled, not now.
- F-201's spec embeds the six answer-key scenarios verbatim as acceptance criteria; the answer key wins every disagreement until a primary source says otherwise.
- `rules/nyc-rules.v1.json` is the crown jewel; version it like code. No fact enters it that is not in the answer key; gaps are [VERIFY] + TODO, never guesses.
