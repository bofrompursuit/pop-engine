// Verdict algorithm, ARCHITECTURE steps 3–6. Branch evaluation for unknowns runs before any
// window check, so an unknown-conditioned finding can never render INFEASIBLE (Scenario F).

import { resolveFindings } from "./findings";
import type { PlanContext } from "./deadlines";
import {
  MISSED_MAY_BE_REQUIRED_IS_CONDITIONAL,
  RESCOPE_EXCLUDES_UNKNOWN_VALUES,
} from "./proposals";
import { UNKNOWN_ANSWER } from "./conditions";
import { triggerFields } from "./ruleset";
import type {
  BranchOutcome,
  EngineRuleset,
  EventIntake,
  Finding,
  MissingFact,
  RescopeSuggestion,
  Verdict,
  VerdictDetail,
} from "./types";

const VERDICT_RANK: Readonly<Record<Verdict, number>> = {
  INFEASIBLE: 0,
  CONDITIONAL: 1,
  FEASIBLE_AT_RISK: 2,
  FEASIBLE: 3,
};

export type WindowVerdict = {
  readonly verdict: Verdict;
  readonly blockingFinding: Finding | null;
  readonly missedRuleIds: readonly string[];
  readonly minSlackDays: number | null;
};

const isMissed = (finding: Finding): boolean =>
  finding.deadlineStatus === "published_deadline_missed";

/**
 * Steps 4–6: the window checks, with no branch expansion. Also the per-branch and per-rescope
 * verdict, which is why it is separate from `computeVerdict`.
 */
export function computeWindowVerdict(findings: readonly Finding[]): WindowVerdict {
  const missed = findings.filter(isMissed);
  const missedRuleIds = missed.flatMap((finding) => finding.ruleIds);
  const slacks = findings
    .filter((finding) => finding.slackDays !== null && !isMissed(finding))
    .map((finding) => finding.slackDays as number);
  const minSlackDays = slacks.length === 0 ? null : Math.min(...slacks);

  // The blocking finding is the missed one with the longest published lead, i.e. the earliest date.
  const blocking = missed
    .filter((finding) => finding.disposition === "required")
    .sort((left, right) =>
      (left.latestApplyDate ?? "").localeCompare(right.latestApplyDate ?? ""),
    )[0];

  if (blocking !== undefined) {
    return { verdict: "INFEASIBLE", blockingFinding: blocking, missedRuleIds, minSlackDays };
  }
  if (MISSED_MAY_BE_REQUIRED_IS_CONDITIONAL && missed.length > 0) {
    return { verdict: "CONDITIONAL", blockingFinding: null, missedRuleIds, minSlackDays };
  }
  if (findings.some((finding) => finding.deadlineStatus === "deadline_approaching")) {
    return { verdict: "FEASIBLE_AT_RISK", blockingFinding: null, missedRuleIds, minSlackDays };
  }
  return { verdict: "FEASIBLE", blockingFinding: null, missedRuleIds, minSlackDays };
}

const ruleIdsOf = (findings: readonly Finding[]): string[] =>
  findings.flatMap((finding) => finding.ruleIds).sort();

const branchSignature = (verdict: Verdict, findings: readonly Finding[]): string =>
  [
    verdict,
    ...[...findings]
      .map((finding) => `${finding.ruleIds.join("+")}@${finding.latestApplyDate ?? "-"}`)
      .sort(),
  ].join("|");

