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

In scope: turning the three private-venue intake answers the published registry already collects
into plan output that distinguishes **narrowed** from **settled**, for the two host authorisations
that are collected but unread.

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
3. **Not multi-city.** An operator that travels between jurisdictions is F-207 · Multi-Jurisdiction
   Rules Architecture. This spec is single-jurisdiction and assumes the published NYC ruleset.
4. **Not new regulatory research.** This spec asserts no permit fact. Everything regulatory below is
   quoted from something already in the repository with its location, or is marked as requiring
   verification research and left unestablished.
5. **Not a new intake field.** The registry already collects what this needs. Adding a field is out
   of scope and would enlarge the blast radius described under System Impact.

## Dependencies and Baseline

Baseline artifacts this builds on, all APPROVED per `docs/BASELINE.md`:

| Artifact | What this depends on it for |
| --- | --- |
| `rules/nyc-rules.v2.8.json` | the three private-venue fields and the three SLA rules that already consume one of them |
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

The last two are the subject of this spec. Both are recorded in `UNCONSUMED_INTAKE_FIELDS` in
`packages/engine/src/ruleset.ts`, which is the mechanism that keeps a collected-but-unread field
visible rather than silent.

## Inputs

No new inputs. The three fields above, as `validateIntake` already accepts them.

## Outputs

Per affected authorisation, one of three plan states. The distinction between the second and third
is the whole feature:

| State | Meaning | Permitted copy |
| --- | --- | --- |
| NOT APPLICABLE | the gate did not put the question in scope | nothing rendered |
| **NARROWED** | host holds the authorisation; the operator's own obligation is reduced but not discharged | must state what remains, never "covered" |
| **OPEN** | host does not hold it, or the operator does not know | must state that the operator's own filing is unresolved |

An `unknown` answer produces OPEN, not NARROWED. That follows from the non-goal above: not knowing
whether the host holds something cannot reduce the operator's obligation.

## State, Validation and Errors

No new persisted state. No new validation: `validateIntake` already accepts, rejects and scopes
these three fields, and this spec changes none of that. No new error class.

One existing behaviour this spec must not disturb, recorded because it is easy to break: answering
`event_open_to_public: "unknown"` makes `food_affinity_private_exception_claimed` **required**,
because the gate is a `!=` comparison and `"unknown" != "yes"` holds. A change that narrows that
gate would silently stop collecting the field.

## UI and Accessibility

Rendering is F-102's, not this spec's. `specs/F-102-feasibility-verdict.md` already owns the
CONDITIONAL copy rule ("branch table rendered") and its Acceptance Criterion 6 already requires the
branch table this feature's OPEN state would populate. This spec adds no component and no new
surface.

Accessibility requirement inherited rather than restated: any status this introduces must be
distinguishable without colour alone, matching the treatment F-206 uses for verification statuses.

## System Impact

| Area | Impact | Note |
| --- | --- | --- |
| Intake registry | none | fields already published |
| `validateIntake` | none | already accepts all three |
| Ruleset | **new rules** | at least one per authorisation, so a version bump |
| `packages/engine/src/ruleset.ts` | **required change** | `UNCONSUMED_INTAKE_FIELDS` entries must be removed in the same change as the trigger |
| `apps/api/src/ruleset.ts` | **required change** | `EXPECTED_RULE_COUNT` is pinned at 33 and compared at boot |
| Answer key | **moves** | new plan output for the scenarios that reach these gates |
| Web | none of this spec's | F-102 owns the rendering |

**The engine change is not optional and not a publication.** Adding a trigger that reads either
field, without removing its `UNCONSUMED_INTAKE_FIELDS` entry, fails `parseEngineRuleset` with
"is now consumed by the ruleset; remove its UNCONSUMED_INTAKE_FIELDS entry". `apps/api/src/index.ts`
calls that parser at module top level, so the API does not boot until the entry is removed. Adding a
rule without moving `EXPECTED_RULE_COUNT` fails startup the same way.

## Acceptance Criteria

1. **F-1NN-AC-01 · Narrowed is not covered.** For a host authorisation answered `yes`, the plan
   states what the operator must still establish in its own name. No output string may assert that
   the operator is covered, exempt, or has no obligation. A test asserts the absence of those
   claims, not merely the presence of the correct one.
2. **F-1NN-AC-02 · Unknown is open.** `unknown` produces OPEN and never NARROWED, for every
   affected authorisation.
3. **F-1NN-AC-03 · No answer is not an answer.** A field the gate did not put in scope produces
   NOT APPLICABLE and no output, per F-201 Acceptance Criterion 4's rule that a field never asked is
   not a material unknown.
4. **F-1NN-AC-04 · Alcohol is untouched.** The three SLA rules' triggers, outputs and dispositions
   are byte-identical before and after. A test compares them against the published artifact.
5. **F-1NN-AC-05 · The exemption list is emptied in the same change.** Any published trigger reading
   `venue_has_assembly_approval` or `food_affinity_private_exception_claimed` lands together with
   the removal of its `UNCONSUMED_INTAKE_FIELDS` entry and the `EXPECTED_RULE_COUNT` move, in one
   commit that boots.
