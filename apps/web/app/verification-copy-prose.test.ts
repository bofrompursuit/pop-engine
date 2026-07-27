import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Prose guard for SPEC-CONFLICT #145: prose must not describe COVERAGE_GAP as an absent source.
//
// ROUND 3 REBUILD, and the reason is measured rather than argued. The first version denied one
// phrase, the second denied two, and the defect then turned up in SIX places in wordings neither
// list reached: a hyphenated run-together of "source", "not" and "established" five times, one of
// them a test name, and a hyphenated "no"+"source" compound modifying "state" once. Both are spelled
// out only in the fragment-assembled probes at the bottom of this file, never in prose here, because
// this file is inside layer 2's own scope and a literal would make the guard fail on itself.
// Enumerating wrong phrasings loses to a writer with a thesaurus, so this file no longer rests on
// that alone.
//
// THREE LAYERS, AND EACH ONE'S GUARANTEE IS STATED EXACTLY. None of them decides meaning; no string
// match can. What they do is bound the ways this defect has actually travelled.
//
//   1. SHIPPED PHRASINGS, repo-wide. Guarantee: a copy-paste of either wording that actually shipped
//      fails anywhere in the repo, including out of git history. Nothing weaker, nothing stronger.
//
//   2. THE SOURCE-ABSENCE FAMILY, scoped, normalised. Guarantee: within the artifacts that define
//      what COVERAGE_GAP means, a phrase attributing source absence to it fails REGARDLESS of
//      hyphenation, spacing or filler words, because the text is normalised before matching. That is
//      what defeats the two evasions above. It does NOT catch a genuinely novel formulation: "the
//      ruleset has not identified an authority" would pass, and a reviewer is still the only thing
//      between that sentence and an approved artifact.
//      The scope is deliberate. Repo-wide, this layer produces three false positives that are all
//      legitimate prose: `docs/VERIFICATION-SOURCES.md` discusses sources genuinely not located,
//      `docs/ARCHITECTURE-FUTURE.md` QUOTES the old wrong wording in order to record its correction,
//      and `apps/api/src/ruleset.ts` uses "no source states" as a verb. A guard that forbids the repo
//      from documenting its own fix is the wrong guard, so the scope is the files that define the
//      status's meaning plus the app that renders it.
//
//   3. THE REQUIRED FORMULATION IS PRESENT, per artifact. Guarantee: DELETION of the correct wording
//      fails. That is all it is, and the limit is not hypothetical: when this rebuild started, all
//      four artifacts already contained the formulation while six clauses inside them contradicted
//      it, so a presence check ALONE would have passed on the broken tree. It is here because removal
//      and contradiction are different failure modes and layer 2 cannot see the first.
const SHIPPED_PHRASINGS: ReadonlyArray<{ phrase: string; why: string }> = [
  {
    // The UI copy both render sites carried.
    phrase: ["source", "not", "yet", "established"].join(" "),
    why: "announces a pending source, which is RESEARCH_REQUIRED's meaning, not COVERAGE_GAP's",
  },
  {
    // F-206 AC 2's phrasing, which PRD, DESIGN and F-201 repeated.
    phrase: ["no", "source", "is", "published"].join(" "),
    why: "states the absence of a source as the status's meaning rather than its consequence",
  },
];

// Assembled from fragments, like the phrases above and for the same reason: a literal written out
// here would be matched by layer 2, because this file sits inside that layer's scope.
const ABSENCE = ["established", "published", "located", "available", "identified"].join("|");
const FAMILY: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: new RegExp(`\\bsource (?:is |was )?not (?:yet )?(?:${ABSENCE})\\b`, "i"),
    why: "attributes a not-established source to the status, which is RESEARCH_REQUIRED's meaning",
  },
  {
    pattern: new RegExp(`\\bno source (?:is |was )?(?:${ABSENCE})\\b`, "i"),
    why: "attributes an absent source to the status, which is RESEARCH_REQUIRED's meaning",
  },
];

// The compound-noun form is matched on the RAW line, not the normalised one. Normalising turns its
// hyphen into a space, which would then also match "no source states" used as a verb in unrelated
// code. The hyphen is what makes it one adjectival unit, so requiring it is what keeps this precise.
// Assembled rather than written as a literal, like everything else here. Written out, the pattern
// would be the one occurrence of the compound in the repo, and it would escape its own check only
// because the leading `\b` puts a word character in front of it. That is luck rather than design:
// drop the leading boundary and the guard fails on itself. Assembling removes the accident.
const COMPOUND = {
  pattern: new RegExp(`\\b${["no", "source"].join("-")}\\b`, "i"),
  why: "the compound form of the same claim",
};

// The formulation the published legend uses, in `rules/nyc-rules.v2.8.json`. Tested after
// normalisation so the hyphenated variant in F-206's Outputs bullet also counts.
const REQUIRED = /\bnot (?:covered|modeled|modelled) by this ruleset version\b/i;

