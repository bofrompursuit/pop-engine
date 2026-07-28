# Host/Guest Authorisation Coverage

**Status:** PROPOSED (2026-07-28) · **Reviewer/approver:** unassigned; see Approval Blockers · **Owner:** unassigned · not in `docs/BASELINE.md` and must not be added there while this is PROPOSED.
**Phase:** post-MVP · **Lane:** Dev 1 (engine) + Dev 4 (verification), pending assignment · **Depends on:** F-101 (intake registry), F-201 (plan generation), F-102 (verdict and branch tables) · **Feeds:** nothing yet.
**NO F-ID IS ASSIGNED, and the filename says so deliberately.** `F-1NN` below is a placeholder, not
an assignment: the Stage 1 range is saturated and the id is an approval blocker. Every acceptance
criterion is keyed `F-1NN-AC-0N` and every one of those ids changes when the real id lands.

The file is **not** named `specs/F-...md`, and that is forced rather than chosen. `docs/BASELINE.md`
marks the glob `specs/F-*.md` APPROVED, so a file matching it must self-declare APPROVED or
`pnpm check:baseline` fails. A PROPOSED spec therefore cannot sit under the `F-` prefix while that
row stands, and adding a manifest row is not this document's to do. Recorded as an approval blocker
rather than worked around silently.

## Purpose and User Outcome

A travelling pop-up operator rents space inside another business's premises: a stall in a shop, a
counter in a food hall, a weekend residency in a bar. The host already holds authorisations for its
own operation. The operator needs to know **which of the host's authorisations reach the operator's
activity, and what the operator must still obtain in its own name.**

As an operator running inside someone else's venue, I answer what the host holds, and the plan tells
me what that does and does not do for me, without ever telling me I am covered because my host is.

## Scope

In scope: **one** field, `venue_has_assembly_approval`. It is the only field this feature touches
that is both collected-but-unread and an authorisation held by the HOST rather than a claim made by
the organizer. The first draft claimed two; see non-goal 3.

### Non-goals

1. **NEVER TELLING A GUEST THEY ARE COVERED BECAUSE THE HOST IS.** This is the spec's central
   constraint, not a caveat. `packages/engine/src/ruleset.ts`, in the `UNCONSUMED_INTAKE_FIELDS`
   note for `venue_has_assembly_approval`, records the reason:

   > "AC 28-117.1.3 requires an amendment for any change inconsistent with the venue's certificate,
   > so an existing approval narrows the question rather than settling it."

   A host authorisation **reduces what must be established. It does not establish it.** Any
   acceptance criterion, copy string or rule output that reads a host's "yes" as the operator's
   answer is wrong by construction and must fail review.
2. **Not alcohol.** Already solved and out of scope. `SLA-VENUE-LICENSE-001`, `SLA-ONEDAY-001` and
   `SLA-CATERING-001` each read `venue_license_covers_event_area` in their published triggers, so
   the host/guest question for alcohol is answered by the shipped ruleset. This spec must not
   restate, duplicate or re-derive it.
3. **NOT `food_affinity_private_exception_claimed`. It is not a host authorisation at all**, and
   the first draft of this spec wrongly placed it under host/guest semantics. Its published
   `asked_when` is `food_present AND event_open_to_public != yes`, **with no venue term**, so it is
   in scope for a street or park event as readily as a private venue. `UNCONSUMED_INTAKE_FIELDS`
   defines it as the organizer's own claim: "Collected for the Health Code Art. 88 private-function
   exemption, which DOHMH-EXEMPTION-001 renders as an advisory on event_open_to_public alone."

   An exception CLAIMED BY THE ORGANIZER is not an authorisation HELD BY A HOST. Applying the
   host-held `yes` semantics below to it would have told a park organizer that a host authorisation
   reduced their obligation, which is precisely the false statement the non-goal above exists to
   make impossible, produced by this spec. Specifying its distinct exception semantics would need
   regulatory research this repository has not done, so it is removed from the feature rather than
   carried with the wrong semantics.
4. **Not multi-city.** An operator that travels between jurisdictions is F-207 · Multi-Jurisdiction
   Rules Architecture. This spec is single-jurisdiction and assumes the published NYC ruleset.
