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
repository's evidence record holds as of `main` at `ef847a2`. Where the record holds nothing, that is
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
  says asserts nothing. Section 4.1 prices that as shape 1.

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

| # | URL | Observations it returns | States per observation |
| --- | --- | --- | --- |
| 1 | `.../permit-types/block-parties.page` | Is the alcohol prohibition sentence present as quoted? | 2 |
| 2 | `.../support/frequently-asked-questions.page` | **(a)** Does an alcohol prohibition sentence appear, and **which of block parties, street events, festivals and parades does it name?** **(b)** production figure, **(c)** street-festival figure, **(d)** single-block-festival figure | 16 for (a), 3 each for (b), (c), (d) |
| 3 | `.../permitting/permit-deadlines.page` | Open-culture figure; single-block-festival figure | 3 each |
| 4 | `.../permit-types/open-culture.page` | Open-culture figure | 3 |
| 5 | `.../permit-types/single-block-festivals.page` | Single-block-festival figure | 3 |
| 6 | `.../permit-types/street-events.page` | Does an alcohol provision appear? | 2 |
| 7 | `.../permit-types/street-festivals.page` | **(a)** Does an alcohol provision appear? **(b)** street-festival figure | 2 for (a), 3 for (b) |
| 8 | `.../permitting/fees.page` | **Per class name**, for each of the five the advisory prints: is it on the schedule as printed, on the schedule under a different published label, or absent? | 3 each, five names |

A figure observation has three states, not two: **as printed**, **present but different**, and
**absent**. The middle state is the one an earlier revision of this document had nowhere to put, and
it is not a failure. A source that now publishes a different figure is fetched evidence about a fact
this advisory prints, and it belongs in the dossier round even though **this document may not restate
it**: writing the new figure into a draft would be asserting a permit fact this scope has no standing
to assert.

**Rows 6 and 7 are two-sided, corrected from an earlier revision.** They were written as negative
checks that could only fail A-2 and A-3. That was wrong: if either page carries an alcohol provision,
the prescribed fetch has found primary text for a category the record currently holds nothing for,
and discarding it because the branch structure had no slot would throw away evidence the scope itself
asked for. They can now confirm as well as fail. **This does not widen the search**: they are the
same two pages, read for one more thing.

**Row 7 also decides B-5**, alongside row 2. An earlier revision said so in this table and then let
the draft keep B-5 on row 2 alone. Section 4 now requires both.

**A-4 (parades) still has no dedicated row**, and that is a finding rather than an omission: the
dossier records no parade source. **But it is no longer unconditionally unavailable.** Row 2(a) can
name parades, and if the FAQ does, A-4 has primary text and the attribution the advisory already
claims. That is the whole of what a bounded fetch can do for it; if the FAQ does not name parades,
A-4 can only be reached by section 6's open-ended work, or removed.

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
   obliges a source block and changes what the plan and checklist render. **And it reaches further
   than that: section 5.0 shows that a promotion also changes an intake warning and, on the SAPO
   advisory, what the engine recommends.**

---

## 4. The narrowed text, as a rule per claim

**These are drafts for the verification owner. None is adopted, none is published, and no source is
treated as promoted by this document.**

**A rule per claim, not a set of branches, and this is the second structural correction in two
rounds.** Round 1 gave two branches per advisory. Round 2 gave a per-claim matrix and then hung
branches off it that recombined the claims, which is why four separate cases turned out to be
unreachable: a corrected fifth class label, an FAQ that names a category the record lacks, a
street-festival figure decided by two rows but retained on one, and a conflict claim that could
supposedly fail while both its halves survived. **Those were not four defects.** They were one:
branches are the wrong unit when claims are decided independently.

So section 4 no longer enumerates outcomes. It gives, per claim, **a total function from the section 3
observations that decide it to a text outcome**, and the assembly is the concatenation. Section 4.3
verifies the mapping is total and single-valued and reports the counts.

**Three constraints bind every assembly.**

1. **A status promotion is not an advisory-text-only change in either advisory.** Section 5.0
   establishes this against the code and prices it.
2. **The legend says a `COVERAGE_GAP` advisory "asserts nothing"**, so any assembly keeping a
   regulatory sentence needs the status to move as well. **This includes the class enumeration**, per
   section 4.2.
3. **An advisory carries one `verification.status` for its whole text**, so per-fact promotion is not
   representable inside one advisory. If three deadlines promote and one does not, no status is true
   of all four sentences at once.

**One pin applies to every assembly.** `packages/engine/src/acceptance.test.ts:871` asserts that
`ADV-SAPO-OTHER-CLASS-001`'s rendered name contains "outside this ruleset version's validated
coverage". Every assembly keeps that phrase.

**Promotion is a separate gate and is never folded into a rule below.** Each rule says what the record
would support. Whether a supported claim is then promoted is the verification owner's, and an
unpromoted claim is removed from the text whatever the fetch returned.

