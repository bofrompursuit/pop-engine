# Pricing brief: issue #107, named confirmations

**Status:** NOT APPROVED, and not a decision. Issue #107 says the line it proposes "is a proposal, not
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

**Second revision.** Six review findings were applied, two of which corrected headline claims. The
overlap is one and not zero, and the near-empty suppression is a pre-existing AC 4 defect rather than a
cost of this proposal. Each correction is marked "Corrected in review" at the point it applies, so a
reader who saw the first version can find what moved.

---

## 1. The proposed line, applied

The line: name an absence when the organizer answered a question specifically to establish it, and
stay silent when the absence follows from something they never mentioned.

### The issue's four candidates are not the complete set under that test

Read as "a declared intake field the organizer is asked, whose negative answer establishes an
absence", the ruleset has **eleven** such fields, not four.

Corrected in review: an earlier version of this brief listed nine and missed two, which understated
exactly the noise it went on to measure. `has_amusement_ride` and `event_open_to_public` are added
below, and the per-scenario counts are re-derived.

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
- **C:** `7. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **D:** `9. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **E:** `9. Confirmations: no alcohol, no battery system stated in your answers.`
- **F:** `6. Confirmations: no generator, no battery system stated in your answers.`

Under the eleven-field reading the same line carries 4 to 7 items instead of 2 to 3, or 4 to 7
separate plan lines in the shape that exists today.

Two consequences for the key that are not optional:

- Scenario B's finding 4, "No SAPO, no sound permit, no assembly permit, no insurance findings",
  and its verdict copy, "No street, park, sound, or assembly permits identified from your answers",
  both become inconsistent with the generated set. See section 5; they name absences the proposed
  line would not produce.
- `exercised_by_scenarios` on each new rule must list every scenario it fires in, and
  `fixture-ruleset-agreement.test.ts` checks that in **both** directions, with named cases for
  "claims-scenario-it-cannot-reach" and "reaches-scenario-it-omits". A confirmation rule firing in all
  six must list all six.

---

## 3. Is the shape followable? Yes, and one thing is registered by name

Verified by evaluating a real intake against the published ruleset, with Scenario A's answers and
`obstructs_public_way` flipped to `"no"` so SAPO-SCOPE-001's trigger is satisfied. It reaches the plan:

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
arrives as a finding with a source. Nothing about the path is special-cased.

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

One presentational consequence: `name` is set to the whole `note_text`, so a plan line's title is the
sentence. SAPO-SCOPE-001's is two sentences and reads as a paragraph in the title position. Short
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
- **The TPA re-attribution should land after PR #163.** It edits `deadline.qualification`, which was
  one of the two lines `specs/F-202` cited by number; #163 replaces that with field paths precisely so
  this edit cannot silently falsify the spec. #163 is open and green.

---

## 7. What could not be established

- Whether the published sequencing table would be byte-identical to the current constant, which is
  what decides whether change two is publication-only. It has one entry today, so the comparison is
  small, but the target shape is undecided.
- Whether the product owner reads Scenario B's four named absences as the specification for named
  confirmations or as one scenario's copy. Section 5's finding depends on which, and the answer keys
  are silent on it.
