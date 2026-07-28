# Decision brief: SPEC-CONFLICT #127 and #144

**Status:** PROPOSED, and not a decision. This document resolves nothing.

**Measured against `a7158c6`**, which is the commit this document's own parent is, and every claim
below is stated against that tree and no other. An earlier revision measured against `048bff3` and
kept saying so after being rebased, which put it four merges behind and made three of its claims
false on the tree actually receiving it. Where re-measuring removed a cost or a blocker, this
document now says the cost has DISAPPEARED rather than quietly dropping the line, because the
product owner has been carrying some of them.

Re-measured against `a7158c6`, three claims changed:

| earlier claim, against `048bff3` | on `a7158c6` |
|---|---|
| PR #131 is open and sequencing-blocks option B | **gone.** `8d91e8c` merged it. Option B has no sequencing blocker |
| `specs/F-203-deadline-alerts.md` has no 2026-07-27 amendments | **false.** `65730ec`, `951d2f4` and `54f659b` amended it that day |
| OPEN-QUESTIONS T-4 cites sections that do not exist | **gone.** `7626391` merged the #161 citation fix |

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

So `ROADMAP.md:57` and the approved F-203 spec **agree on three capabilities and not on a fourth**,
which an earlier revision of this brief stated as unqualified agreement. Set side by side:

| capability | `specs/F-203-deadline-alerts.md:53` | `docs/ROADMAP.md:57` | `docs/PRD.md:206` |
|---|---|---|---|
| escalations | yes | yes | yes |
| digests | yes | yes | yes |
| team reminders | yes | yes | yes |
| **per-user preferences** | **yes** | **absent** | **absent** |

The spec assigns four Phase 2 capabilities; the Roadmap and the PRD assign three. So there is no
disagreement about what F-203 MEANS, which is what the issue's §5 citation implies, and there is a
gap about what its Phase 2 depth CONTAINS.

**That gap is a live scope item, not a wording slip, and neither option currently prices it.** Option
B's rewrite covers the three capabilities the Roadmap names and would leave per-user preferences
assigned by a spec and by nothing else. Option A would move three capabilities to a new id and leave
the fourth behind. The product owner has to choose explicitly among retaining per-user preferences
under whichever id takes the depth, retargeting it with the other three, or removing it, and this
brief takes no position on which.

**And there is no §7 problem either, which an earlier draft of this brief got wrong.** That draft
read §7's "Every scheduled F-id receives one spec" as already biting, and reframed item 1 as how a
second phase of one feature gets a compliant spec. The word doing the work is SCHEDULED, and on
`main` the Phase 2 depth is not:

> `docs/PRD.md:187` — "## 5. REQUIREMENTS — PLANNED SCOPE (Phases 2–4; outlined for delegation,
> specs written when scheduled)"

> `docs/DESIGN.md:105` — "Phases 2+ get specs when scheduled, not now."

Listing the F-203 expansion in the Phase 2 roadmap is what those two artifacts call planned scope,
not scheduling. §7 therefore demands no spec for it today, and nothing in the tree is out of
compliance. The correction is a reduction: item 1 has no live compliance problem attached to it, and
the finding that `ROADMAP.md:57` and the approved spec agree stands on its own with nothing left to
be in tension with.

**What the product owner is actually choosing, and when.** The choice is whether the Phase 2 depth
of alerting is eventually delivered under F-203 or under a new id, and it is a naming and tracking
decision rather than a compliance one. It becomes live at the moment that work is SCHEDULED, because
scheduling is what turns §7's one-spec requirement on. Until then either answer leaves the tree
compliant, and deciding early buys only the ability to write the id into the Roadmap now. Deciding
late costs nothing that this brief could find.

## What governance permits and forbids here

Rather than leaving these to be re-derived:

- **§5's prohibition is scoped to contributors.** "Change an established feature ID's meaning"
  appears in §5's "Contributors must not" list. It binds contributors and agents. It is not a
  restriction on the PRD/Roadmap decision process, and §7 routes scope decisions there explicitly:
  "Scope expansion returns to the PRD/Roadmap decision process."
- **§7 forbids silent expansion, not decided expansion.** "A spec may clarify but may not silently
  expand its Roadmap feature." An explicit, recorded Roadmap decision is the permitted path; an
  implementer widening F-203 on their own is not.
- **§7 requires one spec per SCHEDULED F-id**, and that is what makes item 1 a question for later
  rather than now. `PRD.md:187` and `DESIGN.md:105` both put Phases 2-4 in planned scope with specs
  written when scheduled, so the requirement does not bite until the Phase 2 depth is scheduled. It
  is the constraint that will decide item 1; it is not one the tree is failing today.
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

