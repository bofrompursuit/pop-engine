# F-205 · Insurance Requirement Detector (STRETCH)

**Status:** APPROVED (2026-07-25) · **Reviewer/approver:** product owner + affected lane owners via the approval PR · **Owner:** see Lane below · see `docs/BASELINE.md`.
**Phase:** 1.5 (last in retention order) · **Lane:** Dev 1 (Track B, after the F-201 plan and F-202 checklist views merge; never a parallel core-path branch) · **Depends on:** F-201 (R10/R11 already ship in the day-one ruleset; this feature is the dedicated UI surfacing)

## User Story

As an independent organizer, insurance obligations are called out as a first-class card on my plan, not buried in the line items, because a missing certificate can hold up permit issuance.

## Inputs / Outputs

- Existing R10 (`insurance` kind) and R11 (`note` kind) plan items from F-201.
- A dedicated insurance panel on the plan/checklist view.

## Acceptance Criteria

1. Street/plaza events render the SAPO-INSURANCE-001 card: "$1M per occurrence liability, City of New York named as additional insured; obtain before permit issuance", with the exceptions stated (block parties without rides, press/rally events; hardship waiver exists) and the certificate-wording caveat (OPEN-QUESTIONS R-8).
2. Parks events render the PARKS-INSURANCE-NOTE-001 card: "insurance determined by borough office at review", styled as informational, **never** as a hard requirement.
3. Private-venue events render no insurance card (no rule triggers; silence is correct here because the key is silent).
4. The card links to the checklist item (R10) so certificate upload lives with the requirement.
5. Removing this feature loses only the dedicated card; the insurance findings still appear in the plan from F-201 (acceptance scenarios unaffected).

## Edge Cases

- Scenario D (block party, no ride): **no insurance card at all** — the exemption is the credibility beat; rendering one would contradict 50 RCNY §1-08(b).
- Block party WITH a ride: the SAPO-INSURANCE-BLOCK-PARTY-RIDE-001 card appears (plus DOB inspection-certificate note).
- Rescope from street to private venue: card disappears with the insurance finding (Scenario A rescope).

## Fixture Scenarios Exercised

- A, E (insurance card + exceptions) · C (borough-office card, not hard-required) · D (exempt: correct absence).
