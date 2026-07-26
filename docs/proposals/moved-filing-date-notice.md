# PopEngine — Moved-Filing-Date Notice

**Status:** PROPOSED. Not approved, and not implementable.
**Covered by:** `docs/BASELINE.md`, "Superseded/draft material" row (`docs/proposals/*`): _never build from these_.
**Proposes:** new acceptance criteria on `specs/F-202-compliance-checklist.md`, plus the rule data and schema they would require.
**Blocks:** PR #117, which implements this behaviour and must not merge until these criteria are approved.
**Drafted:** 2026-07-26

---

## 1. Why this document exists

PR #117 implements a moved-filing-date notice on the compliance checklist: when a requirement the organizer has already filed for shows a filing date different from the one they worked against, the row carries a notice.

Review established that **no approved acceptance criterion covers any of it**. Not the behaviour, not the statuses that trigger it, not the persisted column migration 008 adds to `checklist_items`. The whole contract is inferred from a reading of what the product ought to do, and `AGENTS.md:19-20` forbids exactly that: an inferred contract is not a contract.

The product owner has **parked** the work rather than approving criteria under review pressure. That is the right call and this document records it, so the next person does not rediscover the gap or, worse, read #117's merged code as the specification.

**#117 is not merged and should not be merged until this is approved as acceptance criteria on F-202.**

### What the approved specs actually say

Checked rather than asserted, against `specs/F-202-compliance-checklist.md` and `specs/F-206-rules-snapshot-banner.md` at commit `0122eca`:

- **Neither spec has an acceptance criterion about a filing date moving**, about reapplication, or about amending an application.
- The nearest approved criterion is **F-202 AC 5**: "Checklist shows each item's `latest_apply_date` (and `apply_after_date` when gated) so the deadline context lives where the work happens." That requires the date to be **shown**. It says nothing about surfacing that the date has **changed**, which is the entire subject here.
- The only textual match for "amend" in either file is in F-206's own status header, recording that F-206's Acceptance Criterion 4 was amended on 2026-07-26 for SPEC-CONFLICT #115. That is a spec edit, not a permit procedure, and it is not evidence of coverage.

So the gap is total, and it is a gap in F-202. F-206 governs snapshot provenance and is not the right home for it.

---

## 2. Proposed acceptance criteria

These are drafted as criteria for adoption into F-202, in F-202's numbering style. They are proposals: nothing below is approved.

**AC-N (the notice).** When a checklist item at status `submitted` or `approved` shows a `latest_apply_date` different from the one displayed when the organizer last worked that row, the checklist surfaces a notice on that row. The notice states that the filing date moved, and states what the responsible agency publishes about changing an application already with them. Where the agency publishes nothing, the notice says so and directs the organizer to the agency.

**AC-N+1 (a notice, never a requirement).** The notice changes nothing else about the row. No status changes, no status transition is blocked, nothing is gated on it, and the row stays fully editable. Everything the organizer could do before the date moved, they can still do.

**AC-N+2 (persistence, not derivation).** The filing date the organizer worked against is **persisted at the moment they work the row**, and is never derived afterwards from plan timestamps.

The reason is not stylistic. `permit_plans.generated_at` defaults to `current_timestamp`, which in PostgreSQL is the **generating transaction's start time**, while the plan becomes visible only at COMMIT. Timestamp ordering therefore cannot distinguish a plan that was visible to the organizer from one still uncommitted: a checklist update landing inside a generation transaction carries a later timestamp than a plan nobody could see. A derivation reads that invisible plan as what the organizer worked against and **suppresses the notice for work done against a date the organizer could not have seen**.

This was **measured on #117, not reasoned about**: a test holds a generation open with its plan and items inserted and uncommitted, updates the row inside that window, then commits. The derivation stays silent; the persisted value does not.

**AC-N+3 (excluded statuses).** The notice does not appear at `not_started`, `in_progress` or `rejected`. It speaks about an application already with an agency, and at those three statuses there is none: nothing has been filed at the first two, and at `rejected` nothing is live.

---

## 3. Edge cases the criteria must cover

- **No published procedure.** The common case, not the exception: six of the eight rows surveyed below publish nothing. The notice must say so rather than inventing a procedure or staying silent.
- **No recorded worked-against date.** A row nobody has worked, or one worked before the mechanism existed. The notice **stays silent**, and the date is **never inferred from plan timestamps** to fill the gap. Silence is the honest answer; an inferred date reintroduces exactly the defect AC-N+2 exists to prevent.
- **A displayed null date.** A requirement can be raised with no `latest_apply_date` at all, for instance when its deadline is RESEARCH_REQUIRED. There is no date to have moved, so there is no notice. "A requirement with a null date" and "no requirement" are different states and must not collapse into each other.

---

## 4. Agency research

This is the expensive half of this document. Two independent passes; it will not be cheap to redo.

**Caveat, to be carried verbatim wherever this table is reused:**

> NOT PUBLISHED does not mean no agency action is required, only that public sources do not establish which action is required.