### 4.1 `ADV-ALCOHOL-PUBLIC-001`, a rule per claim

| claim | deciding observations | rule |
| --- | --- | --- |
| **A-1** block parties | row 1; row 2(a) | Supported if row 1 shows the sentence as quoted **or** row 2(a) names block parties. Retained iff supported and promoted, sourced to whichever page carries it |
| **A-2** street events | row 2(a); row 6 | Supported if either names street events. Same retention rule |
| **A-3** festivals | row 2(a); row 7(a) | Supported if either names festivals. Same retention rule |
| **A-4** parades | row 2(a) only | Supported if row 2(a) names parades. Same retention rule |
| **A-5** attribution | derived, not decided | **Not an independent claim.** Each retained category names the page that carries it. If a category is carried only by the FAQ, its clause reads "per the CECM FAQ"; if only by `block-parties.page`, it names that page; if by both, both |

**A-5 stops being a branch, and that is a repair rather than a simplification.** An earlier revision
let the FAQ restore a blanket "per the CECM FAQ" while A-2 through A-4 stayed removed, which would
have attributed to the FAQ an assertion the assembly no longer made. Attribution follows the claim it
attributes; it cannot outlive it and it cannot be broader than it.

**A-2, A-3 and A-4 are no longer removed unconditionally.** Section 2 records nothing located for
them **today**. That is a statement about the record, not a prediction about the fetch, and an earlier
revision turned it into one. If the FAQ names a category, the advisory's own attribution turns out to
have been right about that category and the record simply had not captured it.

**The shape decision, which is about A-1 only.** Three shapes, presented and priced, none chosen.

**Shape 1: retain the coverage-gap advisory and let `SAPO-BLOCK-PARTY-ELIG-001` carry A-1.**

> Alcohol in public space is outside this ruleset version's validated coverage, except that a block
> party serving alcohol is evaluated by the block-party eligibility rule. No other
> alcohol-in-public-space path is evaluated by this ruleset version. Confirm with the relevant agency.

**The exception clause is not decoration**, and an earlier revision omitted it and was wrong. For a
public-street intake with `sapo_event_type = block_party` and `alcohol = true`, both this advisory and
`SAPO-BLOCK-PARTY-ELIG-001` fire: the advisory's trigger is alcohol plus any non-private location, the
rule's is `block_party` with an `any` over selling and alcohol. So a plan that said the ruleset
evaluates **no** alcohol-in-public-space path would contradict, on the same page, a rule that
evaluates one and reports the eligibility conflict. Both sentences state what the ruleset does rather
than what the law says, so neither engages constraint 2.

*Price:* section 5's baseline and nothing else. No status move, no source obliged, no engine file
touched, and **the promotion decision leaves the critical path**, because unsupported A-1 produces the
same assembly.

**Shape 2: split A-1 into its own rule.** Same text as shape 1, since the advisory still carries no
category; the prohibition becomes a published rule with its own trigger, source and status.

*Price:* section 5's baseline, **plus a second finding, not merely a higher rule count.**
`SAPO-BLOCK-PARTY-ELIG-001` publishes **no `output.dedupe_key`**, and only two rules in `nyc.v2.8`
publish one at all (`DOB-TENT-001` and `DOB-TALL-STRUCTURE-001`, sharing `dob-structure`).
`packages/engine/src/findings.ts:138-150` merges only findings that share a key and appends every
other. So a new rule triggering on `block_party AND alcohol` gives an alcohol-bearing block party
**two findings where it has one today**, both `prohibited_or_ineligible`, both naming the same
prohibition.

That contradicts section 5.2's row saying finding sets do not move, and the row is now qualified. It
reaches further than the rendered plan: the blocking finding is selected from the findings
(`verdict.ts:54-62`), and `buildRescopeSuggestions` reads `introduced` findings by rule id
(`verdict.ts:340-345`), so a second finding is a second candidate in both. **The cost is therefore a
trigger and deduplication decision, not a text decision**: either the new rule publishes a
`dedupe_key` shared with `SAPO-BLOCK-PARTY-ELIG-001`, which makes it the third rule in the ruleset to
use the mechanism and merges the pair, or it narrows its trigger so the two cannot both fire, or the
duplicate finding is accepted and the plan shows it. **This document does not choose**; it records
that shape 2 cannot be costed without the choice.

Also in shape 2's price: `EXPECTED_RULE_COUNT` and the five rule-count test pins listed in section
5.2; the five documents stating "33 rules + 4 advisories", one of which is F-201 Acceptance Criterion
6, another feature's approved criterion; and the block-party plan tests, which are
`packages/engine/src/acceptance.test.ts:705-713` (the `PROHIBITED_OR_INELIGIBLE` case, which asserts
on a **found** finding and so survives a second one only by luck of which is found first),
`packages/engine/src/fixture-ruleset-agreement.test.ts:654`, and
`packages/engine/src/intake/intake.test.ts:700-719`.

