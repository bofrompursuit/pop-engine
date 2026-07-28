# Measuring issue #108's actual question: a gate ANSWERED "unknown"

**Status:** PROPOSED

This document is a MEASUREMENT. It proposes no change, recommends no option and does not decide
issue #108. The branch carrying it contains no rule, ruleset, spec, answer-key, manifest or engine
change.

Measured at `bd8d05e`, ruleset `nyc-rules.v2.8.json`, Node v24.18.0, suite size 1196. Round 4's
corrections (the rebuilt S2 probe, the `readChecked` runtime measurement in R3, the branch-versus
threshold split and the reachable-unknown recount in R5, and the `unknownFields` sources in S4) were
re-measured on the rebased branch at `776dda2`, suite size 1356, against the same ruleset.

**Which guards each measurement went through, because they are not the same.** Every measurement
against the PUBLISHED ruleset (R1 through R6, and S5's published-ruleset statements) was driven
through the full chain in order: `parseIntakeContract` -> `validateIntake` -> `evaluate` -> the plan
path (`apps/api/src/plan.ts`, `apps/web/app/plan/verdict-copy.ts`), with no engine internal called
directly. The SYNTHETIC probe in S2/S3 did NOT go through that chain: `parseEngineRuleset` accepted
it, `parseIntakeContract` REJECTED it for a reason unrelated to the shape under test (S2), so
`validateIntake` was never run on it, and `evaluate` was given a hand-built intake record assembled
the way `validateIntake` persists one. S3's numbers are therefore an `evaluate`-and-below result,
not an end-to-end one.

PR #167 measured a gate that was legitimately NOT ASKED because its parent held a different value.
This measures a gate that was ASKED and ANSWERED `"unknown"`, which is the case issue #108's title
describes.

---

## Summary

**The scoping mechanism is real. The invisibility is not.**

The proposed mechanism was that a gate answered `"unknown"` fails every `termHolds` clause kind, its
dependents are never added to the asked set, the dependent resolves `not_asked`, the condition
returns `false` before any operator runs, and the requirement disappears **with no unknown, no
finding and no visible trace**.

The first four steps hold for exactly one gate. The fifth does not hold at all on v2.8.

1. **"Fails every clause kind" is false.** `termHolds` handles `!=` as
   `answer !== null && answer !== term.value`, so `"unknown" != "no"` is TRUE. Two of the three
   gates that declare `unknown` gate their dependents with `!=`, and their dependents stay in scope.
2. **One gate does scope its dependents out**: `sapo_event_type`, whose four dependents all use
   `compare` with `=`. `"unknown" === "street_event"` is false, so all four leave scope.
3. **The requirement does not vanish silently.** Answering `sapo_event_type: "unknown"` on a street
   event turns the verdict CONDITIONAL, names `sapo_event_type` as a missing fact, and publishes a
   branch table that names the lost rules explicitly, including `SAPO-STREET-LARGE-001`.

So the harm issue #108 names, a false negative on a permit requirement with no trace, **is not
reachable on the published ruleset**. What is reachable is a weaker version: the specific
requirement is replaced by a conditional branch entry, and the branch entry does not reach the
organizer's screen.

---

## 1. Which gates can be answered "unknown", and what happens to their dependents

Ten registry fields declare `unknown` among their values. Only three of them are gates, meaning
they appear in another field's `asked_when`:

| Gate | Dependents | Clause | `"unknown"` holds? | Dependents scoped out? |
| --- | --- | --- | --- | --- |
| `obstructs_public_way` | `sapo_event_type` | `compare != no` | **yes** | no |
| `event_open_to_public` | `food_affinity_private_exception_claimed` | `compare != yes` | **yes** | no |
| `sapo_event_type` | `street_event_size`, `plaza_level`, `plaza_multiple_blocks`, `has_amusement_ride` | `compare = <value>` | no | **YES, all four** |

The other seven fields that declare `unknown` gate nothing: `street_event_size`, `plaza_level`,
`food_affinity_private_exception_claimed`, `sound_audible_from_public_way`,
`structure_over_10ft_tall`, `venue_license_covers_event_area`, `venue_has_assembly_approval`.

`validateIntake` accepts `"unknown"` for all three gates, because it is a declared value and
`readFieldValue` checks membership. One interaction worth recording, found by measuring rather than
by reading: answering `event_open_to_public: "unknown"` makes
`food_affinity_private_exception_claimed` REQUIRED, so a submission that answers the gate unknown
and omits the dependent is **rejected** with `food_affinity_private_exception_claimed: required`.
The `!=` clause widens scope rather than narrowing it.

**So the mechanism's blast radius is one gate, not the registry.**

## 2. What the plan actually does when `sapo_event_type` is "unknown"

Two submissions, identical except for the gate, both through `validateIntake` and `evaluate`. The
street event is large enough that `SAPO-STREET-LARGE-001` fires when the type is answered.

| | `sapo_event_type: "street_event"`, `street_event_size: "large"` | `sapo_event_type: "unknown"` |
| --- | --- | --- |
| accepted by `validateIntake` | yes | yes |
| verdict | `FEASIBLE_AT_RISK` | **`CONDITIONAL`** |
| findings | 2 | **5** |
| `SAPO-STREET-LARGE-001` | present, required | **absent from findings** |

Rules that appear only in the unknown case: `SAPO-BLOCK-PARTY-001`,
`SAPO-BLOCK-PARTY-SPONSOR-001`, `SAPO-PLAZA-001`, `ADV-SAPO-OTHER-CLASS-001`, all
`may_be_required`.

**The lost rule is named in the plan.** `verdictDetail.missingFacts` carries:

```
{ "field": "sapo_event_type",
  "branches": [
    { "value": "street_event",     "verdict": "CONDITIONAL",
      "reason": "adds SAPO-STREET-LARGE-001, SAPO-STREET-MEDIUM-001, SAPO-STREET-SMALL-001,
                 SAPO-STREET-XL-001; drops ADV-SAPO-OTHER-CLASS-001, SAPO-BLOCK-PARTY-001, ..." },
    { "value": "block_party",      "verdict": "INFEASIBLE",  ... },
    { "value": "plaza_event",      "verdict": "CONDITIONAL", ... },
    { "value": "other_sapo_class", "verdict": "FEASIBLE",    ... }
  ] }
```

Two further channels carry the same loss:

- `verdictDetail.unresolvedTimelines` reports `SAPO-PLAZA-001` with the reason "the plan was never
  asked plaza_level, which this deadline keys on", which names a scoped-out dependent directly.
- `verdictDetail.trace` records `SAPO-STREET-LARGE-001` with `result: "false"`, so the false
  evaluation is recorded rather than merely absent.

**Why this works, and what it depends on.** `sapo_event_type` is itself referenced by rule triggers,
so a rule condition on it resolves to an explicit unknown, the field enters `unknownFields`, and
`evaluateConditional` branches over its declared values. The branch table exists because the gate is
visible to the trigger layer, not because the scoping layer reported anything. The scoping layer
reports nothing; `askedFields` returns a set with no record of what it excluded or why.

## 3. Blast radius

**5 published rules** reference a field that leaves scope when `sapo_event_type` is answered
`"unknown"`:

- `SAPO-STREET-LARGE-001`, `SAPO-STREET-MEDIUM-001`, `SAPO-STREET-SMALL-001`, `SAPO-STREET-XL-001`
  (all reference `street_event_size`)
- `SAPO-INSURANCE-BLOCK-PARTY-RIDE-001` (references `has_amusement_ride`)

No advisory is affected. `plaza_level` and `plaza_multiple_blocks` are referenced by no rule
trigger; `plaza_level` is read by `SAPO-PLAZA-001`'s deadline, which is why its absence surfaces as
an unresolved timeline rather than as a missing rule.

The other two `unknown`-declaring gates contribute **0** rules, because their `!=` clauses keep
their dependents in scope.

## 4. The six approved scenarios

**None of the six answers a gate `"unknown"`.** Measured by reading
`SCENARIO_INTAKE_FIXTURES` through `fixtureSubmission`:

| Scenario | `sapo_event_type` | fields answered `"unknown"` |
| --- | --- | --- |
| A | `street_event` | none |
| B | not asked | none |
| C | not asked | none |
| D | `block_party` | none |
| E | `plaza_event` | `structure_over_10ft_tall` |
| F | not asked | `food_affinity_private_exception_claimed`, `sound_audible_from_public_way`, `venue_license_covers_event_area`, `venue_has_assembly_approval` |

Scenarios E and F answer five fields `"unknown"`, and **every one of them is a dependent that gates
nothing**. So no approved answer key depends on the behaviour measured here, and the question of
whether an answer key is "correct only for another reason" does not arise: the mechanism is not
exercised by any of the six.

## 5. Does "visible end to end" hold on this path

`AGENTS.md:28` states two things. The first is that `SOURCE_CONFIRMED`, `OFFICIAL_CONFLICT`,
`RESEARCH_REQUIRED` and `COVERAGE_GAP` stay visible end to end; **that clause is not engaged here**,
because no verification status changes when a gate is answered unknown. The second is "Never present
a partial plan as complete", and that is the clause this path tests.

Traced through the layers:

| Layer | What it carries |
| --- | --- |
| `evaluate` | `CONDITIONAL`, missing fact `sapo_event_type`, branch table naming the four SAPO-STREET rules, unresolved timeline naming `plaza_level`, trace with `result: "false"` |
| `apps/api/src/plan.ts` | persists and serves `verdictDetail` whole, including `missingFacts` and its branches |
| `apps/web/.../verdict-copy.ts` | renders `CONDITIONAL: sapo event type` |

**The clause holds.** The plan is not presented as complete: the verdict is CONDITIONAL and the
field the plan is waiting on is named on screen.

**What the organizer does not see is the branch table.** `verdictCopy` maps `missingFacts` to their
field names only, so the reason text naming `SAPO-STREET-LARGE-001` and the other three is served by
the API and not rendered by the plan view. An organizer who answers "I do not know what kind of
street event this is" is told the plan is conditional on that answer; they are not told that one
branch requires a large street event permit. That is a rendering gap rather than an engine one, and
it is the only part of the original concern that survives measurement.

## 6. What was refuted, precisely

Stated plainly because the request was to confirm or refute rather than to soften:

| Claim | Result |
| --- | --- |
| `termHolds` returns a plain boolean and a gate answered `"unknown"` fails every clause kind | **Refuted.** `!=` holds on `"unknown"`. Two of three gates are unaffected. |
| `askedFields` never adds the dependent | **Confirmed**, for `sapo_event_type`'s four dependents only |
| The dependent resolves `not_asked` and the condition returns `false` before any operator runs | **Confirmed.** The trace records `SAPO-STREET-LARGE-001` as `false`. |
| The requirement disappears with no unknown, no finding and no visible trace | **Refuted.** An unknown is present (verdict CONDITIONAL), findings are added rather than only removed, and three separate channels name the loss. |

**The scoping layer is silent; the plan is not.** `askedFields` genuinely discards the information
that a dependent was excluded and why, which is the defect issue #108 describes. On v2.8 the verdict
machinery independently reconstructs the consequence, because the same gate that scoped the
dependents out is itself an explicit unknown that rules read. The two facts are separate, and the
second is what prevents the harm today.

## 7. What this measurement does not establish

- **It does not test a gate that scopes dependents out and is invisible to the trigger layer.** On
  v2.8 the only gate that scopes dependents out is read by rules, so the branch table always fires.
  Whether the loss would be silent for a gate that no rule reads is a question about a ruleset that
  does not exist, and reading the code path suggests it would be, since `missingFacts` is built from
  `resolved.unknownFields` and that set is populated by trigger conditions. That is a code reading,
  labelled as such, not a measurement.
- **It does not measure PR #167's question**, which was a gate left unanswered rather than answered
  `"unknown"`. The two produce different engine states: unanswered reaches `resolveAnswer` as
  `state: "unknown", isExplicitUnknown: false`, while `"unknown"` reaches it as
  `isExplicitUnknown: true`, which is what lets a rule listing `unknown` among its accepted values
  be answered by it.
- **It measures v2.8 only.** Every count above is a fact about the published ruleset, not about the
  engine in general.

## Reproduction

1. `git checkout bd8d05e` and `pnpm install --frozen-lockfile`.
2. `pnpm --filter api migrate up` against an empty database.
3. Build a submission from the street-event shape in section 2, vary `sapo_event_type` between
   `"street_event"` with `street_event_size: "large"` and `"unknown"`, pass each through
   `validateIntake` and then `evaluate` with the ruleset's own `calendarId`.
4. Compare `plan.verdict`, the rule ids in `plan.findings`, and `plan.verdictDetail.missingFacts`.


---

# Round 2: the rendering gap, measured

Round 1 established that the branch table exists and is not on screen. This measures what that
costs, through the real component path: `PlanView` rendered with `@testing-library/react`, fed by a
stubbed `fetch` in the same three-call shape the page makes, with the plan body produced by
`validateIntake` -> `evaluate` on the published ruleset. No JSX was read and inferred from.

## R1. It is already required by an APPROVED spec, and it is unimplemented

**This reclassifies the whole thing, so it goes first.**

`specs/F-102-feasibility-verdict.md` is **APPROVED (2026-07-24)**. Its Outputs table sets the copy
rule for one verdict explicitly:

| Verdict | detail carries | Copy rule |
| --- | --- | --- |
| CONDITIONAL | each missing fact + every branch's verdict and reason | **branch table rendered** |

And AC 6, **Branching**: "every material unknown produces a fully evaluated branch (Scenario F:
license coverage, assembly approval, sound audibility -> **branch table with per-branch verdicts**;
the no-license branch shows the one-business-day miss)."