| Requirement                                       | Procedure on a date change | Source                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAPO street / plaza permits                       | **AMEND**                  | Title 50 RCNY 1-07: an applicant proposing to amend the date of a filed application **or a granted permit** must notify SAPO in writing; the Director approves or denies after agency and community board review. Withdrawing instead costs **90 percent of the City's processing cost** for Extra-Large, Large and Medium events within ten days. |
| FDNY generator / fuel permit at a special event   | **REAPPLY**                | FDNY District Office Street-Fair/Special Event Guide, pp. 2-3: if the inspection must be postponed, the applicant must request cancellation and then create a new inspection request. p. 21 ties the inspection date to the event's first day; p. 23 lists gasoline and diesel generators.                                                         |
| DOHMH Temporary Food Service Establishment permit | **NOT PUBLISHED**          | The permit is annual, and the published amendment form covers contacts and addresses, not an event date.                                                                                                                                                                                                                                           |
| DOHMH Article 88 organizer notification           | **NOT PUBLISHED**          | An updated **vendor list** is required when the list changes. Nothing published about a date change.                                                                                                                                                                                                                                               |
| NYPD sound device permit                          | **NOT PUBLISHED**          | §10-108 publishes the date field, the five-day deadline and the revocation authority. No change procedure.                                                                                                                                                                                                                                         |
| NYC Parks special event permit and TUA            | **NOT PUBLISHED**          | 56 RCNY 2-08(d) lets **Parks** offer an alternative date after a denial. That is an agency power, not an applicant procedure.                                                                                                                                                                                                                      |
| DOB temporary structure                           | **NOT PUBLISHED**          | Post Approval Amendments exist for approved-scope changes, but nothing published says a date-only change is a PAA rather than a new filing.                                                                                                                                                                                                        |
| FDNY open flame; FDNY battery                     | **NOT PUBLISHED**          | No published procedure found for a date change.                                                                                                                                                                                                                                                                                                    |

Counted against the rows above: **two** procedures established, **six** rows with nothing published. The brief this was drafted from enumerates five NOT PUBLISHED families and then adds FDNY open flame and battery, which is where the difference between "five" and "six" comes from; the table is the count to trust, since each row is separately citable.

### Method note: where to look next time

The two passes agreed everywhere **except FDNY generators**.

The first pass searched at **rule level** (the Fire Code and the RCNY) and concluded nothing was published. The second pass found the procedure in an **operational guide** for district offices, which is where FDNY documents how an applicant actually reschedules an inspection.

That is worth recording as method, not trivia: for this class of question, an agency's published rules may be silent while its operational or applicant-facing guidance is explicit. A pass that stops at rule level will report NOT PUBLISHED with false confidence. Search both levels before concluding a procedure does not exist, and record which level produced the answer.

---

## 5. What implementing this would take

Scope for whoever picks it up. Three pieces, in order:

1. **Approve the criteria onto F-202.** Sections 2 and 3 above, adopted into `specs/F-202-compliance-checklist.md` with its numbering, reviewed by the product owner and the affected lane owners as that spec's status header requires. Nothing below is safe to start first: the schema and the rule data both encode decisions these criteria make.
2. **Publish the two procedures as rule data, and the five gaps honestly.** SAPO amend and FDNY generator reapply carry `SOURCE_CONFIRMED` with their citations; the five NOT PUBLISHED families carry `RESEARCH_REQUIRED`. Both need `VERIFICATION-SOURCES.md` entries. This is a **ruleset version bump**, with the answer key and fixtures following it, and it is what lets the notice state the agency's procedure without the procedure living in application code.
3. **Rebase #117 and review it against the approved criteria**, including its two findings still open at review round 3:
   - **`checklist.ts:959`, stale-tab plan selection.** The update records the plan visible to the server at the moment it runs, not the plan actually rendered to the client. A checklist page left open in another tab while a regeneration commits elsewhere records the new date and suppresses the notice for work done against the old one. Closing this means carrying the plan or date the client was actually served, rather than re-reading server state.
   - **`checklist.ts:968`, the null-date COALESCE.** When the current plan still raises the requirement but its `latest_apply_date` is null, the fallback substitutes the previous plan item's date. If a later plan restores a date, the notice fires although the organizer last worked the row with no date displayed. Closing this means distinguishing "a matching row whose date is null" from "no matching row", which is the same distinction §3 draws.

---

## 6. What this document is not

It is not a specification, and it confers no permission. It is in `docs/proposals/` because `docs/BASELINE.md` classes everything there as ARCHIVED or PROPOSED draft material with the instruction _never build from these_, and that is the correct status for it today.

Nothing here has been approved: not the criteria, not the column, not the copy the notice would carry, and not the rule data in §4. The research in §4 is a record of what public sources establish as of the drafting date; it is not a verification pass, and promoting any of it to `SOURCE_CONFIRMED` is the verification owner's decision under `docs/OPEN-QUESTIONS.md` §2.