**Shape 3: promote the advisory itself and include the intake contract in the change.**

> Alcohol in public space is outside this ruleset version's validated coverage. A block party may not
> include alcohol (CECM block-parties page). No other alcohol-in-public-space path is evaluated by
> this ruleset version. Confirm with the relevant agency.

*Price:* section 5's baseline, **plus** a `source` block, **plus** the engine work section 5.0
enumerates: `packages/engine/src/intake/validate.ts:248`, the four tests pinning the issue code and
the status together, and a decision about what the intake page renders.

### 4.2 `ADV-SAPO-OTHER-CLASS-001`, a rule per claim

| claim | deciding observations | rule |
| --- | --- | --- |
| **B-1a to B-1e**, one per class name | row 8, per name | **As printed** keeps the name. **Different published label** keeps the name **as the schedule publishes it**, which is not a failure. **Absent** drops that name |
| **B-2** "known published" | derived | Retained only for figures that survive, removed with the last of them |
| **B-3** production 10 days | row 2(b) | As printed and promoted, retained. Different or absent, removed, and the new reading goes to the dossier round |
| **B-4** open culture 15 days | rows 3 and 4 | Both as printed and promoted, retained. **The two disagreeing is not removal**: two live official pages disagreeing is the legend's definition of `OFFICIAL_CONFLICT` and is recorded as a candidate conflict. Otherwise removed |
| **B-5** street festival Dec 31 | rows 2(c) **and** 7(b) | Same three-way rule. **Both rows, corrected**: an earlier revision listed row 7 as deciding B-5 and then retained it on row 2 alone |
| **B-6** single block festival 90 days | rows 3 and 5 | Same three-way rule |
| **B-7** single block festival Dec 31 | row 2(d) | Same as B-3, one source |
| **B-8** the two are both live | **derived: B-8 = B-6 retained AND B-7 retained** | Not an independent claim, and the exception branch is deleted |

**B-8 was defined wrongly and the correction is a proof, not a preference.** An earlier revision let
B-8 fail while B-6 and B-7 both survived. B-6 survives only if rows 3 and 5 show 90 days; B-7 survives
only if row 2(d) shows December 31. **Both surviving means both readings are live on the pages that
carry them, which is exactly what B-8 asserts.** The branch was not merely unlikely, it was
unreachable, and its only effect would have been to render two live official deadlines as ordinary
figures and lose the `OFFICIAL_CONFLICT` the ruleset publishes a status for.

**B-1e is the case an earlier revision classified as failure.** Round 3 of the dossier already
transcribes the fifth label as **"Extra Large Event"**, so "plaza-and-street extra large" is the
ruleset's coinage and the expected observation is *different published label*, not *absent*. The old
criterion demanded all five names transcribe as printed, which the record says will not happen, and
then the draft assumed the enumeration survives minus the coinage. The per-name rule reaches that
outcome directly.

**The class enumeration cannot sit in a `COVERAGE_GAP` advisory, and this corrects a claim an earlier
revision made twice.** That revision said its mixed assembly asserted "nothing beyond the class names
the fee table publishes", as though that put it outside constraint 2. **Section 1.2 classifies B-1 as
a regulatory taxonomy claim, and the legend says a coverage-gap advisory asserts nothing.** Naming
five official SAPO classes while carrying `COVERAGE_GAP` and no source is the same defect this scope
exists to fix, one category smaller.

So the enumeration is **removed from every assembly that keeps `COVERAGE_GAP`**:

> This SAPO class is outside this ruleset version's validated coverage. Confirm the filing deadline
> for your class with SAPO.

**Two ways to keep confirmed class names, both recorded, neither chosen.** The constraint is that the
advisory's status is load-bearing in the recommender: `verdict.ts:345` drops a rescope suggestion only
when it introduces a `COVERAGE_GAP` finding, and `proposals.ts:152-155` names "hold it as some other
SAPO class" as the case that clause exists to prevent. **Any fix that promotes this advisory loses the
guard.**

- **Record the names outside the advisory.** The confirmed labels go into the dossier round and, if
  the owner wants them published, into per-class rules with their own sources. The advisory stays
  generic and `COVERAGE_GAP`, so the guard is untouched.
- **Promote the advisory and pay for the guard.** The enumeration becomes sourced text, and the
  rescope exclusion needs a replacement that does not depend on the status, which is an engine change
  this document does not propose.

**If every deadline row confirms and the owner promotes**, the figures still leave the advisory: this
ruleset models a filing lead as a rule with an `output.deadline`, and constraint 3 says one advisory
cannot carry four independently promoted facts. **Four promoted deadlines are four candidate rules**,
out of this scope.