So rendering the branch table is **not a new requirement**. It is an acceptance criterion of an
approved spec, naming an approved fixture scenario, and it is not implemented. `plan-view.tsx:19`
records the boundary rather than the gap: "F-102's branch tables and rescope ladder are its own
feature."

**Measured against Scenario F itself**, which is what AC 6 names:

- verdict `CONDITIONAL`, two missing facts, four branches
- on screen: `Depends on: sound audible from public way, venue license covers event area`
- branch reason text on screen: **none of the four**
- per-branch verdicts on screen: **none**
- the `venue_license_covers_event_area = "no"` branch carries verdict **INFEASIBLE**, and neither
  the branch nor its verdict is visible

One observation offered without a conclusion, since it is a different question: AC 6 names three
unknowns for Scenario F and the engine produces missing facts for two of them,
`sound_audible_from_public_way` and `venue_license_covers_event_area`.
`venue_has_assembly_approval` is answered `"unknown"` in the fixture but does not appear as a
missing fact. Whether that is correct is outside this measurement.

## R2. What the organizer actually sees

Literal visible text for the `sapo_event_type: "unknown"` submission, in order, at the top of the
page:

```
Your permit plan
Rules snapshot nyc.v2.8 · published July 26, 2026
Depends on: sapo event type · generated 2026-07-25 · revision 1
```

