# PopEngine — Baseline Manifest

**Purpose:** the single entry point stating which artifact versions are current. An artifact is implementable when its row is APPROVED. Anything PROPOSED needs the named approval first. Update this file in the same PR as any status change.
**Last updated:** 2026-07-25

| Concern | Artifact | Status | Needs |
|---|---|---|---|
| Product requirements | `docs/PRD.md` | APPROVED 2026-07-22 against nyc.v2.1; pointer retargeted to nyc.v2.4 on 2026-07-25 with no regulatory change | — |
| Feature registry + phasing | `docs/ROADMAP.md` | APPROVED (2026-07-22) | — |
| Delivery lanes, gates, demo | `docs/DESIGN.md` | APPROVED (2026-07-22) | — |
| Technical architecture (Phase 0–1.5) | `docs/ARCHITECTURE.md` | APPROVED (2026-07-22) | events-schema migration still needs all-4-devs sign-off before coding (Phase 0) |
| Architecture target (Phase 2+) | `docs/ARCHITECTURE-FUTURE.md` | PROPOSED | team read + approval; not an instruction to build |
| Governance | `docs/DOCUMENTATION-GOVERNANCE.md` | APPROVED (adopted 2026-07-22; authority-by-concern + conflict protocol in force) | — |
| Agent/contributor rules | `/AGENTS.md` + `/CONTRIBUTING.md` | APPROVED (2026-07-22) | — |
| Deployment providers (Phase 0) | Provider baseline below + `DEPLOY.md` | APPROVED (2026-07-23, issue #1) | provisioning is a runbook; secrets set per environment |
| **Current NYC ruleset** | `rules/nyc-rules.v2.4.json` (nyc.v2.4) | **APPROVED** — v2.1 team-ratified 2026-07-22 (OPEN-QUESTIONS B-2, all four devs); v2.2, v2.3 and v2.4 authorized by the product owner 2026-07-25, each for the semantic change named in its own `provenance` | per-fact promotion SOURCE_CONFIRMED → VERIFIED continues during the build (verification issue; OPEN-QUESTIONS §2) |
| **Scenario fixtures** | `docs/test-scenario-answer-key.md` (v3) | **APPROVED** (2026-07-22, with the ruleset) | now the green-gate acceptance suite |
| Evidence record | `docs/VERIFICATION-SOURCES.md` | ACTIVE RECORD (Rounds 1–2, 2026-07-22) | grows with each verification pass |
| Open questions | `docs/OPEN-QUESTIONS.md` | ACTIVE REGISTER | — |
| Phase 1 specs | `specs/F-*.md` | APPROVED (2026-07-22; F-101/F-102/F-201 approved 2026-07-24, re-read before building) | specs carry no per-file status header, so this row is their only approval record (governance §7) |
| Superseded/draft material | `rules/proposals/*`, `docs/proposals/*` | ARCHIVED / PROPOSED drafts | never build from these |
| Ruleset v2.3 lineage | git commit `5f32040` | SUPERSEDED (2026-07-25 by nyc.v2.4) | historical only; v2.4 publishes two facts the engine previously held in code — the intake fields SAPO-PLAZA-001's by-level deadline keys on, and DOB-TENT-001's exactly-400-sq-ft conditionality — and changes no regulatory content |
| Ruleset v2.2 lineage | git commit `3a1b7ba` | SUPERSEDED (2026-07-25 by nyc.v2.3) | historical only; v2.3 makes DOB-ASSEMBLY-001's published "earlier than 10 days" bound machine-readable and changes no regulatory content |
| Ruleset v2.1 lineage | git commit `b0214b4` | SUPERSEDED (2026-07-25 by nyc.v2.2) | historical only; v2.2 changes one rule's disposition (DOHMH-ORGANIZER-NOTIFY-001) and no regulatory content |
| Ruleset v1 lineage | git commit `28e937d` | SUPERSEDED | historical only |

**Status 2026-07-22:** all rows current; Phase 0 kickoff is unblocked. The remaining gate before lane coding is the events-schema migration sign-off by all four devs (Phase 0, ARCHITECTURE.md schema banner). `ARCHITECTURE-FUTURE.md` remains PROPOSED as a planning target only.

**Provider baseline (Phase 0, resolved 2026-07-23, issue #1; closes OPEN-QUESTIONS T-2 and T-3):**

| Concern | Choice | Notes |
|---|---|---|
| Host (web + api) | Railway, one project, two services | api is a long-lived process (AD-1); the alert poller stays in-process |
| Postgres | Supabase Postgres | plain `DATABASE_URL` |
| Object storage | Supabase Storage, S3-compatible endpoint | SigV4 signed URLs; F-202 storage code stays vendor-neutral |
| Email / SMTP | Resend | live in the demo |
| SMS | Twilio | A2P 10DLC started; email-live + labeled-SMS-simulation until approved (T-1) |
| Access gate (AD-12) | Cloudflare Access | host-level, email-OTP; synthetic data only |
| Migration tool | node-pg-migrate | installs with the events migration (issue #2), not the scaffold |

Setup steps live in `DEPLOY.md`. Provider SDKs (`pg`, `@aws-sdk/client-s3`, `resend`, `twilio`, `node-pg-migrate`) install with their consuming issue, not the scaffold.

**Version conventions (current):** ruleset `nyc.vMAJOR.MINOR` · rules schema `popengine-rules/v2` · fixtures follow the ruleset version they derive from. Full semver-per-artifact (per `docs/proposals/baseline-manifest-codex-draft.md`) is a Phase 2 upgrade.