5. **Not new regulatory research.** This spec asserts no permit fact. Everything regulatory below is
   quoted from something already in the repository with its location, or is marked as requiring
   verification research and left unestablished.
6. **Not a new intake field.** The registry already collects what this needs. Adding a field is out
   of scope and would enlarge the blast radius described under System Impact.

## Dependencies and Baseline

Baseline artifacts this builds on, all APPROVED per `docs/BASELINE.md`:

| Artifact | What this depends on it for |
| --- | --- |
| `rules/nyc-rules.v2.8.json` | `venue_has_assembly_approval` and its gate, plus the three SLA rules that already consume `venue_license_covers_event_area` |
| `specs/F-101-event-intake.md` | the intake registry and `asked_when` scoping |
| `specs/F-201-permit-plan-generator.md` | plan generation and AC 4's named-confirmation model |
| `specs/F-102-feasibility-verdict.md` | verdict states and the branch table |

Published fields this uses, quoted from `rules/nyc-rules.v2.8.json` as declared:

| Field | Type and values | `asked_when` | Consumed today |
| --- | --- | --- | --- |
| `location_type` | enum, includes `private_venue` | always asked | yes, by many triggers |
| `venue_license_covers_event_area` | enum `yes`/`no`/`unknown` | `alcohol AND location_type = private_venue` | **yes**, by the three SLA rules |
| `venue_has_assembly_approval` | enum `yes`/`no`/`unknown` | `location_type = private_venue AND headcount gte 75` | **no** |
| `food_affinity_private_exception_claimed` | enum `yes`/`no`/`unknown` | `food_present AND event_open_to_public != yes` | **no** |

**`venue_has_assembly_approval` alone is the subject of this spec.** The row above it is already
consumed; the row below it is not a host authorisation and is out of the feature per non-goal 3.
`venue_has_assembly_approval` is recorded in `UNCONSUMED_INTAKE_FIELDS` in
`packages/engine/src/ruleset.ts`, which is the mechanism that keeps a collected-but-unread field
visible rather than silent. That entry, and only that entry, is removed by this feature.

## Inputs

No new inputs. **One field**, `venue_has_assembly_approval`, as `validateIntake` already accepts it. The other two rows in the table above are context, not inputs to this feature.

## Outputs

Per affected authorisation, one of three plan states. The distinction between the second and third
is the whole feature:

The mapping is **by the field's answer**, and it uses only fields the shared `Finding` contract
already carries. Round 3's table invented two plan states, OPEN and UNRESOLVED, and **those states
are not representable**: `Finding` exposes `kind`, `disposition`, `deadlineStatus` and
`verificationStatus` and has no per-authorisation state, `parseRule` ignores unrecognised `output`
properties, and the footprint permits no shared-contract, API, persistence or UI change. A
ruleset-only implementation could not have emitted, persisted or rendered either label.

So the feature emits an ordinary finding, and the answer decides whether it is emitted at all:

| `venue_has_assembly_approval` | Finding | `disposition` | Note text must |
| --- | --- | --- | --- |
| not in scope (gate false) | none | n/a | n/a |
| **`yes`** | emitted | **`may_be_required`** | direct the operator to confirm with DOB; assert no reduction |
| **`no`** | emitted | **`may_be_required`** | state that the operator's own filing is unresolved |
| **`unknown`** (explicit) | emitted | **`may_be_required`** | as `no` |
| **in scope, NO answer** | emitted | **`may_be_required`** | as `no`; see the note below on Scenario A |

**Why `may_be_required` and not something else.** It is the disposition
`DOB-ASSEMBLY-001` already publishes, and it means exactly what the sources support: the requirement
may apply and nothing here settles it. The collision to avoid is `no_new_requirement`, which asserts
there is no requirement, and which no source licenses: DOB-ASSEMBLY-001's own verification block
says the question is "NOT PUBLISHED in either direction". A disposition that already means something
else is how a false state gets rendered, so the mapping reuses the one whose existing meaning is the
one intended.

**All four answered cases share a disposition and differ only in note text.** That is not a
weakening of round 3's distinction, it is what round 3's distinction always was: after NARROWED was
removed, no state in this spec asserted a reduction, so the labels differed only in what they told
the operator to do next, and note text is where this contract puts that.