Then five findings, each `may be required`: the SAPO insurance certificate,
`SAPO-BLOCK-PARTY-001` ("apply by 2026-07-18 · published deadline missed"),
`SAPO-BLOCK-PARTY-SPONSOR-001`, `SAPO-PLAZA-001`, `SAPO-INSURANCE-001`, and the
`ADV-SAPO-OTHER-CLASS-001` coverage-gap advisory ending "Not covered by this ruleset version. This
plan may be incomplete for your event."

**"Depends on: sapo event type"** is the entire branch table as rendered. `verdictCopy` maps
`missingFacts` to `fact.field.replace(/_/g, " ")`, so the organizer is shown a de-underscored
registry field name and no branch.

One raw field name does reach the screen verbatim, inside the `SAPO-PLAZA-001` line: **"the plan
was never asked plaza_level, which this deadline keys on"**. That is `unresolvedTimelines` rendered
as written, underscore included.

## R3. What is in `verdictDetail` and not on screen

For the same submission, every member measured:

| Member | Size | On screen |
| --- | --- | --- |
| `missingFacts` (the branch table) | 757 chars | **No**, except each `field` as de-underscored text |
| `trace` | 1884 chars | **No** |
| `missedRuleIds` | 24 chars | **No** |
| `unresolvedTimelines` | 109 chars | **Yes**, verbatim, on the finding it belongs to |
| `blockingFinding` | null | n/a |
| `minSlackDays` | null | n/a |
| `rescopeSuggestions` | empty | n/a |

