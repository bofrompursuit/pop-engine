# Pricing brief: issue #107, named confirmations

**Status:** `PROPOSED`, which is one of governance section 3's five states. This document decides nothing; that is prose here rather than a status. Issue #107 says the line it proposes "is a proposal, not
a decision, and it is a rules-owner call", it needs a ruleset bump, and it moves approved answer-key
output. This document decides none of that. It prices it.

**Method:** every confirmation enumerated below follows from a published rule trigger or a published
intake field on `main` at `46971a0`. Nothing here was chosen because it reads well. No rule, ruleset,
spec, answer key, BASELINE row or engine file is changed by this document.

**Headline, up front.** The proposed line largely does not reproduce Scenario B, the issue's own worked
example: three of the four absences that scenario names sit on a different axis from the one the line
measures, and one, sound, genuinely overlaps. It also makes the near-empty case noisier on every
measure. Separately, and possibly the largest item here, confirmation rules on the two motivating
fields cannot boot without an approved regulatory source, which is a verification-owner cost rather
than an engineering one. All three are reasons to revisit the framing before deciding, and they are in
sections 1, 3 and 5.

**Third revision.** Fifteen review findings across two rounds have been applied and each is marked
"Corrected in review" at the point it applies, so a reader who saw an earlier version can find what
moved. Two changed what the brief concludes: the overlap is one and not zero, and the near-empty
suppression is a pre-existing AC 4 defect rather than a cost of this proposal. This round adds section 0,
a defect in the proposed shape that outranks the costs, and it records a method change in section 3
after a verification failed the same way twice.

Counts that were guessed in earlier versions are now derived rather than spotted: the field inventory by
exhaustive enumeration over all 33 declared intake fields, and the answer-key item numbers by counting
each scenario's numbered findings. Both derivations are stated so they can be rerun.

---

## 0. A defect in the proposed shape, which outranks every cost below

**The mechanism can tell an organizer an absence was established when they answered that they did not
know.** Not a cost line: it is the invented-claim class, produced by the shape this brief is pricing,
and it is first because no cost matters if the shape states false things.

For an enum gate, `"unknown"` makes an `eq "no"` condition evaluate tri-state UNKNOWN,
`resolveFindings` emits every result other than false, and a classification rule carries a STATIC
`note_text`, so the sentence cannot hedge. Demonstrated with a synthetic confirmation rule keyed on
`event_open_to_public`, driven through `validateIntake` and then `evaluate`:

| answer | intake valid | confirmation emitted |
|---|---|---|
| `"no"` | yes | yes, correctly |
| `"unknown"` | yes | **yes**, stating "You told us this event is not open to the public" |
| `"yes"` | yes | no, correctly |

**Not hypothetical for the approved suite.** Three fields in the corrected inventory are answered
`"unknown"` by the fixtures: `structure_over_10ft_tall` in Scenario E, and
`sound_audible_from_public_way` and `venue_license_covers_event_area` in Scenario F. A confirmation
rule on any of them would state a false absence in those two approved scenarios today.

Options, unpriced and listed rather than recommended: an engine change so a classification emits only
on a TRUE trigger, which touches `resolveFindings` for every rule kind and needs the engine owner; a
rule-shape change carrying separate true and unknown text, which is a schema change needing its own
approved spec; restricting confirmations to boolean gates, which drops five of the fourteen fields and
two of the issue's four named candidates; or accepting that the proposal does not work for enum gates
as shaped.

## 1. The proposed line, applied

The line: name an absence when the organizer answered a question specifically to establish it, and
stay silent when the absence follows from something they never mentioned.

### The issue's four candidates are not the complete set under that test

Read as "a declared intake field the organizer is asked, whose negative answer establishes an
absence", the ruleset has **fourteen** such fields, not four.