## Every approved artifact naming the ids being moved

Three of round 2's five findings were the same defect: an id retarget priced against fewer artifacts
than actually name the id. So this is a sweep of every approved artifact rather than a list of the
ones anyone remembered, and the change sets below are built from it.

**Item 1, the F-203 Phase 2 depth.** Places that ASSIGN the Phase 2 scope, which a retarget must
move:

| location | text | in which option's change set |
|---|---|---|
| `docs/ROADMAP.md:57` | `- **F-203 (full)** — alert escalations, digests, team reminders.` | A and B |
| `docs/PRD.md:206` | `- **F-203 (full)** — alert escalations, digests, and team reminders.` | A, added this round |
| `specs/F-203-deadline-alerts.md:53` | `Phase 2 (F-203 full, per ROADMAP)` | A, added round 1; B rewrites it anyway |

Places that name F-203 as the PHASE 1 feature, which a Phase 2 retarget does not touch and which are
listed so the next reader does not have to re-derive the distinction: `docs/DESIGN.md` lines 12, 16,
18, 73, 80 and 86 (tracks, lanes, dependency graph, Twilio plumbing reuse), `docs/PRD.md:167` (the
F-203 requirement itself), `docs/ROADMAP.md:29` and `:53`, `docs/ARCHITECTURE.md:193`, `:276` and
`:281`, `specs/F-102`, `specs/F-201` and `specs/F-202` cross-references.

One judgement call is flagged rather than decided: `docs/ARCHITECTURE-FUTURE.md:396` lists "F-203
deadline alerts" among the outbound worker's consumers. That is a Phase 2+ document naming F-203 for
alert delivery generally, which covers the Phase 1 alerts too, so whether a depth retarget should add
the new id beside it depends on whether escalations and digests are read as a distinct consumer. This
brief does not decide it.

**Item 2, the Square/POS scope.** Every approved artifact naming it:

| location | text | in which option's change set |
|---|---|---|
| `docs/ROADMAP.md:103` | `- Square/POS integrations.` | A replaces, B deletes |
| `docs/ROADMAP.md:90` | `- **F-408 · Inventory Low-Stock Alerts** — manual counts or Square webhook` | A bounds, B absorbs |
| `docs/PRD.md:226` | `**F-308 / F-408** — … manual counts or Square webhook` | A, added this round |
| `docs/ARCHITECTURE-FUTURE.md:336` | external-integrations row mapping webhooks to `F-108, F-212, F-308, F-408` | A, added this round |

Option B needs none of the last two, because it keeps the capability under F-408 and both artifacts
already assign it there. **That asymmetry is the finding, not an oversight in B:** option A moves an
id and therefore pays wherever the id is written, while option B moves nothing and pays nowhere. The
earlier revision priced A as if it moved the id in one artifact.

## Exact change sets

Line numbers are given only to locate the current text; the edits are described by content.

### Item 1, option A: assign a new F-id to the Phase 2 expansion

1. `docs/ROADMAP.md:57`: replace `- **F-203 (full)** — alert escalations, digests, team reminders.`
   with an entry naming the new id, for example `- **F-215 · Alert Escalations & Digests** — alert
   escalations, digests, team reminders (the Phase 2 depth of F-203).`
2. `docs/DESIGN.md`, lifecycle model: extend STAGE 2's declared range from `F-201–F-214` to
   `F-201–F-215`. Required because the range is saturated.
3. `docs/PRD.md:206`: **required, and missing from an earlier revision of this list.** It carries the
   same assignment as the Roadmap, "**F-203 (full)** — alert escalations, digests, and team
   reminders". Retargeting only the Roadmap leaves one planned scope assigned to two different ids
   across two approved artifacts.
4. `docs/ROADMAP.md` status header: record the id assignment, product-owner approved, dated.
5. `docs/DESIGN.md` status header: record the range extension.
6. `docs/PRD.md` status header: record the retarget.
7. `docs/BASELINE.md`: the rows for `docs/ROADMAP.md`, `docs/DESIGN.md` and `docs/PRD.md`.
8. Tracker: open the F-215 issue; F-203's own issue needs no change.
9. `specs/F-203-deadline-alerts.md:53`: **required, not optional.** Its Phase 1 Scope Cut reads
   "Phase 2 (F-203 full, per ROADMAP)". Step 1 removes the `F-203 (full)` entry that sentence points
   at, so without this edit an APPROVED spec cites a Roadmap entry that no longer exists. Governance
   §5 makes that a conflict requiring reconciliation, so option A either retargets the pointer to the
   new id in the same change set or opens a tracked reconciliation for it. An earlier draft of this
   brief called the edit unnecessary and the retarget optional; that was wrong, and it understated
   option A by one approved artifact. See the sequencing note below.

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

