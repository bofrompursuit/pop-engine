# Measuring the three-state `asked_when` change (issue #108)

**Status:** MEASUREMENT ONLY. No engine, spec, fixture, answer-key or manifest change is proposed
here, and none is included in the branch that carries this file. Issue #108 asks a semantics
question and says fixture impact needs measuring before it can be decided. This is that
measurement. The decision is the product owner's.

Measured against `origin/main` at 46971a0, ruleset `nyc-rules.v2.8.json`, Node v24.18.0.

---

## 1. How many fields are affected

**20 of 33, not 19.** The issue undercounts by one. This is not drift: the count was 20 at v2.5
when the issue was written, and at v2.6, v2.7 and v2.8. I did not find a reading of the registry
that gives 19.

The 20 gated fields, with the gate they depend on:

| Field | Gate expression |
| --- | --- |
| `obstructs_public_way` | `location_type in street/sidewalk/plaza` |
| `sapo_event_type` | `obstructs_public_way != no` |
| `street_event_size` | `sapo_event_type = street_event` |
| `plaza_level` | `sapo_event_type = plaza_event` |
| `plaza_multiple_blocks` | `sapo_event_type = plaza_event` |
| `has_amusement_ride` | `sapo_event_type = block_party` |
| `food_vendor_count` | `food_present` |
| `food_affinity_private_exception_claimed` | `food_present AND event_open_to_public != yes` |
| `sound_audible_from_public_way` | `amplified_sound AND location_type = private_venue` |
| `tent_area_sqft` | `tent_canopy` |
| `tent_days_in_place` | `tent_canopy` |
| `stage_height_ft` | `stage_platform_scaffold` |
| `stage_area_sqft` | `stage_platform_scaffold` |
| `structure_over_10ft_tall` | `structure_types != none` |
| `generator_gasoline_gallons` | `generator_present` |
| `generator_diesel_gallons` | `generator_present` |
| `generator_kw` | `generator_present` |
| `battery_system_kwh` | `battery_present` |
| `venue_license_covers_event_area` | `alcohol AND location_type = private_venue` |
| `venue_has_assembly_approval` | `location_type = private_venue AND headcount gte 75` |

The other 13 are ungated roots: `borough`, `location_type`, `headcount`, `event_date`,
`event_open_to_public`, `food_present`, `selling_anything`, `amplified_sound`, `structure_types`,
`open_flame_or_cooking`, `generator_present`, `battery_present`, `alcohol`.

**The number that matters more is 11**, the fields that act *as* a gate, because only those can
supply the "unanswered" state the change is about: `alcohol`, `amplified_sound`, `battery_present`,
`event_open_to_public`, `food_present`, `generator_present`, `headcount`, `location_type`,
`obstructs_public_way`, `sapo_event_type`, `structure_types`.

**All 11 are `nullable: false`.** The 8 nullable fields in the registry are all leaf quantities
(`tent_area_sqft`, `tent_days_in_place`, `stage_height_ft`, `stage_area_sqft`,
`generator_gasoline_gallons`, `generator_diesel_gallons`, `generator_kw`, `battery_system_kwh`) and
none of them gates anything.

**Three gates already express "unknown" as a real answer.** `obstructs_public_way`,
`sapo_event_type` and `event_open_to_public` publish `unknown` in their `values`. For those, the
distinction the issue asks for already exists and already works: `obstructs_public_way = unknown`
satisfies `!= no`, so `sapo_event_type` is asked rather than scoped out. The gap is confined to
gates whose type cannot carry the value: the 5 booleans, `location_type`, `headcount`, and
`structure_types`.

## 2. Which fixtures move

I implemented the change on a throwaway commit, ran everything, and reverted it. The branch carries
no behaviour change.

**First attempt** (a gate that is in scope and unanswered makes its dependents indeterminate;
indeterminate resolves to `unknown` rather than `not_asked`):

| Suite | Result |
| --- | --- |
| `packages/engine/src/acceptance.test.ts` (answer key, scenarios A-F + boundaries) | **39/39 pass** |
| `packages/engine/src/fixture-ruleset-agreement.test.ts` | 92/92 pass |
| `packages/engine/src/intake/intake.test.ts` | 76/76 pass |
| `packages/engine/src/engine.test.ts` | **11 of 74 fail** |
| `apps/api/src/plan.test.ts` | **4 of 21 fail** |
| everything else | pass |