## State, Validation and Errors

No new persisted state. No new validation: `validateIntake` already accepts, rejects and scopes
`venue_has_assembly_approval`, and this spec changes none of that. No new error class.

One existing behaviour this spec must not disturb, recorded because it is easy to break: answering
`event_open_to_public: "unknown"` makes `food_affinity_private_exception_claimed` **required**,
because the gate is a `!=` comparison and `"unknown" != "yes"` holds. A change that narrows that
gate would silently stop collecting the field.

## UI and Accessibility

Rendering is F-102's, not this spec's, and round 3 left two sentences that could not both stand:
one said this feature must not implement F-102 Acceptance Criterion 6, the other said its OPEN state
populates the branch table. **Decided: this feature does NOT implement F-102 Acceptance Criterion 6,
and it does not claim to populate a branch table.**

What it does do, as a consequence rather than as output: once a published rule consumes
`venue_has_assembly_approval`, the generic verdict engine sees an unknown-capable field that a
trigger reads, so it adds the field to `missingFacts` and evaluates its branches. That is the
assembly-approval PORTION OF THE DATA F-102 Acceptance Criterion 6 would render. This spec produces
it; it does not render it, does not test its rendering, and states no criterion about it.

**The cost of the alternative, reported rather than used to decide.** PR #170 established that
Acceptance Criterion 6 is an approved criterion never implemented, and that the missing work is
widening `ConsumedVerdictDetail` and `MISSING_FACT_CHECKS` in `apps/web/app/plan/plan-api.ts` plus a
component, with no API or persistence change. So folding it in is smaller than "implement an
unimplemented acceptance criterion" sounds. It is still declined here for two reasons that are not
about size: it is a different feature's approved criterion, so implementing it inside this one puts
F-102's acceptance under this spec's approval; and it would widen the footprint to the web lane,
which this feature otherwise does not touch at all.

**Consequence to state plainly:** until Acceptance Criterion 6 is implemented, the branch data this
feature produces is served by the API and not shown to the operator. The finding itself renders
normally, because it is an ordinary finding.

Accessibility requirement inherited rather than restated: any status this introduces must be
distinguishable without colour alone, matching the treatment F-206 uses for verification statuses.

## System Impact

| Area | Impact | Note |
| --- | --- | --- |
| Intake registry | none | fields already published |
| `validateIntake` | none | already accepts all three |
| Ruleset | **new rules** | at least one per authorisation, so a version bump |
| `packages/engine/src/ruleset.ts` | **required change** | `UNCONSUMED_INTAKE_FIELDS` entries must be removed in the same change as the trigger |
| `apps/api/src/ruleset.ts` | **required change** | `EXPECTED_RULESET_VERSION` and `EXPECTED_RULE_COUNT` both compared at boot; see the enumeration below |
| Answer key | **moves** | new plan output for the scenarios that reach these gates |
| Web | none of this spec's | F-102 owns the rendering |

### Every constant coupled to the published artifact, enumerated once

The first draft prescribed moving the rule count only, which would still have failed boot on the
version mismatch before a single new rule loaded. Four such dependencies had been found one at a
time, so they are enumerated here rather than discovered a fifth time. **All seven, swept rather
than recalled:**

| # | Constant | Location | Compared where | Moves for this feature |
| --- | --- | --- | --- | --- |
| 1 | `EXPECTED_SCHEMA` | `apps/api/src/ruleset.ts:31` | `:495` | no, schema family unchanged |
| 2 | **`EXPECTED_RULESET_VERSION`** | `apps/api/src/ruleset.ts:32` | `:500` | **YES**, and the first draft omitted it |
| 3 | **`EXPECTED_RULE_COUNT`** | `apps/api/src/ruleset.ts:33` | `:531` | **YES**, one per new rule |
| 4 | `EXPECTED_ADVISORY_COUNT` | `apps/api/src/ruleset.ts:34` | `:536` | only if an advisory is added |
| 5 | **`UNCONSUMED_INTAKE_FIELDS`** | `packages/engine/src/ruleset.ts:617` | `parseEngineRuleset` | **YES**, the entry must go in the same change |
| 6 | `BLOCK_PARTY_ELIGIBILITY_RULE_ID` | `packages/engine/src/intake/registry.ts:56` | `parseIntakeContract` | no, unless that rule id changes |
| 7 | `ALCOHOL_IN_PUBLIC_SPACE_ADVISORY_ID` | `packages/engine/src/intake/registry.ts:57` | `parseIntakeContract` | no, unless that advisory id changes |