### 4.3 Is the mapping total? Verified by construction

**Yes, and it is single-valued.** Each rule above is a function defined on the full domain of the
observations that decide it: every figure observation has exactly three states and every rule assigns
an outcome to all three; every presence observation has two and every rule assigns an outcome to both;
row 8's per-name observation has three and the rule assigns an outcome to all three. No rule reads an
observation that section 3 does not produce, and no observation is read by a rule that leaves one of
its states unhandled. **That is the property the previous structure lacked**, and all four unreachable
cases were exactly the states no branch handled.

**The counts, since branches were the wrong unit partly because of their number.**

| | count |
| --- | --- |
| Distinct combinations of section 3 observations | **204,073,344** |
| Distinct text assemblies those map onto | **419,904** |

The first is `2 · (16 · 3³) · 3² · 3 · 3 · 2 · (2 · 3) · 3⁵`, one factor per row in the section 3
table. The second is the product of the per-claim outcome domains: `2⁴` for A-1 to A-4, `3⁵` for the
five class names, and `2 · 3 · 3 · 3 · 2` for B-3 to B-7, with A-5, B-2 and B-8 derived rather than
independent. Many observation combinations produce the same text, which is why the second number is
smaller.

**Neither number is a reason to worry, and both are a reason not to enumerate branches.** A document
that tried would have to be wrong; the previous one was wrong in four places at a fraction of the
size. Rules over independent claims are the only representable form, which is what section 1's split
was for.
---

## 5. The publication cost

### 5.0 A status promotion is not an advisory-text-only change, in either advisory

**Stated first, because the rest of this section prices a publication and an earlier revision of this
document read as though the text were the whole change.** It is not. In both advisories the
`verification.status` value is load-bearing in engine code, and moving it off `COVERAGE_GAP` changes
behaviour that no advisory-text sweep would find. Both sites below were read, not inferred.

**`ADV-ALCOHOL-PUBLIC-001`: the intake contract hard-codes the gap.**
`packages/engine/src/intake/validate.ts:243-248` emits, unconditionally, for every public-location
alcohol answer:

```
warnings.push(noticeIssue("alcohol", "coverage_gap", contract.alcoholInPublicSpaceNotice));
```

The issue **code** is the literal string `coverage_gap`, chosen at the call site. The **status**
travels separately, read from the published advisory by `registry.ts:188`. Promote the advisory and
the two disagree, with nothing in the code to notice:

- Every park, street, sidewalk and plaza alcohol answer receives an issue coded `coverage_gap`
  carrying a notice labelled `SOURCE_CONFIRMED` or `VERIFIED`.
- **The organizer sees both.** `apps/web/app/intake/intake-form.tsx:310` renders
  `humanize(warning.code)` as the label and `:315` renders `{warning.ruleId} · {warning.verificationStatus}`
  underneath, so the rendered warning would read as a coverage gap and carry a promoted status in the
  same paragraph.
- Meanwhile shape 3's own text still says no other alcohol path is evaluated, which is the coverage
  gap the code is naming. The label is not simply stale; it is the only part still telling the truth
  about A-2 through A-4.

**Four tests pin the pairing** and would fail, which is the good news: the desynchronisation is not
silent. `packages/engine/src/intake/intake.test.ts:721-733` asserts the whole warning object
including `code: "coverage_gap"` **and** `verificationStatus: "COVERAGE_GAP"` together, `:173` asserts
the contract's status is `COVERAGE_GAP` directly, `:772` asserts the code, and
`apps/api/src/events.test.ts:154`, `:166` and `:437` assert the code over the HTTP boundary. The test
at `:722` states the invariant in its own comment: "The COVERAGE_GAP status travels with the text so
the UI cannot render an uncovered area as an evaluated one".

**`ADV-SAPO-OTHER-CLASS-001`: the status decides what the engine RECOMMENDS.**
`packages/engine/src/verdict.ts:345`, inside `buildRescopeSuggestions`:

```
if (introduced.some((finding) => finding.verificationStatus === "COVERAGE_GAP")) continue;
```

A rescope suggestion is dropped when it introduces a `COVERAGE_GAP` finding, and only then. The
comment two lines above states the rule that a promotion would break: "a coverage gap asserts
nothing, another agency's permit is not relief, and a scope the engine cannot date is not a scope it
can recommend."

`packages/engine/src/proposals.ts:152-155` names this exact case as the reason the clause exists:
the COVERAGE_GAP test "rules out 'hold it as some other SAPO class'". So a block-party event that is
`PROHIBITED_OR_INELIGIBLE` today, with `sapo_event_type` in the blocking rule's trigger and therefore
a rescope candidate, **would begin receiving a suggestion to switch to `other_sapo_class`** while the
advisory it introduces still says that class is outside validated coverage. The engine would be
recommending a scope it declines to evaluate.