6. **F-1NN-AC-06 · No fact beyond the ruleset.** Every regulatory statement rendered traces to a
   published rule's `output`, `notes` or `source`. Nothing is asserted that the ruleset does not
   carry, and the DOB-ASSEMBLY-001 position is quoted rather than paraphrased.
7. **F-1NN-AC-07 · Determinism.** Same intake, same ruleset, same `today`, same calendar produces
   the same states, matching F-102 Acceptance Criterion 9.

## Edge Cases

- Host answers `yes` and the operator's activity is plainly outside the host's certificate. The
  product cannot detect this: nothing in the intake describes the operator's activity in the terms a
  certificate uses. NARROWED must therefore be worded so it is not falsified by this case.
- `headcount` below 75 leaves `venue_has_assembly_approval` unasked even in a private venue, so a
  smaller event produces no assembly output at all. That is the gate as published and this spec does
  not change it.
- A guest operating in a venue whose own authorisation has lapsed is not modelled and cannot be:
  the intake collects the host's claim, not its status.

## Fixtures and Verification

- The six approved scenarios in `docs/test-scenario-answer-key.md` are the baseline. Scenario F is
  the one that reaches these gates: it answers `venue_license_covers_event_area` and
  `venue_has_assembly_approval` `"unknown"` today.
- Any answer-key movement is a regulatory publication under the change-class table in
  `docs/DOCUMENTATION-GOVERNANCE.md` §6 "Change classes and approvals", whose "Regulatory
  source/status/content" row requires the verification owner plus the rules reviewer, and whose
  "Rule trigger, dedupe, branch, deadline, or formula semantics" row requires the verification owner
  plus the engine owner. This feature crosses both.
- **Verification research is REQUIRED and is not done.** Whether a host's place-of-assembly approval
  removes a guest operator's temporary filing at all is **not established in this repository**. The
  answer key records for DOB-ASSEMBLY-001 that "whether it removes the temporary filing at all is
  not published, so the rule asserts no exemption". This spec inherits that and asserts none either.
  No acceptance criterion above depends on the answer; they depend only on the narrowed-versus-
  settled distinction, which is already recorded.

## Allowed Footprint and Coordination

Files this feature may touch, and who must be in the room:

| Path | Change | Owner |
| --- | --- | --- |
| `rules/nyc-rules.v<next>.json` | new rules, new version | verification owner + rules reviewer |
| `packages/engine/src/ruleset.ts` | remove two `UNCONSUMED_INTAKE_FIELDS` entries | engine owner |
| `apps/api/src/ruleset.ts` | move `EXPECTED_RULE_COUNT` | engine owner |
| `docs/test-scenario-answer-key.md` | expectations | verification owner + rules reviewer |
| `docs/BASELINE.md` | lineage row for the new ruleset | product owner |

Must not touch: `specs/F-102`, the plan view, the checklist, or any file owned by an in-flight core
feature. Coordination point: F-102's Acceptance Criterion 6 is already unimplemented, and
DOB-ASSEMBLY-001's note records that its coverage confirmation "blocks F-102 AC 6". Whoever
implements this must not implement that; they are separate approvals.

## Rollout and Fallback

Rollout is a ruleset publication plus the two engine constants, in one change, because none of the
three boots without the others. There is no partial state worth shipping.

Fallback is to publish nothing and leave both fields in `UNCONSUMED_INTAKE_FIELDS`. That is the
current state, it is stable, and its cost is recorded honestly there: the fields are collected and
answering them changes no output. The exemption mechanism exists precisely so this fallback is
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
2. **Issue #89** is open on both fields, which is where the collected-but-unread state is tracked.
3. **The named-confirmation rule from issue #107 currently excludes both fields.** The decision
   recorded there on 2026-07-28 is:

   > "A named confirmation may be published only for a field that cannot evaluate UNKNOWN."

   `venue_has_assembly_approval` and `food_affinity_private_exception_claimed` are both
   unknown-capable enums, so both are deferred by that rule as written. This spec's NARROWED state
   is close in kind to a named confirmation. **The tension is recorded, not resolved:** whether
   NARROWED is a named confirmation for that rule's purposes, and therefore currently forbidden for
   exactly these two fields, is a rules-owner call.
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
8. **Section structure diverges from the house shape, deliberately.** No PROPOSED spec exists in
   this repository to match: all twelve specs under `specs/` are APPROVED and use a shorter
   structure (User Story, Inputs, Outputs, Acceptance Criteria, Edge Cases, Scenarios Exercised).
   This spec follows the fuller structure it was briefed with and keys its criteria `F-1NN-AC-0N`,
   a format no existing spec uses; existing specs number criteria plainly and cross-reference them
   as "Acceptance Criterion N". Whether new specs adopt this structure, or this one is reshaped to
   match the twelve, is a documentation-owner call.
