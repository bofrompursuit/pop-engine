// The browser's calls to the checklist, document-upload and download-URL endpoints (F-202).
//
// Web and api are separate origins behind Cloudflare Access (BASELINE.md provider baseline), so
// every call sends credentials and the api answers with `Access-Control-Allow-Credentials`.
//
// The validation discipline is `apps/web/app/plan`'s, and its helpers are imported rather than
// copied: a consumed type carries exactly the fields this feature reads, `FieldChecks` is mapped
// over `keyof` that type, so a field cannot be read without a runtime check existing for it. The
// reason it is worth the weight here is the same one it was worth there — every field below is
// regulatory content or organizer state, and a silently-undefined one renders as an answer.

import { CHECKLIST_STATUSES } from "@pop-engine/engine";
import type {
  ChecklistStatus,
  Deadline,
  DeadlineStatus,
  Disposition,
  FindingSource,
  VerificationStatus,
} from "@pop-engine/engine";
import { CREDENTIALED } from "../intake/events-api";
import {
  arrayOf,
  asRecord,
  type FieldChecks,
  isNumber,
  isString,
  isToken,
  nullOr,
  readChecked,
  shapedLike,
  tokensOf,
} from "../plan/validated";

/** Spec AC 3. The api enforces both; these are what the file picker offers and pre-checks. */
export const ACCEPTED_DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * The plan a checklist row's displayed values came from (AC 8), read off the row rather than the
 * live rules file. The two travel together and are never split: a pinned version beside another
 * source's date is a pair that never existed (F-206 AC 4).
 */
export type SourcePlan = {
  readonly rulesetVersion: string;
  readonly snapshotDate: string | null;
};

/**
 * The only part of a `Deadline` this feature reads. Same widening as the plan view's, for the same
 * reason: the token is humanised for display, so pinning it to today's union would make the
 * validator refuse a whole checklist the moment the engine publishes a new deadline kind.
 */
export type ConsumedDeadline = {
  readonly [K in keyof Pick<Deadline, "type">]: string;
};

/**
 * The regulatory half of a checklist row: what the plan item says, carried through by the api's
 * `planContext`. Every published qualification is here rather than only the resolved values —
 * a `research_required` deadline has no date and its meaning lives entirely in the published
 * notes, and dropping those renders an unresolved requirement as a resolved one.
 */
export type PlanContext = {
  readonly ruleIds: readonly string[];
  readonly permitName: string | null;
  readonly agency: string | null;
  readonly disposition: Disposition;
  readonly deadline: ConsumedDeadline | null;
  readonly deadlineDisplay: string | null;
  readonly latestApplyDate: string | null;
  readonly applyAfterDate: string | null;
  readonly deadlineStatus: DeadlineStatus;
  readonly deadlineUnknownFields: readonly string[];
  readonly timelineUnresolvedReason: string | null;
  readonly verificationStatus: VerificationStatus;
  /** Published regulatory text. Never the organizer's `notes`, which are a different field. */
  readonly publishedNotes: readonly string[];
  readonly noteText: string | null;
  readonly conflictText: string | null;
  readonly feeDisplay: string | null;
  readonly portalName: string | null;
  readonly portalUrl: string | null;
  readonly portalInstructions: string | null;
  readonly sources: readonly FindingSource[];
  readonly sourcePlan: SourcePlan;
};

export type ChecklistDocument = {
  readonly id: string;
  readonly filename: string;
};

/** A trackable row: the organizer's state, plus the plan context it is tracking. */
export type ChecklistItem = PlanContext & {
  readonly id: string;
  readonly status: ChecklistStatus;
  readonly notes: string | null;
  /**
   * False for a requirement the latest plan no longer raises. Such a row is struck through and
   * kept (AC 6), and it is counted separately from the rollup, which is current-plan only (AC 2).
   */
  readonly inLatestPlan: boolean;
  readonly documents: readonly ChecklistDocument[];
};

/**
 * AC 2's rollup as the api counted it: current-plan rows only, one count per status. The counting
 * rule lives there and only there, so this feature reads the answer rather than recomputing it.
 */
export type StatusRollup = Readonly<Record<ChecklistStatus, number>>;

export type ChecklistResponse = {
  /** The current plan's pinned pair, for the checklist's own banner (F-206 AC 1). */
  readonly rulesetVersion: string;
  readonly snapshotDate: string | null;
  /** Whether a checklist has ever been created; the rows cannot say, because zero is a real answer. */
  readonly created: boolean;
  /** The plan has been regenerated since the organizer last reviewed the checklist (AC 6). */
  readonly planChanged: boolean;
  /** The event has been edited since even the latest plan was generated; creation is refused. */
  readonly planStale: boolean;
  readonly statusRollup: StatusRollup;
  readonly items: readonly ChecklistItem[];
  /** Advisories and notes: read-only context, never trackable tasks. */
  readonly contextItems: readonly PlanContext[];
};

export type ChecklistResult =
  | { ok: true; checklist: ChecklistResponse }
  /**
   * `noPlan` separates "this event has no plan to convert", which the plan view answers, from
   * "a checklist may exist but could not be read", which nothing on this page answers. Offering
   * creation for the second would POST against a plan whose state is unknown.
   */
  | { ok: false; noPlan: boolean; message: string };

