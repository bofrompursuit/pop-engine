import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Prose guard for SPEC-CONFLICT #145.
//
// `verification-copy.test.ts` pins the two UI strings apart. It cannot stop the SPECIFICATION PROSE
// drifting back, and prose drift is how this defect reached four approved artifacts: F-206, PRD,
// DESIGN and F-201 all described COVERAGE_GAP as a missing source, which is RESEARCH_REQUIRED's
// published meaning. Nothing checked the documents against the legend, so nothing caught it.
//
// The banned phrase is assembled at runtime rather than written out. If this file contained the
// literal it would match itself, and the alternative (an allow-list exempting this path) rots the
// moment a second file has a defensible reason to be listed. Assembling it means the invariant is
// simply "zero occurrences, anywhere", with no exceptions to maintain.
const BANNED = ["source", "not", "yet", "established"].join(" ");

// `git grep` rather than a filesystem walk: it respects .gitignore for free, so node_modules,
// build output and the coverage report cannot produce phantom hits, and it only ever sees files
// that are actually committed.
function trackedOccurrences(phrase: string): string[] {
  try {
    return execFileSync("git", ["grep", "-rniI", "--", phrase], {
      cwd: process.cwd(),
      encoding: "utf8",
    })
      .split("\n")
      .filter((line) => line.length > 0);
  } catch (error) {
    // git grep exits 1 with no output when there are no matches, which is the passing case.
    const failure = error as { status?: number; stdout?: string };
    if (failure.status === 1 && !failure.stdout) return [];
    throw error;
  }
}

describe("COVERAGE_GAP prose cannot drift back to the RESEARCH_REQUIRED meaning", () => {
  it("has no tracked file describing COVERAGE_GAP as an unestablished source", () => {
    // Fails with the offending file:line, so whoever reintroduces it is told where and why rather
    // than being handed a bare boolean.
    expect(trackedOccurrences(BANNED)).toEqual([]);
  });

  it("would catch the phrase if it came back", () => {
    // Guards the guard. A grep helper that silently returns [] for everything would let the test
    // above pass forever, which is the failure mode that makes a regression test worthless.
    expect(trackedOccurrences("COVERAGE_GAP").length).toBeGreaterThan(0);
  });
});