**The branches are not dropped by the renderer, and rounds 1 to 3 were wrong to say they are
dropped at the type boundary. Nothing drops them. They are present at runtime and no code looks
at them.** `apps/web/app/plan/plan-api.ts:134` defines what the web consumes:

```ts
export type ConsumedVerdictDetail = Omit<
  Pick<VerdictDetail, "minSlackDays" | "missingFacts">, "missingFacts"
> & { readonly missingFacts: readonly Pick<MissingFact, "field">[] };
```

with `MISSING_FACT_CHECKS: FieldChecks<Pick<MissingFact, "field">> = { field: isString }`.

That is a NARROWING, not a PROJECTION, and the distinction is the whole point. `readChecked` in
`apps/web/app/plan/validated.ts:53` validates the properties named in `checks` and then does
`return record as T` (line 60) on the object it was handed. `shapedLike` (line 64) is a type
predicate over `readChecked`, and `arrayOf` (line 84) is `Array.isArray(value) && value.every(check)`.
No member is copied, deleted or rebuilt anywhere on that path. The declared type narrows to
`Pick<MissingFact, "field">`; the runtime value is whatever the API sent.

Measured, by taking the six approved scenarios through `evaluate`, JSON round-tripping the
`missingFacts` array the way the wire does, and running it through the web's own parser:

