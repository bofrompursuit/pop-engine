# PopEngine — Architecture (Canonical)

**Status:** Canonical technical design for Phase 0–1.5. Companion to `PRD.md` (requirements), `ROADMAP.md` (phasing), `DESIGN.md` (lanes, gates, demo). Permit facts referenced here trace to `test-scenario-answer-key.md`; none are asserted beyond it.

## Architecture Decisions (2026-07-21)

| # | Decision | Rationale |
|---|---|---|
| AD-1 | Separate Express API + Next.js frontend (two services) | Canonical stack; long-lived process hosts the alert poller in-process; decoupled lifecycles. Chosen after explicit tradeoff review vs. single Next.js app. |
| AD-2 | `rules/nyc-rules.v1.json` in git is the authoritative ruleset; loaded in-memory at boot; `permit_rules` table is a seeded read model | Engine tests run without a database; rule changes are PRs (matches the manual rules-admin workflow in `DESIGN.md`); "crown jewel is a versioned file" stays literally true. |
| AD-3 | S3-compatible object storage for F-202 document uploads (metadata in Postgres) | Production-correct from day one; survives redeploys. |
| AD-4 | No Redis | Demo-scale check-in volume needs no queue layer (PRD appendix). Alerts run on a DB-backed poller. |
| AD-5 | No auth in MVP | Demo runs single-tenant. F-701 is Phase 2. |
| AD-6 | Rules engine is a pure module (no DB, no HTTP, no clock) | Deterministic; testable against the 6 scenarios as plain unit tests from day 3. `today` is a parameter, never `Date.now()` inside evaluation. |
| AD-7 | Plans are immutable snapshots | Regeneration inserts a new plan row pinned to its ruleset version; history is reproducible even after rules change. |
| AD-8 | TypeScript across the monorepo | The engine package's exported intake/plan/verdict types are the client/server contract; TS makes it enforced rather than conventional. Decided 2026-07-22 (OPEN-QUESTIONS S-5). |

## System Overview

```
┌─────────────────┐     REST/JSON      ┌──────────────────────────┐
│  apps/web        │ ─────────────────▶ │  apps/api (Express)       │
│  Next.js         │                    │  ├─ routes/validation     │
│  (organizer UI,  │                    │  ├─ alert poller (60s)    │
│   plan render,   │                    │  └─ packages/engine ◀── rules/nyc-rules.v1.json
│   stretch pages) │                    └────────┬─────────┬───────┘
└─────────────────┘                              │         │
                                          PostgreSQL   S3-compatible
                                          (system of   (document
                                           record)      uploads)
                                                 │
                                          Twilio (SMS) / SMTP (email)
```

**Stack:** React / Next.js · Node.js / Express · PostgreSQL · S3-compatible object storage · Twilio (SMS) + SMTP (email). No Redis.

**Repo layout:**

```
/apps/web          Next.js frontend (Dev 2 lane; stretch pages Dev 3/4)
/apps/api          Express API + alert poller (Dev 1/3/4 lanes)
/packages/engine   Pure rules engine module (Dev 1 lane)
/rules             nyc-rules.v1.json (authoritative ruleset, versioned like code)
/specs             One spec per F-id
/docs              PRD, ROADMAP, DESIGN, this file, OPEN-QUESTIONS
```

## The Event-Record Spine

One **Event** row is the single source of truth. Four stage-scoped module views read and write it; no module owns a copy:

- **IDEATE (F-101/F-102):** intake writes the event; verdict reads it.
- **COMPLY (F-201–F-206):** plan generation reads intake fields; checklist/alerts hang off the plan.
- **MARKET (F-301/F-302, stretch):** event page + RSVP read the same row (title, date, venue, headcount).
- **OPERATE (F-401/F-402, stretch):** check-in writes back against the same event.

## PostgreSQL Schema (proposed)

> ⚠️ **SINGLE INTEGRATION POINT — the `events` table is the contract between all four lanes. Nobody starts coding until all four devs approve this schema (Phase 0, day 1). Every column change after day 1 is a team decision, not a lane decision.**

