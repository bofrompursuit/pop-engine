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

export type PlanResult = { ok: true; plan: PlanResponse } | { ok: false; message: string };
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

/** The plan a set of findings was generated as (`GET /api/events/:id/plan`). */
export async function loadPlan(apiBaseUrl: string, eventId: string): Promise<PlanResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/events/${eventId}/plan`, { ...CREDENTIALED });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      message: failureMessage(
        body,
        response.status === 404
          ? "No plan has been generated for this event yet."
          : `The plan could not be loaded (HTTP ${response.status}).`,
      ),
    };
  }

  const plan = asRecord(body);
  if (plan === null || typeof plan.rulesetVersion !== "string" || !Array.isArray(plan.findings)) {
    return { ok: false, message: "The API returned a plan this page cannot read." };
  }
  return { ok: true, plan: plan as unknown as PlanResponse };
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