**Corrected in review for the third time, so this one is DERIVED rather than spotted, and here is the
method.** For all 33 declared intake fields, take each field's negative values from its DECLARED domain
only (`false` for a boolean, `["none"]` for a multi_enum that declares `none`, `"no"` for an enum that
declares it). Then for every condition in every rule trigger that reads that field, decide
mechanically whether the negative makes the condition false, which rules the rule out, or true, which
triggers it. That is exhaustive over the field list rather than over the fields anyone happened to
notice, and it is why this pass found `venue_license_covers_event_area`, which neither the earlier
versions nor the review named.

The result is 11 fields whose negative rules out at least one rule, plus 3 that establish an absence
while ruling out nothing because no trigger reads them (`obstructs_public_way`, whose `"no"` TRIGGERS
SAPO-SCOPE-001 rather than ruling anything out, and `generator_present` and `battery_present`).
Fourteen in total. Four are MIXED, ruling one thing out while triggering another:
`event_open_to_public`, `sound_audible_from_public_way`, `venue_license_covers_event_area`, and
`obstructs_public_way` in the pure-trigger direction.

| Field | Negative value | In the issue? | Rules whose trigger reads it |
|---|---|---|---|
| `obstructs_public_way` | `"no"` | yes | 1: SAPO-SCOPE-001 |
| `alcohol` | `false` | yes | 5: ADV-ALCOHOL-PUBLIC-001, SAPO-BLOCK-PARTY-ELIG-001, SLA-CATERING-001, SLA-ONEDAY-001, SLA-VENUE-LICENSE-001 |
| `generator_present` | `false` | yes | **0** |
| `battery_present` | `false` | yes | **0** |
| `food_present` | `false` | **no** | 3: DOHMH-EXEMPTION-001, DOHMH-ORGANIZER-NOTIFY-001, DOHMH-VENDOR-PERMIT-001 |
| `selling_anything` | `false` | **no** | 2: PARKS-TUA-001, SAPO-BLOCK-PARTY-ELIG-001 |
| `amplified_sound` | `false` | **no** | 3: ADV-NOISE-CODE-001, NYPD-SOUND-001, NYPD-SOUND-PARKS-DEP-001 |
| `structure_types` | `["none"]` | **no** | 4: DOB-PROP-TRUSS-001, DOB-STAGE-001, DOB-TALL-STRUCTURE-001, DOB-TENT-001 |
| `open_flame_or_cooking` | `["none"]` | **no** | 3: FDNY-FUEL-001, FDNY-OPENFLAME-001, PARKS-PROPANE-001 |
| `has_amusement_ride` | `false` | **no** | 1: SAPO-INSURANCE-BLOCK-PARTY-RIDE-001 |
| `event_open_to_public` | `"no"` | **no** | 2 ruled out of 3 that read it: DOHMH-VENDOR-PERMIT-001 and DOHMH-ORGANIZER-NOTIFY-001 both require `"yes"`; DOHMH-EXEMPTION-001 fires ON `"no"` |
| `sound_audible_from_public_way` | `"no"` | **no** | 1: NYPD-SOUND-001's private-venue branch. MIXED: also triggers ADV-NOISE-CODE-001 |
| `structure_over_10ft_tall` | `"no"` | **no** | 1: DOB-TALL-STRUCTURE-001, when its structure condition holds |
| `venue_license_covers_event_area` | `"no"` | **no** | 1: SLA-VENUE-LICENSE-001. MIXED: also triggers SLA-CATERING-001 and SLA-ONEDAY-001 |

Three observations, each verified rather than inferred:

1. **Two of the four named candidates are read by no trigger at all.** `generator_present` and
   `battery_present` appear in no rule's trigger. FDNY-GENERATOR-001 reads
   `generator_gasoline_gallons`, `generator_diesel_gallons` and `battery_system_kwh`;
   DEP-GENERATOR-REG-001 reads `generator_kw`. The two `_present` booleans are consumed only by
   *scoping* those quantity questions, which is what nyc.v2.5 added them for, and is why they are
   absent from `UNCONSUMED_INTAKE_FIELDS`. A confirmation rule keyed on either would be the first
   trigger in the ruleset to read it. That is mechanically fine, and it means the confirmation's
   warrant is "you told us there is none, so the quantity question was never asked" rather than "this
   answer ruled out rule X".