export type ChecklistItemUpdate = {
  readonly id: string;
  readonly status: ChecklistStatus;
  readonly notes: string | null;
};

export type ItemUpdateResult =
  { ok: true; item: ChecklistItemUpdate } | { ok: false; message: string };

export type UploadResult =
  | { ok: true; document: ChecklistDocument }
  /**
   * `retryable` is the api's own flag on a storage failure: the item kept its state and no
   * metadata row was written, so the same upload can simply be sent again (spec edge case).
   */
  | { ok: false; retryable: boolean; message: string };

export type DownloadResult = { ok: true; url: string } | { ok: false; message: string };

const UNREACHABLE = "The API could not be reached.";
const UNREADABLE_CHECKLIST = "The API returned a checklist this page cannot read.";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // A non-JSON body (a proxy error page, an Access challenge) still has a status.
    return null;
  }
}

function failureMessage(body: unknown, fallback: string): string {
  const error = asRecord(body)?.error;
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const DISPOSITIONS = tokensOf<Disposition>({
  required: true,
  may_be_required: true,
  prohibited_or_ineligible: true,
  advisory: true,
  no_new_requirement: true,
});

const DEADLINE_STATUSES = tokensOf<DeadlineStatus>({
  on_track: true,
  deadline_approaching: true,
  published_deadline_missed: true,
  not_calculable: true,
  not_applicable: true,
});

const VERIFICATION_STATUSES = tokensOf<VerificationStatus>({
  SOURCE_CONFIRMED: true,
  OFFICIAL_CONFLICT: true,
  RESEARCH_REQUIRED: true,
  COVERAGE_GAP: true,
  VERIFIED: true,
});

const STATUSES = tokensOf<ChecklistStatus>({
  not_started: true,
  in_progress: true,
  submitted: true,
  approved: true,
  rejected: true,
});

const DEADLINE_CHECKS: FieldChecks<ConsumedDeadline> = { type: isString };

const SOURCE_PLAN_CHECKS: FieldChecks<SourcePlan> = {
  rulesetVersion: isString,
  // Null on a plan generated before migration 002 recorded the date its version carried.
  snapshotDate: nullOr(isString),
};

const SOURCE_CHECKS: FieldChecks<FindingSource> = {
  ruleId: isString,
  citation: isString,
  urls: arrayOf(isString),
};

const PLAN_CONTEXT_CHECKS: FieldChecks<PlanContext> = {
  ruleIds: arrayOf(isString),
  permitName: nullOr(isString),
  agency: nullOr(isString),
  disposition: isToken(DISPOSITIONS),
  deadline: nullOr(shapedLike(DEADLINE_CHECKS)),
  deadlineDisplay: nullOr(isString),
  latestApplyDate: nullOr(isString),
  applyAfterDate: nullOr(isString),
  deadlineStatus: isToken(DEADLINE_STATUSES),
  deadlineUnknownFields: arrayOf(isString),
  timelineUnresolvedReason: nullOr(isString),
  verificationStatus: isToken(VERIFICATION_STATUSES),
  publishedNotes: arrayOf(isString),
  noteText: nullOr(isString),
  conflictText: nullOr(isString),
  feeDisplay: nullOr(isString),
  portalName: nullOr(isString),
  portalUrl: nullOr(isString),
  portalInstructions: nullOr(isString),
  sources: arrayOf(shapedLike(SOURCE_CHECKS)),
  sourcePlan: shapedLike(SOURCE_PLAN_CHECKS),
};

const DOCUMENT_CHECKS: FieldChecks<ChecklistDocument> = { id: isString, filename: isString };

const ITEM_CHECKS: FieldChecks<ChecklistItem> = {
  ...PLAN_CONTEXT_CHECKS,
  id: isString,
  status: isToken(STATUSES),
  notes: nullOr(isString),
  inLatestPlan: isBoolean,
  documents: arrayOf(shapedLike(DOCUMENT_CHECKS)),
};

/**
 * One count per status, keyed off the engine's own list, so a status added upstream stops this
 * compiling rather than going uncounted on screen.
 */
const ROLLUP_CHECKS = Object.fromEntries(
  CHECKLIST_STATUSES.map((status) => [status, isNumber]),
) as FieldChecks<StatusRollup>;

const CHECKLIST_CHECKS: FieldChecks<ChecklistResponse> = {
  rulesetVersion: isString,
  snapshotDate: nullOr(isString),
  created: isBoolean,
  planChanged: isBoolean,
  planStale: isBoolean,
  statusRollup: shapedLike(ROLLUP_CHECKS),
  items: arrayOf(shapedLike(ITEM_CHECKS)),
  contextItems: arrayOf(shapedLike(PLAN_CONTEXT_CHECKS)),
};

const ITEM_UPDATE_CHECKS: FieldChecks<ChecklistItemUpdate> = {
  id: isString,
  status: isToken(STATUSES),
  notes: nullOr(isString),
};

/** The fields this feature reads off a checklist row, exposed so a test can assert coverage. */
export const CONSUMED_ITEM_FIELDS: readonly string[] = Object.keys(ITEM_CHECKS);

const readChecklist = (body: unknown): ChecklistResponse | null =>
  readChecked(CHECKLIST_CHECKS, body);

/** The event's checklist, whether or not one has been created (`GET /api/events/:id/checklist`). */
export async function loadChecklist(apiBaseUrl: string, eventId: string): Promise<ChecklistResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/events/${eventId}/checklist`, { ...CREDENTIALED });
  } catch {
    return { ok: false, noPlan: false, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      // The endpoint answers 404 only when the event has no plan to build a checklist from.
      noPlan: response.status === 404,
      message: failureMessage(
        body,
        response.status === 404
          ? "No plan has been generated for this event yet."
          : `The checklist could not be loaded (HTTP ${response.status}).`,
      ),
    };
  }

  const checklist = readChecklist(body);
  if (checklist === null) return { ok: false, noPlan: false, message: UNREADABLE_CHECKLIST };
  return { ok: true, checklist };
}

/**
 * Turn the latest plan into a checklist, and re-run the same call to review it after a
 * regeneration (AC 1 and AC 6 are one idempotent endpoint). A second call creates nothing and
 * returns the checklist that already exists, so a double click cannot duplicate anything.
 *
 * The response IS the checklist it just wrote, so it goes straight on screen rather than being
 * thrown away and asked for again.
 */
export async function createChecklist(
  apiBaseUrl: string,
  eventId: string,
): Promise<ChecklistResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/events/${eventId}/checklist`, {
      method: "POST",
      ...CREDENTIALED,
    });
  } catch {
    return { ok: false, noPlan: false, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      noPlan: response.status === 404,
      message: failureMessage(
        body,
        `The checklist could not be created (HTTP ${response.status}).`,
      ),
    };
  }

  const checklist = readChecklist(body);
  if (checklist === null) return { ok: false, noPlan: false, message: UNREADABLE_CHECKLIST };
  return { ok: true, checklist };
}