```
Scenario E  AFTER_READCHECKED [["field","branches","thresholds"],["field","thresholds","branches"]]
Scenario F  AFTER_READCHECKED [["field","thresholds","branches"],["field","thresholds","branches"]]
```

So `branches` and `thresholds` arrive in the browser and sit there unread. `unresolvedTimelines`,
`trace`, `blockingFinding`, `missedRuleIds` and `rescopeSuggestions` are likewise not declared in
`ConsumedVerdictDetail` but likewise not stripped by it. `unresolvedTimelines` reaches the screen by
another path: it is carried on the finding, not on the verdict detail.

**What this changes about the F-102 AC 6 work.** Since the values already arrive, AC 6 is not a
plumbing task. No API change, no new response member, no serialization work: `apps/api/src/plan.ts`
stores and returns `verdict_detail` whole. The work is to declare what is already there
(`ConsumedVerdictDetail` and `MISSING_FACT_CHECKS` widened from `Pick<MissingFact, "field">` to the
members the table needs, with the checks to match) and to write the component that renders it.
Rounds 1 to 3 described this as data being dropped in transit and repeated that to the product
owner twice; it sizes the work larger than it is.

On whether the UI honours the engine's own completeness rule: `verdict.ts` treats leaving a branch
out as a defect ("drop it from the branch table (P1-B)"). The UI does not render the table, so the
question of honouring per-branch completeness does not arise; there is no partial table, there is
none.

## R4. Whether an existing renderer is being missed

**No.** Searching the web app for a branch-table or missing-fact renderer outside test files returns
exactly one file, `apps/web/app/plan/verdict-copy.ts`, and its only use of `missingFacts` is the
field-name join quoted above. There is no component that renders branches, and no path that reaches
one.

So this is "not built", not "built and unreached". That is the larger of the two readings.

## R5. How many situations reach it

**The gap is general, not specific to the unknown gate.** Any missing fact produces branches, and no
missing fact renders them.

Measured across the six approved scenarios, through the same component path:

| Scenario | Verdict | Missing facts | Facts with branches | Branch reasons on screen |
| --- | --- | --- | --- | --- |
| A | INFEASIBLE | none | 0 | n/a |
| B | CONDITIONAL | none | 0 | n/a |
| C | FEASIBLE | none | 0 | n/a |
| D | FEASIBLE_AT_RISK | none | 0 | n/a |
| E | CONDITIONAL | `tent_area_sqft`, `structure_over_10ft_tall` | 1 | none |
| F | CONDITIONAL | `sound_audible_from_public_way`, `venue_license_covers_event_area` | 2 | none |

**These are two distinct rendering gaps, not one.** A missing fact does not always carry branches.
When `alternativeValues` returns no enumerable candidates, `evaluateConditional` pushes
`{ field, branches: [], thresholds: publishedThresholds(field, ruleset) }` instead
(`packages/engine/src/verdict.ts:199`), which is a threshold string with no branch table at all.
Scenario E contains one of each, measured:

```
E: [{"field":"tent_area_sqft","branches":0,"thresholds":"DOB-TENT-001 applies above 400"},
    {"field":"structure_over_10ft_tall","branches":2,"thresholds":null}]
F: [{"field":"sound_audible_from_public_way","branches":2,"thresholds":null},
    {"field":"venue_license_covers_event_area","branches":2,"thresholds":null}]
```

So **three of the six approved scenarios' missing facts reach an unrendered branch table** (one in
E, two in F), and **one reaches unrendered threshold guidance instead** (`tent_area_sqft` in E,
whose organizer is never told the 400 sqft number that decides the requirement). Having a missing
fact and having a branch table are different conditions, and a fix for one does not cover the
other. Rounds 1 to 3 collapsed them.

Upper bound on the surface, recounted. Round 3 said 15 fields, taking every enumerable
trigger-referenced field. That overstates it: `validateIntake` closes the route for a field that
declares no `unknown` value. Measured, by submitting `"unknown"` and `null` for each of the 15
against the published contract:

- **8 of the 15 cannot resolve unknown at all.** `location_type`, `has_amusement_ride`,
  `food_present`, `selling_anything`, `amplified_sound`, `alcohol`, `structure_types` and
  `open_flame_or_cooking` are non-nullable and declare no `unknown` member, so `"unknown"` is
  rejected `invalid_value` and `null` is rejected `required` (except where scoping makes the field
  not applicable, which is not an unknown either).
- **7 of the 15 can**, and each was accepted as `"unknown"` in at least one approved scenario:
  `obstructs_public_way` (A, D, E), `sapo_event_type` (A, D, E), `street_event_size` (A),
  `structure_over_10ft_tall` (E), `event_open_to_public` (all six),
  `sound_audible_from_public_way` (F), `venue_license_covers_event_area` (F). Outside those
  scenarios each is rejected `not_applicable` rather than accepted, so scope narrows the reachable
  surface further per submission.

The remaining 10 trigger-referenced fields are numeric or date, and take the `branches: []` path
above: threshold guidance where the ruleset publishes one, nothing where it does not. Also
unrendered.

## R6. What this round establishes and does not

Establishes:

- rendering the branch table is an acceptance criterion of an approved spec, unimplemented;
- the organizer sees a de-underscored field name and nothing else of the table;
- the branches arrive in the browser and are read by nothing, so AC 6 is a rendering task rather
  than a plumbing one;
- no renderer exists anywhere in the web app;
- two of six approved scenarios reach it today, and 7 trigger-referenced fields can resolve
  unknown; a further gap, unrendered threshold guidance, is separate from the branch table.

Does not establish, and is outside this measurement:

- whether Scenario F's third named unknown, `venue_has_assembly_approval`, should appear as a
  missing fact;
- whether the approved answer key expects the branch table on screen, which is a question about
  `docs/test-scenario-answer-key.md` rather than about the engine or the component;
- anything about whether #108 should be closed, which this document does not address.


---

# Round 3: is the engine safe, or is v2.8 safe

Round 1 found that answering `sapo_event_type: "unknown"` surfaces the loss through a branch table,
and noted that this happens **because that gate is itself read by rule triggers**. That left one
question open, and it is the one the #108 disposition turns on: is the surfacing a property of the
engine, or an overlap in this particular ruleset?

**Answer: v2.8 happens to be safe. The engine is not.**

## S1. The dangerous shape is expressible, and the loader accepts it

The first thing to check was whether the schema forbids a gate that no trigger reads, because a
validator that rejects the shape would be a real guarantee. It does not.

`rejectUnconsumedFields` (`ruleset.ts:654`) counts a field as consumed when a trigger reads it, when
a deadline resolves against it, **or when it scopes another question**:

```ts
const consumed = new Set<string>([
  ...published.flatMap((rule) => triggerFields(rule.trigger)),
  ...deadlineConsumedFields(published),
  ...intakeFields.flatMap((field) => (field.askedWhenClauses ?? []).map((clause) => clause.field)),
]);
```