**Consequence for this scope.** Promotion is not free in either advisory, and the shape decision in
section 4.1 is partly a decision about how much engine work to take on. Shape 1 avoids both sites
entirely. Shape 2 avoids both and pays a finding-count price instead, which section 4.1 derives and
which is larger than the rule-count price an earlier revision named. Shape 3 pays for the alcohol
site.
Promoting `ADV-SAPO-OTHER-CLASS-001` pays for the rescope site in addition, whichever alcohol shape
is chosen, and that is the strongest practical argument for section 4.2's structural finding that
promoted deadlines belong in rules rather than in an advisory.

**Neither engine change is proposed here.** Both are named so the publication is costed honestly.

### 5.1 Where this enumeration came from, and why it is reproduced rather than cited

The enumeration below **originated in PR #171**, `specs/host-guest-authorisation-coverage.md`,
sections "Every constant coupled to the published artifact, enumerated once", "The pinned tests,
DERIVED rather than listed", and "Category 5: COUNTS the publication moves, which the version sweep
could not see". An earlier revision of this document cited it instead of reproducing it, to stop two
accounts drifting apart.

**That citation is unresolvable.** The file exists only on #171's unmerged branch: it is absent from
`main`, and a search of the repository's history finds no copy at any commit reachable from `main`.
Someone executing this scope cannot open the source, so an abbreviated applies-and-does-not table
citing it could not be checked against anything.

**So it is reproduced, which is the lesser evil.** A duplicate account can at least be compared with
its original; an unresolvable one cannot. **Every location below was re-verified against `main` and
they all hold**, which is worth knowing on its own: the two accounts agree today.

**This reproduction is authoritative for this document, full stop.** An earlier revision said #171's
copy stays authoritative where they differ, which was the same defect one level up: an executor cannot
open the supposed authority, so a precedence rule pointing at it is as unresolvable as the citation it
replaced. **And an unapproved external branch cannot override the approved baseline in this tree
anyway.** The first version of this section created an unresolvable citation and the second created an
unresolvable precedence; this one has neither.

**The dependency is a note, not a precedence rule.** #171 is where this enumeration originated and
that is worth knowing. If #171 merges, the two accounts should be reconciled and the duplication
collapsed, by whoever lands the second of them. Until then **this document governs its own contents**,
and every location in it stands or falls against `main`, which is the only tree either reader has.

### 5.2 The enumeration, reproduced, with what an advisory-text-only change reaches

**The seven constants coupled to the published artifact**, plus the eighth that is not compared at
boot:

| # | Constant | Location | Compared where | Moves for an advisory-text change? |
| --- | --- | --- | --- | --- |
| 1 | `EXPECTED_SCHEMA` | `apps/api/src/ruleset.ts:31` | `:495` | **No.** Schema family unchanged |
| 2 | `EXPECTED_RULESET_VERSION` | `apps/api/src/ruleset.ts:32` | `:500` | **YES.** Any edit to an immutable artifact is a new version |
| 3 | `EXPECTED_RULE_COUNT` | `apps/api/src/ruleset.ts:33` | `:531` | **No**, unless section 4.1's shape 2 is chosen, which adds a rule |
| 4 | `EXPECTED_ADVISORY_COUNT` | `apps/api/src/ruleset.ts:34` | `:536` | **No.** Only a deleted or added advisory moves it, and see 5.3 |
| 5 | `UNCONSUMED_INTAKE_FIELDS` | `packages/engine/src/ruleset.ts:617` | `parseEngineRuleset` | **No.** No field's consumption changes |
| 6 | `BLOCK_PARTY_ELIGIBILITY_RULE_ID` | `packages/engine/src/intake/registry.ts:56` | `parseIntakeContract` | **No.** That rule id does not change |
| 7 | `ALCOHOL_IN_PUBLIC_SPACE_ADVISORY_ID` | `packages/engine/src/intake/registry.ts:57` | `parseIntakeContract` | **No.** The advisory id does not change, and see 5.3 |
| 8 | `DEPENDENCY_SEQUENCING_BINDINGS` | `packages/engine/src/proposals.ts:128` | not compared at boot | **No.** Keyed by three rule ids, none of them these |

**The pinned tests.** PR #171's method, carried over: grep the non-`node_modules` TypeScript for the
literal version string, for rule and advisory count assertions, and for assertions over a complete
set of published ids.

*Moves whenever the ruleset VERSION changes, so all of these move here:*