2. **One of the four is already implemented.** `obstructs_public_way = "no"` is exactly
   SAPO-SCOPE-001's second trigger condition. That confirmation exists today.
3. **Seven fields that pass the same test are not named**, and between them they gate 19 rule
   triggers, which is more than the four named candidates gate combined.
4. **`event_open_to_public = "no"` is a mixed case and belongs in the inventory with that stated.** It
   rules out the two DOHMH rules that require `"yes"` and simultaneously TRIGGERS
   DOHMH-EXEMPTION-001, which fires on `"no"` or `"unknown"`. So one answer both establishes an
   absence and produces a finding. An earlier version of this brief excluded it for the second half of
   that and lost the first half, which was wrong: the test asks whether an answer established an
   absence, not whether it did only that.

### Confirmations per scenario

Fixture answers read from `packages/engine/src/intake/scenario-intake-fixtures.ts`. A field
contributes only when its answer is the negative value and the field was in scope.

Under the **eleven-field** reading:

| Scenario | Confirmation set | Count |
|---|---|---|
| A | alcohol, structures, open flame, generator, battery | 5 |
| B | alcohol, selling, amplified sound, structures, open flame, generator, battery | 7 |
| C | alcohol, food, selling, structures, open flame, generator, battery | 7 |
| D | alcohol, food, selling, structures, generator, battery, **amusement ride** | 7 |
| E | alcohol, selling, open flame, battery | 4 |
| F | selling, structures, open flame, generator, battery, **not open to the public** | 6 |

Mean 6.0, range 4 to 7. Scenario D is a block party with `has_amusement_ride: false`, so that
question is in scope and answered; Scenario F answers `event_open_to_public = "no"`.

**The three fields added in this round do not change those counts, and that is the point of separating
two numbers.** The fixtures answer `structure_over_10ft_tall`, `sound_audible_from_public_way` and
`venue_license_covers_event_area` as `"unknown"`, so they contribute no confirmation in any scenario.
The count an implementation must carry is therefore FOURTEEN rules, while the count a fixture displays
is 4 to 7. The gap matters twice: it is unmeasured noise for any real organizer who answers those three
negatively, and under section 0 it is exactly where a false confirmation would be stated in Scenarios E
and F.

Under the issue's **four-field** reading:

| Scenario | Confirmation set | Count |
|---|---|---|
| A | alcohol, generator, battery | 3 |
| B | alcohol, generator, battery | 3 |
| C | alcohol, generator, battery | 3 |
| D | alcohol, generator, battery | 3 |
| E | alcohol, battery | 2 |
| F | generator, battery | 2 |

Mean 2.7, range 2 to 3.

**`obstructs_public_way` produces zero confirmations in all six scenarios.** It is `"yes"` in A, D and
E, and out of scope in B, C and F, which are private venue and park. That is the same reason
SAPO-SCOPE-001 carries `exercised_by_scenarios: []`: no fixture has a street activity with no
obstruction. So of the four named candidates, one never fires in the suite and two are read by no
trigger.

---

## 2. What the answer key would gain, per scenario

The text below is what would be added, in the key's existing register. It is illustrative of the
movement, not proposed wording, since the wording is part of the decision.

**Corrected in review: the shape does not produce one combined sentence.** `resolveFindings` emits one
finding per triggered rule and `PlanView` renders each as its own `PlanLine`, so three confirmation
rules produce THREE plan lines, not the single line illustrated below. A shared `dedupe_key` does not
combine them either: `mergeFindings` spreads the first finding and takes `noteText: first.noteText ??
second.noteText`, so the first rule's `name` and `noteText` win and the others' text is dropped rather
than concatenated.

So the one-line-per-scenario illustration below is what an AGGREGATED rendering would look like, and
aggregation does not exist. Producing it needs one of: a rendering change that groups
`no_new_requirement` notes into a single line, an engine change that aggregates them into one finding,
or a new contract shape for a multi-text finding. That is unpriced engineering work on top of the
rules, and it is additional to the answer-key movement. What the current shape renders instead is one
plan line per confirmation, each with the note text in its title position.

