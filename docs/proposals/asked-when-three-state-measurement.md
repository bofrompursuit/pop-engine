# Measuring the three-state `asked_when` change (issue #108)

**Status:** PROPOSED

This document is a MEASUREMENT and proposes no change. It recommends no option, and the branch
carrying it contains no engine, spec, fixture, schema or manifest change. Issue #108 asks a
semantics question and says fixture impact needs measuring before it can be decided; this is that
measurement, and the decision is the product owner's. The status above is the governance §3 state,
which is about whether an artifact may be implemented, and there is nothing here to implement.

Measured against `origin/main` at 46971a0, ruleset `nyc-rules.v2.8.json`, Node v24.18.0, with the
throwaway implementation described in section 2 reverted before publication.

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

**All 11 are `nullable: false` IN THE REGISTRY.** The 8 registry-nullable fields are all leaf
quantities (`tent_area_sqft`, `tent_days_in_place`, `stage_height_ft`, `stage_area_sqft`,
`generator_gasoline_gallons`, `generator_diesel_gallons`, `generator_kw`, `battery_system_kwh`) and
none of them gates anything.

**The schema does not agree, and the first version of this document said "non-nullable" without
saying which.** That was wrong to write and it was read as a schema fact. Checked against a live
database after `migrate up`, not by reading migrations:

| Gate field | registry `nullable` | schema |
| --- | --- | --- |
| `alcohol` | false | NOT NULL |
| `amplified_sound` | false | NOT NULL |
| `event_open_to_public` | false | NOT NULL |
| `food_present` | false | NOT NULL |
| `generator_present` | false | NOT NULL |
| `headcount` | false | NOT NULL |
| `location_type` | false | NOT NULL |
| `structure_types` | false | NOT NULL |
| **`battery_present`** | false | **nullable** |
| **`obstructs_public_way`** | false | **nullable** |
| **`sapo_event_type`** | false | **nullable** |

So eight of the eleven are NOT NULL in the schema and **three are nullable**. Two of the thirteen
tokens that appear in `asked_when` expressions, `tent_canopy` and `stage_platform_scaffold`, are
*values* of `structure_types` rather than fields, which is why the field count is 11 and not 13;
all 11 fields are columns.

The two nullable SAPO gates are nullable because they are themselves gated and are legitimately
NULL for a park. `battery_present` is nullable for the reason migration 006 records: test helpers
insert events with partial column lists, and a NOT NULL constraint would be enforcing a rule those
callers do not follow.

**Which claim does the work.** The registry claim is the one that makes the unanswered state
unreachable through the API, because `validateIntake` reads `nullable` from the registry and
requires every asked field that omits it. The schema claim is separate, and where this document
needs it, it is stated as a schema claim.

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
v2.5 added.

**Two different fixture mechanisms, and the first version of this document ran them together.**
They are separated here because section 3 uses this provenance to argue about production
reachability, and a fixture shape is not evidence of a production route:

- The **4 `plan.test.ts` failures** come from SQL. `insertEvent` builds its column list from
  `Object.keys(row)`, so the omitted field is never named in the INSERT and the column is NULL in
  a real row. This is what migration 006's comment means by "test helpers insert events with
  partial column lists".
- The **11 `engine.test.ts` failures** never touch a database. `parkIntake` is an in-memory object
  passed straight to `evaluate`, so the field is simply absent from a JavaScript record. No row, no
  column, no NULL.

Neither is a production route. The first is a route the API does not use, since `events.ts` names
every registry column on every insert and update. The second is not a storage state at all.
Adding `battery_present: false` to those two fixture objects, one line each, cleared all 4
`plan.test.ts` failures and 6 of the 11 `engine.test.ts` failures.

**The residual 5 were all the stack overflow, and it is not a fixture artefact.**
`verdict.ts:evaluateConditional` resolves unknowns by substituting each candidate value and
recursing. It terminates today because every branch removes an unknown. Under the first attempt it
did not, because a field that is unknown *for want of its gate's answer* is not resolved by
supplying that field's own value, so the resolver branched on a field it could not settle and the
unknown set stopped shrinking.

