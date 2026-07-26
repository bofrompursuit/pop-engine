# F-109 edits for the product owner to apply

`specs/F-109-coverage-state-classification.md` is untracked in the primary checkout (`agent/draft-future-feature-specs`), so I cannot see or edit it. Below is exactly what it should say. **I have not created the file** and this handoff file is not committed to the PR branch.

Everything here is mechanical except items 5 and 6, which are judgement calls flagged as such.

---

## 1. Filename

Rename the file:

```
specs/F-109-coverage-state-classification.md  →  specs/F-109-scope-support-classification.md
```

If any approved artifact already links the old path, the link moves in the same commit. As of `7bad52e` nothing in `docs/`, `specs/` or code references the file path, so this should be a clean `git mv`.

## 2. Title line

Replace the H1 with:

```markdown
# F-109 · Scope-Support Classification
```

## 3. Status header

Follow the precedent F-206 set for #115 and F-203 for #125. Keep the original approval, append what was amended, the date, and that you approved it. **`APPROVED` must remain the first word** — `scripts/check-baseline-drift.mjs` tests `/^APPROVED\b/i` against the trimmed status line, and this file will be checked once it is tracked and listed in `docs/BASELINE.md`.

Take the existing status line and insert the amendment inside the parenthetical, e.g.:

```markdown
**Status:** APPROVED (<original date>; concept renamed from "coverage states" to "scope support states" and the feature retitled Scope-Support Classification 2026-07-26, product-owner approved, resolving a three-way overload of "coverage"; the five state values are unchanged) · **Reviewer/approver:** product owner + affected lane owners via the approval PR · **Owner:** see Lane below · see `docs/BASELINE.md`.
```

## 4. Body terminology, mechanical

Throughout the spec:

| Replace | With |
|---|---|
| coverage state / coverage states | scope support state / scope support states |
| coverage-state classification | scope-support classification |
| Coverage-State Classification | Scope-Support Classification |
| coverage envelope | supported scope |
| `coverage_state` (field/column/JSON key, if present) | `scope_support_state` |

**Do not change the five state values.** They stay exactly as approved: fully supported, partially supported, unsupported, ambiguous, awaiting information.

**Do not rename any use of `COVERAGE_GAP`.** If the spec references it, that is the per-rule verification status and it keeps its name.

## 5. Add the rationale, so this reads as disambiguation and not drift

Add near the top of the spec, after the status header block. This is the paragraph a reader in three months needs:

> **Why "scope support" and not "coverage".** Until 2026-07-26 this feature's concept was called "coverage states". Three unrelated things in this repo were called coverage and nothing distinguished them: `VerificationStatus.COVERAGE_GAP` (per rule — no primary source is published; shipped and live), `ARCHITECTURE-FUTURE.md` §7.1 (per result — how complete is the plan we produced; post-evaluation), and this feature (per request — can we handle the scope the organizer described; pre-evaluation). The product owner resolved it by name rather than by forcing one vocabulary to absorb another, because all three describe something real at a different point in the pipeline. This feature keeps the **scope** sense and takes its name from the vocabulary its own values already use: three of the five say "supported". `COVERAGE_GAP` keeps its name, being the most literal use and already in production; §7.1 became **result completeness**. The five state values here are unchanged.

## 6. Strengthen AC-04, and this is the judgement call

AC-04 currently keeps this state distinct from feasibility verdict, rule verification status, finding disposition, and evaluation failure. It does **not** mention §7.1's result completeness, because §7.1 was called "coverage status" when AC-04 was written and the collision was invisible.

Result completeness is now the nearest neighbour to this feature of anything in the system, so I recommend adding it to AC-04's exclusion list:

> AC-04 — the scope support state remains distinct from feasibility verdict, rule verification status, finding disposition, evaluation failure, **and `ARCHITECTURE-FUTURE.md` §7.1's result completeness**. Scope support is decided *before* evaluation, on the scope the organizer described; result completeness is decided *after*, on the plan that was produced.

**Flagging honestly, because it affects whether you want that edit:** those two may not be fully distinct. §7.1's `OUTSIDE_VALIDATED_COVERAGE` is glossed as "a material event element is **unsupported**. **Supported** findings may be shown" — which is this feature's vocabulary, not §7.1's. If that is not a coincidence, then §7.1's values and this feature's `unsupported` are one axis measured at two points rather than two axes, and AC-04 would be asserting a distinction that does not hold.

I did not resolve that, and §7.1 in PR #136 records it as deliberately left open. Two options:

- **(a)** Add the AC-04 clause as written above. Asserts the distinction. Correct if the two really are separate axes.
- **(b)** Add only the pointer, not the claim: "AC-04 … and is adjacent to `ARCHITECTURE-FUTURE.md` §7.1's result completeness, which is decided after evaluation. Whether the two are one axis measured at two points is recorded as open in §7.1 and is not decided here."

I recommend **(b)**. It gives the reader the cross-reference without asserting a separation nobody has established, and it matches how §7.1 now records the same question. (a) is defensible if you already know the two are distinct — you have context on F-109's intent that I do not.

## 7. BASELINE.md

Not done by me and not in PR #136. When this spec is tracked and added to `docs/BASELINE.md`, the manifest row should use the new path and the new title. `pnpm check:baseline` will then enforce the `APPROVED` header on it.