**Option B has no mirror of option A's step 7, and that was checked rather than assumed.** B keeps
the `F-203 (full)` Roadmap entry, so the spec's "per ROADMAP" pointer still resolves and needs no
retarget on that account; and B's step 2 already rewrites the Scope Cut section, so the sentence is
priced there in any case. The asymmetry in the two lists is therefore real and not an artefact of
one being written more carefully: A touches an approved spec that B was already touching.

**This option is cheaper in artifacts, and its sequencing blocker has merged away.** See below.

### Item 2, option A: assign a permanent F-id to Square/POS

1. `docs/ROADMAP.md:103`: replace `- Square/POS integrations.` with an F-id entry, for example
   `- **F-414 · Square/POS Integrations** — …`, and state its relationship to F-408 so the two are
   not read as overlapping.
2. `docs/ROADMAP.md:90`: F-408's "manual counts or Square webhook" needs a boundary sentence, or
   the two entries both claim the Square webhook.
3. `docs/PRD.md:226`: **required, and missing from an earlier revision of this list.** It assigns the
   Square-webhook scope exclusively to F-408: "**F-308 / F-408** — ticketing integration/export;
   inventory low-stock alerts (manual counts or Square webhook; deliberately last)". A Roadmap
   boundary sentence does not reach it, so without this the product requirement keeps assigning the
   capability to F-408.
4. `docs/ARCHITECTURE-FUTURE.md:336`: **required, same reason.** Its external-integrations row maps
   webhook events and provider mappings to `F-108, F-212, F-308, F-408` and to no other id, so a new
   id owning POS integration is absent from the architecture mapping until this row names it.
5. `docs/DESIGN.md`: extend STAGE 4's declared range from `F-401–F-413` to `F-401–F-414`.
6. Status headers and BASELINE rows for all FOUR documents: `docs/ROADMAP.md`, `docs/PRD.md`,
   `docs/ARCHITECTURE-FUTURE.md` and `docs/DESIGN.md`. An earlier revision said "both documents",
   which was counted before the sweep below was done.
7. Tracker: open the F-414 issue.

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

### Whether the claims are evidenced, re-derived claim by claim

An earlier draft of this brief said the issue's "without source records" was imprecise because both
advisories carry `evidence` references, and treated the claims as evidenced on that basis. **That
inherited a citation label as if it were a source record.** The labels have now been read against the
source text. The result does not go the way either the earlier draft or the review expected, so each
claim is set out separately with the located text quoted rather than summarised.

**ADV-ALCOHOL-PUBLIC-001** claims a prohibition for four categories. Its evidence ref is "CECM FAQ
prohibition quote, VS Round2 #6". Round 2 #6 reads, in full:

> **Block party** (`block-parties.page`): community-sponsored public event, "no sales of goods or
> services"; "Alcohol, vendors, commercial branding and sponsorships are not permitted"; applicant
> "must be a member of a block association and given permission by their neighbors"; 60-day
> deadline. Community-board recommendation per SAPO rules §1-04(h).

| claim | located in the dossier |
|---|---|
| block parties | **candidate lead located**, in the quoted line above |
| street events | **no candidate lead located** |
| festivals | **no candidate lead located** |
| parades | **no candidate lead located** — "parade" appears nowhere in `VERIFICATION-SOURCES.md` |

Two further precisions. The located prohibition is on `block-parties.page`, not on the CECM FAQ the
advisory names, so the attribution does not match the record even for the one category with a lead.
And the whole document was searched, not only the cited entry, before writing "no candidate lead located".

**NEITHER "SUPPORTED" NOR "UNSUPPORTED" IS THE RIGHT WORD, AND ROUND 1 GOT THIS WRONG TWICE OVER.**
Round 1 declined the review's finding on `ADV-SAPO-OTHER-CLASS-001` by citing RF-2, as though
locating text there settled that the deadlines are supported. It does not, and the document says so
about itself on its own third line:

> **Purpose:** Candidate primary sources for the 11 open `[VERIFY]` items in `OPEN-QUESTIONS.md` §2,
> collected 2026-07-22 by a four-agent research pass. **Nothing in this document is a verification.**
> … SUPPORT / CONTRADICT / NOT ADDRESS labels are the researchers' candidate assessments of fetched
> text against the encoded claim, for triage only.