/**
 * A status change, a note, or both (`PATCH /api/checklist-items/:id`). Every transition is
 * allowed — agencies are messy (AC 2) — so nothing here refuses one.
 */
export async function updateChecklistItem(
  apiBaseUrl: string,
  itemId: string,
  changes: { status?: ChecklistStatus; notes?: string | null },
): Promise<ItemUpdateResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/checklist-items/${itemId}`, {
      method: "PATCH",
      ...CREDENTIALED,
      body: JSON.stringify(changes),
    });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      message: failureMessage(body, `The item could not be updated (HTTP ${response.status}).`),
    };
  }

  const item = readChecked(ITEM_UPDATE_CHECKS, body);
  if (item === null) {
    return { ok: false, message: "The API returned an item this page cannot read." };
  }
  return { ok: true, item };
}

/** Why this file cannot be uploaded, or null when it can (AC 3). */
export function documentRejection(file: File): string | null {
  if (!(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    return "Documents must be a PDF, PNG or JPG.";
  }
  if (file.size > MAX_DOCUMENT_BYTES) return "Documents must be 10 MB or smaller.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

/**
 * Stream one document up for an item (`POST /api/checklist-items/:id/documents`).
 *
 * The body is the file itself: the api reads the declared content type and length off the
 * request, which the browser sets from the `File`, and it never buffers the whole body. The
 * filename rides in a header because it is a display name only — the api generates the storage
 * key, so nothing a caller sends decides where the bytes land.
 */
export async function uploadDocument(
  apiBaseUrl: string,
  itemId: string,
  file: File,
): Promise<UploadResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/checklist-items/${itemId}/documents`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": file.type, "X-Filename": file.name },
      body: file,
    });
  } catch {
    // Nothing reached the api, so nothing was stored and the same upload can be sent again.
    return { ok: false, retryable: true, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      // The api flags a storage failure as retryable: the item kept its state and no metadata
      // row was written. Anything else it refused (a wrong type, an over-size body) will be
      // refused again identically, so it is not offered as a retry.
      retryable: asRecord(body)?.retryable === true,
      message: failureMessage(
        body,
        `The document could not be uploaded (HTTP ${response.status}).`,
      ),
    };
  }

  const document = readChecked(DOCUMENT_CHECKS, body);
  if (document === null) {
    // The upload succeeded — the api answered 2xx — so this is not offered as a retry: sending
    // it again would store a second copy of a document that is already there.
    return {
      ok: false,
      retryable: false,
      message: "The document was uploaded, but the API returned a response this page cannot read.",
    };
  }
  return { ok: true, document };
}

/** A short-lived signed download URL for a stored document (`GET /api/documents/:id/url`). */
export async function documentUrl(apiBaseUrl: string, documentId: string): Promise<DownloadResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/documents/${documentId}/url`, { ...CREDENTIALED });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      message: failureMessage(
        body,
        `The document link could not be read (HTTP ${response.status}).`,
      ),
    };
  }

  const url = asRecord(body)?.url;
  if (typeof url !== "string" || url.length === 0) {
    return { ok: false, message: "The API returned a download link this page cannot read." };
  }
  return { ok: true, url };
}
