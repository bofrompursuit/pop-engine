# F-205 · Insurance Requirement Detector (STRETCH)

**Phase:** 1.5 (last in retention order) · **Lane:** Dev 1 (post green gate) · **Depends on:** F-201 (R10/R11 already ship in the day-one ruleset; this feature is the dedicated UI surfacing)

## User Story

As an independent organizer, insurance obligations are called out as a first-class card on my plan, not buried in the line items, because a missing certificate can hold up permit issuance.

## Inputs / Outputs

- Existing R10 (`insurance` kind) and R11 (`note` kind) plan items from F-201.
- A dedicated insurance panel on the plan/checklist view.

## Acceptance Criteria

1. Street/sidewalk/plaza events render the R10 card: "$1M per occurrence commercial GL, City of New York named as additional insured; obtain before permit issuance", with its `[VERIFY — whether required for ALL SAPO event types]` caveat visible.
2. Parks events render the R11 card verbatim per the answer key's engine note: "insurance determined by borough office at review", styled as informational, **never** as a hard requirement.
3. Private-venue events render no insurance card (no rule triggers; silence is correct here because the key is silent).
4. The card links to the checklist item (R10) so certificate upload lives with the requirement.
5. Removing this feature loses only the dedicated card; the R10/R11 lines still appear in the plan from F-201 (acceptance scenarios unaffected).

## Edge Cases

- Scenario D: the card carries the block-party applicability caveat (`[VERIFY]`).
- Rescope from street to private venue: card disappears with the R10 line (Scenario A rescope).

## Answer-Key Scenarios Exercised

- A, D, E (R10 card + caveats) · C (R11 borough-office card, not hard-required).