So gating something is sufficient to be consumed. A gate read by nothing else loads cleanly.

## S2. The synthetic ruleset

**Correction to round 3.** The probe published in round 3 carried invented regulatory content: a
rule id of `PROBE-REQUIREMENT-001`, `output: { permit_name: "Probe requirement", agency: "PROBE" }`,
a `source` block with a citation and a `https://example.test/probe` url, and
`verification: { status: "SOURCE_CONFIRMED" }` on a rule whose own citation read "synthetic probe,
no source". That is a fabricated permit fact and a fabricated verification state, and being
synthetic does not license it: AGENTS.md's rule is that a permit fact is never invented, and a
reader scanning this file for permit-shaped content should not find any. All of it has been removed
and the probe below re-measured from scratch. Nothing that content asserted was load-bearing for the
result; the numbers in S3 are unchanged.

What the parser actually requires of a rule, measured against `parseEngineRuleset` directly:

| Member | Required? | Measured |
| --- | --- | --- |
| `verification` | **yes** | omitting it fails with `ruleset.rules[0].verification must be an object` |
| `verification.status` | **yes** | `""` fails "must be a non-empty string"; `NOT_A_STATUS` fails "has unsupported value"; the four published statuses all parse |
| `source` | no | omitted entirely, parses |
| `output` | present but may be empty | `{}` parses; no `permit_name` or `agency` is demanded |
| `id`, `kind`, `trigger` | yes | `kind` accepts permit, note, advisory, prohibition, registration |

So the minimum that parses is an id, a `kind`, a trigger, `output: {}`, and a `verification.status`
from the published set. `RESEARCH_REQUIRED` is the choice because the parser leaves no way to omit
a status and that status is the one whose meaning ("nothing is confirmed about this") is true of a
probe. `SOURCE_CONFIRMED` would have parsed equally well and asserted something false. The id says
what the thing is rather than naming a requirement.

Test scope only. It asserts no permit fact, names no agency, permit or citation, and `rules/` is
untouched. Carried here in full so the result is reproducible:

```ts
const SYNTHETIC = {
  ruleset_version: "probe.v1",
  jurisdiction: "US-NY-NYC",
  snapshot_date: "2026-07-22",
  config: {
    slack_warning_days: { value: 14 },
    business_day_math: { calendar: "test-calendar@2026" },
  },
  intake_fields: [
    { field: "event_date", type: "date", collected: true },
    // The gate. Declares "unknown". Read by NO trigger; consumed only by scoping the dependent.
    { field: "gate_field", type: "enum", values: ["yes", "no", "unknown"], collected: true },
    // Scoped out when the gate is answered "unknown", because "unknown" !== "yes".
    { field: "dependent_field", type: "boolean", collected: true, asked_when: "gate_field = yes" },
  ],
  rules: [
    {
      id: "PROBE-SYNTHETIC-NOT-A-RULE",
      kind: "permit",
      trigger: { all: [{ field: "dependent_field", op: "eq", value: true }] },
      // Empty. The probe measures whether the gate is reported, not what the rule would say.
      output: {},
      verification: { status: "RESEARCH_REQUIRED" },
    },
  ],
  advisories: [],
};
```

Driven through the guards in order:

- **`parseEngineRuleset`: ACCEPTED.** The shape loads.
- **`parseIntakeContract`: REJECTED**, with "ruleset does not publish SAPO-BLOCK-PARTY-ELIG-001".
  That guard requires two specific published notice rules by id, so it cannot be driven on a
  synthetic ruleset at all. It is a constraint on this probe, not a protection against the shape:
  any real published ruleset carries those two rules and would pass. `validateIntake` therefore
  could not be driven here either, and the intake record below is built the way `validateIntake`
  persists one, every declared field present with un-asked fields NULL.
- **`evaluate`: ran on all three answers.**

## S3. The result

| Answer to `gate_field` | Verdict | Findings | `missingFacts` | `unresolvedTimelines` | Gate named anywhere in the plan |
| --- | --- | --- | --- | --- | --- |
| `"yes"` + `dependent_field: true` | FEASIBLE | `PROBE-SYNTHETIC-NOT-A-RULE` | none | none | no |
| `"no"` | FEASIBLE | none | none | none | no |
| **`"unknown"`** | **FEASIBLE** | **none** | **none** | **none** | **no** |