Three of its own section headings repeat it: "Findings for rule authoring (candidate, not
promoted)", "Per-rule attribution located (candidate, not promoted)", "Notes for rule authoring
(candidate, not promoted)". `OPEN-QUESTIONS.md:48` puts promotion elsewhere: "Every promotion to
VERIFIED follows the governance rules: primary sources only, record URL + date checked, update the
rules file's `verification` block, named reviewer."

So what the dossier establishes is narrower than either side of the round-1 exchange said:

| claim | status against the dossier |
|---|---|
| production 10 days | **candidate lead located** (RF-2), fetched 2026-07-22, never promoted |
| open culture 15 days | **candidate lead located** (Round 2 #4), same |
| street festival Dec 31 of prior year | **candidate lead located** (RF-2), same |
| single block festival 90 days vs Dec 31 | **candidate lead located** (Round 2 #5), same |
| alcohol prohibited at block parties | **candidate lead located** (Round 2 #6), same |
| alcohol prohibited at street events | **no candidate lead located** |
| alcohol prohibited at festivals | **no candidate lead located** |
| alcohol prohibited at parades | **no candidate lead located.** "parade" appears nowhere in the dossier |

**What promotion would cost.** The dossier records its own method: every URL was fetched on
2026-07-22 and read before quoting, and most nyc.gov and codelibrary.amlegal.com pages return HTTP
403 to generic fetchers and need a browser user-agent. A verification-owner pass over the four
deadline claims is therefore a re-fetch and read of the CECM per-type deadlines page,
`open-culture.page`, `single-block-festivals.page` and 50 RCNY §1-08, recording URL and date checked
against each and updating the `verification` block under a named reviewer. Four URLs and one
rules-file edit, by the one person governance allows to do it. For the three alcohol categories there
is nothing to promote: that pass would be a search for a source not located in two research rounds,
and its outcome may be that none exists.

**So the issue's original statement is closer to right than either round-1 revision allowed**, and
precisely: `ADV-ALCOHOL-PUBLIC-001` asserts a prohibition for three categories with no located
candidate, and `ADV-SAPO-OTHER-CLASS-001` asserts four deadlines whose candidates are located but
unpromoted. Different defects, different remedies, and this brief previously treated the two
advisories as one.

**Recorded for the revision history, because this correction was made twice at two different
depths.** Round 1 corrected this brief for treating an evidence LABEL as a source record, and then
made the same mistake one level down, treating the dossier's CONTENT as a verification without
reading the dossier's own status header. The review confirmed that decline without checking the
header either. The shape is identical both times, taking a label for the thing it labels, which is
the same failure as trusting a line number behind a section sigil. What catches it is reading an
artifact's own statement of what it is before quoting anything out of it.

**What survives of the earlier draft's correction.** The distinction between a missing `source`
object and unevidenced claims is still real, and SPEC-CONFLICT #75's exemption still permits the
absent `source` for an assertion-free COVERAGE_GAP. What does not survive is using that distinction
to call the claims evidenced: it is true of `ADV-SAPO-OTHER-CLASS-001` and false of
`ADV-ALCOHOL-PUBLIC-001` for three of its four categories. The two advisories are in different
positions and this brief previously treated them as one.

The legend contradiction stated above is unaffected: both texts assert while the legend they carry
says an advisory asserts nothing. That remains the verification owner's under the issue's own
authority section, and this brief decides none of it.

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

**#127 item 1** is narrower than filed, and narrower again than an earlier draft of this brief made
it: the two artifacts already agree on F-203's meaning, and the Phase 2 depth is planned rather than
scheduled scope, so no §7 obligation is outstanding today. What remains is a naming and tracking
choice that becomes live when that work is scheduled. Option B touches one spec and one Roadmap line,
and its PR #131 sequencing block has merged away. Option A touches four approved artifacts once
every place naming the id is counted: the Roadmap entry, `docs/PRD.md:206`, the F-203 spec pointer
its own step 1 invalidates, and DESIGN.md's saturated STAGE 2 range.

**#127 item 2** has an approved policy pointing at option B, with two precedents, and option B is the
only one of the four change sets that touches a single artifact.

**#144** has lost one of its three internal-inconsistency bullets to #146 and retains one live
regulatory item, the two claim-bearing advisories, which is the only part with a named owner who has
not signed anything. Items 1 and 2 remain untouched by anything that has merged, and the F-109 draft
they depend on is stale against #136 in three ways.
