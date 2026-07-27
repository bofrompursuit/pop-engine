# F-204 · Portal Deep Links + Prepared Packages

**Status:** APPROVED (2026-07-25; deferred criteria behind SPEC-CONFLICT #149 recorded 2026-07-27 — required documents, DOHMH/SLA portals, and per-facet verification are not in the published ruleset) · **Reviewer/approver:** product owner + affected lane owners via the approval PR · **Owner:** see Lane below · see `docs/BASELINE.md`.
**Phase:** 1 (core, week 2) · **Lane:** Dev 3 · **Depends on:** F-201 (portal data on findings), F-202 (renders on checklist) · **Open verification facts (do not block implementation):** remaining portal-path confirmations (OPEN-QUESTIONS §2, Dev 4 owns); unresolved paths use Acceptance Criterion 2

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
   - DOHMH organizer notification → sponsor-guidelines path (submission channel: OPEN-QUESTIONS R-11) — **deferred:** SPEC-CONFLICT #149; rule carries no `output.portal`
2. A portal whose verification is unresolved renders the portal name + "confirm application path with agency", never a guessed or dead link. — **deferred:** SPEC-CONFLICT #149; ruleset has no per-facet portal verification, and DOHMH/SLA rules that need the unresolved fallback also lack a portal name
3. Each finding lists its required documents from the rules data; unverified documents carry their caveat (e.g. the Parks site-diagram note). — **deferred:** SPEC-CONFLICT #149; `required_documents` is absent from the published ruleset
4. The UI never implies PopEngine submits anything (non-goal): copy is "apply at [portal]", and links open in a new tab.
5. Demo path: Scenario A's rescoped plan and Scenario C's plan each show correct, distinct portal blocks (E-Apply vs. Parks vs. precinct instructions).

## Edge Cases

- Advisory/note items (R11, R13, A1–A3): no portal block at all.
- Alcohol paths: the SLA one-day/catering branches render SLA application guidance (sla.ny.gov); the venue-license branch renders no portal (nothing to file). — **SLA portal guidance deferred:** SPEC-CONFLICT #149; SLA-* rules carry no `output.portal`. Their `source.urls` citation of `sla.ny.gov/permits-available-online` must **not** be rendered as an application portal.
- Mixed verification: a verified URL with an unverified fee renders the link and the fee caveat independently (per-facet granularity). — **deferred:** SPEC-CONFLICT #149; verification is one `{status, evidence}` (optional `qualification`) per rule

## Answer-Key Scenarios Exercised

- A (E-Apply for SAPO; DOHMH path caveated).
- C (Parks portal + precinct instructions, sequenced).
- E (four distinct agencies on one checklist: SAPO, DOB/FDNY caveated, FDNY Business, DOHMH caveated, precinct).

## Implementable on the published ruleset (nyc.v2.8)

Eleven rules carry `output.portal` (name / url / optional instructions): six SAPO E-Apply classes, `PARKS-EVENT-001`, three FDNY Business rules, and `NYPD-SOUND-001` (`url: null` + in-person instructions). That subset covers AC 1's first four bullets, AC 4, and Scenario A/C of AC 5.
