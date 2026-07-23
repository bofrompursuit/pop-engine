// pop-engine rules engine.
//
// PURE module (AGENTS.md "Engine invariants"): no database, HTTP, environment reads,
// randomness, or system clock. `today`, the ruleset, and the holiday calendar are always
// explicit inputs. The real evaluate(intake, ruleset, today, calendar) lands with F-201
// (issue #4); this scaffold only proves the toolchain and the cross-package wiring.

export const ENGINE_NAME = "pop-engine-engine";

/** Hello-world placeholder. Deterministic and side-effect free by construction. */
export function describeEngine(): string {
  return `${ENGINE_NAME} ready`;
}