**Second attempt**, and rounds 1 and 2 of this document reported its result as the headline. It
added a rule that an indeterminate field whose own value *is* present counts as answered. That
terminates and passes 1161/1161, **but it is a different and narrower change than issue #108 asks
for**, because under it the three states only diverge when the gate *and* the dependent are both
unanswered. Reporting its number as "the answer key does not move" was measuring one thing and
quoting it about another, and the number was relayed to the product owner and to an external
reviewer on that basis.

**Third attempt, round 3: preserve #108's semantics exactly and fix the recursion at its actual
cause.** The dependent resolves unknown whatever its own stored value is, which is the requested
behaviour. The non-termination was never in the semantics; it was in `evaluateConditional`
branching on a field it could not settle. A dependent that is unknown *for want of its gate's
answer* is not resolved by supplying the dependent's value, so that branch never shrank the unknown
set. **Branching on the blocking GATE instead does shrink it**, because every branch answers a gate
and there are finitely many gates.

With that, plus the two fixture lines:

> **Full suite: 1161/1161 pass, under the semantics issue #108 actually proposes. Zero answer-key
> expectations move.**

Verified live rather than inferred from a green suite, because a change that does nothing also
passes: with `battery_present` absent, `FDNY-GENERATOR-001` now lists on a plan where it previously
did not; with `battery_present: false` it does not list. The semantics bite and the answer key
still does not move.

The measured source diff is **two files**: `packages/engine/src/conditions.ts` (+47/-3) and
`packages/engine/src/verdict.ts` (+18/-2), plus the two fixture lines. `visibility.ts` needed no
change at all (see the note under 4).

**Two caveats on that number, because it is the one likely to be quoted.**

1. **`verdict.ts` is not optional.** The issue's "Scope if changed" list names `visibility.ts` and
   `conditions.ts`; the branching change belongs on it too, and without it the plan generator does
   not terminate. That is the finding rounds 1 and 2 buried by working around it in the semantics
   instead.
2. The suite passing is evidence about the fixtures, not about production rows. Every failure the
   change produced came from a state that, as measured in section 3, the API cannot create.

**Failure counts across the three attempts**, so the shape of the correction is visible:

| Attempt | Semantics | Failures before fixture fix | After | Non-termination |
| --- | --- | --- | --- | --- |
| 1 | as #108 asks | 15 | 5 | 5 fixtures |
| 2 | narrower | 15 | 0 | none |
| 3 | as #108 asks | 6 | **0** | none |

## 3. Whether the case can arise today

**Not through the API.** Confirmed, and the confirmation is stronger than the issue claims.

- `validateIntake` requires every asked field that the REGISTRY does not mark `nullable`
  (`validate.ts:299`). All 11 gate fields omit it, so an asked gate cannot be submitted blank. This
  is a registry fact and does not depend on the schema, where three of the eleven do allow NULL.
- `insert` and `update` in `apps/api/src/events.ts` write **every** registry column from
  `validateIntake`'s output, so no column is skipped on write.
- `mergeIntakeEdit` clears answers whose question is no longer asked and then re-validates, so an
  edit cannot leave a gate in scope and unanswered either.
- `public-page.ts`'s UPDATE touches publication fields only, never intake.

A gate *is* NULL whenever it was legitimately never asked: with `location_type = park`,
`obstructs_public_way` and `sapo_event_type` are both NULL. That is the correct outcome, not a
masquerade, and the current two-state behaviour gets it right.

The remaining routes to "in scope, unanswered" are:

1. **HYPOTHETICAL: a migration adding a gate column to existing rows without backfilling.** No such
   migration exists. **v2.5 is not an instance of this route, and the first version of this
   document wrongly presented it as one.** Migration 006 does the opposite: it backfills every
   existing row and says so. Verified by running its two statements against a live table rather
   than by reading them, over every value the column can hold:

   | `battery_system_kwh` | resulting `battery_present` |
   | --- | --- |
   | NULL | false |
   | 0 | false |
   | 5 | true |
   | -1 | **NULL** |

   Total over every value the API can produce, because `validateIntake` rejects a negative quantity
   on every submission. The negative is the one uncovered case, and migration 006's comment
   characterises it as "`> 0` reads it as no battery"; in fact neither statement matches it and the
   row would be left NULL. That is a detail of an already-merged migration, unreachable through the
   API, and it is recorded here rather than acted on.

   So v2.5 is evidence that this route can be CLOSED by a migration author who notices, not
   evidence that it happens. What migration 006 also records is that a migration facing real rows
   could not have written that backfill.