| File | Line | Pin |
| --- | --- | --- |
| `apps/api/src/ruleset.ts` | 32 | `EXPECTED_RULESET_VERSION` |
| `apps/api/src/ruleset.ts` | 324 | the version inside the offset diagnostic message |
| `apps/api/src/ruleset.test.ts` | 75, 112 | asserted version, and a fixture carrying it |
| `apps/api/src/ruleset.test.ts` | 76 | `snapshotDate`. **Unconditional**, and see the correction below |
| `apps/api/src/plan.test.ts` | 127 | `rulesetVersion` on the plan response |
| `packages/engine/src/engine.test.ts` | 972 | asserted version |

*Moves whenever a RULE is added, so none of these move unless shape 2 is chosen:*

| File | Line | Pin |
| --- | --- | --- |
| `apps/api/src/ruleset.ts` | 33 | `EXPECTED_RULE_COUNT` (33) |
| `apps/api/src/ruleset.test.ts` | 78 | `rules` length (33) |
| `apps/api/src/ruleset.test.ts` | 368-370 | the `/expected 33 rules/` error expectation |
| `apps/api/src/ruleset.test.ts` | 980, 1022, 1038 | `permit_rules` row count (37, rules plus advisories) |
| `packages/engine/src/engine.test.ts` | 974 | merged `rules` length (37) |

*Moves whenever a scenario's FINDINGS change:* the hard-coded finding sets in
`packages/engine/src/acceptance.test.ts`, `packages/engine/src/fixture-ruleset-agreement.test.ts`,
the fixture expectations in `apps/api/src/plan.test.ts` and `apps/api/src/rules-snapshot.test.ts`,
and the complete per-scenario `ruleIds` lists in `apps/api/src/checklist.test.ts`.

**Under shapes 1 and 3 none of these move**: both advisories keep the same triggers, so the same
findings fire on the same scenarios with different text. The one exception is the substring pin at
`acceptance.test.ts:871`, named in section 4.

**Under shape 2 they do move, and an earlier revision of this row said otherwise without
qualification.** A new rule triggering on `block_party AND alcohol` adds a finding rather than
replacing one, for the reason section 4.1 derives from `findings.ts:138-150` and the two
`dedupe_key` publications in the whole ruleset. An alcohol-bearing block party then carries two
`prohibited_or_ineligible` findings, which changes the rendered plan and feeds a second candidate
into both the blocking selection at `verdict.ts:54-62` and `buildRescopeSuggestions` at `:340-345`.
**The row was written as though rule count were the only axis.** It is not: rule count and finding
count are different things, and only the second is what a plan shows.

**On `snapshotDate`, correcting what an earlier revision of this row said.** That revision claimed
the pin moves because "the re-fetch produces a new as-of date". **That conflates two dates and would
put wrong provenance on every plan banner.** `specs/F-206-rules-snapshot-banner.md:17` defines the
field: the banner reads "Rules snapshot nyc.v2.8 · published July 26, 2026", the spec forbids
rendering it as a verified-as-of date, and it states that "a snapshot date means published-on, not
all-facts-verified-on". The same spec adds that a
per-line last-verified date must "never substitute the ruleset snapshot date". **The retrieval date
belongs in `docs/VERIFICATION-SOURCES.md`**, which records one per round, and v2.8's own metadata
keeps the three apart: `snapshot_date` is 2026-07-26 while Round 6's fetches are dated 2026-07-27,
after publication. So the pin moves, and it moves to **the date the new artifact is published**.

**The counts that move only when a rule or advisory is published**, and therefore do not move here:
`docs/ARCHITECTURE.md:312`, `docs/PRD.md:143`, `docs/ROADMAP.md:12`, `docs/DESIGN.md:7` and
`specs/F-201-permit-plan-generator.md` Acceptance Criterion 6, all stating "33 rules + 4 advisories".
Under section 4.1's shape 2 all five move, and the last is another feature's approved criterion.

**The eleven scenario counts** PR #171 enumerates, which move only if a scenario is added, do not
move here: no scenario is added, so F-201 Acceptance Criterion 7 and F-101 Acceptance Criterion 1 are
untouched and that coordination cost does not arise.

**The publication artifacts, which move for any version bump:**

| Item | Where |
| --- | --- |
| Current-ruleset row and its `sha256` digest | `docs/BASELINE.md:17`. `check:baseline` recomputes the digest and fails on a mismatch |
| A new lineage row | A `Ruleset v2.8 lineage` row joins the eight already there |
| Changelog metadata | The artifact's own `status` and `provenance` fields, which are the changelog `ARCHITECTURE-FUTURE.md` §14 step 5 requires alongside version, checksum and approval |
| Replay | `permit_plans` pins `ruleset_version`; recovery runs from the lineage commit, which is what keeps v2.8 replayable once `rules/` holds only its successor |


### 5.2a The current-version pointers, swept, and this is the largest omission in the list

