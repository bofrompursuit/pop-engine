# Decision brief: SPEC-CONFLICT #127 and #144

**Status:** NOT APPROVED, and not a decision. This document resolves nothing. It records what is
verifiably true on `main` at `048bff3` so that the two product-owner decisions can be made against
the current tree rather than against issue text written days ago.

**Method:** every claim below was checked against `main` rather than taken from the issue. Where a
claim could not be verified either way it says so. No approved artifact is changed by this document,
and no permit fact is asserted anywhere in it.

---

# SPEC-CONFLICT #127: two F-id assignments

## Every location the issue cites verifies exactly

| Issue claim | On `main` | Verdict |
|---|---|---|
| `ROADMAP.md:57` lists F-203 (full) for escalations, digests, team reminders | `- **F-203 (full)** — alert escalations, digests, team reminders.` | accurate |
| `specs/F-203-deadline-alerts.md` is APPROVED | `**Status:** APPROVED (2026-07-25; …)` | accurate |
| `ROADMAP.md:103` lists Square/POS with no F-id | `- Square/POS integrations.` | accurate |
| `ROADMAP.md:90` already scopes F-408 | `- **F-408 · Inventory Low-Stock Alerts** — manual counts or Square webhook (deliberately last).` | accurate |

Section context, which the issue does not give: `:57` sits under "Phase 2 — Execution Hardening
(post-capstone)" and `:103` under "Phase 4 — Platform, AI & Expansion", where it is the only
un-idented bullet in a list of F-7xx admin features.

## One correction to the framing this task was dispatched with

F-203's spec has **not** been amended today. Its last three amendments were all on **2026-07-26**
(`74551f3`, `e4f04b1`, `33eac8c`); there are zero commits touching it on 2026-07-27. Nothing about
the decision changes, but the spec is not moving under the decision either.

## The finding that most narrows item 1

F-203's own APPROVED spec already assigns the Phase 2 scope to F-203. Its "Phase 1 Scope Cut" reads:

> Happy path only. Escalations, digests, team reminders, per-user preferences: Phase 2 (F-203 full,
> per ROADMAP).

So `ROADMAP.md:57` and the approved F-203 spec **agree**. There is no disagreement between artifacts
about what F-203 means, which is what the issue's §5 citation implies. The whole of the tension is
with §7's requirement that every scheduled F-id receive one spec: the Phase 2 depth is scheduled
under an F-id whose one spec already exists and is approved for the Phase 1 cut of it.

That reframes item 1 from "whose meaning wins" to "how a second phase of one feature gets a
compliant spec", which is a narrower question with a cheaper answer.

## What governance permits and forbids here

Rather than leaving these to be re-derived:

- **§5's prohibition is scoped to contributors.** "Change an established feature ID's meaning"
  appears in §5's "Contributors must not" list. It binds contributors and agents. It is not a
  restriction on the PRD/Roadmap decision process, and §7 routes scope decisions there explicitly:
  "Scope expansion returns to the PRD/Roadmap decision process."
- **§7 forbids silent expansion, not decided expansion.** "A spec may clarify but may not silently
  expand its Roadmap feature." An explicit, recorded Roadmap decision is the permitted path; an
  implementer widening F-203 on their own is not.
- **§7 requires one spec per scheduled F-id**, which is the actual constraint biting item 1.
- **DESIGN.md's approved ID policy adds two rules the issue does not cite.** "Once assigned, an ID's
  meaning never changes, and IDs are never reused." And, directly relevant to item 2: "Closely
  related capabilities are absorbed into existing IDs rather than split: run-of-show lives in F-405
  (day-of runbook); consent separation lives in F-403 (lead capture & consent)."

**Neither answer is forced for item 1.** Both options are governance-compliant if decided and
recorded: expanding F-203 explicitly is permitted because the prohibition is on silent expansion and
on contributor-initiated meaning changes, and a new F-id is permitted because nothing requires a
phase of a feature to share its predecessor's id.

**For item 2 the approved ID policy leans one way** without forbidding the other. The absorption rule
and its two named precedents point at keeping POS support inside F-408. That is a stated preference
in an approved document, not a prohibition on minting an id.

## The F-id inventory, because "assign a new F-id" is not actionable without it

Referenced across `ROADMAP.md`, `PRD.md`, `specs/` and all 300 tracker issues: 64 distinct F-ids.
`specs/` currently holds 12 files: F-101, F-102, F-201, F-202, F-203, F-204, F-205, F-206, F-301,
F-302, F-401, F-402.

