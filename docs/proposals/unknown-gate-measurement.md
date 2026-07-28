# Measuring issue #108's actual question: a gate ANSWERED "unknown"

**Status:** PROPOSED

This document is a MEASUREMENT. It proposes no change, recommends no option and does not decide
issue #108. The branch carrying it contains no rule, ruleset, spec, answer-key, manifest or engine
change.

Measured at `bd8d05e`, ruleset `nyc-rules.v2.8.json`, Node v24.18.0, suite size 1196. Every
measurement below was driven through the guards the product uses, in order:
`parseIntakeContract` -> `validateIntake` -> `evaluate` -> the plan path (`apps/api/src/plan.ts`,
`apps/web/app/plan/verdict-copy.ts`). No engine internal was called directly.

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
