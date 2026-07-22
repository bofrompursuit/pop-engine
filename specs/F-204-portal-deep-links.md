# F-204 · Portal Deep Links + Prepared Packages

**Phase:** 1 (core, week 2) · **Lane:** Dev 3 · **Depends on:** F-201 (portal data on findings), F-202 (renders on checklist) · **Blocked-by facts:** remaining portal-path confirmations (OPEN-QUESTIONS §2, Dev 4 owns)

## User Story

As an independent organizer ready to apply, each checklist item takes me straight to the right application portal with the document list I need in hand, so I never hunt through nyc.gov.

## Inputs

Per plan item from the rules data: `portal.name`, `portal.url`, `portal.instructions`, `required_documents`, portal verification facet.

## Outputs

On each plan/checklist item: a portal block with link (or filing instructions), plus the prepared document list.

## Acceptance Criteria

1. Every permit/notification finding renders its application path from the rules data:
   - SAPO classes → E-Apply (`nyceventpermits.nyc.gov/cems/Login`)
   - Parks → `nyceventpermits.nyc.gov/parks`
   - NYPD sound → no URL by design: in-person filing instructions ("file at the precinct local to the event; certified check or money order; form PD 656-041A")
   - FDNY (fuel / open flame / generator) → FDNY Business (`fires.fdnycloud.org/CitizenAccess/Default.aspx`)
   - DOHMH organizer notification → sponsor-guidelines path (submission channel: OPEN-QUESTIONS R-11)
2. A portal whose verification is unresolved renders the portal name + "confirm application path with agency", never a guessed or dead link.
3. Each finding lists its required documents from the rules data; unverified documents carry their caveat (e.g. the Parks site-diagram note).
4. The UI never implies PopEngine submits anything (non-goal): copy is "apply at [portal]", and links open in a new tab.
5. Demo path: Scenario A's rescoped plan and Scenario C's plan each show correct, distinct portal blocks (E-Apply vs. Parks vs. precinct instructions).

## Edge Cases

- Advisory/note items (R11, R13, A1–A3): no portal block at all.
- Alcohol paths: the SLA one-day/catering branches render SLA application guidance (sla.ny.gov); the venue-license branch renders no portal (nothing to file).
- Mixed verification: a verified URL with an unverified fee renders the link and the fee caveat independently (per-facet granularity).

## Answer-Key Scenarios Exercised

- A (E-Apply for SAPO; DOHMH path caveated).
- C (Parks portal + precinct instructions, sequenced).
- E (four distinct agencies on one checklist: SAPO, DOB/FDNY caveated, FDNY Business, DOHMH caveated, precinct).