`DEPENDENCY_SEQUENCING_BINDINGS` (`packages/engine/src/proposals.ts:128`) is an eighth artifact
coupling of the same family, keyed by three rule ids, but it is not compared at boot and does not
move for this feature. It is listed because the point of this table is that the set is knowable.

Nos. 6 and 7 are the reason a synthetic ruleset cannot be driven through `parseIntakeContract` at
all: it requires those two ids to be published. That is a constraint on testing, not on this
feature.

**The engine change is not optional and not a publication.** Adding a trigger that reads
`venue_has_assembly_approval` without removing its `UNCONSUMED_INTAKE_FIELDS` entry fails
`parseEngineRuleset` with "is now consumed by the ruleset; remove its UNCONSUMED_INTAKE_FIELDS
entry". `apps/api/src/index.ts` calls that parser at module top level, so the API does not boot
until the entry is removed. Nos. 2, 3 and 5 must land in one commit or the API does not start.

## Acceptance Criteria

1. **F-1NN-AC-01 · A host `yes` asserts no reduction.** For `venue_has_assembly_approval: yes` the
   finding is emitted with `disposition: may_be_required` and note text directing the operator to
   confirm with DOB. No output string may assert that the operator is covered, exempt, has a
   reduced obligation, or has no obligation. The test asserts the ABSENCE of each of those claims,
   not merely the presence of the correct one, because the failure mode is an extra sentence rather
   than a missing one.
2. **F-1NN-AC-02 · An explicit `unknown` emits the same disposition**, with the unresolved-filing
   note text, and never a disposition asserting any reduction.
3. **F-1NN-AC-03 · An explicit `no` is emitted, and is tested.** `venue_has_assembly_approval: no`
   emits the finding with the unresolved-filing note text. This needs its own fixture: **no approved
   scenario contains an explicit `no` for this field**, so without one an implementation could omit
   or misclassify the known-negative path and still satisfy every other criterion here.
4. **F-1NN-AC-04 · IN SCOPE WITH NO ANSWER behaves as a stated `no`, and is defined rather than
   left to fall out.** Scenario A's rescope reaches the gate with the field OMITTED, which the
   engine represents differently from an explicit `"unknown"`: `resolveAnswer` returns
   `isExplicitUnknown: false` for an absent answer and `true` for the literal value, and that flag
   is what lets a rule listing `unknown` among its accepted values be answered by it. A rule that
   accepts the literal `unknown` therefore does NOT define the rescope's behaviour. This criterion
   defines it: the finding is emitted with the same disposition and the same unresolved-filing note
   text, the field appears in `missingFacts`, and its branches are evaluated. Tested on the
   Scenario A rescope specifically, not only on an intake that answers the field.
5. **F-1NN-AC-05 · A field the gate did not reach emits nothing**, per F-201 Acceptance Criterion
   4's rule that a field never asked is not a material unknown.
6. **F-1NN-AC-06 · Alcohol is untouched, compared against an INDEPENDENT copy.** The three SLA
   rules' triggers, outputs and dispositions are unchanged. The comparison must NOT read the newly
   published artifact for both sides: rollout deletes `rules/nyc-rules.v2.8.json`, so a test
   deriving its expectation from the new file would pass a changed alcohol rule against itself.
   The expectation is pinned independently inside the test footprint, as either the exact expected
   bytes for those three rules or a digest of them, captured from v2.8 before it is deleted.
7. **F-1NN-AC-07 · Scenario A's rescope is expected explicitly.** Scenario A carries
   `headcount: 75`, which meets the `headcount gte 75` half of the gate, so its required
   re-evaluation to `location_type = private_venue` puts `venue_has_assembly_approval` in scope
   with no answer. A trigger consuming that field therefore changes that rescope's findings, its
   missing facts and its `A-rescope` exercise metadata. Expectations and tests for the rescope land
   with the change; moving Scenario F's answer-key output alone is insufficient.