### events

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | event title (also feeds F-301) |
| borough | text CHECK IN (manhattan, brooklyn, queens, bronx, staten_island) | |
| location_type | text CHECK IN (street, sidewalk, plaza, park, private_venue) | drives R1/R2/R13 |
| location_name | text | free text (venue/park/street name) |
| headcount | integer | drives R2 (20+ in parks), capacity gauge |
| event_date | date | anchor for backward timeline |
| food_format | text CHECK IN (none, prepackaged_free, free_sampling, served_sold, catered_private) | drives R4; value set mirrors Scenarios A/B/E/F and must track R4's `[VERIFY]` permit classes. `catered_private` (Scenario F: catered, no public sales) deliberately triggers nothing |
| street_event_kind | text CHECK IN (residential_block_party, other), nullable | asked only when location_type = street; drives R1's "Block Party Permit" display name + community-board note (Scenario D). Full SAPO type taxonomy is `[VERIFY]` |
| amplified_sound | boolean | drives R3 |
| structures | boolean | |
| structure_length_ft / structure_width_ft | integer, nullable | dimensions stored, threshold evaluated in rules (R7 threshold is `[VERIFY]`) |
| open_flame | boolean | drives R8 |
| alcohol | boolean | drives R9 (Scenario F) |
| venue_has_liquor_license | text CHECK IN (yes, no, unknown) | the Scenario F branch fact; `unknown` is first-class |
| power_generator | boolean | drives R6 (Scenario E) |
| status | text CHECK IN (draft, planned, live, done) | lifecycle stage marker |
| created_at / updated_at | timestamptz | |

