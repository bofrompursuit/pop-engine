# F-102 · Feasibility Verdict

**Phase:** 1 (core, week 1) · **Lane:** Dev 1 · **Depends on:** F-201 (same engine invocation) · **Feeds:** plan UI, F-203 slack warnings

## User Story

As an independent organizer, the moment my plan generates I see whether my date actually works, and if it doesn't, exactly which permit kills it and what I could change.

## Inputs

The F-201 evaluation context: required items with typed deadlines, `event_date`, `today`, `config.slack_warning_days` (14, tunable), unknown facts.

## Outputs

One of four verdicts on the `permit_plans` row, plus `verdict_detail`:

| Verdict | detail carries |
|---|---|
| FEASIBLE | min_slack_days |
| FEASIBLE-AT-RISK | tightest permit, "apply within N days" |
| CONDITIONAL | missing fact, each branch's verdict + reason |
| INFEASIBLE | blocking permit, rescope suggestions (each a re-evaluated scenario) |

## Acceptance Criteria

1. **Backward timeline:** every dated item gets `latest_apply_date` per its typed deadline (lead ranges use the max bound; `unverified` deadlines are listed but excluded from verdict math).
2. **Algorithm order** (ARCHITECTURE steps 1–6): unknown-fact branches are evaluated before window checks. Scenario F must render CONDITIONAL, never INFEASIBLE.
3. **The cliff:** R2's 21-day hard floor is binary. Park event 22 days out → not floor-blocked; 21 days out → INFEASIBLE naming the Parks permit. No gradient.
4. **Sequencing:** in parks with amplified sound, the sound permit's `apply_after_date` = Parks apply date + 30 processing days; the rendered timeline shows apply-Parks-now → decision ~day 30 → file sound → buffer (Scenario C).
5. **Slack warning:** min slack below threshold renders FEASIBLE-AT-RISK with "apply within N days"; Scenario D renders exactly "10 days". Any threshold value > 10 preserves this; default 14.
6. **Conditional branching:** `venue_has_liquor_license = unknown` yields both branches evaluated fully; branch verdicts and reasons render side by side (Scenario F: yes-branch feasible with confirm-coverage advisory; no-branch infeasible, SLA ~21 calendar > 20-day runway).
7. **Rescopes are re-evaluations:** each suggestion is produced by re-running the engine on a modified intake and reporting that result; never a static claim. Scenario A: (a) private venue → SAPO + insurance drop from the re-evaluated plan; (b) push ≥60 days (internal recommendation 60 + threshold for clean FEASIBLE, per OPEN-QUESTIONS I-10).
8. Verdict computation adds < 5 seconds to plan generation (PRD metric; in practice it's the same in-memory pass).
9. Same inputs + same `today` → same verdict and detail, always.

## Edge Cases

- Every dated deadline already past → INFEASIBLE names the largest blocker (longest lead), lists all blocked permits in detail.
- R2's 22–29-day band: accepted (past no floor) but processing overruns event → FEASIBLE-AT-RISK, "processing may not complete before event" (interpretation I-5, not a verified fact).
- Multiple unknowns: branch product capped by intake design (v1 has one branchable unknown: liquor license; dimensions-unknown produces a conditional item, not a verdict branch).
- Zero required dated permits (Scenario B) → FEASIBLE with no slack figure (nothing to compute).

## Answer-Key Scenarios Exercised

- A: INFEASIBLE + named blocker + both rescopes.
- B: FEASIBLE with empty permit set.
- C: FEASIBLE with sequenced dependency timeline.
- D: FEASIBLE-AT-RISK, 10-day slack.
- E: FEASIBLE, ~75-day slack (max-bound arithmetic).
- F: CONDITIONAL with two-branch detail.