8. **F-1NN-AC-08 · The coupled constants, the manifest and the current-version documents land
   together.** A published trigger reading `venue_has_assembly_approval` lands in ONE commit with:
   the removal of its `UNCONSUMED_INTAKE_FIELDS` entry, the `EXPECTED_RULESET_VERSION` move, the
   `EXPECTED_RULE_COUNT` move, the `snapshot_date` advance and its test pin, the
   `docs/BASELINE.md` update (current row repointed, new sha256, superseded-lineage row for v2.8),
   the deletion of `rules/nyc-rules.v2.8.json`, and the current-version references in the approved
   documents listed under System Impact. That commit boots AND passes `pnpm check:baseline`.
9. **F-1NN-AC-09 · No fact beyond the ruleset.** Every regulatory statement rendered traces to a
   published rule's `output`, `notes`, `source` or `verification`. Nothing is asserted that the
   published artifact does not carry, and DOB-ASSEMBLY-001's position that the question is "NOT
   PUBLISHED in either direction" is quoted rather than paraphrased.
10. **F-1NN-AC-10 · Determinism.** Same intake, same ruleset, same `today`, same calendar produces
    the same findings, matching F-102 Acceptance Criterion 9.

## Edge Cases

- Host answers `yes` and the operator's activity is plainly outside the host's certificate. The
  product cannot detect this: nothing in the intake describes the operator's activity in the terms a
  certificate uses. The note text is worded so this case cannot falsify it, which is a second
  reason the finding asserts nothing about the operator's obligation.
- `headcount` below 75 leaves `venue_has_assembly_approval` unasked even in a private venue, so a
  smaller event produces no assembly output at all. That is the gate as published and this spec does
  not change it.
- A guest operating in a venue whose own authorisation has lapsed is not modelled and cannot be:
  the intake collects the host's claim, not its status.

## Fixtures and Verification

- The six approved scenarios in `docs/test-scenario-answer-key.md` are the baseline. **Two of them
  reach this gate, not one.** Scenario F answers `venue_has_assembly_approval` `"unknown"` today.
  Scenario A carries `headcount: 75` and its required rescope to `location_type = private_venue`
  puts the same field in scope unanswered, so that rescope's findings, missing facts and
  `A-rescope` metadata move too.
- **A new fixture is required for the explicit `no` path**, because no approved scenario contains
  one for this field. Adding it is an answer-key change and carries the approvals below.
- Any answer-key movement is a regulatory publication under the change-class table in
  `docs/DOCUMENTATION-GOVERNANCE.md` §6 "Change classes and approvals", whose "Regulatory
  source/status/content" row requires the verification owner plus the rules reviewer, and whose
  "Rule trigger, dedupe, branch, deadline, or formula semantics" row requires the verification owner
  plus the engine owner. This feature crosses both.
- **Verification research is REQUIRED and is not done.** Whether a host's place-of-assembly approval
  removes a guest operator's temporary filing at all is **not established in this repository**. The
  answer key records for DOB-ASSEMBLY-001 that "whether it removes the temporary filing at all is
  not published, so the rule asserts no exemption". This spec inherits that and asserts none either.
  No acceptance criterion above depends on the answer. They depend only on the plan declining to
  assert a reduction that no source establishes, which is what the note text encodes.

## Allowed Footprint and Coordination

Files this feature may touch, and who must be in the room:

| Path | Change | Owner |
| --- | --- | --- |
| `rules/nyc-rules.v<next>.json` | new rules, new version, advanced `snapshot_date` | verification owner + rules reviewer |
| **`rules/nyc-rules.v2.8.json`** | **deleted** | verification owner + rules reviewer |
| `packages/engine/src/ruleset.ts` | remove **only** the `venue_has_assembly_approval` entry from `UNCONSUMED_INTAKE_FIELDS` | engine owner |
| `apps/api/src/ruleset.ts` | move `EXPECTED_RULESET_VERSION` and `EXPECTED_RULE_COUNT` | engine owner |
| `docs/test-scenario-answer-key.md` | expectations | verification owner + rules reviewer |
| `docs/BASELINE.md` | current row, new digest, superseded-lineage record | product owner |
| the test files below | version, count and expectation pins | engine owner |
| the documents below | current-version references | product owner + each artifact's owner |

