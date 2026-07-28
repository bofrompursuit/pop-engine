# Scope: the bounded half of the #144 advisory reconciliation

**Status:** `PROPOSED`, one of governance section 3's five states. This document decides nothing and
publishes nothing. It says what the work IS, so a person can decide whether to do it. **The promotion
decision belongs to the verification owner and is not taken here.** No rule, ruleset, spec, answer
key, BASELINE row or engine file is changed by this document, and no verification status is moved.

**Scope,** set by the product owner's decision of 2026-07-28 on issue #144: the bounded half only.
`ADV-ALCOHOL-PUBLIC-001` and `ADV-SAPO-OTHER-CLASS-001`, re-fetching the leads that are already
located. The open-ended half, source discovery for the street-event, festival and parade alcohol
claims, is deliberately NOT started here; section 6 says what would start it and what a time-box
would cost.

**Three constraints are inputs, not questions.** They are the decision's, not this document's:

1. **A status change is not a remedy.** The text is narrowed to what the record supports, or removed.
   A status change may accompany that and can never replace it.
2. **Both outcomes require a publication.** These are edits to an immutable artifact. Only the
   promotion step disappears if nothing is located.
3. **Retaining the block-party category is conditional** on the bounded re-fetch confirming it AND
   the verification owner promoting it.

**Method.** Every regulatory sentence below is either a quotation with a location, or an explicit
statement that nothing was located. Nothing was re-fetched for this document; it reports what the
repository's evidence record holds as of `main` at `dc14ad2`. Where the record holds nothing, that is
written as the finding rather than filled in.

---

## 0. How to read the evidence vocabulary, before any claim below

This ruleset publishes its own ladder, and reading a lower rung as a higher one is the error that has
been made three times on PR #158 at three different depths. So the ladder is quoted here, in full,
from `rules/nyc-rules.v2.8.json`'s `status_legend`, and every row of every table below is pinned to
one of these rungs by name.

| Published status | Published meaning, verbatim |
| --- | --- |
| `VERIFIED` | "verification owner confirmed against primary source (none at publication; only the verification owner assigns this)" |
| `SOURCE_CONFIRMED` | "fetch-confirmed primary-source quote on file in VERIFICATION-SOURCES.md; **pending verification-owner promotion to VERIFIED**" |
| `OFFICIAL_CONFLICT` | "live official pages disagree; both readings encoded, output renders the conflict" |
| `RESEARCH_REQUIRED` | "no primary source located in two research passes; rendered as 'confirm with agency'" |
| `COVERAGE_GAP` | "combination not modeled by this ruleset version; advisory asserts nothing" |

And below all of them, the dossier itself. `docs/VERIFICATION-SOURCES.md:3`, in bold, in its own
words:

> **Nothing in this document is a verification.**

The same line continues: "SUPPORT / CONTRADICT / NOT ADDRESS labels are the researchers' candidate
assessments of fetched text against the encoded claim, **for triage only**." Round 3 and Round 4 each
repeat it per-section as "candidate, not promoted".

**So there are four distinguishable things, and this document never collapses them:**

| Rung | What it means here |
| --- | --- |
| **Nothing located** | The dossier records no candidate lead for the claim at all |
| **Candidate lead** | A URL was fetched and quoted, and a researcher labelled it. It supports nothing by itself |
| **`SOURCE_CONFIRMED`** | The published ruleset already carries that quote on a rule. Still explicitly pending promotion, by the legend's own words |
| **`VERIFIED`** | Promoted by the verification owner. **There are none in `nyc.v2.8`**, per the legend's parenthetical |

**The consequence, stated once so no table below has to restate it:** for every claim in both
advisories, the highest rung anything reaches is `SOURCE_CONFIRMED`. **Nothing in either advisory is
promoted, and nothing this document describes promotes anything.** A reader who ticks a row below as
"supported" has made the fourth instance of the error.

---