function describeDifference(base: readonly Finding[], candidate: readonly Finding[]): string {
  const baseIds = new Set(ruleIdsOf(base));
  const candidateIds = new Set(ruleIdsOf(candidate));
  const added = [...candidateIds].filter((id) => !baseIds.has(id));
  const dropped = [...baseIds].filter((id) => !candidateIds.has(id));
  const parts = [
    added.length > 0 ? `adds ${added.join(", ")}` : null,
    dropped.length > 0 ? `drops ${dropped.join(", ")}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? "same findings, re-dated" : parts.join("; ");
}

type Evaluated = { readonly findings: readonly Finding[]; readonly window: WindowVerdict };

function evaluateWith(
  intake: EventIntake,
  field: string,
  value: string,
  ruleset: EngineRuleset,
  context: PlanContext,
): Evaluated {
  const branchIntake = { ...intake, [field]: value };
  const findings = resolveFindings(branchIntake, ruleset, {
    ...context,
    intake: branchIntake,
  }).findings;
  return { findings, window: computeWindowVerdict(findings) };
}

/** Declared alternatives for a field, minus its current answer and minus `unknown`. */
function alternativeValues(field: string, intake: EventIntake, ruleset: EngineRuleset): string[] {
  const definition = ruleset.intakeFields.find((entry) => entry.field === field);
  const values = definition?.values ?? null;
  if (values === null) return [];
  return values.filter(
    (value) =>
      value !== intake[field] && !(RESCOPE_EXCLUDES_UNKNOWN_VALUES && value === UNKNOWN_ANSWER),
  );
}

function buildMissingFacts(
  unknownFields: readonly string[],
  intake: EventIntake,
  ruleset: EngineRuleset,
  context: PlanContext,
  base: readonly Finding[],
): {
  readonly missingFacts: readonly MissingFact[];
  readonly branchesDiverge: boolean;
  readonly allBranchable: boolean;
} {
  const ordered = ruleset.intakeFields
    .map((definition) => definition.field)
    .filter((field) => unknownFields.includes(field));
  const missingFacts: MissingFact[] = [];
  let branchesDiverge = false;
  let allBranchable = ordered.length === unknownFields.length;

  for (const field of ordered) {
    const values = alternativeValues(field, intake, ruleset);
    if (values.length === 0) {
      // A numeric or free-form unknown cannot be enumerated into branches, but it is still material.
      allBranchable = false;
      continue;
    }
    const branches = values.map((value) => ({
      value,
      ...evaluateWith(intake, field, value, ruleset, context),
    }));
    const outcomes: BranchOutcome[] = branches.map((branch) => ({
      value: branch.value,
      verdict: branch.window.verdict,
      reason: describeDifference(base, branch.findings),
    }));
    // ARCHITECTURE step 3: an unknown that changes the finding set *or the timeline* is
    // conditional, so the signature carries each finding's date, not just the verdict.
    const signatures = branches.map((branch) =>
      branchSignature(branch.window.verdict, branch.findings),
    );
    if (new Set(signatures).size > 1) branchesDiverge = true;
    missingFacts.push({ field, branches: outcomes });
  }

  return { missingFacts, branchesDiverge, allBranchable };
}

/** Fields whose `asked_when` chain the blocking rule ultimately hangs off (proposals §6, R1). */
function rootGatingFields(fields: readonly string[], ruleset: EngineRuleset): string[] {
  const declared = new Map(
    ruleset.intakeFields.map((definition) => [definition.field, definition]),
  );
  const roots = new Set<string>();
  const seen = new Set<string>();

  const walk = (field: string): void => {
    if (seen.has(field)) return;
    seen.add(field);
    const askedWhen = declared.get(field)?.askedWhen ?? null;
    if (askedWhen === null) {
      roots.add(field);
      return;
    }
    for (const token of askedWhen.split(/[^a-z_]+/)) if (declared.has(token)) walk(token);
  };

  for (const field of fields) walk(field);
  return [...roots];
}

function buildRescopeSuggestions(
  blocking: Finding,
  intake: EventIntake,
  ruleset: EngineRuleset,
  context: PlanContext,
  base: Evaluated,
): RescopeSuggestion[] {
  const blockingRules = ruleset.rules.filter((rule) => blocking.ruleIds.includes(rule.id));
  const triggerFieldNames = blockingRules.flatMap((rule) => triggerFields(rule.trigger));
  const candidateFields = new Set([
    ...triggerFieldNames,
    ...rootGatingFields(triggerFieldNames, ruleset),
  ]);
  const baseRuleIds = new Set(ruleIdsOf(base.findings));
  const baseAgencies = new Set(base.findings.map((finding) => finding.agency));
  const suggestions: RescopeSuggestion[] = [];

  for (const definition of ruleset.intakeFields) {
    if (!candidateFields.has(definition.field)) continue;
    for (const value of alternativeValues(definition.field, intake, ruleset)) {
      const candidate = evaluateWith(intake, definition.field, value, ruleset, context);
      if (VERDICT_RANK[candidate.window.verdict] <= VERDICT_RANK[base.window.verdict]) continue;

      const introduced = candidate.findings.filter((finding) =>
        finding.ruleIds.every((ruleId) => !baseRuleIds.has(ruleId)),
      );
      // R3 (proposals §6): a coverage gap asserts nothing, another agency's permit is not
      // relief, and a scope the engine cannot date is not a scope it can recommend.
      if (introduced.some((finding) => finding.verificationStatus === "COVERAGE_GAP")) continue;
      if (
        introduced.some(
          (finding) => finding.disposition === "required" && !baseAgencies.has(finding.agency),
        )
      ) {
        continue;
      }
      if (introduced.some((finding) => finding.deadlineStatus === "not_calculable")) continue;

      const candidateIds = new Set(ruleIdsOf(candidate.findings));
      suggestions.push({
        change: { field: definition.field, value },
        reevaluatedVerdict: candidate.window.verdict,
        droppedRuleIds: [...baseRuleIds].filter((ruleId) => !candidateIds.has(ruleId)),
      });
    }
  }
  return suggestions;
}

export function computeVerdict(
  intake: EventIntake,
  ruleset: EngineRuleset,
  context: PlanContext,
): {
  readonly findings: readonly Finding[];
  readonly verdict: Verdict;
  readonly verdictDetail: VerdictDetail;
} {
  const resolved = resolveFindings(intake, ruleset, context);
  const window = computeWindowVerdict(resolved.findings);
  const base: Evaluated = { findings: resolved.findings, window };

  const { missingFacts, branchesDiverge, allBranchable } = buildMissingFacts(
    resolved.unknownFields,
    intake,
    ruleset,
    context,
    resolved.findings,
  );

  // Step 3: an unknown that moves the finding set or the timeline gives CONDITIONAL; an
  // unknown the registry cannot enumerate is still material, so it cannot be waved through.
  const hasMaterialUnknown = resolved.unknownFields.length > 0;
  const verdict: Verdict =
    hasMaterialUnknown && (branchesDiverge || !allBranchable) ? "CONDITIONAL" : window.verdict;

  const rescopeSuggestions =
    verdict === "INFEASIBLE" && window.blockingFinding !== null
      ? buildRescopeSuggestions(window.blockingFinding, intake, ruleset, context, base)
      : [];

  return {
    findings: resolved.findings,
    verdict,
    verdictDetail: {
      blockingFinding:
        verdict === "INFEASIBLE" && window.blockingFinding !== null
          ? { ruleIds: window.blockingFinding.ruleIds, name: window.blockingFinding.name }
          : null,
      missedRuleIds: window.missedRuleIds,
      minSlackDays: window.minSlackDays,
      missingFacts,
      rescopeSuggestions,
      trace: resolved.trace,
    },
  };
}