15 failures out of ~1000. Of the 15: 5 verdict flips toward `CONDITIONAL`, 1 extra `triggeredBy`
contribution, 4 plan-item count changes, and 5 `RangeError: Maximum call stack size exceeded`.

**The added finding is `FDNY-GENERATOR-001`** on a plan fixture that expects five findings and got
six. That is the same rule as the issue's worked example, and it is the only rule in the ruleset
whose trigger references `battery_system_kwh`.

**Then I traced the cause.** Every one of the 10 non-crash failures came from one thing: the
fixture objects in `engine.test.ts` (`parkIntake`) and `plan.test.ts` (`scenarioAEvent`) set
`generator_present: false` and `battery_system_kwh: 0` but **omit `battery_present`**, the field
v2.5 added. `plan.test.ts`'s `insertEvent` builds its column list from `Object.keys(row)`, so the
column is NULL in the row. This is exactly what migration 006's comment describes: "It is nullable
only because several test helpers insert events with partial column lists."

Adding `battery_present: false` to those two fixture objects, one line each, cleared all 4
`plan.test.ts` failures and 6 of the 11 `engine.test.ts` failures.

**The residual 5 were all the stack overflow, and it is not a fixture artefact.**
`verdict.ts:evaluateConditional` resolves unknowns by substituting each candidate value and
recursing. It terminates today because every branch removes an unknown. Under the first attempt it
did not, because a field that is unknown *for want of its gate's answer* is not resolved by
supplying that field's own value, so the resolver branched on a field it could not settle and the
unknown set stopped shrinking.

**Second attempt**, adding one rule: an indeterminate field whose own value *is* present counts as
answered. With that, plus the two fixture lines:

> **Full suite: 1161/1161 pass. Zero answer-key expectations move.**

The measured source diff is **one file, +32/-3, `packages/engine/src/conditions.ts`**, plus two
fixture lines. `visibility.ts` needed no change at all (see the note under 4).

**Three caveats on that number, because it is the one likely to be quoted.**

1. The second attempt's extra rule is a real semantic choice the issue does not discuss: it decides
   that a stored answer overrides an unanswered gate. It is defensible (if the dependent has an
   answer, the question was evidently once asked) but it means the three states only diverge when
   the gate *and* the dependent are both unanswered. That is a narrower change than the issue
   describes.
2. Without that rule, the plan generator does not terminate on 5 existing fixtures. So the issue's
   "Scope if changed" list is incomplete: `verdict.ts` belongs on it, not only `visibility.ts` and
   `conditions.ts`.
3. The suite passing is evidence about the fixtures, not about production rows. Every failure the
   change produced came from a state that, as measured in section 3, the API cannot create.

## 3. Whether the case can arise today

**Not through the API.** Confirmed, and the confirmation is stronger than the issue claims.

- `validateIntake` requires every asked field that is not `nullable` (`validate.ts:299`). All 11
  gate fields are non-nullable, so an asked gate cannot be submitted blank.
- `insert` and `update` in `apps/api/src/events.ts` write **every** registry column from
  `validateIntake`'s output, so no column is skipped on write.
- `mergeIntakeEdit` clears answers whose question is no longer asked and then re-validates, so an
  edit cannot leave a gate in scope and unanswered either.
- `public-page.ts`'s UPDATE touches publication fields only, never intake.

A gate *is* NULL whenever it was legitimately never asked: with `location_type = park`,
`obstructs_public_way` and `sapo_event_type` are both NULL. That is the correct outcome, not a
masquerade, and the current two-state behaviour gets it right.

The remaining routes to "in scope, unanswered" are:

1. **A migration adding a gate column to existing rows without backfilling**, which is the
   `battery_present` case and the one migration 006 documents. It required rows to exist; `events`
   is empty in every environment, which is the only reason the backfill was writable.
2. **Direct SQL, including test helpers with partial column lists.** This is how all 15 measured
   failures arose.
3. A ruleset edit adding a new gate is route 1, because `ruleset.test.ts` requires the events
   columns to equal the ruleset's intake fields plus the eight fixed columns, so a new field cannot
   land without a migration.

