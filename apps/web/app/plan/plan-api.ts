// The browser's calls to the plan and rules-meta endpoints (F-206).
//
// Web and api are separate origins behind Cloudflare Access (BASELINE.md provider baseline), so
// every call sends credentials and the api answers with `Access-Control-Allow-Credentials`.

import type { Finding, Verdict, VerdictDetail } from "@pop-engine/engine";
import { CREDENTIALED } from "../intake/events-api";

/** A stored plan as `GET /api/events/:id/plan` serves it (F-201's `StoredPlan`). */
export type PlanResponse = {
  readonly id: string;
  readonly eventId: string;
  readonly eventRevision: number;
  /** The version that produced this plan, pinned at generation — never the live file's. */
  readonly rulesetVersion: string;
  /**
   * The publication date that version carried, pinned beside it (AC 4). Null on a plan generated
   * before migration 002 added the column; the banner says so rather than substituting a date.
   */
  readonly snapshotDate: string | null;
  readonly verdict: Verdict;
  /** Fills the slots the approved verdict copy leaves open (slack days, unanswered fields). */
  readonly verdictDetail: VerdictDetail;
  readonly today: string;
  readonly generatedAt: string;
  readonly findings: readonly Finding[];
};

/** What the loaded rules file says about itself, as `GET /api/rules/meta` serves it. */
export type RulesMetaResponse = {
  readonly ruleset_version: string;
  readonly snapshot_date: string;
};

export type PlanResult =
  | { ok: true; plan: PlanResponse }
  /**
   * `missing` separates "this event has no plan yet", which generating answers, from "a plan may
   * exist but could not be read", which it does not. The plan endpoint answers 404 for both a
   * missing plan and a missing event, so the caller confirms the event exists before offering to
   * create one — a 404 alone is not enough to justify writing an immutable plan row.
   */
  | { ok: false; missing: boolean; message: string };
export type RulesMetaResult =
  { ok: true; meta: RulesMetaResponse } | { ok: false; message: string };

const UNREACHABLE = "The API could not be reached.";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // A non-JSON body (a proxy error page, an Access challenge) still has a status.
    return null;
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function failureMessage(body: unknown, fallback: string): string {
  const error = asRecord(body)?.error;
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

const UNREADABLE_PLAN = "The API returned a plan this page cannot read.";

const VERDICTS: ReadonlySet<string> = new Set<Verdict>([
  "FEASIBLE",
  "FEASIBLE_AT_RISK",
  "CONDITIONAL",
  "INFEASIBLE",
]);

/**
 * `findings` being an array is not enough: the view reads `finding.ruleIds.join(...)` on every
 * element without checking it, both for the React key and for the line's own heading.
 */
const hasRuleIds = (value: unknown): boolean => Array.isArray(asRecord(value)?.ruleIds);

/**
 * A plan body the view can actually render, or null.
 *
 * The rule is one line: every field the view consumes WITHOUT first checking it is checked here.
 * Validating a subset is the defect, not a specific missing field — this checked three and the view
 * called `.slice()` on an unchecked `generatedAt`, which turned an intended "cannot read this plan"
 * message into a render failure during an api/web rollout skew.
 *
 * Three more had the same gap, and the worst of them does not crash. `eventRevision` is compared
 * against the event's current revision, and a non-number makes `current > pinned` false — so an
 * event that HAS been edited renders as current, with nothing thrown and nothing logged. That is
 * the false-currency claim this page exists to prevent. A `verdict` outside the four tokens renders
 * an empty verdict line and silently drops the at-risk buffer label, which is the same failure in
 * the other load-bearing sentence on the page.
 *
 * Where this stops: fields the view does not consume (`id`, `eventId`, `today`) are not checked,
 * because rejecting a body over a field nothing reads would refuse a plan the page can render
 * correctly. Inside a finding only `ruleIds` is checked, for the unconditional `.join()` above;
 * validating every `Finding` member would be re-implementing the engine's schema in the browser,
 * and the engine owns that contract.
 */
function readPlan(body: unknown): PlanResponse | null {
  const plan = asRecord(body);
  if (plan === null) return null;
  if (typeof plan.rulesetVersion !== "string") return null;
  // A plan that omits the field entirely is unreadable, not legacy. Only an explicit null means
  // "generated before migration 002", and that is the one case the banner may say so for; reading
  // an absent field as null would put that copy under a plumbing mismatch instead.
  if (!(typeof plan.snapshotDate === "string" || plan.snapshotDate === null)) return null;
  if (typeof plan.eventRevision !== "number") return null;
  if (typeof plan.generatedAt !== "string") return null;
  if (typeof plan.verdict !== "string" || !VERDICTS.has(plan.verdict)) return null;
  if (!Array.isArray(plan.findings) || !plan.findings.every(hasRuleIds)) return null;
  return plan as unknown as PlanResponse;
}

/** The plan a set of findings was generated as (`GET /api/events/:id/plan`). */
export async function loadPlan(apiBaseUrl: string, eventId: string): Promise<PlanResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/events/${eventId}/plan`, { ...CREDENTIALED });
  } catch {
    return { ok: false, missing: false, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      missing: response.status === 404,
      message: failureMessage(
        body,
        response.status === 404
          ? "No plan has been generated for this event yet."
          : `The plan could not be loaded (HTTP ${response.status}).`,
      ),
    };
  }

  const plan = readPlan(body);
  if (plan === null) return { ok: false, missing: false, message: UNREADABLE_PLAN };
  return { ok: true, plan };
}

/**
 * What the api's own rules file says about itself. The banner needs it to tell an organizer
 * when a plan was generated from an older ruleset than the one now published.
 */
export async function loadRulesMeta(apiBaseUrl: string): Promise<RulesMetaResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/rules/meta`, { ...CREDENTIALED });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      message: failureMessage(
        body,
        `The ruleset version could not be read (HTTP ${response.status}).`,
      ),
    };
  }

  const meta = asRecord(body);
  if (
    meta === null ||
    typeof meta.ruleset_version !== "string" ||
    typeof meta.snapshot_date !== "string"
  ) {
    return { ok: false, message: "The API returned a ruleset version this page cannot read." };
  }
  return { ok: true, meta: meta as unknown as RulesMetaResponse };
}