**The change set as this document previously listed it would leave approved artifacts pointing at a
file that is not there.** `docs/BASELINE.md:45` states the retention rule: "a published ruleset is
never deleted, but through Phase 1.5 it is retained in **git history** rather than as a second file
under `rules/`, which holds exactly one artifact at a time." So publishing a successor removes
`rules/nyc-rules.v2.8.json` from the working tree, and **every instruction that names that path stops
being followable.**

**Method, reproduced from PR #171 rather than invented.** Sweep **every tracked file**, not a
directory list, because both root documents carry a reference and a `docs/` and `specs/` grep cannot
see them. Then sort every hit into four categories, since "moves or does not move" is too coarse:

1. **Instructions and authority claims.** A reader is told to open the file, or told the file is the
   authority. **These must move.**
2. **Executable literals.** The version appears in code that runs, including inside a diagnostic
   message. **These must move.**
3. **Assertions in tests.** Enumerated in the pinned-tests tables above.
4. **Comments and historical records.** These do not move, and the category splits further on whether
   the comment names the file as the **current** authority.

```
git grep -n "nyc\.v2\.8\|nyc-rules\.v2\.8\.json" -- .
```

**115 hits across 35 tracked files** on `main` at `ef847a2`. Both patterns are swept, because the
version string goes stale on the same publication that removes the path.

**Category 1, and it is where the seventeen direct path references live.** Counting only
`rules/nyc-rules.v2.8.json` as a path: `AGENTS.md` twice, `docs/PRD.md` six times,
`docs/ARCHITECTURE.md` eight times, `specs/F-101-event-intake.md` once. The version-string references
in the same category move with them.

| File | Lines | What it asserts |
| --- | --- | --- |
| **`AGENTS.md`** | 13, 27 | **Line 13 is item 5 of mandatory pre-work, directing a contributor to open the file. Line 27 names it as the sole origin of regulatory output** |
| **`CONTRIBUTING.md`** | 17, 22 | Golden Rule 1 says every lead time, fee, agency and requirement comes from that path; line 22 puts it in the authority chain |
| `docs/PRD.md` | 6, 9, 134, 143, 159 | the status pointer, the permit-fact trace, the registry authority, the evaluated artifact, and the banner example with its published date |
| `docs/ARCHITECTURE.md` | 10, 17, 30, 48, 68, 85, 231, 312 | AD-2's authoritative file, AD-9's baseline, the component diagram, the source tree, the intake-column authority, the `permit_rules` seed, the per-rule contract, and boot validation |
| `docs/DESIGN.md` | 52, 70, 107 | the gate that flips the version to APPROVED, Dev 1's fidelity target, the versioning rule |
| `docs/ROADMAP.md` | 12 | the ratification line |
| `specs/F-101-event-intake.md` | 4, 13 | `Depends on: ruleset nyc.v2.8 ratified`, and the registry-authority line |
| `specs/F-201-permit-plan-generator.md` | 4, 14 | `Depends on:`, and the authoritative-inputs line |
| `specs/F-206-rules-snapshot-banner.md` | 17 | the banner example, **version and published date together** |
| `specs/F-204-portal-deep-links.md` | 41 | its `## Published on nyc.v2.8` scope heading |
| `docs/test-scenario-answer-key.md` | 1, 5 | the ruleset the key is derived from, and its authority hierarchy |

**The root documents are why this is not a tidiness item**, and PR #171 makes the same point about the
same two files. `AGENTS.md:13` is mandatory pre-work. If the publication leaves it naming a deleted
path, the next worker's first instruction cannot be followed, and the correct response is to stop on
the contradiction rather than guess which file replaced it. **Both root documents land in the same
commit as the publication.**

**Category 2, executable literals:** `apps/api/src/ruleset.ts:32`, already listed as
`EXPECTED_RULESET_VERSION`, and `apps/api/src/ruleset.ts:324`, the diagnostic string reporting that
"the longest window nyc.v2.8 publishes is 60 days". The 60 does not move and the version claim does.
PR #171 records the preferable fix, which is to interpolate `EXPECTED_RULESET_VERSION` rather than
repeat the literal, since it is in the same file and already moves.

**Category 3** is the pinned-tests tables above, unchanged.

**Category 4, which does not move, split on whether it claims current authority:**

- **4a, names the file as the CURRENT authority, so it goes stale**: `packages/engine/src/intake/registry.ts:3`,
  `packages/engine/src/proposals.ts:17`, `packages/engine/src/types.ts:198`,
  `apps/web/app/verification-copy.ts:3`, `apps/web/app/verification-copy.test.ts:12`,
  `apps/web/app/verification-copy-prose.test.ts:95`, `apps/web/app/plan/plan-line.tsx:201`, and
  `apps/api/src/ruleset.ts:55` and `:278`. **The cost is stated rather than hidden**, as PR #171
  states it: these will name a superseded version until they are next edited. Moving them widens the
  footprint into `apps/web`, which this change otherwise does not touch, so it is a follow-up sweep
  for those files' owners.