**So the state the change protects against is currently unreachable in production, and route 1 is
only reachable at a moment when the deployment has rows AND a new gate is being introduced.** That
materially weakens the case for changing the engine, and it strengthens the case for the cheaper
alternative in section 6.

## 4. What `IntakeValue` would need

`IntakeValue` is `string | number | boolean | readonly string[] | null` and is **declared twice**,
in `packages/engine/src/types.ts` and `packages/engine/src/intake/visibility.ts`. Both would move
together or drift.

Today `null` carries at least four meanings, and they are only distinguishable by asking the
registry and the scope resolver, never by looking at the value:

1. never asked (out of scope);
2. asked, nullable, deliberately left blank;
3. asked and unanswered (unreachable via the API, per section 3);
4. absent from a partial insert.

The measured change did **not** need `IntakeValue` altered, which is worth stating plainly because
the issue lists it as likely scope. The distinction was carried in the scope resolver as a separate
set, not in the value. Adding a distinct "unanswered" member instead would reach: the two type
declarations, `EventIntake`, `resolveAnswer`, `compareAnswer`, `evaluateClause` and `termHolds`,
`validate.ts`'s reader functions and its persistence loop, `apps/api/src/plan.ts`, and every
`?? null` that currently flattens the distinction on the way to Postgres. The database would also
need a representation, since a column has only NULL to work with.

**Recommendation implicit in the measurement, offered as a fact rather than advice:** the scope
resolver already knows which of the four meanings applies, so representing it in `IntakeValue` buys
nothing the measured implementation needed.

## 5. The v2.5 risk, concretely

**What v2.5 changed, in full:** one field added, `battery_present`; one field regated,
`battery_system_kwh` from `asked_when: null` to `asked_when: "battery_present"`. **No rule was
added, removed, or had its trigger changed.**

Before v2.5, `battery_system_kwh` was always asked and is nullable, so an event with no battery
left it blank, which resolved to `unknown` and made **`FDNY-GENERATOR-001`** conditional on every
such plan. That is the spurious conditional v2.5 removed, and `FDNY-GENERATOR-001` is the single
rule in the ruleset whose trigger references the field.

**Would the three-state change bring it back? Yes, on exactly that rule, and only when
`battery_present` is itself NULL.** This is not a theoretical answer: the measurement produced
precisely that finding, on precisely that rule, on the two fixtures where `battery_present` is
absent. Since section 3 shows the API cannot produce a NULL `battery_present`, the reintroduction is
confined to rows created by route 1 or route 2.

So the argument against in the issue is correct in mechanism and narrow in reach: it is the same
rule and the same shape, reachable only where an answer is genuinely missing.

## 6. An option the issue does not list

Three gates already carry `unknown` in their published `values` and the engine already handles it
correctly. Extending that to the gates that cannot express it is a **ruleset change** rather than an
engine semantics change: it moves the 5 boolean gates to enums with `yes/no/unknown` and leaves
`asked_when`, `visibility.ts`, `conditions.ts` and `verdict.ts` untouched.

What it costs: a new published ruleset version, a migration per changed column (boolean to text),
and a form control change. What it buys: the distinction is expressible by an organizer who
genuinely does not know, which is a case the engine change does *not* address, because the engine
change only helps where nobody was asked at all.

What it does not do: help route 1. A row predating a column is still unanswered whatever the
column's type. If route 1 is the motivating case, only the engine change reaches it.

I am not recommending this. It is listed because the measurement surfaced it and the issue's option
set did not contain it.

## 7. What the measurement does and does not force

It does not force an answer. The load-bearing number came out **against** the assumption in the
issue that this class of change moves approved output: the answer key does not move, and the
implementation is one file.

The two facts a decision should turn on, neither of which is about fixtures:

- The state being protected against is **unreachable through the API today** (section 3). Changing
  engine semantics to handle it is insurance against a migration that has not been written, on a
  deployment that has no rows.
- The change is **larger than the issue scopes it**: `verdict.ts` must change too, or the plan
  generator does not terminate (section 2). That is a correctness-critical file the issue does not
  mention.

If the deployment gains real rows before the next gate-adding ruleset version, route 1 becomes live
and the calculus changes. Until then the measurement supports deferring, without forcing it.