| Family | Taken | Lowest unused |
|---|---|---|
| F-1xx | F-101 … F-109 | F-110 |
| F-2xx | F-201 … F-214 | F-215 |
| F-3xx | F-301 … F-309 | F-310 |
| F-4xx | F-401 … F-413 | F-414 |
| F-5xx | F-501 … F-503 | F-504 |
| F-6xx | F-601 … F-606 | F-607 |
| F-7xx | F-701 … F-704, F-710 … F-715 | F-705 |

**The part that costs more than it looks.** DESIGN.md's approved lifecycle model declares each
stage's id range, and every range is exactly saturated:

| Stage | Declared range | Taken | Free inside the range |
|---|---|---|---|
| 1 IDEATE | F-101–F-109 | F-101–F-109 | none |
| 2 COMPLY | F-201–F-214 | F-201–F-214 | none |
| 3 MARKET | F-301–F-309 | F-301–F-309 | none |
| 4 OPERATE & ADMINISTER | F-401–F-413 | F-401–F-413 | none |

So minting F-215 (item 1's stage) or F-414 (item 2's stage) is not a one-line Roadmap edit. It
extends a range published in APPROVED `DESIGN.md`, which makes the new-id options edits to **two**
approved artifacts rather than one. That is a real cost difference between the options and it is not
visible from the issue.

## Exact change sets

Line numbers are given only to locate the current text; the edits are described by content.

### Item 1, option A: assign a new F-id to the Phase 2 expansion

1. `docs/ROADMAP.md:57`: replace `- **F-203 (full)** — alert escalations, digests, team reminders.`
   with an entry naming the new id, for example `- **F-215 · Alert Escalations & Digests** — alert
   escalations, digests, team reminders (the Phase 2 depth of F-203).`
2. `docs/DESIGN.md`, lifecycle model: extend STAGE 2's declared range from `F-201–F-214` to
   `F-201–F-215`. Required because the range is saturated.
3. `docs/ROADMAP.md` status header: record the id assignment, product-owner approved, dated.
4. `docs/DESIGN.md` status header: record the range extension.
5. `docs/BASELINE.md`: the rows for `docs/ROADMAP.md` and `docs/DESIGN.md`.
6. Tracker: open the F-215 issue; F-203's own issue needs no change.
7. `specs/F-203-deadline-alerts.md`: **no edit required.** Its Scope Cut sentence points at
   "F-203 full, per ROADMAP"; whether that pointer should be retargeted to F-215 is itself part of
   the decision. If retargeted, see the sequencing note below.

### Item 1, option B: expand F-203 explicitly, without changing its meaning

1. `docs/ROADMAP.md:57`: keep the entry, and record that the Phase 2 depth is scheduled under
   F-203 by decision rather than by default.
2. `specs/F-203-deadline-alerts.md`: the Phase 2 scope becomes in-scope for this spec, which means
   §7's contents list applies to it: acceptance criteria, fixtures, footprint, rollout for
   escalations, digests and team reminders. The existing "Phase 1 Scope Cut" section becomes a phase
   boundary inside one spec rather than a deferral to a different id.
3. `specs/F-203-deadline-alerts.md` status header, plus its BASELINE row.
4. `docs/ROADMAP.md` status header and BASELINE row.
5. No DESIGN.md change and no new tracker issue.

**This option is cheaper in artifacts and blocked in sequencing.** See below.

### Item 2, option A: assign a permanent F-id to Square/POS

1. `docs/ROADMAP.md:103`: replace `- Square/POS integrations.` with an F-id entry, for example
   `- **F-414 · Square/POS Integrations** — …`, and state its relationship to F-408 so the two are
   not read as overlapping.
2. `docs/ROADMAP.md:90`: F-408's "manual counts or Square webhook" needs a boundary sentence, or
   the two entries both claim the Square webhook.
3. `docs/DESIGN.md`: extend STAGE 4's declared range from `F-401–F-413` to `F-401–F-414`.
4. Status headers and BASELINE rows for both documents.
5. Tracker: open the F-414 issue.

### Item 2, option B: remove the standalone entry, keep POS inside F-408

1. `docs/ROADMAP.md:103`: delete `- Square/POS integrations.`
2. `docs/ROADMAP.md:90`: F-408's entry absorbs the scope explicitly, so the capability is not lost
   with the bullet.
3. `docs/ROADMAP.md` status header and BASELINE row.
4. No DESIGN.md change, no new id, no new tracker issue.