With that caveat, under the four-field reading each scenario's expected-findings block gains, in
aggregated form:

- **A:** `6. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **B:** `5. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **C:** `5. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **D:** `6. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **E:** `9. Confirmations: no alcohol, no battery system stated in your answers.`
- **F:** `6. Confirmations: no generator, no battery system stated in your answers.`

Under the eleven-field reading the same line carries 4 to 7 items instead of 2 to 3, or 4 to 7
separate plan lines in the shape that exists today.

### It contradicts an APPROVED artifact, which is a SPEC-CONFLICT rather than answer-key movement

`docs/DESIGN.md`'s demo plan requires Scenario B to render "no new city event requirement identified
from your answers" plus **exactly two confirmations**. The four-field interpretation produces three for
Scenario B; the fourteen-field reading produces seven. Both contradict an approved document, and under
governance section 5 that is filed and resolved rather than priced as movement.

**One ambiguity has to be resolved first, and it may be the whole of it.** DESIGN's sentence continues
"The system that says 'almost nothing, and here's what to confirm' is the system you trust", which reads
as the two things Scenario B tells the organizer to CONFIRM, its occupancy question and its DOHMH
question, and not as two named absences. F-201 AC 4 uses "named confirmations" for the absences. Neither
document defines the term, and nothing else in PRD, DESIGN or F-201 uses it. So there are three branches,
all decisions:

- the two uses mean the same thing, and DESIGN's "exactly two" contradicts the proposal directly;
- they mean different things, and two approved artifacts use one word for two concepts, which is the
  same defect shape #136 resolved for "coverage";
- the term is defined, which settles both.

Recorded as a conflict either way, because on the first reading the count is wrong and on the second the
vocabulary is.

Two consequences for the key that are not optional:

- Scenario B's finding 4, "No SAPO, no sound permit, no assembly permit, no insurance findings",
  and its verdict copy, "No street, park, sound, or assembly permits identified from your answers",
  both become inconsistent with the generated set. See section 5; they name absences the proposed
  line would not produce.
- `exercised_by_scenarios` on each new rule must list every scenario it fires in, and
  `fixture-ruleset-agreement.test.ts` checks that in **both** directions, with named cases for
  "claims-scenario-it-cannot-reach" and "reaches-scenario-it-omits". A confirmation rule firing in all
  six must list all six.
- **Corrected in review: that metadata is not sufficient.** The guard's
  "Scenario %s reaches nothing the answer key omits" case extracts rule IDs from each scenario's
  expected-findings block and fails on any rule `reachedIn(scenario)` returns that the block does not
  NAME. The illustrated `Confirmations:` lines carry no rule IDs, so every confirmation rule fails that
  case even with perfect coverage metadata. So the key must name each confirmation rule by ID, which
  makes the added text longer than illustrated and multiplies the answer-key movement by the rule count,
  or the comparison itself needs an approved change. Both are costs and neither was priced.

---

## 3. Is the shape followable? Yes, and one thing is registered by name

**Corrected in review: the earlier verification here was invalid, and this is the SECOND time the same
method failed.** Flipping Scenario A's `obstructs_public_way` to `"no"` leaves `sapo_event_type` and
`street_event_size` in the submission, but the registry stops asking them once obstruction is no, so
`validateIntake` rejects it. Rerun through the guarded path, that intake produces two errors:

```
sapo_event_type      not_applicable: only asked when obstructs_public_way != no
street_event_size    not_applicable: only asked when sapo_event_type = street_event
```

So "verified by evaluating a real intake" was not established. Removing the two now-unasked answers
gives an intake `validateIntake` accepts with zero errors, and on THAT intake the shape does reach the
plan:

```
findings total = 4
SAPO-SCOPE-001 present as a finding = true
  kind = "note"            (the engine maps classification to note)
  disposition = "no_new_requirement"
  deadlineStatus = "not_applicable"
  name = the full note_text
  noteText = the full note_text
  agency = null, deadline = null, latestApplyDate = null, feeDisplay = null
  sources = 1, carrying the rule's citation and URL
```

