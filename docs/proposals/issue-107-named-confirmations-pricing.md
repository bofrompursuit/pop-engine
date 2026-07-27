# Pricing brief: issue #107, named confirmations

**Status:** NOT APPROVED, and not a decision. Issue #107 says the line it proposes "is a proposal, not
a decision, and it is a rules-owner call", it needs a ruleset bump, and it moves approved answer-key
output. This document decides none of that. It prices it.

**Method:** every confirmation enumerated below follows from a published rule trigger or a published
intake field on `main` at `46971a0`. Nothing here was chosen because it reads well. No rule, ruleset,
spec, answer key, BASELINE row or engine file is changed by this document.

**Headline, up front.** The proposed line does not reproduce Scenario B, which is the issue's own
worked example. It produces a set that is disjoint from the four absences Scenario B's approved copy
names, and it makes the near-empty case noisier on every measure. That is a reason to revisit the
framing before deciding, and it is set out in the last section.

---

## 1. The proposed line, applied

The line: name an absence when the organizer answered a question specifically to establish it, and
stay silent when the absence follows from something they never mentioned.

### The issue's four candidates are not the complete set under that test

Read as "a declared intake field the organizer is asked, whose negative answer establishes an
absence", the ruleset has **nine** such fields, not four.

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
3. **Five fields that pass the same test are not named**, and between them they gate 15 rule triggers,
   which is more than the four named candidates gate combined.

### Confirmations per scenario

Fixture answers read from `packages/engine/src/intake/scenario-intake-fixtures.ts`. A field
contributes only when its answer is the negative value and the field was in scope.

Under the **nine-field** reading:

| Scenario | Confirmation set | Count |
|---|---|---|
| A | alcohol, structures, open flame, generator, battery | 5 |
| B | alcohol, selling, amplified sound, structures, open flame, generator, battery | 7 |
| C | alcohol, food, selling, structures, open flame, generator, battery | 7 |
| D | alcohol, food, selling, structures, generator, battery | 6 |
| E | alcohol, selling, open flame, battery | 4 |
| F | selling, structures, open flame, generator, battery | 5 |

Mean 5.7, range 4 to 7.

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

Under the four-field reading each scenario's expected-findings block gains one line:

- **A:** `6. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **B:** `5. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **C:** `7. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **D:** `9. Confirmations: no alcohol, no generator, no battery system stated in your answers.`
- **E:** `9. Confirmations: no alcohol, no battery system stated in your answers.`
- **F:** `6. Confirmations: no generator, no battery system stated in your answers.`

Under the nine-field reading the same line carries 4 to 7 items instead of 2 to 3.

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

**A harder interaction, which is a conflict rather than a cost.** That sentence renders only when
`plan.findings.length === 0`. Confirmations arrive as findings, as section 3 shows. Under the
four-field reading every one of the six scenarios gains at least two findings, so `findings.length`
would never be zero for any plan whose organizer answered the intake. The first-class near-empty
sentence that F-201 AC 4 requires would stop rendering entirely, in every case, as a side effect of
implementing the other half of the same criterion.

Rendering confirmations instead would therefore take, at minimum: a separate render path so
confirmations do not count toward the near-empty test, or a near-empty test that counts only findings
with a requirement disposition. That is a decision about AC 4's meaning, not a copy change.

---

## 5. THE QUESTION: does Scenario B get clearer or noisier? Noisier, and the line misses it entirely

**Volume.** Scenario B has three substantive findings today. Under the four-field reading it becomes
three findings plus three confirmations, so half the plan is absences. Under the nine-field reading it
becomes three plus seven, so 70 percent of the plan is absences. There is no reading under which the
near-empty case gets shorter, and the case whose entire purpose is to look trustworthy when almost
nothing applies is the case that grows most, because it has the most negative answers.

**Worse than volume: the sets do not match.** Scenario B's approved output names four absences. Here
is what the proposed line does with each:

| Absence the approved copy names | Where it comes from | Proposed line |
|---|---|---|
| street / SAPO | `location_type = private_venue` | **silent**, the organizer never mentioned a street |
| park | `location_type = private_venue` | **silent**, same |
| sound | `amplified_sound = false` | named only under the nine-field reading, not among the issue's four |
| assembly | `headcount = 60`, below the 75 threshold | **silent**, a threshold rather than an absence answer |

Under the issue's four named fields the overlap with the approved copy is **zero**: it would produce
alcohol, generator and battery, none of which the copy mentions, and would omit all four that it does.
Under the nine-field reading exactly one of four overlaps.

So the proposed line, applied to the issue's own worked example, does not reproduce it. The reason is
structural rather than a matter of tuning: the absences Scenario B names all follow from
`location_type` and `headcount`, which are facts the organizer *did* supply, but which the proposed
line's own test treats as "something they never mentioned", because the organizer never mentioned a
street, a park, or an assembly. The test keys on whether a question was answered to establish an
absence; Scenario B's copy keys on whether a permit family was ruled out.

**Those are two different axes**, and the issue's framing conflates them. That is the finding: on the
issue's own success criterion, the proposal is not merely noisy, it is measuring something else.

Stated as an observation and not a recommendation, since this is the rules-owner's call: a line that
would reproduce Scenario B keys on permit families ruled out by location and scale, which is
per-agency rather than per-question, and which the nine-field enumeration above does not describe at
all. Deciding between the two axes looks like the actual decision hiding inside #107.

---

## 6. The v2.9 question

Three changes are pending for one bump.

| Change | Adds or edits | Moves evaluated output? | Needs a decision first? |
|---|---|---|---|
| TPA source re-attribution on DOB-ASSEMBLY-001 | edits `deadline.qualification` | no date, status or verdict moves; the qualification is rendered, so organizer-visible text changes | no, it is a source correction |
| `DEPENDENCY_SEQUENCING_BINDINGS` into the ruleset | adds published data, removes an engine constant | only if the published table differs from the constant | no |
| Named confirmations | adds N rules | **yes, moves approved answer-key output** | **yes, undecided** |

**They can share one bump, and bundling the third one couples a ready publication to an unready
decision.** Nothing about the three conflicts technically: one edits a field, one adds a root key, one
adds rules, and the provenance block already separates per-change consequences in exactly this way for
v2.6 and v2.7. But the first two need no decision and the third needs two, the rules-owner call on the
line and the product-owner call on moving approved output. Bundling makes the first two wait.

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