This is the option DESIGN.md's absorption rule and its two precedents point at, and the only one of
the four that touches a single approved artifact.

## Sequencing note: PR #131

**PR #131 is OPEN** and its footprint **includes `specs/F-203-deadline-alerts.md`** (53-file
footprint; confirmed by its file list). Item 1 option B edits that spec, and so does option A if the
decision retargets the Scope Cut pointer. Either must land after #131 merges or be coordinated with
its owner. Item 1 option A without a pointer retarget, and both item 2 options, do not touch that
file and are not blocked.

---

# SPEC-CONFLICT #144: the vocabulary question

Item 1 of its required decisions governs the other four and is not attempted here. What follows is
verification only.

## What #146 already settled, which is one full bullet of the conflict

The issue's second internal-inconsistency bullet says `specs/F-206`, `docs/PRD.md`,
`docs/DESIGN.md` and `apps/web/app/plan/plan-line.tsx` present a source-less `COVERAGE_GAP` as a
source that is not yet established. **That is now entirely obsolete.**

The four superseded phrasings are named descriptively rather than quoted below, because the guard
PR #146 added denies them repo-wide with no exceptions, and it fails on any file that reproduces
one. It caught the first draft of this brief, which is the guard working: a document explaining
that a phrasing is gone is exactly the shape a copy-paste out of git history also has, and the
guard cannot tell them apart. Paraphrasing here costs nothing.

| Superseded phrasing | Occurrences on `main` |
|---|---|
| the spaced form asserting a source is not yet established | 0 files |
| its hyphenated run-together, used adjectivally | 0 files |
| the spaced form asserting that a source has not been published | 0 files |
| the hyphenated no-plus-source compound | 0 files |

All four cited locations now state the published meaning instead. F-206 AC 2 and the PRD and DESIGN
lines all read that a source-less COVERAGE_GAP "visibly states that the combination is not covered by
this ruleset version", and the render site emits `NOT_COVERED_BY_RULESET`. A guard test asserts the
superseded wordings appear nowhere in the repository.

**Consequence for the decision:** the COVERAGE_GAP half of this conflict is narrower than the issue
describes. What remains of it is one item, immediately below, and it is a rules-artifact question
rather than a copy question.

## What is still true, and is the live half

The two claim-bearing advisories are unchanged. Both carry `verification.status = COVERAGE_GAP`,
both have `source: null`, and both assert regulatory content in `advisory_text`:

- **ADV-ALCOHOL-PUBLIC-001**, quoted verbatim: "Alcohol in public space is outside this ruleset version's validated
  coverage (SAPO prohibits alcohol at block parties, street events, festivals, and parades per the
  CECM FAQ; other paths not evaluated). Confirm with the relevant agency." Evidence ref: "CECM FAQ
  prohibition quote, VS Round2 #6".
- **ADV-SAPO-OTHER-CLASS-001**, quoted verbatim: "This SAPO class … is outside this ruleset version's validated
  coverage. Known published deadlines for reference: production 10 days; open culture 15 days; street
  festival Dec 31 of prior year; single block festival OFFICIAL CONFLICT (90 days vs Dec 31 of prior
  year). Confirm with SAPO." Evidence ref: "VS Round2 #4-5".

The legend they carry says "combination not modeled by this ruleset version; advisory asserts
nothing". Both texts assert something. That contradiction is live and is the verification owner's
under the issue's own authority section.

**One precision correction to the issue.** It says these advisories "state regulatory facts without
source records". Both carry `evidence` references into `VERIFICATION-SOURCES.md`; what they lack is a
`source` object, which SPEC-CONFLICT #75's exemption expressly permits for an assertion-free
COVERAGE_GAP. So the defect is that the text asserts while the legend says it does not, not that the
claims are unevidenced. That distinction changes what a fix would have to do.

## Everything else in the issue, verified

| Issue claim | Status on `main` |
|---|---|
| `PRD.md:225` and `ROADMAP.md:88` require F-109's five scope-support states | **true**, both present, five values unchanged |
| `ARCHITECTURE-FUTURE.md` §7.1 publishes four result-completeness values and leaves the relationship open | **true**, and §7.1 says so in terms |
| ruleset legend defines COVERAGE_GAP as an unmodeled combination asserting nothing | **true** |
| the F-109 draft on PR #134 has no approved mapping and its AC-01 adopts the four values | **true**, PR #134 is OPEN and carries `specs/F-109-coverage-state-classification.md` |
| SPEC-CONFLICT #75 is closed and does not reconcile the claim-bearing advisories | **true** |
| issue #54's title is stale | **true**, still reads "[F-109] Coverage-state classification (phase-4)" |
| OPEN-QUESTIONS T-4 tracks the question | **true**, and T-4 is the better statement of it than the issue is |