### The current-version documents, DERIVED the same way as the tests

Round 3 derived the pinned TESTS; this is the same method applied to DOCUMENTS, because deleting
v2.8 while approved artifacts still name it leaves them pointing at a missing file. **Method:** grep
`specs/*.md` and `docs/*.md` for `nyc.v2.8` and `nyc-rules.v2.8.json`, then separate references that
ASSERT THE CURRENT VERSION from those recording lineage or history, which must not move.

Thirteen files match. Those carrying current-version assertions, which move:

| File | What asserts the current version |
| --- | --- |
| `docs/ARCHITECTURE.md` | AD-2 names the authoritative file; the component diagram names it |
| `docs/DESIGN.md` | the lane definition owning engine fidelity to the file; the ratification line |
| `docs/PRD.md` | current-ruleset references |
| `specs/F-101-event-intake.md` | `Depends on: ruleset nyc.v2.8 ratified`; the registry-authority line |
| `specs/F-201-permit-plan-generator.md` | `Depends on:` and the authoritative-inputs line |
| `specs/F-206-rules-snapshot-banner.md` | the banner example, version AND published date |
| `specs/F-204-portal-deep-links.md` | its published-on-nyc.v2.8 scope line |
| `docs/test-scenario-answer-key.md` | the ruleset the key is derived from |
| `docs/ROADMAP.md` | the current-ruleset pointer |

Those that must NOT move: `docs/BASELINE.md`'s superseded-lineage rows for v2.7 and earlier,
`docs/VERIFICATION-SOURCES.md`'s dated round records, and `docs/ARCHITECTURE-FUTURE.md`'s historical
references. `specs/F-102-feasibility-verdict.md`'s single occurrence is in its `Updated:` history
line, which records a retarget rather than asserting the current version, so it does not move
either. **That is why the footprint permits F-102 nothing:** round 3 forbade touching it and this
derivation confirms nothing in it needs touching.

Three documents also state that `venue_has_assembly_approval` is read by no trigger
(`specs/F-101-event-intake.md`, `docs/ARCHITECTURE.md`, `docs/test-scenario-answer-key.md`). Those
statements become false the moment this feature lands and move with it.

### The pinned tests, DERIVED rather than listed

The footprint has been extended three rounds running by whatever a reviewer happened to find, so
this set is derived by search rather than by recall. **Method, so it can be re-run when the next
version publishes:** grep the non-`node_modules` TypeScript for the literal `nyc.v2.8`, for rule and
advisory count assertions, and for assertions over a complete set of published ids.

**Moves whenever the ruleset VERSION changes:**

| File | Line | Pin |
| --- | --- | --- |
| `apps/api/src/ruleset.ts` | 32 | `EXPECTED_RULESET_VERSION` |
| `apps/api/src/ruleset.test.ts` | 75, 112 | asserted version, and a fixture carrying it |
| `apps/api/src/plan.test.ts` | 127 | `rulesetVersion` on the plan response |
| `packages/engine/src/engine.test.ts` | 972 | asserted version |

**Moves whenever a RULE is added:**

| File | Line | Pin |
| --- | --- | --- |
| `apps/api/src/ruleset.ts` | 33 | `EXPECTED_RULE_COUNT` (33) |
| `apps/api/src/ruleset.test.ts` | 78 | `rules` length (33) |
| `apps/api/src/ruleset.test.ts` | 368 to 370 | the `/expected 33 rules/` error expectation |
| `apps/api/src/ruleset.test.ts` | 980, 1022, 1038 | `permit_rules` row count (37, rules plus advisories) |
| `packages/engine/src/engine.test.ts` | 974 | merged `rules` length (37) |

**Moves whenever a scenario's FINDINGS change:**

