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
| **Current NYC ruleset** | `rules/nyc-rules.v2.1.json` (nyc.v2.1) | **PROPOSED** | verification-owner (Dev 4) sign-off of SOURCE_CONFIRMED facts; team ratification |
| **Scenario fixtures** | `docs/test-scenario-answer-key.md` (v3) | **PROPOSED** | approved together with the ruleset; then it is the green-gate acceptance suite |
| Evidence record | `docs/VERIFICATION-SOURCES.md` | ACTIVE RECORD (Rounds 1–2, 2026-07-22) | grows with each verification pass |
| Open questions | `docs/OPEN-QUESTIONS.md` | ACTIVE REGISTER | — |
| Phase 1 specs | `specs/F-*.md` | APPROVED except F-101/F-102/F-201 (updated 2026-07-22, re-read before building) | — |
| Superseded/draft material | `rules/proposals/*`, `docs/proposals/*` | ARCHIVED / PROPOSED drafts | never build from these |
| Ruleset v1 lineage | git commit `28e937d` | SUPERSEDED | historical only |

**Hard rule for coding agents and humans:** do not start a feature branch while the ruleset row is PROPOSED. The two PROPOSED rows above are the only blockers to the Phase 0 kickoff; everything else is current.

**Version conventions (current):** ruleset `nyc.vMAJOR.MINOR` · rules schema `popengine-rules/v2` · fixtures follow the ruleset version they derive from. Full semver-per-artifact (per `docs/proposals/baseline-manifest-codex-draft.md`) is a Phase 2 upgrade.
