import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Prose guard for SPEC-CONFLICT #145.
//
// WHAT THIS IS: a denylist of the specific wordings this defect actually used. It is not a
// semantic check on COVERAGE_GAP prose and cannot become one. Whether a sentence describes a
// status correctly is a judgement about meaning, and no string match decides it: a reviewer can
// still write a fresh wording that makes the same error, and this will pass. A narrow check that
// says what it does beats a broad claim that cannot be kept.
//
// WHAT IT BUYS: the defect reached four approved artifacts by the same two phrases being copied
// between documents. Copying is what this stops. Each entry is a phrasing that shipped and was
// corrected, so a reintroduction is caught at the point it is pasted back in.
//
// Phrases are assembled from fragments rather than written out. A literal here would match itself,
// and the alternative (an allow-list exempting this file) rots the moment a second file has a
// defensible reason to be listed. Assembling them keeps the invariant "zero occurrences of these
// phrasings, anywhere, no exceptions".
const DENIED: ReadonlyArray<{ phrase: string; why: string }> = [
  {
    // The UI copy both render sites carried.
    phrase: ["source", "not", "yet", "established"].join(" "),
    why: "announces a pending source, which is RESEARCH_REQUIRED's meaning, not COVERAGE_GAP's",
  },
  {
    // F-206 AC 2's phrasing, which PRD, DESIGN and F-201 repeated, and which survived the first
    // pass of this guard because only the copy string was denied.
    phrase: ["no", "source", "is", "published"].join(" "),
    why: "states the absence of a source as the status's meaning rather than its consequence",
  },
];

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

describe("COVERAGE_GAP prose cannot drift back to a known-bad wording", () => {
  it.each(DENIED)("has no tracked file saying $phrase", ({ phrase, why }) => {
    // Fails with the offending file:line and the reason, so whoever reintroduces it is told where
    // and why rather than being handed a bare boolean.
    expect(trackedOccurrences(phrase), why).toEqual([]);
  });

  it("would catch a denied phrase if it came back", () => {
    // Guards the guard. A grep helper that silently returned [] for everything would let the
    // assertions above pass forever, which is the failure mode that makes a regression test
    // worthless.
    expect(trackedOccurrences("COVERAGE_GAP").length).toBeGreaterThan(0);
  });
});