## 1. The exact claims, quoted

### 1.1 `ADV-ALCOHOL-PUBLIC-001`

`output.advisory_text`, verbatim from `rules/nyc-rules.v2.8.json:1692`:

> Alcohol in public space is outside this ruleset version's validated coverage (SAPO prohibits
> alcohol at block parties, street events, festivals, and parades per the CECM FAQ; other paths not
> evaluated). Confirm with the relevant agency.

`verification`: `status: COVERAGE_GAP`, `evidence: "CECM FAQ prohibition quote, VS Round2 #6"`. There
is **no `source` block on this advisory at all**, which `apps/api/src/ruleset.ts` permits for exactly
one status, per PR #146: "`${label}.source is required unless verification.status is COVERAGE_GAP`".

Split into individually checkable claims. The frame rows are statements about the ruleset, not about
law, and need no regulatory source; they are listed so the split is complete and so a reader can see
which words survive every draft in section 4.

| # | Claim, verbatim fragment | Kind |
| --- | --- | --- |
| A-0 | "Alcohol in public space is outside this ruleset version's validated coverage" | frame |
| **A-1** | "SAPO prohibits alcohol at block parties" | **regulatory** |
| **A-2** | "SAPO prohibits alcohol at ... street events" | **regulatory** |
| **A-3** | "SAPO prohibits alcohol at ... festivals" | **regulatory** |
| **A-4** | "SAPO prohibits alcohol at ... parades" | **regulatory** |
| **A-5** | "per the CECM FAQ", the attribution applying to A-1 through A-4 | **regulatory (attribution)** |
| A-6 | "other paths not evaluated" | frame |
| A-7 | "Confirm with the relevant agency" | frame |

A-1 through A-4 each also assert **the acting agency**, since each says *SAPO* prohibits. That is one
assertion per category and not a separate row, but it is what makes A-2 through A-4 harder than they
look: they claim both that a prohibition exists and whose it is.

### 1.2 `ADV-SAPO-OTHER-CLASS-001`

`output.advisory_text`, verbatim from `rules/nyc-rules.v2.8.json:1713`:

> This SAPO class (e.g. street festival, single block festival, production event, open culture,
> plaza-and-street extra large) is outside this ruleset version's validated coverage. Known published
> deadlines for reference: production 10 days; open culture 15 days; street festival Dec 31 of prior
> year; single block festival OFFICIAL CONFLICT (90 days vs Dec 31 of prior year). Confirm with SAPO.

`verification`: `status: COVERAGE_GAP`, `evidence: "VS Round2 #4-5"`. No `source` block.

| # | Claim, verbatim fragment | Kind |
| --- | --- | --- |
| B-0 | "This SAPO class ... is outside this ruleset version's validated coverage" | frame |
| **B-1** | The five named classes exist as SAPO classes: "street festival, single block festival, production event, open culture, plaza-and-street extra large" | **regulatory (taxonomy)** |
| **B-2** | "Known **published** deadlines", an assertion about the record, that each figure below is published | **regulatory (attribution)** |
| **B-3** | "production 10 days" | **regulatory** |
| **B-4** | "open culture 15 days" | **regulatory** |
| **B-5** | "street festival Dec 31 of prior year" | **regulatory** |
| **B-6** | "single block festival ... 90 days" | **regulatory** |
| **B-7** | "single block festival ... Dec 31 of prior year" | **regulatory** |
| **B-8** | Those two figures are in "OFFICIAL CONFLICT", i.e. both are live | **regulatory (conflict claim)** |
| B-9 | "Confirm with SAPO" | frame |

B-8 is its own row because it is a claim about the *state of the sources*, not about a deadline, and
it can fail independently: one of the two pages could have changed since 2026-07-22, in which case
there are still two figures on file but no live conflict.

`OFFICIAL CONFLICT` is additionally a **published status token** in the legend quoted in section 0.
This advisory's `verification.status` is `COVERAGE_GAP`, so the text names a status the advisory does
not carry. That is a wording observation for the verification owner, not a claim about the law.