So a new rule of that shape validates, evaluates, becomes `kind: note`, carries its message, and
arrives as a finding with a source. Nothing about the path is special-cased. The conclusion survives the
corrected experiment; the earlier evidence for it did not.

### The method that keeps proving less than it appears to, and what I am changing

Twice now a verification here has used an engine-level call in place of a path the API guards. Round 2
found the first instance, `parseEngineRuleset` exercising the laxer of two parsers and hiding the source
requirement. Round 3 found the second, a direct `evaluate` call hiding `validateIntake`. Same shape both
times, and a method that fails the same way twice deserves more attention than any number it produced.

What changes, stated so it can be held against me: **any claim in this brief about what the product does
is driven through the guards the product uses, in order, and the claim names which guards it passed.**
For a ruleset claim that is the API's `validateRuleset` rather than the engine's parser. For an intake
claim it is `parseIntakeContract` plus `validateIntake` before `evaluate`, and an intake that fails
validation is reported as a failure rather than worked around. Where a claim is genuinely about engine
behaviour alone, as section 0's tri-state demonstration is, it says so and says why the guard does not
apply. Every experiment in this revision was rerun on that basis, which is how the intake in section 0
turned out to need `food_affinity_private_exception_claimed` supplied before it would validate at all.

Four costs are registered rather than automatic, and each is a deliberate guard:

1. **`apps/api/src/ruleset.ts` pins `EXPECTED_RULE_COUNT = 33`** and boot fails on any other count.
   Each added rule changes it.
2. **The agency exemption is pinned by exact equality.** `apps/api/src/ruleset.test.ts` asserts the
   list of rules that may omit `agency` with `.toEqual([...])`, and its comment says "A future rule
   that quietly joins either list has to change this test." A confirmation rule has no agency, so
   every one must be added there by name.
3. **`apps/api/src/ruleset.test.ts` pins `rules` at 33 and `advisories` at 4.**
4. **The fixture-agreement guard checks `exercised_by_scenarios` both ways**, as above.

### The largest single cost, and my SAPO experiment could not have caught it

**These rules cannot boot without an approved regulatory source.** `apps/api/src/ruleset.ts` refuses a
rule whose `source` is absent unless its verification status is COVERAGE_GAP, and `parseSource`
requires a nonempty `citation` string plus a `urls` array with at least one non-empty entry. F-201
permits an empty source snapshot only for a source-less coverage gap.

`generator_present` and `battery_present` have no trigger and no regulatory citation. The intake
registry is not a regulatory source, and no agency publishes "if the organizer has no battery, nothing
applies". So a confirmation rule on either needs one of:

- a source and verification state obtained and approved by the verification owner, which is
  regulatory-source work and not engineering work;
- publication as COVERAGE_GAP, which is the only status exempt from the source requirement, and which
  the published legend defines as a combination the ruleset does not model whose advisory asserts
  nothing, so it would say the wrong thing and it lands inside SPEC-CONFLICT #144's live half;
- an approved contract change permitting a source-less classification.

**This may be the largest single item in the brief, and it is a verification-owner cost on a v2.9
rather than an engineering one.** It was missing from the earlier version, and the reason is worth
recording: the SAPO experiment in this section used `parseEngineRuleset`, and the engine's own
`parseSource` returns null for an absent source rather than refusing it. The engine is laxer than the
API, so the experiment exercised the path that cannot fail and proved less than it appeared to. The
refusal is at API boot.

**Corrected in review: each confirmation renders its sentence TWICE.** The parser sets both `name` and
`noteText` from `output.note_text`, verified on the corrected experiment above where `name === noteText`
was true, and `PlanLine` renders `name` in the heading and `noteText` again in the note paragraph, gated
only on `noteText !== null && noteText !== conflictText`. So the volume is double what the earlier
measurement reported:

| Scenario | confirmations | rendered sentences |
|---|---|---|
| A | 5 | 10 |
| B | 7 | 14 |
| C | 7 | 14 |
| D | 7 | 14 |
| E | 4 | 8 |
| F | 6 | 12 |

Scenario B therefore carries **14 rendered absence sentences beside 3 substantive findings** unless the
rule shape or the renderer changes, which compounds rather than qualifies the noise finding in section 5.
Avoiding it means either a rule shape that separates a short title from the sentence, or a renderer that
suppresses `noteText` when it equals `name`. Both are unpriced.

One further presentational consequence of the same mapping: the heading is the whole sentence, so the
line has no short title at all. SAPO-SCOPE-001's is two sentences and reads as a paragraph in the title position. Short
confirmation text is therefore a UI requirement, not a style preference.

---

## 4. F-102 drift: the premise needs correcting

The issue says F-102's verdict copy "should stop hand-writing the list and render the confirmations
instead". There is no hand-written list in F-102 or in any code to stop hand-writing.

- The only place the list exists is `docs/test-scenario-answer-key.md`, in Scenario B's verdict copy.
  It is a fixture expectation.
- What ships is `apps/web/app/plan/plan-view.tsx`, which renders one generic sentence, "No new city
  event requirement identified from your answers.", with **no list of absent permit types**. A repo
  search for any code emitting such a list returns nothing.
- So Scenario B's approved copy is currently unimplemented, which is consistent with the issue's
  overall claim, but the work is *adding* a capability rather than replacing existing product copy.

### A pre-existing AC 4 defect, which this proposal does not cause

**Corrected in review. This is not a cost of the proposal.** That sentence renders only when
`plan.findings.length === 0`, and Scenario B already produces THREE engine findings today, so the
near-empty sentence is already suppressed for the very scenario F-201 AC 4 cites as its example.
Measured on the published ruleset: DOHMH-VENDOR-PERMIT-001, DOHMH-ORGANIZER-NOTIFY-001 and
ADV-VENUE-OCCUPANCY-001. So the near-empty definition is already broken and confirmations would not
newly switch off a working path. An earlier version of this brief presented it as the proposal's
sharpest implementation cost, which was wrong.

It is still a real defect and still worth knowing, and it belongs to AC 4's current implementation as
independent work. Two specifics for whoever picks it up:

- The obvious fix does not work either. A near-empty test counting only findings with a requirement
  disposition would still be suppressed for Scenario B, because DOHMH-VENDOR-PERMIT-001's disposition
  is `required`. Measured, not assumed.
- What confirmations WOULD add is volume to a path that is already not rendering, so the interaction is
  additive to an existing defect rather than causal of a new one.

---

## 5. THE QUESTION: does Scenario B get clearer or noisier? Noisier, and the line misses it entirely

**Volume.** Scenario B has three substantive findings today. Under the four-field reading it becomes
three findings plus three confirmations, so half the plan is absences. Under the eleven-field reading it
becomes three plus seven, so 70 percent of the plan is absences. There is no reading under which the
near-empty case gets shorter, and the case whose entire purpose is to look trustworthy when almost
nothing applies is the case that grows most, because it has the most negative answers.

**Worse than volume: the sets do not match.** Scenario B's approved output names four absences. Here
is what the proposed line does with each:

| Absence the approved copy names | Where it comes from | Proposed line |
|---|---|---|
| street / SAPO | `location_type = private_venue` | **silent**, the organizer never mentioned a street |
| park | `location_type = private_venue` | **silent**, same |
| sound | `amplified_sound = false` | named only under the eleven-field reading, not among the issue's four |
| assembly | `headcount = 60`, below the 75 threshold | **silent**, a threshold rather than an absence answer |

**Under the broad eleven-field reading the overlap is one of four:** sound, via
`amplified_sound = false`. Under the issue's four named fields it is zero, because `amplified_sound`
is not one of them, so that reading would produce alcohol, generator and battery, none of which the
copy mentions, and would omit all four that it does. The one-of-four figure is the one to quote,
because it is the best case for the proposal.