**Line citations:** 11 of the issue's 12 file:line references still resolve to what it claims. The
exception is `specs/F-206-rules-snapshot-banner.md:41`, now a blank line; the COVERAGE_GAP edge case
it pointed at is at `:51`, moved by #154's additions to AC 4.

## Staleness in the F-109 draft beyond what the issue records

Checked against PR #134's head (`agent/draft-future-feature-specs`):

1. The spec is titled **"F-109 · Coverage-State Classification"** and its filename is
   `F-109-coverage-state-classification.md`. Both predate #136's retitle to "Scope-Support
   Classification".
2. Its AC-01 names the four values as `COMPLETE_WITHIN_VALIDATED_COVERAGE`, **`CONDITIONAL`**,
   `CANNOT_DETERMINE` and `OUTSIDE_VALIDATED_COVERAGE`. **#136 replaced `CONDITIONAL` with
   `OPEN_FACTS_MAY_CHANGE_OUTCOME`**, which the draft never mentions. So AC-01 both conflicts with the
   approved five-state requirement, as the issue says, and misquotes the four-value set it adopts.
3. **Could not verify** the issue's "the pending edit restores the five values". The branch head still
   carries the four-value AC-01. Either the edit has not landed on that branch or the claim is stale;
   this brief does not decide which.

## What #154 settled, which for this issue is almost nothing

#154 re-keyed F-206 AC 4's attribution cases and corrected two F-202 cross-references. It did not
touch F-206 AC 2, the COVERAGE_GAP legend, the advisories, or any scope-axis vocabulary. Its only
effect on this issue is that one line citation moved. Recorded so the decision is not delayed looking
for an interaction that is not there.

## Approval classes the resolution would need, and whether any are satisfied

The issue's authority section and OPEN-QUESTIONS T-4 agree, and T-4 is more precise. Summarising
without deciding:

| Decision | Class | Satisfied? |
|---|---|---|
| Item 1, one axis or three (in documents only) | durable architecture decision; product owner as architecture owner | **no** |
| Item 1 or 2, once implemented as a consumed shared enum | all affected lane owners plus architecture owner | **no** |
| Item 3, the legend and the two advisories | regulatory status/content: verification owner plus rules reviewer | **no** |
| Item 4, F-206/PRD/DESIGN/UI conformance | lower authority, follows the rules resolution | the COVERAGE_GAP copy half is **already done** by #146 |
| Item 5, fixtures and a rules-artifact check | follows whichever invariant is approved | **no** |

**None of #144's five decisions is satisfied.** #136 carried only the rename, and it says so.

T-4 adds one routing point worth carrying into the decision: because one option on the table would
retire or redefine the shipped `COVERAGE_GAP`, a closing change taking that path is *also* a
regulatory status change, and the other two paths do not reach the verification owner at all. So the
choice of option determines which owners must sign, and two of the three options can be fully
approved without the only owner who changes verification statuses.

## A defect in where those approval classes are recorded

OPEN-QUESTIONS T-4 cites governance **"§98", "§95" and "§93"**. `DOCUMENTATION-GOVERNANCE.md` has
sections **§1 through §10 only**; none of those three exists. The intended references are almost
certainly rows of §6's change-class table, but this brief does not guess which and does not edit the
register. Flagged because T-4 is the artifact a reader would consult for the approval routing, and
three of its citations lead nowhere.

---

# Summary of what would make each decision cheapest

Stated as observations, not recommendations.

**#127 item 1** is narrower than filed: the two artifacts already agree on F-203's meaning, so the
question is only how the Phase 2 depth gets a §7-compliant spec. Option B touches one spec and one
Roadmap line but is sequencing-blocked behind PR #131. Option A touches two approved artifacts
because STAGE 2's declared id range is saturated.

**#127 item 2** has an approved policy pointing at option B, with two precedents, and option B is the
only one of the four change sets that touches a single artifact.

**#144** has lost one of its three internal-inconsistency bullets to #146 and retains one live
regulatory item, the two claim-bearing advisories, which is the only part with a named owner who has
not signed anything. Items 1 and 2 remain untouched by anything that has merged, and the F-109 draft
they depend on is stale against #136 in three ways.