---

## 2. Per claim, what the record actually holds

Every "candidate lead" row below is a fetched quote and **nothing more**, per section 0.

### 2.1 `ADV-ALCOHOL-PUBLIC-001`

| # | What the record holds | Rung |
| --- | --- | --- |
| **A-1** block parties | `VERIFICATION-SOURCES.md:115` (Round 2 #6), from `block-parties.page`: "Alcohol, vendors, commercial branding and sponsorships are not permitted". Re-quoted at `:194` (Round 4) as "...are not permitted at block parties". **And the same quote is already carried by a published rule**: `SAPO-BLOCK-PARTY-ELIG-001` sources it to `block-parties.page` at `SOURCE_CONFIRMED` | **`SOURCE_CONFIRMED`**, pending promotion |
| **A-2** street events | **Nothing located.** `street-events.page` IS on file, fetched in Round 1 (`:29`, `:56`) and Round 2 (`:110`), and no alcohol text is quoted from it anywhere in the dossier | nothing located |
| **A-3** festivals | **Nothing located.** `street-festivals.page` (`:56`) and `single-block-festivals.page` (`:114`) are both on file; neither is quoted for alcohol | nothing located |
| **A-4** parades | **Nothing located, and no page fetched.** The string "parade" appears **zero times** in `docs/VERIFICATION-SOURCES.md`. There is no candidate lead, no URL, and no negative result either | nothing located |
| **A-5** "per the CECM FAQ" | **Nothing located, and the attribution is contradicted by the record.** The CECM FAQ is cited in five separate places in the dossier (`:16`, `:49`, `:55`, `:76`, `:114`) and is **never quoted for an alcohol prohibition**. The only located prohibition is on `block-parties.page` | nothing located |

**On A-1, stated plainly because it cuts against the framing this scope inherited.** The block-party
category is not merely a "candidate lead". It reaches `SOURCE_CONFIRMED` on a *different published
rule*, which is the highest rung anything in `nyc.v2.8` occupies. That is more support than a bare
candidate and **still not promotion**, by the legend's own "pending verification-owner promotion to
VERIFIED". Constraint 3 stands unchanged; the reason it stands is the legend, not the absence of a
quote.

**Two things A-1's quote does not settle, and the verification owner decides both:**

- The located sentence is a **condition of the block-party class** on the block-party page. Whether
  "SAPO prohibits alcohol at block parties" is a fair restatement of "alcohol ... [is] not permitted
  at block parties" is a reading, not a quotation. It is close. It is still not the same sentence.
- `SAPO-BLOCK-PARTY-ELIG-001` **already emits this content** on its own trigger (`sapo_event_type =
  block_party` AND `alcohol`), at a higher status, with a source. Retaining A-1 inside a
  `COVERAGE_GAP` advisory duplicates a better-supported rule's content in the one place the legend
  says asserts nothing. Section 4.1 drafts that variant.

**A defect found while auditing A-5, outside this advisory and NOT fixed here.**
`SAPO-BLOCK-PARTY-ELIG-001`'s own `source.citation` reads "CECM block-parties page; **FAQ alcohol
prohibition**". That is the same unsupported attribution as A-5, on a `SOURCE_CONFIRMED` published
rule, and it is a second artifact carrying it. It is recorded here and deliberately left alone: it is
a different rule, its correction is a publication decision of its own, and this scope covers two
advisories. Whoever schedules the publication should decide whether to carry it in the same bump.

### 2.2 `ADV-SAPO-OTHER-CLASS-001`

| # | What the record holds | Rung |
| --- | --- | --- |
| **B-1** classes | Round 3's verbatim fee-table transcription (`:145`–`:161`) lists **Street Festival**, **Single Block Festival**, **Production Events**, **Open Culture Event** and **Extra Large Event** as event types. Four of the five advisory names map to a transcribed row. **"plaza-and-street extra large" appears in no quoted source**: Round 2 records "Extra Large = up to 60 ('depends on plaza levels')" for street events (`:110`) and "Extra Large up to 60" under plaza levels (`:112`), and Round 3's table has a plain "Extra Large Event" row. The compound name is the ruleset's, not a source's | candidate lead (4 of 5); nothing located for the compound name |
| **B-2** "published" | Each figure below is stated on a fetched page, so the word is defensible as to *publication*. It is **not** defensible as to promotion, and nothing else in the sentence tells a reader which is meant | candidate lead |
| **B-3** production 10 days | `VERIFICATION-SOURCES.md:16` (RF-2), CECM FAQ: "press/rallies/productions 10 days" | candidate lead |
| **B-4** open culture 15 days | `:113` (Round 2 #4): "**Open Culture**: 15 days (`open-culture.page` + deadlines page)" | candidate lead |
| **B-5** street festival Dec 31 prior year | `:16` (RF-2), CECM FAQ: "street festivals: December 31 of the **prior year**" | candidate lead |
| **B-6 / B-7 / B-8** single block festival | `:114` (Round 2 #5): "`single-block-festivals.page` + deadlines page say 90 days; the CECM FAQ says December 31 of the preceding year. **Both live.**" | candidate lead, all three |

**The `evidence` reference is under-inclusive, and this is a checkable defect rather than a
judgement.** The advisory cites "VS Round2 #4-5". Round 2 #4 is open culture (B-4); Round 2 #5 is the
single block festival (B-6, B-7, B-8). **B-3 and B-5 are not in Round 2 at all**. Both come from
Round 1's RF-2 row (`:16`), re-stated at `:76`. So two of the four deadlines the advisory prints are
sourced to a section that does not contain them. A reader following the citation to check the
production figure finds nothing there and cannot tell whether the figure is unsourced or the pointer
is wrong.

**Where an advisory's own `evidence` names a source that does not carry the claim:** A-5 above (CECM
FAQ, alcohol prohibition) and this row (Round 2 #4-5, production and street festival). Both are
recorded; neither is repaired here.

---

## 3. The bounded re-fetch, as an executable list

**Why this half is bounded:** every URL below is already in the dossier with a 2026-07-22 or later
retrieval date. The work is re-retrieval and re-quotation of a closed set, not discovery. Nothing in
this list requires finding a page that nobody has found.

**Carry the dossier's own retrieval caveat forward.** `VERIFICATION-SOURCES.md:5`: "most nyc.gov,
nycgovparks.org, and codelibrary.amlegal.com pages block generic fetchers (HTTP 403) and were
retrieved with a **browser user-agent**; a normal browser will open them fine." Rounds 3 and 4 repeat
it (`:139`, `:173`) and add: none of these pages shows a "last updated" date, so **the retrieval date
is the as-of date** and must be recorded as such.

| # | URL | Claims it decides | Confirms if | Fails if |
| --- | --- | --- | --- | --- |
| 1 | `https://www.nyc.gov/site/cecm/permitting/permit-types/block-parties.page` | **A-1** | The alcohol sentence is present, and the quote transcribes verbatim | The sentence is absent, or its scope has changed (for example to a conditional rather than a prohibition) |
| 2 | `https://www.nyc.gov/site/cecm/support/frequently-asked-questions.page` | **A-5**, B-3, B-5, B-7 | For A-5, an alcohol prohibition sentence exists on this page. For the deadlines, the per-type figures transcribe verbatim | No alcohol sentence on the page, which **fails A-5 outright**, since A-5 is an attribution and nothing else can substitute for it |
| 3 | `https://www.nyc.gov/site/cecm/permitting/permit-deadlines.page` | B-4, B-6 | The open-culture and single-block-festival figures transcribe | Either figure is absent or has moved |
| 4 | `https://www.nyc.gov/site/cecm/permitting/permit-types/open-culture.page` | B-4 | 15 days, as the second of two pages | Absent, leaving B-4 on one page |
| 5 | `https://www.nyc.gov/site/cecm/permitting/permit-types/single-block-festivals.page` | B-6, **B-8** | 90 days is present **while** item 2 still shows Dec 31, which is what makes B-8's "both live" true today | Either side has changed. **B-8 fails even if both figures still exist somewhere**, if they are no longer both live |
| 6 | `https://www.nyc.gov/site/cecm/permitting/permit-types/street-events.page` | **A-2** | Nothing confirms A-2 from this list. This is a **negative check**: read the page for an alcohol provision | A-2 stays "nothing located". Do not widen the search from here; that is section 6 |
| 7 | `https://www.nyc.gov/site/cecm/permitting/permit-types/street-festivals.page` | **A-3**, B-5 | For B-5, a street-festival deadline. For A-3, same negative check as row 6 | Same as row 6 |
| 8 | `https://www.nyc.gov/site/cecm/permitting/fees.page` | B-1 | The five class names transcribe as event types, and the extra-large row's label is read exactly | The label is not "plaza-and-street extra large", which is the expected outcome given Round 3's transcription |

**A-4 (parades) has no row, and that is the finding, not an omission.** There is no page to re-fetch:
the dossier records no parade source, so there is nothing bounded to re-retrieve. A-4 can only be
addressed by section 6's open-ended work, or removed.

**What a successful promotion produces.** Three artifacts, and the third is the only rules-file edit
governance allows:

1. **A dated record in `docs/VERIFICATION-SOURCES.md`**: a new round entry, per the file's existing
   shape, carrying URL, retrieval date, browser-user-agent note where applicable, and the verbatim
   quote. Round 5 and Round 6 are the models. Its own header must repeat that it promotes nothing.
2. **The verification owner's promotion**, which is a per-fact status move on the artifact and is
   theirs alone: the legend says `VERIFIED` is assigned by no one else, and `CONTRIBUTING`'s Golden
   Rule 2 says the same. **A dossier entry never performs this step**, no matter how good the quote
   is.
3. **One new immutable ruleset publication** carrying the narrowed `advisory_text`. Section 5 prices
   it. Note the coupling if a status moves off `COVERAGE_GAP`: per PR #146, `apps/api/src/ruleset.ts`
   requires a `source` block for **every** status except `COVERAGE_GAP`, and both render sites gate
   the not-covered line on `sources.length === 0`. So a promotion is not a status field edit; it
   obliges a source block and changes what the plan and checklist render.

---

## 4. The narrowed text, drafted both ways

**These are drafts for the verification owner. Neither is adopted, neither is published, and no
source is treated as promoted by this document.** They exist so the publication decision is made
against real sentences rather than against an intention.

**One pin applies to every draft.** `packages/engine/src/acceptance.test.ts:871` asserts that
`ADV-SAPO-OTHER-CLASS-001`'s rendered name contains "outside this ruleset version's validated
coverage". Both 4.2 drafts keep that phrase. A draft that drops it moves a test, which section 5
would otherwise price as unaffected. The phrase is kept in 4.1 too, for symmetry rather than because
a test requires it there.

**The crux both branches share, stated once.** The legend says a `COVERAGE_GAP` advisory "asserts
nothing". So **any** draft that keeps a regulatory sentence needs the status to move as well, and a
status move obliges a source (section 3, step 3). That is not in tension with constraint 1: the
constraint says a status change cannot *replace* narrowing, not that it cannot accompany one. The
practical effect is that the confirmed branch is strictly more expensive than the not-confirmed
branch, in exactly the way the decision anticipated.

### 4.1 `ADV-ALCOHOL-PUBLIC-001`

**If the re-fetch confirms A-1 and the verification owner promotes it**, in which case A-2, A-3, A-4 and A-5 are
removed regardless, because nothing was located for any of them:

> Alcohol in public space is outside this ruleset version's validated coverage. A block party may not
> include alcohol (CECM block-parties page). No other alcohol-in-public-space path is evaluated by
> this ruleset version. Confirm with the relevant agency.

Requires: status off `COVERAGE_GAP`, plus a `source` block naming `block-parties.page`.

**Variant on the same branch, which the verification owner should weigh against the draft above.**
Delete the regulatory sentence entirely and let `SAPO-BLOCK-PARTY-ELIG-001` carry it, since that rule
already fires on `block_party` AND `alcohol`, already sources it to the same page, and already sits
at a higher status:

> Alcohol in public space is outside this ruleset version's validated coverage. This ruleset version
> does not evaluate any alcohol-in-public-space path. Confirm with the relevant agency.

This is textually identical to the not-confirmed draft below, which is the point: **if the block-party
prohibition is better carried by the rule that already carries it, then confirming A-1 and failing to
confirm it produce the same advisory**, and the promotion decision stops being a precondition for the
publication. It is offered because it is the cheaper option and would otherwise have to be asked for.

**If the re-fetch fails, or the verification owner does not promote**, all four categories go:

> Alcohol in public space is outside this ruleset version's validated coverage. This ruleset version
> does not evaluate any alcohol-in-public-space path. Confirm with the relevant agency.

Status stays `COVERAGE_GAP`, no source, and the advisory asserts nothing, which is what the legend
says it does.

### 4.2 `ADV-SAPO-OTHER-CLASS-001`

**If the re-fetch confirms the deadlines and the verification owner promotes them:**

> This SAPO class (street festival, single block festival, production event, open culture, extra
> large) is outside this ruleset version's validated coverage. Confirm the filing deadline for your
> class with SAPO.

The class enumeration keeps only names that transcribe from row 8's fee table; "plaza-and-street" is
dropped as a coinage. **The deadlines leave the advisory even on the confirming branch**, and the
reason is structural rather than evidential: this ruleset models a filing lead as a rule with an
`output.deadline`, not as prose inside an advisory. Four promoted per-class deadlines are four
candidate rules, which is a larger change than an advisory-text edit and is **out of this scope**.
Recorded so the verification owner sees that promoting B-3 through B-8 does not end at these two
advisories.

If the owner instead wants the figures retained as reference prose, that draft is the current text
minus the coinage and minus anything row 2, 3, 4 or 5 fails, with `OFFICIAL CONFLICT` rewritten so it
does not name a status the advisory does not carry. It is not drafted in full here because which
figures survive is exactly what the re-fetch decides.

**If the re-fetch fails or nothing is promoted:**

> This SAPO class is outside this ruleset version's validated coverage. Confirm with SAPO.

---

## 5. The publication cost, cited

**Cited, not re-derived.** The enumeration lives in PR #171, `specs/host-guest-authorisation-coverage.md`,
in three sections: "**Every constant coupled to the published artifact, enumerated once**" (the seven
numbered constants plus `DEPENDENCY_SEQUENCING_BINDINGS`), "**The pinned tests, DERIVED rather than
listed**", and "**Category 5: COUNTS the publication moves, which the version sweep could not see**".
Read those. What follows says only which of its items an **advisory-text-only** change reaches.

**Applies:**

| Item, as PR #171 names it | Why it applies here |
| --- | --- |
| No. 2, `EXPECTED_RULESET_VERSION` | Any advisory-text edit is a new immutable publication, so the boot comparison moves |
| The version-pinned test table in full | `apps/api/src/ruleset.ts:32` and `:324`, `ruleset.test.ts:75`/`:112`, `plan.test.ts:127`, `engine.test.ts:972` |
| `ruleset.test.ts:76`, `snapshotDate` | PR #171 records this as **unconditional**. It is doubly so here: the re-fetch produces a new as-of date, which is the whole point of the round |
| BASELINE current-ruleset row, and its `sha256` digest | `docs/BASELINE.md:17`. `check:baseline` recomputes the digest and fails on a mismatch |
| BASELINE lineage row + changelog metadata | A `Ruleset v2.8 lineage` row joins the eight already there, and the artifact's own `status` and `provenance` fields are the changelog `ARCHITECTURE-FUTURE.md` §14 step 5 requires |
| Replay | `permit_plans` pins `ruleset_version` and recovery runs from the lineage commit; the new lineage row is what makes v2.8 recoverable after `rules/` holds only its successor |

**Does not apply, item by item, because the change adds no rule, no advisory, no field and no
scenario:**

| Item | Why not |
| --- | --- |
| No. 1, `EXPECTED_SCHEMA` | Schema family unchanged |
| No. 3, `EXPECTED_RULE_COUNT`, and every rule-count pin | No rule is added or removed |
| No. 4, `EXPECTED_ADVISORY_COUNT` | **Only if an advisory were deleted, and deletion is not on the table**. See the note below |
| No. 5, `UNCONSUMED_INTAKE_FIELDS` | No intake field's consumption changes |
| No. 6, `BLOCK_PARTY_ELIGIBILITY_RULE_ID` | That rule id does not change |
| No. 7, `ALCOHOL_IN_PUBLIC_SPACE_ADVISORY_ID` | The advisory id does not change. See the note below |
| `DEPENDENCY_SEQUENCING_BINDINGS` | Keyed by three rule ids, none of them these |
| The eleven scenario counts | No scenario is added; F-201 AC 7 and F-101 AC 1 are untouched, so PR #171's expensive coordination item does not arise |
| The rule/advisory count documents (`ARCHITECTURE.md:312`, `PRD.md:143`, `ROADMAP.md:12`, `DESIGN.md:7`, F-201 AC 6) | All state "33 rules + 4 advisories", and both figures hold |
| Finding-set pins in `acceptance.test.ts`, `fixture-ruleset-agreement.test.ts`, `checklist.test.ts` | Both advisories keep the same triggers, so the same findings fire on the same scenarios, with different text. **The one exception is the substring pin named in section 4** |

**"Removed" means the claims, not the advisory, and no. 7 is why.** Deleting
`ADV-ALCOHOL-PUBLIC-001` outright is not available at advisory-text scope:
`packages/engine/src/intake/registry.ts:57` pins that id, `parseIntakeContract` requires it to be
published, and `specs/F-101-event-intake.md:40` requires the intake page to render its
`advisory_text` verbatim inline. Deleting it would move nos. 4 and 7, the advisory counts in five
documents, and an approved spec's criterion. The not-confirmed branch in section 4 removes the four
categories from the text and leaves the advisory in place, which is what constraint 1 asks for.

**Two items PR #171's enumeration structurally could not contain, added rather than re-derived.** That
feature changed rules, not advisory text, so nothing in its sweep looked at what an advisory's words
reach:

- **`specs/F-101-event-intake.md:40`** requires the intake page to render `ADV-ALCOHOL-PUBLIC-001`'s
  `advisory_text` **verbatim**, inline, as the coverage warning. **The narrowed text is therefore
  shipped UI copy.** No spec edit follows, because the spec names no literal and explicitly says "the
  rule is the source of the wording; this spec does not paraphrase it". The cost is that a text
  decision here is a copy decision on the intake page, with no second review step in between.
- **`docs/test-scenario-answer-key.md:129`** says `ADV-SAPO-OTHER-CLASS-001` renders a "coverage
  advisory **with reference deadlines** (incl. the Single Block Festival OFFICIAL_CONFLICT)". Every
  draft in section 4.2 makes that sentence false. The answer key is an approved artifact with its own
  BASELINE row (`docs/BASELINE.md:18`, "Scenario fixtures"), so this is an approved-artifact edit in
  the same change, not a stale comment.

---

## 6. What is open-ended, and is NOT in this scope

**The work:** locating a source for A-2 (street events), A-3 (festivals) and A-4 (parades).

**Why it is not bounded.** Section 2.1 records nothing located for any of the three. For A-4 there is
no negative result either: "parade" appears zero times in the dossier, so no one has looked. There is
no URL to re-fetch, no page known to be relevant, and therefore no way to say in advance how much
work the search is. **This is the difference between the two halves**, and it is why the decision
separated them.

**One observation that bounds nothing but is worth having before anyone starts.** Round 3's verbatim
fee-table transcription has no "Parade" row. That is a fee schedule, not a taxonomy, so it does not
establish that no parade class exists, but a searcher should know that the most complete published
SAPO event-type list in the repository does not name one.

**What would start such a search**, in the order a bounded attempt would try them:

1. The CECM permit-type pages for the classes named, read for an alcohol provision rather than for
   the deadline and fee facts previous rounds took from them. Rows 6 and 7 of section 3 already do
   this for A-2 and A-3 as a negative check; if they come back empty, this step is finished and the
   search moves to 2.
2. **50 RCNY §1-01 through §1-12**, the codified SAPO rules, on `codelibrary.amlegal.com`. Round 1
   fetched §1-08 (insurance and fees) and Round 2 §1-01 and §1-03 (the trigger definition), so the
   access path is known and the 403 caveat applies. Read the definitions and scan the full part for
   an alcohol provision.
3. **The agency question, which may be the reason nothing is located.** The advisory says *SAPO*
   prohibits. Round 4 (`:187`) quotes CECM attributing alcohol to a different agency entirely: "If
   your event includes selling or distributing alcohol, you must have a special event permit from The
   New York State Liquor Authority SLA." A permitting requirement is not a prohibition, and the two
   do not contradict, but if the alcohol authority at street events is SLA's, then a searcher
   looking for a SAPO prohibition is looking in the wrong body of text, and the advisory's own
   attribution is what needs to change. **This is a lead, not a finding, and nothing here establishes
   what SLA's requirement means for A-2 through A-4.**

**Time-boxing it.** The honest shape is a fixed budget with a reportable outcome, not a target: steps
1 and 2 above, capped at the pages they name, with anything beyond them requiring a fresh decision.
Step 3 has no page count because there is no known page.

**"No source located" is a real outcome.** It is not a failed search. It changes what the publication
says, meaning section 4's not-confirmed drafts, rather than whether one happens, and it should be recorded
as a dated dossier entry in its own right so the next person does not repeat the same steps.

**This document does not start it.**

---

## 7. Open for the verification owner

Listed rather than answered. Every one is theirs, and each changes the publication.

1. **Is "SAPO prohibits alcohol at block parties" a fair restatement** of "Alcohol, vendors,
   commercial branding and sponsorships are not permitted at block parties"? Section 2.1.
2. **Should A-1 live in the advisory at all**, when `SAPO-BLOCK-PARTY-ELIG-001` already carries it at
   a higher status with a source? Section 4.1's variant.
3. **Does `SAPO-BLOCK-PARTY-ELIG-001`'s "FAQ alcohol prohibition" citation get corrected in the same
   bump?** It carries A-5's defect on a different rule. Section 2.1.
4. **Do B-3 through B-8, if promoted, become per-class deadline rules** rather than advisory prose?
   Section 4.2.
5. **Is the under-inclusive `evidence` pointer** on `ADV-SAPO-OTHER-CLASS-001` corrected in the same
   bump? Section 2.2.
6. **`ADV-ALCOHOL-PUBLIC-001` fires on `park` as well**, via its `location_type` trigger, while none
   of A-1 through A-4 names a park event. Narrowing a trigger is a product decision and is **not**
   proposed here; it is recorded because whoever rewrites the text will see the mismatch.