// The artifacts whose criteria mandate a COVERAGE_GAP description, plus the app that renders it.
const MEANING_ARTIFACTS = [
  "docs/PRD.md",
  "docs/DESIGN.md",
  "specs/F-201-permit-plan-generator.md",
  "specs/F-206-rules-snapshot-banner.md",
] as const;

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  } catch (error) {
    // git grep exits 1 with no output when there are no matches, which is the passing case.
    const failure = error as { status?: number; stdout?: string };
    if (failure.status === 1 && !failure.stdout) return "";
    throw error;
  }
}

// `git grep` rather than a filesystem walk: it respects .gitignore for free, so node_modules, build
// output and the coverage report cannot produce phantom hits, and it only sees committed files.
function trackedOccurrences(phrase: string): string[] {
  return git(["grep", "-rniI", "--", phrase])
    .split("\n")
    .filter((line) => line.length > 0);
}

function scopedFiles(): string[] {
  const web = git(["ls-files", "apps/web"]).split("\n").filter(Boolean);
  return [...MEANING_ARTIFACTS, ...web];
}

// The working-tree copy, not `git show HEAD:`. `git grep` above reads the working tree by default,
// and a guard that only saw committed content would pass on a broken edit and fail on a fixed one
// until it was committed, which inverts the edit-and-rerun loop it exists to support.
function readTracked(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

/** Hyphens and underscores to spaces, runs of whitespace to one. Defeats both observed evasions. */
function normalise(line: string): string {
  return line.replace(/[-_]/g, " ").replace(/\s+/g, " ");
}

type Hit = { file: string; line: number; why: string };

function familyHits(files: readonly string[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    readTracked(file)
      .split("\n")
      .forEach((line, index) => {
        const matched =
          FAMILY.find((entry) => entry.pattern.test(normalise(line))) ??
          (COMPOUND.pattern.test(line) ? COMPOUND : undefined);
        if (matched !== undefined) {
          hits.push({ file, line: index + 1, why: matched.why });
        }
      });
  }
  return hits;
}

function caughtByFamily(wording: string): boolean {
  return (
    FAMILY.some((entry) => entry.pattern.test(normalise(wording))) ||
    COMPOUND.pattern.test(wording)
  );
}

describe("COVERAGE_GAP prose cannot describe an absent source", () => {
  it.each(SHIPPED_PHRASINGS)("has no tracked file saying $phrase", ({ phrase, why }) => {
    // Fails with the offending file:line and the reason, so whoever reintroduces it is told where
    // and why rather than being handed a bare boolean.
    expect(trackedOccurrences(phrase), why).toEqual([]);
  });

  it("has no source-absence wording in the artifacts that define the status", () => {
    const hits = familyHits(scopedFiles()).map((hit) => `${hit.file}:${hit.line} ${hit.why}`);
    expect(
      hits,
      "COVERAGE_GAP means the combination is not covered, not that a source is missing",
    ).toEqual([]);
  });

  it.each(MEANING_ARTIFACTS)("%s states the published formulation", (file) => {
    // Deletion guard only. A file can satisfy this and still contradict itself elsewhere, which is
    // exactly what happened before this round, so it asserts nothing about the rest of the file.
    expect(
      REQUIRED.test(normalise(readTracked(file))),
      `${file} must state COVERAGE_GAP's published meaning`,
    ).toBe(true);
  });

  it("fires on every wording this defect has actually used", () => {
    // Guards the guard against the real history rather than a synthetic string: these are the
    // wordings that reached approved artifacts, rebuilt from fragments so this file does not trip
    // the very layer it is testing.
    const sourceNot = ["source", "not", "established"].join("-");
    const historical = [
      `an explicit ${sourceNot} coverage state`,
      `an explicit ${sourceNot} coverage gap`,
      `an explicit ${sourceNot} gap`,
      `exposes the ${sourceNot} gap`,
      `the explicit ${sourceNot} state`,
      `its explicit ${["no", "source"].join("-")} state`,
      ...SHIPPED_PHRASINGS.map((entry) => entry.phrase),
    ];
    for (const wording of historical) {
      expect(caughtByFamily(wording), `should be caught: ${wording}`).toBe(true);
    }
  });

  it("does not fire on prose that legitimately discusses missing sources", () => {
    // The scope decision above, asserted rather than described. If someone widens the scope to the
    // whole repo, these are the sentences that begin failing, and this test says why that is wrong:
    // a rule the evidence record and the amendment history cannot obey is the wrong rule.
    const legitimate = [
      "no primary source located in two research passes",
      "a rule that publishes no source",
      "rendering the citation without a source URL",
      "a published verification date that no source states",
    ];
    for (const wording of legitimate) {
      expect(caughtByFamily(wording), `should NOT be caught: ${wording}`).toBe(false);
    }
  });

  it("would notice if the grep helper stopped working", () => {
    // A helper that silently returned nothing would let every assertion above pass forever, which is
    // the failure mode that makes a regression test worthless.
    expect(trackedOccurrences("COVERAGE_GAP").length).toBeGreaterThan(0);
    expect(scopedFiles().length).toBeGreaterThan(MEANING_ARTIFACTS.length);
    expect(readTracked("docs/PRD.md").length).toBeGreaterThan(0);
  });
});