**The requirement leaves with no missing fact, no branch, no finding and no unresolved timeline.**
The verdict stays FEASIBLE, which is the engine saying the plan is complete.

The sharpest form of the result:

```
plan(gate_field = "no") === plan(gate_field = "unknown")   ->   true
```

The two plans are byte-identical JSON. There is no channel, rendered or unrendered, that
distinguishes "I do not know whether this applies" from "this does not apply". The `trace` is
identical too: `[{"ruleId":"PROBE-SYNTHETIC-NOT-A-RULE","result":"false"}]` in both cases, so even the
unrendered diagnostic channel records the unknown answer as a settled false.

**For contrast, the engine handles an unanswered DEPENDENT correctly.** With
`gate_field: "yes"` and `dependent_field` unanswered, the same ruleset gives CONDITIONAL with a full
branch table:

```json
{ "field": "dependent_field", "branches": [
  { "value": "true",  "verdict": "FEASIBLE", "reason": "same findings, re-dated" },
  { "value": "false", "verdict": "FEASIBLE", "reason": "drops PROBE-SYNTHETIC-NOT-A-RULE" } ] }
```

So the gap is specific to the GATE. An unknown one level down is branched; an unknown at the gate is
consumed by the scoping layer and never reaches the trigger layer that does the branching.

## S4. Which world we are in

**V2.8 happens to be safe.** Stated without hedging, because the disposition turns on it.

What makes v2.8 safe is a property of the ruleset, not of the engine: `sapo_event_type` is the only
gate whose `"unknown"` scopes dependents out, and it is read directly by SAPO rule triggers. That
makes it a missing fact in its own right, which is what fires the branch machinery. The branch table
in round 1 was produced by the trigger layer noticing the gate, not by the scoping layer reporting
what it excluded.

Remove that overlap, as the synthetic ruleset does, and the whole surfacing apparatus is silent.
Round 1 said the scoping layer "returns a set with no record of what it excluded or why"; this
measures what that costs when nothing else happens to compensate.

**The exact condition, narrower than round 3 stated it.** Round 3 said the silence follows whenever
no trigger reads the gate. That is too broad. `resolveFindings` builds `unknownFields` from two
sources, not one (`packages/engine/src/findings.ts:260` and `:263`): trigger evaluation, and
`finding.deadlineUnknownFields` on each rule whose trigger did not evaluate false. A gate read by no
trigger but read by a published deadline on a rule that does fire is still unioned in and still
surfaces as a missing fact. The condition that produces silence is therefore:

> the gate is consumed EXCLUSIVELY by `asked_when` scoping, that is, by no trigger and by no
> deadline of any rule that fires.

**Is that condition reachable by a valid published ruleset? Yes, and the parser is where it is
licensed.** `rejectUnconsumedFields` (`packages/engine/src/ruleset.ts:654`) builds its `consumed`
set from exactly three sources, trigger fields, deadline-consumed fields, and `askedWhenClauses`
fields, and accepts a field that appears in only the third. That is the same code quoted in S1: a
field consumed by scoping alone passes the guard whose whole purpose is to catch fields that change
nothing. Nothing downstream of it objects either. The condition is not a theoretical corner of the
type system; it is a shape the loader is written to accept.

**What follows for #108, stated as measurement rather than recommendation:** a future published rule
that gates a question where the gate is read by no trigger and no firing rule's deadline
reintroduces exactly the silent requirement-drop #108 alleges, and the F-102 rendering fix would not
touch it, because there is nothing in `verdictDetail` to render. Whether that is worth acting on
before such a rule exists is the product owner's call, and this document does not make it.

## S5. What this does not establish

- It does not show that any such gate is likely, or that anyone intends to write one. It shows the
  loader accepts it and the engine goes quiet on it.
- It does not measure `validateIntake` on the synthetic ruleset, which `parseIntakeContract` made
  impossible. On the published ruleset, round 1 established that `"unknown"` is accepted for all
  three gates that declare it.
- The probe uses `=` for the gate clause. Round 1 established that `!=` clauses keep dependents in
  scope, so a gate written with `!=` does not exhibit this.