*Unknown-capable fields use explicit `unknown` values, never NULL-as-unknown. Editing any intake field invalidates the current plan client-side and prompts regeneration (recalculate, don't patch).*

### permit_rules *(read model, seeded from `rules/nyc-rules.v1.json` at migration/boot; never hand-edited)*

| Column | Type | Notes |
|---|---|---|
| rule_id | text PK ("R1"…"R13") | |
| ruleset_version | text | e.g. "nyc.v1" |
| permit_name / agency | text | |
| trigger | jsonb | condition tree (see Rules Engine) |
| deadline | jsonb | typed deadline spec |
| fee | jsonb | amount or "varies" + verify TODO |
| dependencies | jsonb | e.g. R3 depends_on R2 when location_type = park |
| required_documents | jsonb | |
| portal | jsonb | portal name + URL (`[VERIFY]` until confirmed) |
| notes | text | engine notes (e.g. R11 borough-office wording) |
| source_url / verified_status / last_verified_date | text / text / date | verbatim from the answer key |

### permit_plans *(immutable; one row per generation)*

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK → events | |
| ruleset_version | text | pinned at generation (lean-plus) |
| verdict | text CHECK IN (feasible, feasible_at_risk, conditional, infeasible) | |
| verdict_detail | jsonb | blocking permit, missing facts + branches, min slack days, rescope suggestions |
| intake_snapshot | jsonb | the intake values evaluated, for reproducibility |
| generated_at | timestamptz | |

### permit_plan_items *(denormalized snapshot of the rule at generation time — plans stay reproducible after rules change)*

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| plan_id | uuid FK → permit_plans | |
| rule_id | text | provenance link |
| permit_name / agency | text | |
| deadline | jsonb | typed deadline snapshot |
| latest_apply_date | date | computed backward from event_date |
| apply_after_date | date, nullable | dependency-gated earliest filing (Parks→NYPD) |
| fee_display | text | |
| required_documents | jsonb | |
| portal_name / portal_url | text | |
| source_url / verified_status / last_verified_date | text / text / date | rendered per line (F-206) |
| item_kind | text CHECK IN (permit, insurance, advisory, note) | R10 is `insurance` (a requirement, not a permit); R11's borough-office line and Scenario F's noise-code advisory are `advisory`/`note`. Acceptance comparisons against the answer key count `permit` + `insurance` lines; advisories/notes compare as expected-output text |

### checklist_items

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| plan_item_id | uuid FK → permit_plan_items | keeps status linked to rule + source |
| status | text CHECK IN (not_started, in_progress, submitted, approved, rejected) | |
| notes | text | |
| updated_at | timestamptz | |

### documents

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| checklist_item_id | uuid FK | |
| filename / content_type / size_bytes | text / text / bigint | |
| storage_key | text | S3 object key; access via short-lived signed URLs |
| uploaded_at | timestamptz | |

### alerts

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| checklist_item_id | uuid FK, nullable | |
| alert_type | text CHECK IN (deadline_reminder, slack_warning, dependency_unlocked) | |
| channel | text CHECK IN (email, sms) | |
| send_at | timestamptz | |
| status | text CHECK IN (pending, sent, failed) | |
| sent_at | timestamptz, nullable | |
| payload | jsonb | rendered message content |

### rsvps *(stretch, F-302 — in the day-1 schema so stretch needs no migration)*

id uuid PK · event_id FK · name text · email text · phone text nullable · status CHECK IN (confirmed, cancelled) · created_at

### checkins *(stretch, F-401)*

id uuid PK · event_id FK · rsvp_id FK nullable · name text · contact text (email or phone) · checked_in_at timestamptz

## Rules Engine (packages/engine)

A pure function, no I/O:

```
evaluate(intake, ruleset, today) → {
  items: [{rule_id, permit_name, agency, deadline, latest_apply_date,
           apply_after_date?, fee, documents, portal, source, status,
           item_kind, triggered_by: [field: value]}],
  verdict: FEASIBLE | FEASIBLE_AT_RISK | CONDITIONAL | INFEASIBLE,
  verdict_detail: {blocking_permit?, min_slack_days?,
                   missing_facts?: [{field, branches: [{value, verdict}]}],
                   rescope_suggestions?: [{change, expected_effect}]}
}
```

### Rules as data

Each rule in `rules/nyc-rules.v1.json` carries: `id`, `trigger` (condition tree over intake fields), `permit`, `agency`, `deadline` (typed), `fee`, `dependencies`, `required_documents`, `portal`, `notes`, `source_url`, `verified_status` (verbatim from the answer key), `last_verified_date`. Full schema ships with the rules file deliverable. A second city is a new JSON file, not new code (F-207): the engine knows condition operators and deadline types, never NYC specifics.

### Condition evaluation (tri-state)

- Triggers are trees of conditions `{field, op, value}` with `all` / `any` combinators; ops: `eq`, `in`, `gt`, `gte`, `bool`. Fields reference F-101 intake columns or declared derived values (e.g. structure area = length × width; null dimensions with `structures = true` evaluate to `unknown`, not `false`).
- Collected-but-unknown answers (e.g. `venue_has_liquor_license: unknown`) evaluate tri-state `unknown` and drive CONDITIONAL. Fields the intake does not collect at all (declared `collected: false` in the rules file, e.g. `procession`, `selling_merchandise`) evaluate `false` with a coverage note on the rule; otherwise every plan would go CONDITIONAL on facts nobody was asked.
- Evaluation is tri-state: `true` / `false` / `unknown`. An `unknown` input (e.g. `venue_has_liquor_license: unknown`) makes dependent requirements conditional rather than silently included or dropped.
- The empty result is first-class: R13 events produce zero permit items plus their advisory notes (Scenario B). Over-prescribing is a failure mode.
- `[VERIFY]`-status facts render as "confirm with agency" on the plan line; the engine never fills a gap.

### Typed deadlines (never one number)

| Type | Example | Semantics |
|---|---|---|
| `lead_days` (min/max) | R1 SAPO ~60 days; R6 FDNY 45–60 | latest_apply = event_date − conservative bound (**max** where a range is given; Scenario E's "~75 days of slack" uses R6's 60, not 45) |
| `hard_floor_days` | R2 Parks: applications within 21 days NOT accepted | a cliff: past it → INFEASIBLE, no gradient |
| `processing_days` | R2 Parks: 30-day processing | used for dependency sequencing; runway shorter than processing (the 22–29-day band) → FEASIBLE-AT-RISK (interpretation; the answer key is silent on this band, see OPEN-QUESTIONS) |
| `business_days` | R9 SLA: ≥15 business days | v1 evaluates via the key's stated calendar approximation (15 business ≈ 21 calendar) so relative-date fixtures stay deterministic; true business-day calendar math deferred |
| `dependency_gated` | R3 in parks: file after Parks grants sound permission | apply_after = Parks apply date + processing_days; slack for gated items = latest_apply − apply_after |
| `unverified` | R4/R7/R8: lead time "varies" `[VERIFY]` | item is listed and rendered "confirm lead time with agency"; excluded from verdict and slack arithmetic (Scenarios A/D/E expect these items present without them affecting the verdict) |

A rule's `deadline` may combine components: R2 carries both `hard_floor_days` and `processing_days`.

### Verdict algorithm

1. Resolve required permits from triggers (tri-state).
2. For each required permit, compute `latest_apply_date` backward from `event_date`; apply dependency sequencing to get `apply_after_date` where relevant.
3. If any `unknown` fact changes the requirement set or the timeline, evaluate every branch fully (running steps 4–6 inside each branch). All branches agree → that verdict. Branches diverge → **CONDITIONAL**, listing the missing fact and each branch's verdict (Scenario F: license yes → feasible branch; license no → SLA ~21 calendar days > 20-day runway → infeasible branch). Unknown-conditioned items never trigger INFEASIBLE directly — ordering matters: checking windows before branching would wrongly render Scenario F INFEASIBLE.
4. If any definitively-required permit's window is already impossible (`today` past latest_apply, a hard floor breached, or apply_after > latest_apply) → **INFEASIBLE**, naming the blocking permit; generate rescope suggestions by re-evaluating modified intakes (e.g. `location_type: private_venue`) — suggestions are re-evaluated scenarios, never assertions.
5. Otherwise, if minimum slack across permits < warning threshold → **FEASIBLE-AT-RISK** with "apply within N days" (Scenario D: 10 days). Threshold is data in the rules file config (default 14 days — the answer key's "e.g." value; flagged in OPEN-QUESTIONS).
6. Otherwise **FEASIBLE**.

Determinism: same intake + same ruleset version + same `today` → identical output. `today` is injected; the engine never reads the clock. The six answer-key scenarios run as the engine's unit-test suite; the answer key wins every disagreement.

## API Surface (Phase 1; stretch marked)

Base: `apps/api`, JSON over REST. No auth in MVP (AD-5).

| Method + Path | Purpose | Feature |
|---|---|---|
| POST /api/events | Create event from intake (validates contradictions, returns field errors) | F-101 |
| GET /api/events/:id | Fetch event | F-101 |
| PATCH /api/events/:id | Edit intake (marks current plan stale) | F-101 |
| POST /api/events/:id/plan | Generate plan + verdict (new immutable plan row) | F-201/F-102 |
| GET /api/events/:id/plan | Latest plan with items, verdict, ruleset version | F-201/F-206 |
| GET /api/rules/meta | Ruleset version + snapshot date (banner) | F-206 |
| POST /api/events/:id/checklist | Materialize checklist from latest plan; schedules alerts | F-202/F-203 |
| GET /api/events/:id/checklist | Checklist with statuses + documents | F-202 |
| PATCH /api/checklist-items/:id | Update status/notes | F-202 |
| POST /api/checklist-items/:id/documents | Upload document (API streams to S3; returns metadata) | F-202 |
| GET /api/documents/:id/url | Short-lived signed download URL | F-202 |
| POST /api/events/:id/alerts/test | Fire one alert immediately (demo utility, labeled) | F-203 |
| GET /e/:eventId *(stretch)* | Public event page data | F-301 |
| POST /api/events/:id/rsvps *(stretch)* | Create RSVP (capacity-aware) | F-302 |
| POST /api/events/:id/checkins *(stretch)* | 2-field check-in | F-401 |
| GET /api/events/:id/stats *(stretch)* | Check-in counts + capacity (polled ~5s; no websockets in MVP) | F-402 |

Error principle: rule-evaluation failures return an explicit error; the API never returns a partial plan as complete.

## Alert Scheduling (no Redis)

- Alerts are computed and inserted when a checklist is materialized (and recomputed on plan regeneration): one `deadline_reminder` per permit at `latest_apply_date − reminder_offset`, `slack_warning` for at-risk permits, `dependency_unlocked` when a gated permit's window opens.
- An in-process poller in Express ticks every 60s: `SELECT … WHERE status='pending' AND send_at <= now()` → send via Twilio (SMS) / SMTP (email) → mark `sent`/`failed`. Failures retry on the next tick.
- Day-granularity deadlines make 60s polling generous. If Twilio A2P approval misses demo day: email sends live, SMS renders as a labeled in-product simulation (`DESIGN.md` fallback rules).

## Deployment (Dev 4 lane)

- Two services (web + api) on any node host (Railway / Render / Fly), managed Postgres (Neon / Supabase / host-provided), S3-compatible bucket (S3 / R2 / Supabase storage).
- Environment variables per service: `DATABASE_URL`, `S3_*`, `TWILIO_*`, `SMTP_*`, `RULES_FILE` (path, defaults to `rules/nyc-rules.v1.json`), `API_BASE_URL` / `WEB_ORIGIN` (CORS).
- Demo environment is seeded via script (scenario events pre-loaded as drafts) and never redeployed on demo day after final rehearsal.

## Cross-Cutting Notes

- **CORS:** api allows the web origin only.
- **Shared types:** `packages/engine` exports the intake/plan/verdict types; both apps import from it.
- **Migrations:** plain SQL or a light tool (node-pg-migrate); the `events` migration is PR #1 and requires all-hands approval (Phase 0).
- **Rules loading:** api boots by validating `rules/nyc-rules.v1.json` (schema check + all 13 rules present) and syncing `permit_rules`; a validation failure aborts boot loudly.
- **Observability (MVP-appropriate):** structured request logs + an engine-evaluation trace (rule → tri-state result) attached to each plan row in `verdict_detail`; nothing fancier until Phase 2.