| File | Pin |
| --- | --- |
| `packages/engine/src/acceptance.test.ts` | hard-coded finding sets per scenario |
| `packages/engine/src/fixture-ruleset-agreement.test.ts` | published rules against the answer key |
| `apps/api/src/plan.test.ts`, `apps/api/src/rules-snapshot.test.ts` | fixture expectations pinning plan output |
| `apps/api/src/checklist.test.ts` | complete per-scenario `ruleIds` lists, e.g. Scenario A at line 392 |

**Does NOT move, recorded so the next reader does not re-derive it:** `apps/api/src/ruleset.test.ts:77`
pins `intakeFields` at 33 and this feature adds no field; `:76` pins `snapshotDate` and moves only if
the publication re-fetches a source; `EXPECTED_SCHEMA` and `EXPECTED_ADVISORY_COUNT` move only for a
schema change or a new advisory. Occurrences of `nyc.v2.8` in `packages/engine/src/types.ts` and
`scripts/check-baseline-drift.mjs` are prose and comments, not assertions.

`apps/api/src/checklist.test.ts` is marked **conditional**: whether it moves depends on which
scenarios the new rule reaches, and checklist items derive from the base plan rather than from a
rescope. It is in the footprint so an implementer is not blocked, not because it is certain to
change.

The first draft permitted only `packages/engine/src/ruleset.ts` under the engine, which made the
feature **unimplementable**.

Must not touch: `specs/F-102`, the plan view, the checklist, or any file owned by an in-flight core
feature. Coordination point: F-102's Acceptance Criterion 6 is already unimplemented, and
DOB-ASSEMBLY-001's note records that its coverage confirmation "blocks F-102 AC 6". This feature
produces the data that criterion would render and does not render it, per the UI section; the two
remain separate approvals.

## Rollout and Fallback

Rollout is one change or none. In it:

1. `rules/nyc-rules.v<next>.json` published with an advanced `snapshot_date`, and
   `rules/nyc-rules.v2.8.json` **deleted** and named in the footprint as deleted. `publishedRulesFile`
   throws unless exactly one published ruleset is present, so leaving v2.8 in place fails boot and
   deleting a file the footprint does not name is an out-of-footprint change. Round 3 required the
   deletion and permitted only the new file.
2. `EXPECTED_RULESET_VERSION` and `EXPECTED_RULE_COUNT` moved.
3. The `venue_has_assembly_approval` entry removed from `UNCONSUMED_INTAKE_FIELDS`, and **only**
   that entry: `food_affinity_private_exception_claimed` stays, because no rule in this feature
   consumes it and removing its exemption would fail `rejectUnconsumedFields` and stop the API
   booting.
4. **`docs/BASELINE.md` updated**: the current row repointed at the new path and version, its
   sha256 recomputed over the new bytes, and a superseded-lineage row recorded for v2.8 with its
   commit. Without this `pnpm check:baseline` fails, and the new artifact carries none of the
   approval metadata this spec requires of it.
5. The derived test pins updated, per the footprint, including the `snapshotDate` pin.
6. The answer key updated for Scenario F and Scenario A's rescope.
7. The current-version references in the approved documents updated, per the derivation in the
   footprint.

Items 1 to 4 each fail independently: 1 and 2 at boot, 3 at load, 4 in CI. No subset starts. There is no partial state worth shipping.

Fallback is to publish nothing and leave the field in `UNCONSUMED_INTAKE_FIELDS`. That is the
current state, it is stable, and its cost is recorded honestly there: the field is collected and
answering it changes no output. The exemption mechanism exists precisely so this fallback is
visible rather than silent.

## Approval Blockers

Every one of these is open, and this spec cannot be approved until each is resolved by its owner.
None is resolved here.

1. **F-ID ASSIGNMENT, and the range is saturated.** Stage 1 (IDEATE) is stated in `docs/DESIGN.md`
   as F-101 to F-109, and all nine are assigned. `docs/ROADMAP.md` is the authoritative registry per
   the Feature ID Policy, and that policy also says "Closely related capabilities are absorbed into
   existing IDs rather than split". **The proposal, with reasoning and not a decision:** absorb this
   into **F-108 · Location & Authority Resolution**, whose subject is already which authority governs
   a given location, of which "which of this venue's authorisations reach my activity" is a
   specialisation. The alternative is a new id past the stated range, which extends Stage 1 beyond
   F-109 and needs the policy amended rather than stretched. This is the same class of problem as
   SPEC-CONFLICT #127, which is open on exactly this question of colliding and unassigned feature
   ids. **The product owner assigns; this spec does not.**
