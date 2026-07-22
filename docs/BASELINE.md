# PopEngine — Baseline Manifest

**Purpose:** the single entry point stating which artifact versions are current. An artifact is implementable when its row is APPROVED. Anything PROPOSED needs the named approval first. Update this file in the same PR as any status change.
**Last updated:** 2026-07-22

| Concern | Artifact | Status | Needs |
|---|---|---|---|
| Product requirements | `docs/PRD.md` | APPROVED (reconciled to nyc.v2.1, 2026-07-22) | — |
| Feature registry + phasing | `docs/ROADMAP.md` | APPROVED (2026-07-22) | — |
| Delivery lanes, gates, demo | `docs/DESIGN.md` | APPROVED (2026-07-22) | — |
| Technical architecture (Phase 0–1.5) | `docs/ARCHITECTURE.md` | APPROVED (2026-07-22) | events-schema migration still needs all-4-devs sign-off before coding (Phase 0) |
| Architecture target (Phase 2+) | `docs/ARCHITECTURE-FUTURE.md` | PROPOSED | team read + approval; not an instruction to build |
| Governance | `docs/DOCUMENTATION-GOVERNANCE.md` | APPROVED (adopted 2026-07-22; authority-by-concern + conflict protocol in force) | — |
| Agent/contributor rules | `/AGENTS.md` + `/CONTRIBUTING.md` | APPROVED (2026-07-22) | — |
| **Current NYC ruleset** | `rules/nyc-rules.v2.1.json` (nyc.v2.1) | **APPROVED** (team ratification 2026-07-22) | per-fact promotion SOURCE_CONFIRMED → VERIFIED continues during the build (verification issue; OPEN-QUESTIONS §2) |
| **Scenario fixtures** | `docs/test-scenario-answer-key.md` (v3) | **APPROVED** (2026-07-22, with the ruleset) | now the green-gate acceptance suite |
| Evidence record | `docs/VERIFICATION-SOURCES.md` | ACTIVE RECORD (Rounds 1–2, 2026-07-22) | grows with each verification pass |
| Open questions | `docs/OPEN-QUESTIONS.md` | ACTIVE REGISTER | — |
| Phase 1 specs | `specs/F-*.md` | APPROVED except F-101/F-102/F-201 (updated 2026-07-22, re-read before building) | — |
| Superseded/draft material | `rules/proposals/*`, `docs/proposals/*` | ARCHIVED / PROPOSED drafts | never build from these |
| Ruleset v1 lineage | git commit `28e937d` | SUPERSEDED | historical only |

**Status 2026-07-22:** all rows current; Phase 0 kickoff is unblocked. The remaining gate before lane coding is the events-schema migration sign-off by all four devs (Phase 0, ARCHITECTURE.md schema banner). `ARCHITECTURE-FUTURE.md` remains PROPOSED as a planning target only.

**Version conventions (current):** ruleset `nyc.vMAJOR.MINOR` · rules schema `popengine-rules/v2` · fixtures follow the ruleset version they derive from. Full semver-per-artifact (per `docs/proposals/baseline-manifest-codex-draft.md`) is a Phase 2 upgrade.