2. **Direct SQL that omits columns.** Real, and how the 4 `plan.test.ts` failures arose, but not a
   route the API uses: `events.ts` names every registry column on every insert and update.
3. **An in-memory intake record missing a key**, which is how the 11 `engine.test.ts` failures
   arose. This is not a storage state at all and reaches production only through a caller that
   builds an intake object by hand rather than loading a row.
4. A ruleset edit adding a new gate reduces to route 1, because `ruleset.test.ts` requires the
   events columns to equal the ruleset's intake fields plus the eight fixed columns, so a new field
   cannot land without a migration.

**So the state the change protects against is not currently reachable in production, and route 1 has
never occurred.** Routes 2 and 3 are fixture mechanisms; they produced every failure this
measurement observed, and none of them is a thing the API can do. That materially weakens the case
for changing the engine. It does not eliminate it: route 1 becomes live the first time a
gate-adding ruleset version meets a deployment with rows, and that is a matter of sequencing rather
than of impossibility.

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
`?? null` that currently flattens the distinction on the way to Postgres.

**NO DATABASE CHANGE IS NEEDED, and the first version of this document said one was.** That was
wrong and it overstated the cost of an option, which argues against it on grounds that are not real.
A NULL column plus the ruleset already determines the answer: a NULL the registry resolves as IN
SCOPE is unanswered, and the same NULL under a false `asked_when` is not-asked. The API loader can
derive an `unanswered` member on the way in, exactly as the measured scope resolver derives it now.

The derivation is unambiguous for **every one of the 11 gates**, checked rather than assumed. The
table below is stated **under the proposed three-state semantics**, which matters: rounds 1 and 2
of this document printed it under TODAY's semantics, where an unanswered gate collapses to false,
and then used it to argue for the new representation. That reused the collapse the change exists to
remove, and it understated the runtime state.

For `location_type = street` with `obstructs_public_way` NULL:

| Field | Today (two-state) | Proposed (three-state) |
| --- | --- | --- |
| `battery_present` | in scope, NULL -> unknown | in scope, NULL -> **unanswered** |
| `obstructs_public_way` | in scope, NULL -> unknown | in scope, NULL -> **unanswered** |
| `sapo_event_type` | gate `!= no` is false -> **not asked** | gate `!= no` is **unknown** -> **scope unknown** |

For `location_type = park`, where `obstructs_public_way` is legitimately out of scope, both columns
agree: `obstructs_public_way` and `sapo_event_type` are not asked, and `battery_present` is
unanswered.

**The third row is the correction.** Under three-state, `sapo_event_type` is neither in scope nor
out of it; its scope depends on an answer nobody gave, which is exactly the engine's own tri-state
invariant applied one level up. Calling it "not asked" was the old collapse wearing the new label,
and it is also what a chained gate looks like in general: indeterminacy propagates down the chain
rather than stopping at the first dependent.

**What that costs the loader**, corrected upward from rounds 1 and 2:

- scope becomes three-valued, not two, so a loader deriving `unanswered` must derive
  `scope unknown` as well and cannot answer with a boolean `isInScope`;
- the derivation must be transitive, since a dependent of an indeterminate gate is itself
  indeterminate, which is the fixed point the measured `blockersFor` walk computes;
- the blocking gate must be carried, not just the fact of indeterminacy, because that is what
  `verdict.ts` branches on (section 2).

The ambiguous case would be a field that is in scope, NULL, and registry-nullable, where NULL could
equally mean "asked and deliberately left blank". **No gate is registry-nullable**, so no gate is
ambiguous. The 8 registry-nullable fields are all leaves and none of them gates anything, so their
ambiguity is pre-existing and is not what the three-state change is about.

None of this changes the conclusion of this section, which is that no DATABASE change is needed: the
row still carries only NULL and the ruleset still supplies the rest. It does mean the derivation is
a three-valued transitive walk rather than a two-valued lookup, and rounds 1 and 2 described the
cheaper thing.

