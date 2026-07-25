// Rule → finding. Step 1 of the verdict algorithm: resolve triggers tri-state, merge by
// dedupe key retaining every contributing rule, and date each finding.

import { createScopeResolver, evaluateTrigger } from "./conditions";
import { CONFIRM_WITH_AGENCY, computeDeadline } from "./deadlines";
import type { DeadlineContext, PlanContext } from "./deadlines";
import { DEFAULT_DISPOSITION_BY_RULE_KIND, UNKNOWN_TRIGGER_DISPOSITION } from "./proposals";
import type {
  EngineRule,
  EngineRuleset,
  EvaluationTraceEntry,
  EventIntake,
  Finding,
  FindingKind,
  FindingSource,
  Disposition,
  TriggeredBy,
  Tristate,
} from "./types";

export type ResolvedFindings = {
  readonly findings: readonly Finding[];
  readonly trace: readonly EvaluationTraceEntry[];
  /** Intake fields whose unanswered state left at least one finding conditional. */
  readonly unknownFields: readonly string[];
};

function findingKind(rule: EngineRule): FindingKind {
  // A classification rule persists as a note finding, keeping its rule id for provenance (#73).
  return rule.kind === "classification" ? "note" : rule.kind;
}

function resolveDisposition(rule: EngineRule, result: Tristate): Disposition {
  const published = rule.publishedDisposition ?? DEFAULT_DISPOSITION_BY_RULE_KIND[rule.kind];
  // An unknown-triggered finding is never definitive; weaker dispositions already say
  // what they mean and are left alone (proposals §2).
  return result === "unknown" && published === "required" ? UNKNOWN_TRIGGER_DISPOSITION : published;
}

function ruleNotes(rule: EngineRule): string[] {
  const isResearchRequired =
    rule.deadline?.type === "research_required" || rule.verificationStatus === "RESEARCH_REQUIRED";
  return isResearchRequired ? [...rule.notes, CONFIRM_WITH_AGENCY] : [...rule.notes];
}

function ruleSources(rule: EngineRule): FindingSource[] {
  return rule.source === null
    ? []
    : [{ ruleId: rule.id, citation: rule.source.citation, urls: rule.source.urls }];
}

function buildFinding(
  rule: EngineRule,
  result: Tristate,
  triggeredBy: readonly TriggeredBy[],
  context: DeadlineContext,
): Finding {
  const dated = computeDeadline(rule.deadline, context);
  return {
    ruleIds: [rule.id],
    kind: findingKind(rule),
    disposition: resolveDisposition(rule, result),
    name: rule.name,
    agency: rule.agency,
    deadline: rule.deadline,
    deadlineDisplay: dated.deadlineDisplay,
    latestApplyDate: dated.latestApplyDate,
    // Dependency sequencing (Parks → NYPD) is F-102's lane; nyc.v2.1 publishes no
    // machine-readable link from the dependency rule to the finding it gates.
    applyAfterDate: null,
    deadlineStatus: dated.deadlineStatus,
    slackDays: dated.slackDays,
    feeDisplay: rule.feeDisplay,
    portalName: rule.portalName,
    portalUrl: rule.portalUrl,
    notes: ruleNotes(rule),
    noteText: rule.noteText,
    deadlineUnknownFields: dated.unknownFields,
    // An OFFICIAL_CONFLICT rule renders both readings and every source; it never resolves silently.
    conflictText: rule.verificationStatus === "OFFICIAL_CONFLICT" ? rule.noteText : null,
    sources: ruleSources(rule),
    verificationStatus: rule.verificationStatus,
    triggeredBy,
  };
}

function mergeFindings(first: Finding, second: Finding): Finding {
  return {
    ...first,
    ruleIds: [...first.ruleIds, ...second.ruleIds],
    notes: [...first.notes, ...second.notes],
    sources: [...first.sources, ...second.sources],
    triggeredBy: [...first.triggeredBy, ...second.triggeredBy],
    deadlineUnknownFields: [...first.deadlineUnknownFields, ...second.deadlineUnknownFields],
    noteText: first.noteText ?? second.noteText,
    conflictText: first.conflictText ?? second.conflictText,
  };
}

/** Findings sharing a dedupe key merge deterministically, retaining every contributing rule and source. */
function dedupe(findings: readonly { finding: Finding; dedupeKey: string | null }[]): Finding[] {
  const merged: Finding[] = [];
  const positionByKey = new Map<string, number>();
  for (const { finding, dedupeKey } of findings) {
    const existing = dedupeKey === null ? undefined : positionByKey.get(dedupeKey);
    if (existing === undefined) {
      if (dedupeKey !== null) positionByKey.set(dedupeKey, merged.length);
      merged.push(finding);
      continue;
    }
    merged[existing] = mergeFindings(merged[existing] as Finding, finding);
  }
  return merged;
}

export function resolveFindings(
  intake: EventIntake,
  ruleset: EngineRuleset,
  context: PlanContext,
): ResolvedFindings {
  const scope = createScopeResolver(intake, ruleset);
  const deadlineContext: DeadlineContext = { ...context, scope };
  const trace: EvaluationTraceEntry[] = [];
  const triggered: { finding: Finding; dedupeKey: string | null }[] = [];
  const unknownFields = new Set<string>();

  for (const rule of ruleset.rules) {
    const evaluation = evaluateTrigger(rule.trigger, intake, scope, rule.id);
    trace.push({ ruleId: rule.id, result: evaluation.result });
    if (evaluation.result === "false") continue;
    for (const field of evaluation.unknownFields) unknownFields.add(field);
    const finding = buildFinding(rule, evaluation.result, evaluation.triggeredBy, deadlineContext);
    // An unknown that surfaces while dating a finding is as material as one from its trigger.
    for (const field of finding.deadlineUnknownFields) unknownFields.add(field);
    triggered.push({ finding, dedupeKey: rule.dedupeKey });
  }

  return { findings: dedupe(triggered), trace, unknownFields: [...unknownFields] };
}