So the proposed line, applied to the issue's own worked example, largely does not reproduce it.
**Corrected in review: the overlap is one, not zero.** THREE of the four absences Scenario B names
follow from `location_type` and `headcount`, which the organizer did supply but which the proposed
line's own test treats as "something they never mentioned", because they never mentioned a street, a
park, or an assembly. The fourth, sound, follows from an explicit `amplified_sound = false` answer, so
under the broad reading it is a genuine overlap. An earlier version of this brief said all four follow
from location and scale, which its own table above contradicts.

That weakens the claim rather than destroying it: three of four still sit on a different axis. The test
keys on whether a question was answered to establish an absence; Scenario B's copy keys on whether a
permit family was ruled out.

**Those are two different axes**, and the issue's framing conflates them. That is the finding: on the
issue's own success criterion, the proposal is not merely noisy, it is measuring something else.

Stated as an observation and not a recommendation, since this is the rules-owner's call: a line that
would reproduce Scenario B keys on permit families ruled out by location and scale, which is
per-agency rather than per-question, and which the eleven-field enumeration above does not describe at
all. Deciding between the two axes looks like the actual decision hiding inside #107.

---

## 6. The v2.9 question

Three changes are pending for one bump.

| Change | Adds or edits | Moves evaluated output? | Needs a decision first? |
|---|---|---|---|
| TPA source re-attribution on DOB-ASSEMBLY-001 | edits `deadline.qualification` | no date, status or verdict moves; the qualification is rendered, so organizer-visible text changes | **yes**: regulatory source and content, needing the verification owner plus rules reviewer |
| `DEPENDENCY_SEQUENCING_BINDINGS` into the ruleset | adds published data, removes an engine constant | only if the published table differs from the constant | **yes**: `proposals.ts` carries an explicit "PROPOSAL — NOT YET APPROVED" header requiring verification-owner plus engine-owner sign-off, and publishing the machine-readable binding IS approving the sequencing semantics |
| Named confirmations | adds N rules | **yes, moves approved answer-key output** | **yes, undecided** |

**Corrected in review: none of the three is decision-free, so there are no ready passengers.** An
earlier version of this brief described the first two that way, and I relayed it. What is true is
weaker: the first two are decided in principle and not yet approved as publications. The
re-attribution changes organizer-visible regulatory text, which is governance's
"Regulatory source/status/content" row, verification owner plus rules reviewer. The binding sits under
a file-level header naming its own approval class as verification owner plus engine owner, and
publishing it is the approval, not a consequence of one.

Nothing about the three conflicts technically: one edits a field, one adds a root key, one adds rules,
and the provenance block already separates per-change consequences this way for v2.6 and v2.7. The
difference between them is how many owners each needs and whether the underlying question is settled.
The confirmations need two calls that have not been made at all, the rules-owner call on the line and
the product-owner call on moving approved output, so bundling them still makes the other two wait on
the least settled item.

Two specifics worth having:

- **The sequencing bindings do not fit `engine_conventions` as it stands.** That key is an array of
  seven prose strings. A structured table of `dependencyRuleId` / `upstreamRuleId` / `gatedRuleId`
  needs either a new root key, `config.dependency_sequencing` being the obvious shape, or a schema
  change to `engine_conventions`. Which of those it is changes whether the move is publication-only.
- **The TPA re-attribution's ordering dependency is already satisfied.** It edits
  `deadline.qualification`, which was one of the two lines `specs/F-202` cited by number. PR #163 has
  MERGED, so F-202 now cites the field paths and this edit can no longer silently falsify the spec.
  Corrected in review; the earlier version described #163 as open.

---

## 7. What could not be established

- Whether the published sequencing table would be byte-identical to the current constant, which is
  what decides whether change two is publication-only. It has one entry today, so the comparison is
  small, but the target shape is undecided.
- Whether the product owner reads Scenario B's four named absences as the specification for named
  confirmations or as one scenario's copy. Section 5's finding depends on which, and the answer keys
  are silent on it.