**This argument depends on the registry-versus-schema divergence from section 1, not despite it.**
Both halves are needed: the schema must PERMIT NULL for the state to be storable at all, which it
does for exactly the three gates above, and the registry must say whether that NULL is in scope,
which is what makes it interpretable. The same divergence that made the original sentence wrong is
what makes this option cheap.

One corollary, since it follows from the same fact: a NOT NULL constraint on those three columns
would close route 1 at the database. It is not available for two of them, because
`obstructs_public_way` and `sapo_event_type` are legitimately NULL for a park, and migration 006
records why it is not taken for `battery_present` either.

**Offered as a fact rather than advice:** the scope resolver already knows which of the four
meanings applies, so representing it in `IntakeValue` buys nothing the measured implementation
needed. What it would buy is making the distinction legible at the API boundary rather than only
inside the engine, which is a readability argument and not a capability one.

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
confined to rows created by routes 1 to 3, none of which the API can produce.

So the argument against in the issue is correct in mechanism and narrow in reach: it is the same
rule and the same shape, reachable only where an answer is genuinely missing.

## 6. An option the issue does not list

Three gates already carry `unknown` in their published `values` and the engine already handles it
correctly. Extending that to the gates that cannot express it moves the 5 boolean gates to enums
with `yes/no/unknown`.

**The first version of this document priced this as leaving `asked_when` untouched. That is wrong:
the ruleset does not load.** `parseAskedWhenClause` accepts a bare token as a flag only when the
field is boolean, so changing the type without changing the expression fails at load with:

```
Intake contract invalid: ruleset.intake_fields[12].asked_when is unusable:
asked_when clause "food_present" reads "food_present" as a flag, but it is a enum field
```

Verified by building the mutated ruleset in memory and parsing it, not by reading the parser. The
corrected price:

1. **8 `asked_when` expressions rewritten** to explicit comparisons, with the unknown semantics
   decided for each. Today `food_present` means "true"; `food_present = yes` and
   `food_present != no` are different rules and the difference is the whole point of the option,
   so this is a regulatory decision per expression and not a mechanical edit. The 8:
   `food_vendor_count`, `food_affinity_private_exception_claimed`, `sound_audible_from_public_way`,
   `generator_gasoline_gallons`, `generator_diesel_gallons`, `generator_kw`, `battery_system_kwh`,
   `venue_license_covers_event_area`.
2. **9 rules, 10 trigger conditions** that compare one of these fields to a boolean. These fail
   quietly rather than loudly: a trigger comparing `bool true` against a stored `"yes"` simply
   stops matching, and every finding behind it disappears from plans with no error anywhere.
   `SAPO-BLOCK-PARTY-ELIG-001`, `NYPD-SOUND-001` (2 conditions), `NYPD-SOUND-PARKS-DEP-001`,
   `DOHMH-VENDOR-PERMIT-001`, `DOHMH-ORGANIZER-NOTIFY-001`, `DOHMH-EXEMPTION-001`,
   `SLA-VENUE-LICENSE-001`, `SLA-ONEDAY-001`, `SLA-CATERING-001`.
3. A new published ruleset version, a migration per changed column (boolean to text), and a form
   control change.
4. Answer-key impact, which this document has **not** measured for this option. The engine change
   was measured and moves nothing; this one changes 10 trigger conditions across 9 rules and cannot
   be assumed to move nothing.

What it buys: the distinction is expressible by an organizer who genuinely does not know, which is a
case the engine change does *not* address, because that change only helps where nobody was asked at
all.

What it does not do: help route 1. A row predating a column is still unanswered whatever the
column's type. If route 1 is the motivating case, only the engine change reaches it.

**On the corrected price this option is no longer the cheap one.** The engine change is one file,
+32/-3, with the answer key measured and unmoved. This one is 8 regulatory decisions, 9 rules at
risk of silent non-matching, a ruleset publication, a migration, a form change, and an unmeasured
answer key. I am still not recommending either. I am recording that the first version of this
document understated this option's cost and overstated the other's, and that correcting both moves
them in the same direction.

## 7. What the measurement does and does not force

It does not force an answer. The load-bearing number came out **against** the assumption in the
issue that this class of change moves approved output: **under the semantics issue #108 actually
proposes**, the answer key does not move, and the implementation is two files.

