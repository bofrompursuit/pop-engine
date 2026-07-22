# F-204 · Portal Deep Links + Prepared Packages

**Phase:** 1 (core, week 2) · **Lane:** Dev 3 · **Depends on:** F-201 (portal data on plan items), F-202 (renders on checklist) · **Blocked-by facts:** portal URLs are `[VERIFY]` items (OPEN-QUESTIONS §2.9, Dev 4 owns)

## User Story

As an independent organizer ready to apply, each checklist item takes me straight to the right application portal with the document list I need in hand, so I never hunt through nyc.gov.

## Inputs

Per plan item from the rules data: `portal.name`, `portal.url`, `portal.instructions`, `required_documents`, portal verification facet.

## Outputs

On each plan/checklist item: a portal block with link (or filing instructions), plus the prepared document list.

## Acceptance Criteria

1. Every permit item renders its application path:
   - R1 (SAPO) → E-Apply link
   - R2 (Parks) → nyceventpermits.nyc.gov/parks link
   - R3 (NYPD sound) → no URL by design: renders in-person filing instructions ("file at the precinct local to the event; certified check or money order")
   - R6 (FDNY) → FDNY Business link
2. A portal whose URL facet is still `[VERIFY]` renders the portal name + "confirm application path with agency", never a guessed or dead link. Links go live only when Dev 4's verification updates the rules file.
3. Each item lists its required documents from the rules data; documents the key marks `[VERIFY]` carry the caveat (e.g. R2's site diagram).
4. The UI never implies PopEngine submits anything (non-goal): copy is "apply at [portal]", and links open in a new tab.
5. Demo path: Scenario A's rescoped plan and Scenario C's plan each show correct, distinct portal blocks (E-Apply vs. Parks vs. precinct instructions).

## Edge Cases

- Advisory/note items (R11, R13, A1–A3): no portal block at all.
- R9 paths: the SLA-temporary branch renders SLA contact guidance (path-level `[VERIFY]`); the venue-license branch renders no portal (nothing to file).
- Mixed verification: a verified URL with an unverified fee renders the link and the fee caveat independently (per-facet granularity).

## Answer-Key Scenarios Exercised

- A (E-Apply for SAPO; DOHMH path caveated).
- C (Parks portal + precinct instructions, sequenced).
- E (four distinct agencies on one checklist: SAPO, DOB/FDNY caveated, FDNY Business, DOHMH caveated, precinct).
