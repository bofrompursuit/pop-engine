// Shared engine contracts (ARCHITECTURE.md "Rules Engine"). Both apps import these;
// nobody redefines intake, finding, or verdict types locally (AGENTS.md "Shared contracts").

/** Intake keys are the ruleset's own `intake_fields` names, so triggers resolve without a mapping table. */
export type IntakeValue = string | number | boolean | readonly string[] | null;

/**
 * The evaluated intake. A key that is absent or `null` means "asked, not answered"
 * (ARCHITECTURE: a null numeric on a selected structure evaluates unknown, not false);
 * a field the registry's `asked_when` does not scope in is never material, whatever it holds.
 */
export type EventIntake = Readonly<Record<string, IntakeValue>>;

export type Tristate = "true" | "false" | "unknown";

export type ConditionOperator = "eq" | "in" | "gt" | "gte" | "bool" | "contains" | "contains_any";

export type Condition = {
  readonly field: string;
  readonly op: ConditionOperator;
  readonly value: unknown;
};

export type TriggerNode =
  Condition | { readonly all: readonly TriggerNode[] } | { readonly any: readonly TriggerNode[] };

export type Deadline =
  | {
      readonly type: "published_minimum";
      readonly calendarDays: number;
      readonly display: string | null;
    }
  | {
      readonly type: "published_minimum_by_level";
      readonly levels: Readonly<
        Record<string, { readonly calendarDays: number; readonly multiBlockDays: number | null }>
      >;
      readonly unknownLevelBehavior: string | null;
    }
  | {
      readonly type: "composite";
      readonly hardFloorDays: number;
      readonly processingRangeDays: readonly [number, number];
      readonly display: string | null;
    }
  | {
      readonly type: "business_days_minimum";
      readonly businessDays: number;
      readonly display: string | null;
    }
  | { readonly type: "before_issuance"; readonly display: string | null }
  | { readonly type: "research_required"; readonly display: string | null };

export type VerificationStatus =
  "SOURCE_CONFIRMED" | "OFFICIAL_CONFLICT" | "RESEARCH_REQUIRED" | "COVERAGE_GAP" | "VERIFIED";

/** Rule kinds as published. `classification` is a rule role, never a persisted finding kind (#73). */
export type RuleKind =
  | "permit"
  | "insurance"
  | "notification"
  | "registration"
  | "eligibility"
  | "prohibition"
  | "dependency"
  | "classification"
  | "advisory"
  | "note";

export type FindingKind = Exclude<RuleKind, "classification">;

export type Disposition =
  "required" | "may_be_required" | "prohibited_or_ineligible" | "advisory" | "no_new_requirement";

export type DeadlineStatus =
  | "on_track"
  | "deadline_approaching"
  | "published_deadline_missed"
  | "not_calculable"
  | "not_applicable";

export type Verdict = "FEASIBLE" | "FEASIBLE_AT_RISK" | "CONDITIONAL" | "INFEASIBLE";

export type RuleSource = { readonly citation: string; readonly urls: readonly string[] };

export type IntakeFieldDefinition = {
  readonly field: string;
  readonly type: string;
  readonly values: readonly string[] | null;
  readonly askedWhen: string | null;
  readonly nullable: boolean;
};

export type EngineRule = {
  readonly id: string;
  readonly kind: RuleKind;
  readonly trigger: TriggerNode;
  readonly name: string | null;
  readonly agency: string | null;
  readonly publishedDisposition: Disposition | null;
  readonly deadline: Deadline | null;
  readonly feeDisplay: string | null;
  readonly portalName: string | null;
  readonly portalUrl: string | null;
  readonly noteText: string | null;
  readonly notes: readonly string[];
  readonly dedupeKey: string | null;
  readonly verificationStatus: VerificationStatus;
  readonly verificationQualification: string | null;
  readonly source: RuleSource | null;
};

export type EngineRuleset = {
  readonly rulesetVersion: string;
  readonly snapshotDate: string;
  readonly slackWarningDays: number;
  readonly calendarId: string;
  readonly intakeFields: readonly IntakeFieldDefinition[];
  /** Published `rules` followed by `advisories`, in file order — the engine's evaluation order. */
  readonly rules: readonly EngineRule[];
};

/** The pinned holiday calendar (AD-11). Injected; the engine never derives holidays itself. */
export type HolidayCalendar = { readonly id: string; readonly holidays: readonly string[] };

export type TriggeredBy = { readonly field: string; readonly value: IntakeValue };

export type FindingSource = {
  readonly ruleId: string;
  readonly citation: string;
  readonly urls: readonly string[];
};

export type Finding = {
  readonly ruleIds: readonly string[];
  readonly kind: FindingKind;
  readonly disposition: Disposition;
  readonly name: string | null;
  readonly agency: string | null;
  readonly deadline: Deadline | null;
  readonly deadlineDisplay: string | null;
  readonly latestApplyDate: string | null;
  readonly applyAfterDate: string | null;
  readonly deadlineStatus: DeadlineStatus;
  readonly slackDays: number | null;
  readonly feeDisplay: string | null;
  readonly portalName: string | null;
  readonly portalUrl: string | null;
  readonly notes: readonly string[];
  /** The rule's published note text, verbatim — carries eligibility rescope guidance and scope caveats. */
  readonly noteText: string | null;
  /** Intake fields that stopped this finding's deadline from resolving (e.g. an unknown plaza level). */
  readonly deadlineUnknownFields: readonly string[];
  /** Both readings of an OFFICIAL_CONFLICT rule, verbatim; null otherwise. */
  readonly conflictText: string | null;
  readonly sources: readonly FindingSource[];
  readonly verificationStatus: VerificationStatus;
  readonly triggeredBy: readonly TriggeredBy[];
};

export type BranchOutcome = {
  readonly value: string;
  readonly verdict: Verdict;
  readonly reason: string;
};

export type MissingFact = { readonly field: string; readonly branches: readonly BranchOutcome[] };

export type RescopeSuggestion = {
  readonly change: { readonly field: string; readonly value: string };
  readonly reevaluatedVerdict: Verdict;
  readonly droppedRuleIds: readonly string[];
};

export type EvaluationTraceEntry = { readonly ruleId: string; readonly result: Tristate };

export type VerdictDetail = {
  readonly blockingFinding: {
    readonly ruleIds: readonly string[];
    readonly name: string | null;
  } | null;
  readonly missedRuleIds: readonly string[];
  readonly minSlackDays: number | null;
  readonly missingFacts: readonly MissingFact[];
  readonly rescopeSuggestions: readonly RescopeSuggestion[];
  readonly trace: readonly EvaluationTraceEntry[];
};

export type PermitPlan = {
  readonly rulesetVersion: string;
  readonly today: string;
  readonly calendarId: string;
  readonly findings: readonly Finding[];
  readonly verdict: Verdict;
  readonly verdictDetail: VerdictDetail;
};

/** Rule evaluation never degrades to "no requirement": failures throw this instead (AC 5). */
export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationError";
  }
}