That qualifier is round 3's correction and it matters. Rounds 1 and 2 reported the same number for a
narrower change and quoted it as though it were about #108's. The number now says what it appeared
to say, but only because the recursion was fixed in `verdict.ts` rather than worked around in the
semantics.

The two facts a decision should turn on, neither of which is about fixtures:

- The state being protected against is **not reachable through the API today** (section 3). Changing
  engine semantics to handle it is insurance against a migration that has not been written, on a
  deployment that has no rows. Route 1 has never occurred; v2.5 is an instance of a migration author
  closing it, not of it happening.
- The change is **larger than the issue scopes it**: `verdict.ts` must change too, or the plan
  generator does not terminate (section 2). That is a correctness-critical file the issue does not
  mention, and it is where the whole difficulty of this change lives. The semantics are three lines;
  the branching is the part that has to be got right.

**The round 2 corrections all moved in the same direction, and it is not the direction that favours
the alternative.** The engine option lost a cost it never had (no database change: section 4), and
the ruleset option gained several it does have (8 regulatory decisions, 9 rules that fail quietly,
an unmeasured answer key: section 6). That narrows the gap between them considerably.

It still does not force an answer, and the reason is the one fact none of the corrections touched:
the engine change buys correctness in a state nothing can currently produce. A cheaper option that
addresses an unreachable state is not thereby worth taking.

If the deployment gains real rows before the next gate-adding ruleset version, route 1 becomes live
and the calculus changes. Until then the measurement supports deferring, without forcing it.

---

## Revision note

Round 2 corrected four things in this document. They are recorded rather than silently edited,
because three of them were errors in the direction of the conclusion.

1. **"All 11 gates are non-nullable" was written without saying registry or schema**, and was read
   as a schema claim. In the schema three of the eleven are nullable. The registry claim is the one
   that carries the argument and it stands (section 1).
2. **v2.5 was presented as an observed instance of the unbackfilled-migration route.** It is the
   opposite: migration 006 backfills every row it can reach. Route 1 has never occurred (section 3).
3. **The two fixture mechanisms were run together**, and one of them was used as evidence about
   production reachability. SQL inserts omitting columns and in-memory records missing keys are
   different things, and neither is a production route (sections 2 and 3).
4. **The alternative was underpriced and the engine change overpriced.** The ruleset option does not
   load without rewriting 8 expressions and auditing 9 rules; the engine option needs no database
   change at all (sections 4 and 6).

Errors 1, 2 and 4 each made the engine change look worse or the alternative look better than the
evidence supports. Corrected, the two options are closer than the first version implied.

### Round 3

Three more, and the first is the most serious error in the history of this document.

5. **The headline number was measured on the wrong change.** 1161/1161 was the second attempt's
   result, which added a rule that a stored dependent answer overrides its unanswered gate. That is
   narrower than #108's semantics, the document said so in a later caveat, and the headline did not.
   It was quoted as the central fact to the product owner and to a cross-model reviewer.

   Round 3 took the option of fixing rather than qualifying: the recursion is fixed in `verdict.ts`
   by branching on the blocking gate, #108's semantics are preserved exactly, and the suite passes
   1161/1161. So the headline survives, but it survives on a re-measurement rather than on the
   evidence originally offered for it, and the scope grew by a file. **The non-termination was
   never a property of the semantics.** It was a property of branching on a field that could not
   settle the unknown, and rounds 1 and 2 mistook the second for the first and weakened the
   semantics to avoid it.
6. **The chained-gate table was stated under today's semantics while arguing for the new ones**
   (section 4). Under three-state a NULL `obstructs_public_way` makes `sapo_event_type`'s scope
   unknown, not "not asked". The corrected table costs the loader a three-valued transitive walk
   rather than a two-valued lookup. The section's conclusion, that no database change is needed,
   is unaffected.
7. **The status was `MEASUREMENT ONLY`, which is not a governance §3 state**, so the document sat
   outside the approval protocol. It is `PROPOSED`, with the measurement-only qualifier kept as
   prose.

Error 5 is the one to weigh: for two rounds this document's most quoted sentence was evidence about
a change nobody had proposed.