2. **Issue #89** is open on this field, which is where the collected-but-unread state is tracked.
3. **The named-confirmation rule from issue #107 currently excludes this field.** The decision
   recorded there on 2026-07-28 is:

   > "A named confirmation may be published only for a field that cannot evaluate UNKNOWN."

   `venue_has_assembly_approval` is an unknown-capable enum, so it is deferred by that rule as
   written. This spec's finding is close in kind to a named confirmation. **The tension is
   recorded, not resolved:** whether it is a named confirmation for that rule's purposes, and
   therefore currently forbidden for exactly this field, is a rules-owner call.
4. **DOB-ASSEMBLY-001's coverage confirmation is unimplemented**, and its note records that it
   blocks F-102 Acceptance Criterion 6.
5. **Verification research** on whether a host's approval removes a guest's temporary filing, per
   Fixtures and Verification above. Not established; the rule asserts no exemption in either
   direction.
6. **F-207 · Multi-Jurisdiction** is the home for a genuinely travelling operator, and its own
   approval blocker is SPEC-CONFLICT #130, which is unresolved.
7. **The manifest glob blocks the filename.** `docs/BASELINE.md` marks `specs/F-*.md` APPROVED, so
   this file cannot carry an `F-` prefix while it is PROPOSED without failing `check:baseline`, and
   a PROPOSED spec is not eligible for a manifest row. Either the glob narrows to the approved
   twelve, or PROPOSED specs live outside `specs/F-*`, or the id and the approval land together.
   Naming this file without the prefix is the only one of those three a worker can do alone, so it
   is what this branch does. Product owner and documentation owner to decide the general rule.
8. **Round 2 removed a field and a state, and both were unbacked claims by this document.** The
   draft placed `food_affinity_private_exception_claimed` under host/guest semantics when its gate
   carries no venue term, and defined a NARROWED state asserting a reduction that DOB-ASSEMBLY-001's
   own verification block records as "NOT PUBLISHED in either direction". Both are corrected above.
   They are recorded here because a spec whose central non-goal is "do not assert unbacked
   coverage" made two unbacked coverage assertions in its first draft, and the reviewer caught them
   rather than the author.
9. **Round 3 fixed a defect round 2 created.** Removing the food field from the feature was right,
   and its consequence was not carried through: the footprint still told the implementer to remove
   two `UNCONSUMED_INTAKE_FIELDS` entries, and removing the food entry with no rule consuming it
   would fail `rejectUnconsumedFields` and stop the API booting. Recorded because it is the
   characteristic cost of a correct narrowing, and the way to catch it is to sweep for the plural
   rather than to edit the sentence that was flagged.
10. **Round 4 changed the feature's SHAPE, not its wording, and the shape is smaller.** Two findings
    said the spec could not be implemented as written. The plan states OPEN and UNRESOLVED were not
    representable in the shared `Finding` contract, and the spec simultaneously forbade implementing
    F-102 Acceptance Criterion 6 while claiming to populate its branch table. Both are resolved the
    same way: the feature emits an ORDINARY FINDING using fields the contract already carries, and
    the branch data is a consequence of the field becoming consumed rather than this feature's
    output. That keeps the footprint out of the shared contract, the API, persistence and the web
    lane entirely. Recorded because three rounds of this spec described output the product could not
    have produced, and no reviewer or author caught it until the contract was read.
11. **Section structure diverges from the house shape, deliberately.** No PROPOSED spec exists in
   this repository to match: all twelve specs under `specs/` are APPROVED and use a shorter
   structure (User Story, Inputs, Outputs, Acceptance Criteria, Edge Cases, Scenarios Exercised).
   This spec follows the fuller structure it was briefed with and keys its criteria `F-1NN-AC-0N`,
   a format no existing spec uses; existing specs number criteria plainly and cross-reference them
   as "Acceptance Criterion N". Whether new specs adopt this structure, or this one is reshaped to
   match the twelve, is a documentation-owner call.
