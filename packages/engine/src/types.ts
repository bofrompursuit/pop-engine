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

/**
 * The published caveat that qualifies a deadline's number, which any deadline type can carry.
 */
type DeadlineBound = {
  readonly qualification: string | null;
};

/**
 * Whether a published day count is an inclusive or exclusive bound, on the deadline types that
 * express a single filing bound and date it by counting back from the event.
 *
 * `inclusive` (the default when a rule declares nothing) is "at least N days before" — filing on
 * day N is valid. `exclusive` is "earlier than N days before" — day N is already too late, so the
 * last valid filing day is one unit earlier. The difference decides whether an event exactly N
 * days out is at risk or already missed, so it is published data rather than something the engine
 * infers from the qualification prose.
 *
 * `composite` deliberately has no boundary. Its hard floor is a cliff with its own semantics — day
 * N is already missed — so labelling it `inclusive`, whose contract is that day N is valid, would
 * publish a claim the engine itself contradicts. Whether that cliff reading is right for
 * PARKS-EVENT-001 is an open artifact question (issue #89), untouched here.
 */
export type DeadlineBoundary = "inclusive" | "exclusive";

type BoundedDeadline = DeadlineBound & {
  readonly boundary: DeadlineBoundary;
};

export type Deadline =
  | ({
      readonly type: "published_minimum";
      readonly calendarDays: number;
      readonly display: string | null;
    } & BoundedDeadline)
  | ({
      readonly type: "published_minimum_by_level";
      readonly levels: Readonly<
        Record<string, { readonly calendarDays: number; readonly multiBlockDays: number | null }>
      >;
      readonly unknownLevelBehavior: string | null;
    } & BoundedDeadline)
  | ({
      readonly type: "composite";
      readonly hardFloorDays: number;
      readonly processingRangeDays: readonly [number, number];
      readonly display: string | null;
    } & DeadlineBound)
  | ({
      readonly type: "business_days_minimum";
      readonly businessDays: number;
      readonly display: string | null;
    } & BoundedDeadline)
  | ({ readonly type: "before_issuance"; readonly display: string | null } & DeadlineBound)
  | ({
      readonly type: "research_required";
      readonly display: string | null;
    } & DeadlineBound);

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
  /** The parsed form of `askedWhen`, validated when the ruleset loads; null when unscoped. */
  readonly askedWhenClauses: readonly AskedWhenClause[] | null;
  readonly nullable: boolean;
};

export type AskedWhenClause =
  | { readonly kind: "in"; readonly field: string; readonly values: readonly string[] }
  | {
      readonly kind: "compare";
      readonly field: string;
      readonly op: "=" | "!=";
      /** Typed to the field it compares: a boolean field yields a boolean, a numeric one a number. */
      readonly value: string | number | boolean;
    }
  | { readonly kind: "at_least"; readonly field: string; readonly threshold: number }
  | { readonly kind: "truthy"; readonly field: string }
  | { readonly kind: "member"; readonly field: string; readonly member: string };

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
  readonly portalInstructions: string | null;
  readonly noteText: string | null;
  readonly notes: readonly string[];
  readonly dedupeKey: string | null;
  readonly verificationStatus: VerificationStatus;
  readonly verificationQualification: string | null;
  readonly source: RuleSource | null;
};

export type EngineRuleset = {
  readonly rulesetVersion: string;
  /** e.g. "US-NY-NYC". The api maps this to the local clock a plan's `today` is read from. */
  readonly jurisdiction: string;
  readonly snapshotDate: string;
  readonly slackWarningDays: number;
  readonly calendarId: string;
  readonly intakeFields: readonly IntakeFieldDefinition[];
  /** Published `rules` followed by `advisories`, in file order — the engine's evaluation order. */
  readonly rules: readonly EngineRule[];
};

/**
 * The pinned holiday calendar (AD-11). Injected; the engine never derives holidays itself.
 *
 * `holidays: null` means no list has been published for this calendar id — distinct from a
 * published list that happens to be empty. A business-day deadline cannot be computed without
 * one, so findings that need it render NOT_CALCULABLE rather than falling back to weekday-only
 * arithmetic, which would push the date later than it really is.
 */
export type HolidayCalendar = { readonly id: string; readonly holidays: readonly string[] | null };

/** A calendar whose holiday list has been published, so business-day math can run. */
export type PublishedHolidayCalendar = HolidayCalendar & { readonly holidays: readonly string[] };

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
  /**
   * How to file when the portal is not a URL. NYPD-SOUND-001 publishes no URL and carries the
   * precinct and form number here, so dropping it leaves the only actionable filing detail on the
   * floor and F-204 with no in-person path to render.
   */
  readonly portalInstructions: string | null;
  readonly notes: readonly string[];
  /** The rule's published note text, verbatim — carries eligibility rescope guidance and scope caveats. */
  readonly noteText: string | null;
  /** Intake fields that stopped this finding's deadline from resolving (e.g. an unknown plaza level). */
  readonly deadlineUnknownFields: readonly string[];
  /**
   * Why this finding's published deadline could not be turned into a date, when the cause is a
   * missing input rather than an unanswered question — today, only an unpublished holiday list.
   * The requirement is real and dated by the agency; it is the timeline we cannot compute, so the
   * plan stays CONDITIONAL rather than dropping the window from the arithmetic (P1-A).
   */
  readonly timelineUnresolvedReason: string | null;
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

export type MissingFact = {
  readonly field: string;
  readonly branches: readonly BranchOutcome[];
  /**
   * Set when the field cannot be enumerated into branches (a numeric answer has no declared
   * values), naming the published thresholds that decide it. The fact is still listed: a client
   * that only sees "conditional" with an empty branch table cannot tell what to ask for.
   */
  readonly thresholds: string | null;
};

export type RescopeSuggestion = {
  readonly change: { readonly field: string; readonly value: string };
  readonly reevaluatedVerdict: Verdict;
  readonly droppedRuleIds: readonly string[];
};

export type EvaluationTraceEntry = { readonly ruleId: string; readonly result: Tristate };

/** A finding whose published window exists but could not be computed from the inputs supplied. */
export type UnresolvedTimeline = { readonly ruleIds: readonly string[]; readonly reason: string };

export type VerdictDetail = {
  readonly blockingFinding: {
    readonly ruleIds: readonly string[];
    readonly name: string | null;
  } | null;
  readonly missedRuleIds: readonly string[];
  readonly minSlackDays: number | null;
  readonly missingFacts: readonly MissingFact[];
  readonly unresolvedTimelines: readonly UnresolvedTimeline[];
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