- **4b, historical or dated, and never goes stale**: `docs/BASELINE.md`'s superseded-lineage rows,
  `docs/VERIFICATION-SOURCES.md`'s dated round records, `docs/ARCHITECTURE-FUTURE.md`'s amendment
  history, `specs/F-102-feasibility-verdict.md:5` and the other specs' `Updated:` retarget lines, the
  three files under `docs/proposals/` other than this one, the twenty-five in
  `scripts/check-baseline-drift.mjs` (commentary on path-matching bugs the guard already fixed),
  `packages/engine/src/__fixtures__/published-ruleset.ts:4`, `apps/web/app/rules-file.ts:4`,
  `apps/web/app/pages.test.tsx:65` and `apps/api/src/ruleset.ts:46`, each of which describes a past
  hard-coding rather than asserting the current artifact.

**This document is in the sweep and is category 4b.** It is a `docs/proposals/` file recording what
`nyc.v2.8` says today; it does not instruct anyone to open the artifact and it is not approved.

### 5.3 Two items outside the reproduced enumeration

**"Removed" means the claims, not the advisory, and constant 7 is why.** Deleting
`ADV-ALCOHOL-PUBLIC-001` outright is not available at advisory-text scope:
`packages/engine/src/intake/registry.ts:57` pins that id, `parseIntakeContract` requires it to be
published, and `specs/F-101-event-intake.md:40` requires the intake page to render its
`advisory_text` verbatim inline. Deleting it would move constants 4 and 7, the advisory counts in
five documents, and an approved spec's criterion. Every assembly in section 4 removes claims from the
text and leaves the advisory in place, which is what constraint 1 of the decision asks for.

**Two costs PR #171's enumeration structurally could not contain**, because that feature changed
rules rather than advisory text, so nothing in its sweep looked at what an advisory's words reach:

- **`specs/F-101-event-intake.md:40`** requires the intake page to render `ADV-ALCOHOL-PUBLIC-001`'s
  `advisory_text` **verbatim**, inline, as the coverage warning. **The narrowed text is therefore
  shipped UI copy.** No spec edit follows, because the spec names no literal and explicitly says "the
  rule is the source of the wording; this spec does not paraphrase it". The cost is that a text
  decision here is a copy decision on the intake page with no review step in between, and section
  5.0 is where that becomes sharp.
- **`docs/test-scenario-answer-key.md:129`** says `ADV-SAPO-OTHER-CLASS-001` renders a "coverage
  advisory **with reference deadlines** (incl. the Single Block Festival OFFICIAL_CONFLICT)". Every
  assembly in section 4.2 that drops the figures makes that sentence false. The answer key is an
  approved artifact with its own BASELINE row (`docs/BASELINE.md:18`, "Scenario fixtures"), so this
  is an approved-artifact edit in the same change rather than a stale comment.
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
2. **Which of section 4.1's three shapes** carries A-1: leave it on `SAPO-BLOCK-PARTY-ELIG-001`,
   split it into a new rule, or promote the advisory and take the intake-contract work with it. The
   three differ in cost by far more than the text does. Sections 4.1 and 5.0.
3. **Does `SAPO-BLOCK-PARTY-ELIG-001`'s "FAQ alcohol prohibition" citation get corrected in the same
   bump?** It carries A-5's defect on a different rule. Section 2.1.
4. **Do B-3 through B-8, if promoted, become per-class deadline rules** rather than advisory prose?
   Section 4.2.
5. **Is the under-inclusive `evidence` pointer** on `ADV-SAPO-OTHER-CLASS-001` corrected in the same
   bump? Section 2.2.
6. **Is `ADV-SAPO-OTHER-CLASS-001` promoted at all**, given that promoting it makes the engine start
   recommending `other_sapo_class` as a rescope for a prohibited block party, which
   `packages/engine/src/proposals.ts:152-155` says the clause exists to prevent? Section 5.0.
7. **If shape 2 is chosen, does the new rule share a `dedupe_key` with `SAPO-BLOCK-PARTY-ELIG-001`,
   narrow its trigger so the two cannot both fire, or accept a second finding on the plan?** Shape 2
   cannot be costed without the answer, and only two rules in the ruleset use the mechanism today.
   Section 4.1.
8. **Where do confirmed SAPO class names go**, given that the enumeration cannot sit in a
   `COVERAGE_GAP` advisory and that promoting the advisory to hold them loses the rescope guard at
   `verdict.ts:345`? Section 4.2 records the two routes and chooses neither.
9. **`ADV-ALCOHOL-PUBLIC-001` fires on `park` as well**, via its `location_type` trigger, while none
   of A-1 through A-4 names a park event. Narrowing a trigger is a product decision and is **not**
   proposed here; it is recorded because whoever rewrites the text will see the mismatch.
