// F-202 compliance checklist + document uploads (ARCHITECTURE.md API Surface).
//
// The checklist is the execution view of a plan: one trackable row per permit/insurance line
// of the latest plan, each still linked to the plan item it came from, so rule, deadline,
// citation and portal travel with the work (spec AC 1).
//
// Plans are immutable snapshots (AD-7), so a rescope produces a NEW plan rather than editing
// the old one. Supersession is therefore a relationship between two plans, not a flag on
// either: this file computes it by comparing the requirement identities in the latest plan
// with the ones the checklist already tracks, and returns the answer as explicit fields
// (`planChanged`, `inLatestPlan`) so a client renders rather than re-derives it. Nothing is
// ever deleted or rewritten (spec AC 6).

import { randomUUID } from "node:crypto";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import type {
  Disposition,
  DeadlineStatus,
  FindingKind,
  VerificationStatus,
} from "@pop-engine/engine";
import { calendarDateFrom } from "./plan";
import { DocumentStorageError, type DocumentStorage } from "./storage";

/**
 * The statuses `checklist_items.status` accepts. Kept in the same shape as `ruleset.ts`'s
 * enum constants, and checked against the live CHECK constraint by `checklist.test.ts`, so
 * this list cannot drift from the schema unnoticed (the failure mode behind issues #70/#73/#76).
 */
export const CHECKLIST_STATUSES = [
  "not_started",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
] as const;

export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

const isChecklistStatus = (value: unknown): value is ChecklistStatus =>
  typeof value === "string" && (CHECKLIST_STATUSES as readonly string[]).includes(value);

/**
 * Only permit and insurance lines become trackable tasks; every other finding kind renders as
 * read-only context (spec: "one per permit/insurance plan item; advisories render as read-only
 * context, not trackable tasks"). Kinds themselves come from the engine, never a local copy.
 */
const TRACKABLE_FINDING_KINDS: ReadonlySet<FindingKind> = new Set<FindingKind>([
  "permit",
  "insurance",
]);

/** Spec AC 3: PDF/PNG/JPG up to 10 MB. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * The accepted upload types, each with the byte prefix its format is required to start with.
 * A `Content-Type` header is a claim by the caller, so the bytes are checked against it: an
 * executable renamed and announced as a PDF must not reach the bucket.
 */
const DOCUMENT_TYPES = {
  "application/pdf": { extension: "pdf", signature: [0x25, 0x50, 0x44, 0x46] },
  "image/png": { extension: "png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  "image/jpeg": { extension: "jpg", signature: [0xff, 0xd8, 0xff] },
} as const satisfies Record<string, { extension: string; signature: readonly number[] }>;

type DocumentContentType = keyof typeof DOCUMENT_TYPES;

const DOCUMENT_CONTENT_TYPES = Object.keys(DOCUMENT_TYPES) as DocumentContentType[];

/**
 * Long enough for a browser to follow the redirect and download, short enough that a URL that
 * leaks (chat history, a proxy log) is dead by the time anyone reuses it. Not a regulatory
 * value; an engineering one.
 */
const DOWNLOAD_URL_TTL_SECONDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChecklistDependencies = {
  database: Pool;
  storage: DocumentStorage;
};

type Queryable = {
  query<Row extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
};

/**
 * A requirement's identity across plans. A regenerated plan writes new plan-item rows with new
 * uuids, so the stable identity of "the same requirement" is its contributing rule ids — the
 * same key `plan.ts` uses to zip findings back onto stored items.
 */
const requirementKey = (ruleIds: readonly string[]): string => ruleIds.join(",");

type PlanItemRow = {
  id: string;
  rule_ids: string[];
  permit_name: string | null;
  agency: string | null;
  kind: FindingKind;
  disposition: Disposition;
  latest_apply_date: Date | string | null;
  apply_after_date: Date | string | null;
  deadline_status: DeadlineStatus;
  verification_status: VerificationStatus;
  fee_display: string | null;
  portal_name: string | null;
  portal_url: string | null;
};

const PLAN_ITEM_COLUMNS = `id, rule_ids, permit_name, agency, kind, disposition, latest_apply_date,
   apply_after_date, deadline_status, verification_status, fee_display, portal_name, portal_url`;

/**
 * Plan items carry uuid primary keys, so the table has no stable order of its own (F-201 hit
 * the same wall reading plans back). The soonest published filing date first is both stable and
 * the order the work actually happens in; the trailing keys break ties for undated lines.
 */
const PLAN_ITEM_ORDER = `latest_apply_date NULLS LAST, permit_name, rule_ids`;

type ChecklistRow = PlanItemRow & {
  checklist_item_id: string;
  plan_item_id: string;
  status: ChecklistStatus;
  notes: string | null;
  updated_at: Date;
};

type DocumentRow = {
  id: string;
  checklist_item_id: string;
  filename: string;
  content_type: string;
  size_bytes: string;
  uploaded_at: Date;
};

const isoDate = (value: Date | string | null): string | null =>
  value === null ? null : calendarDateFrom(value);

/**
 * The plan context a checklist row renders: deadline, agency, portal, verification badge.
 * Spec AC 5 puts the dates where the work happens, so they ride on every item.
 */
const planContext = (item: PlanItemRow) => ({
  ruleIds: item.rule_ids,
  permitName: item.permit_name,
  agency: item.agency,
  kind: item.kind,
  disposition: item.disposition,
  latestApplyDate: isoDate(item.latest_apply_date),
  applyAfterDate: isoDate(item.apply_after_date),
  deadlineStatus: item.deadline_status,
  verificationStatus: item.verification_status,
  feeDisplay: item.fee_display,
  portalName: item.portal_name,
  portalUrl: item.portal_url,
});

async function latestPlanId(database: Queryable, eventId: string): Promise<string | null> {
  const { rows } = await database.query<{ id: string }>(
    `SELECT id FROM permit_plans WHERE event_id = $1 ORDER BY generated_at DESC, id DESC LIMIT 1`,
    [eventId],
  );
  return rows[0]?.id ?? null;
}

async function planItems(database: Queryable, planId: string): Promise<PlanItemRow[]> {
  const { rows } = await database.query<PlanItemRow>(
    `SELECT ${PLAN_ITEM_COLUMNS} FROM permit_plan_items WHERE plan_id = $1
      ORDER BY ${PLAN_ITEM_ORDER}`,
    [planId],
  );
  return rows;
}

/**
 * Every checklist row of the event, oldest plan first, then by filing date within a plan. That
 * order is also the display order the spec asks for: rows created from a later plan land after
 * the ones already being worked, which is what "new items appended" means (AC 6).
 */
async function checklistRows(database: Queryable, eventId: string): Promise<ChecklistRow[]> {
  const { rows } = await database.query<ChecklistRow>(
    `SELECT checklist.id AS checklist_item_id, checklist.plan_item_id, checklist.status,
            checklist.notes, checklist.updated_at,
            ${PLAN_ITEM_COLUMNS.split(",")
              .map((column) => `item.${column.trim()}`)
              .join(", ")}
       FROM checklist_items AS checklist
       JOIN permit_plan_items AS item ON item.id = checklist.plan_item_id
       JOIN permit_plans AS plan ON plan.id = item.plan_id
      WHERE plan.event_id = $1
      ORDER BY plan.generated_at, ${PLAN_ITEM_ORDER.split(", ")
        .map((key) => `item.${key}`)
        .join(", ")}`,
    [eventId],
  );
  return rows;
}

async function documentsFor(
  database: Queryable,
  checklistItemIds: readonly string[],
): Promise<Map<string, DocumentRow[]>> {
  const byItem = new Map<string, DocumentRow[]>();
  if (checklistItemIds.length === 0) return byItem;
  const { rows } = await database.query<DocumentRow>(
    `SELECT id, checklist_item_id, filename, content_type, size_bytes, uploaded_at
       FROM documents WHERE checklist_item_id = ANY($1) ORDER BY uploaded_at, id`,
    [checklistItemIds],
  );
  for (const row of rows) {
    const existing = byItem.get(row.checklist_item_id);
    if (existing === undefined) byItem.set(row.checklist_item_id, [row]);
    else existing.push(row);
  }
  return byItem;
}

const documentView = (row: DocumentRow) => ({
  id: row.id,
  filename: row.filename,
  contentType: row.content_type,
  // bigint arrives as a string; a document size fits a number long before it loses precision.
  sizeBytes: Number(row.size_bytes),
  uploadedAt: row.uploaded_at.toISOString(),
});

/**
 * The whole checklist for an event: its items with live plan context, the read-only lines of
 * the latest plan, and whether the plan the checklist was built from has been superseded.
 */
async function checklistView(database: Queryable, eventId: string, planId: string) {
  const items = await checklistRows(database, eventId);
  const latestItems = await planItems(database, planId);
  const documents = await documentsFor(
    database,
    items.map((item) => item.checklist_item_id),
  );

  const latestByKey = new Map(latestItems.map((item) => [requirementKey(item.rule_ids), item]));
  const trackedKeys = new Set(items.map((item) => requirementKey(item.rule_ids)));

  const view = items.map((item) => {
    const key = requirementKey(item.rule_ids);
    const current = latestByKey.get(key);
    return {
      id: item.checklist_item_id,
      planItemId: item.plan_item_id,
      status: item.status,
      notes: item.notes,
      updatedAt: item.updated_at.toISOString(),
      // A requirement the latest plan no longer raises is struck through, never deleted (AC 6).
      inLatestPlan: current !== undefined,
      // Deadlines come from the latest plan while the requirement still stands: the plan is
      // recalculated, not patched (PRD principle 6). A dropped requirement keeps the dates of
      // the last plan that raised it, which is the honest last-known state.
      ...planContext(current ?? item),
      documents: (documents.get(item.checklist_item_id) ?? []).map(documentView),
    };
  });

  const trackable = latestItems.filter((item) => TRACKABLE_FINDING_KINDS.has(item.kind));
  const statusRollup = Object.fromEntries(
    CHECKLIST_STATUSES.map((status) => [
      status,
      view.filter((item) => item.inLatestPlan && item.status === status).length,
    ]),
  );

  return {
    eventId,
    planId,
    // Either the latest plan raises a requirement nothing tracks yet, or the checklist tracks
    // one the latest plan dropped. Both mean "plan has changed; review items" (AC 6).
    planChanged:
      view.some((item) => !item.inLatestPlan) ||
      trackable.some((item) => !trackedKeys.has(requirementKey(item.rule_ids))),
    statusRollup,
    items: view,
    // Advisories, notifications, prohibitions and notes: shown for context, not tracked.
    contextItems: latestItems
      .filter((item) => !TRACKABLE_FINDING_KINDS.has(item.kind))
      .map(planContext),
  };
}

/** Materialize the missing rows, returning how many were created. Idempotent by construction. */
async function materialize(client: PoolClient, eventId: string, planId: string): Promise<number> {
  const tracked = new Set(
    (await checklistRows(client, eventId)).map((item) => requirementKey(item.rule_ids)),
  );
  const missing = (await planItems(client, planId)).filter(
    (item) => TRACKABLE_FINDING_KINDS.has(item.kind) && !tracked.has(requirementKey(item.rule_ids)),
  );
  for (const item of missing) {
    await client.query(
      `INSERT INTO checklist_items (id, plan_item_id) VALUES ($1, $2)
         ON CONFLICT (plan_item_id) DO NOTHING`,
      [randomUUID(), item.id],
    );
  }
  return missing.length;
}

const notFound = (res: Response, message: string): void => {
  res.status(404).json({ error: message });
};

/** A malformed id must never reach `WHERE id = $1`: Postgres 22P02 would surface as driver text. */
function rejectMalformedId(id: string, res: Response, label: string): boolean {
  if (UUID.test(id)) return false;
  res.status(400).json({ error: `${label} must be a uuid` });
  return true;
}

/** Only our own messages are safe to echo; anything else could carry driver or SDK detail. */
function respondWithFailure(res: Response, error: unknown, summary: string): void {
  if (error instanceof DocumentStorageError) {
    // The item keeps its state and no metadata row was written, so retrying is safe (spec edge case).
    res.status(503).json({ error: error.message, retryable: true });
    return;
  }
  console.error(summary, error);
  res.status(500).json({ error: summary });
}

const handle =
  (route: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    route(req, res).catch(next);
  };

/**
 * A display name only. The client's filename is untrusted: it is reduced to its last path
 * segment and a conservative character set, and it never contributes to the storage key.
 */
function displayFilename(supplied: string | undefined, extension: string): string {
  const lastSegment = (supplied ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = lastSegment
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned === "" ? `document.${extension}` : cleaned;
}

const startsWithSignature = (body: Buffer, signature: readonly number[]): boolean =>
  body.length >= signature.length && signature.every((byte, index) => body[index] === byte);

export function createChecklistRouter(dependencies: ChecklistDependencies): Router {
  const { database, storage } = dependencies;
  const router = Router();

  router.post(
    "/events/:id/checklist",
    handle(async (req, res) => {
      const eventId = req.params.id ?? "";
      if (rejectMalformedId(eventId, res, "event id")) return;

      // The event row is locked for the decision so two clicks cannot both find the checklist
      // missing and both materialize it. The UNIQUE plan_item_id backs that up.
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<{ id: string }>(
          "SELECT id FROM events WHERE id = $1 FOR UPDATE",
          [eventId],
        );
        if (rows[0] === undefined) {
          await client.query("ROLLBACK");
          notFound(res, `event ${eventId} not found`);
          return;
        }
        const planId = await latestPlanId(client, eventId);
        if (planId === null) {
          await client.query("ROLLBACK");
          notFound(res, `no plan generated for event ${eventId}`);
          return;
        }
        const created = await materialize(client, eventId, planId);
        const view = await checklistView(client, eventId, planId);
        await client.query("COMMIT");
        // A second call creates nothing and returns the checklist that already exists.
        res.status(created > 0 ? 201 : 200).json(view);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }),
  );

  router.get(
    "/events/:id/checklist",
    handle(async (req, res) => {
      const eventId = req.params.id ?? "";
      if (rejectMalformedId(eventId, res, "event id")) return;
      const planId = await latestPlanId(database, eventId);
      if (planId === null) {
        notFound(res, `no plan generated for event ${eventId}`);
        return;
      }
      res.json(await checklistView(database, eventId, planId));
    }),
  );

  router.patch(
    "/checklist-items/:id",
    handle(async (req, res) => {
      const id = req.params.id ?? "";
      if (rejectMalformedId(id, res, "checklist item id")) return;

      const body: unknown = req.body;
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        res.status(400).json({ error: "body must be a JSON object" });
        return;
      }
      const { status, notes } = body as { status?: unknown; notes?: unknown };
      // Every transition is allowed — agencies are messy (AC 2) — so only the value is checked.
      if (status !== undefined && !isChecklistStatus(status)) {
        res.status(400).json({ error: `status must be one of ${CHECKLIST_STATUSES.join(", ")}` });
        return;
      }
      if (notes !== undefined && notes !== null && typeof notes !== "string") {
        res.status(400).json({ error: "notes must be a string or null" });
        return;
      }
      if (status === undefined && notes === undefined) {
        res.status(400).json({ error: "nothing to update: send status, notes, or both" });
        return;
      }

      const { rows } = await database.query<{
        id: string;
        plan_item_id: string;
        status: ChecklistStatus;
        notes: string | null;
        updated_at: Date;
      }>(
        `UPDATE checklist_items
            SET status = COALESCE($2, status),
                notes = CASE WHEN $3::boolean THEN $4 ELSE notes END,
                updated_at = current_timestamp
          WHERE id = $1
          RETURNING id, plan_item_id, status, notes, updated_at`,
        [id, status ?? null, notes !== undefined, notes ?? null],
      );
      const updated = rows[0];
      if (updated === undefined) {
        notFound(res, `checklist item ${id} not found`);
        return;
      }
      res.json({
        id: updated.id,
        planItemId: updated.plan_item_id,
        status: updated.status,
        notes: updated.notes,
        updatedAt: updated.updated_at.toISOString(),
      });
    }),
  );

  router.post(
    "/checklist-items/:id/documents",
    express.raw({ type: DOCUMENT_CONTENT_TYPES, limit: MAX_DOCUMENT_BYTES }),
    handle(async (req, res) => {
      const checklistItemId = req.params.id ?? "";
      if (rejectMalformedId(checklistItemId, res, "checklist item id")) return;

      const contentType = (req.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
      const accepted = DOCUMENT_TYPES[contentType as DocumentContentType] as
        (typeof DOCUMENT_TYPES)[DocumentContentType] | undefined;
      const body: unknown = req.body;
      if (accepted === undefined || !Buffer.isBuffer(body)) {
        res
          .status(415)
          .json({ error: `content type must be one of ${DOCUMENT_CONTENT_TYPES.join(", ")}` });
        return;
      }
      if (body.byteLength === 0) {
        res.status(400).json({ error: "document body is empty" });
        return;
      }
      if (!startsWithSignature(body, accepted.signature)) {
        res.status(400).json({ error: `document contents are not a valid ${contentType} file` });
        return;
      }

      const { rows } = await database.query<{ id: string }>(
        "SELECT id FROM checklist_items WHERE id = $1",
        [checklistItemId],
      );
      if (rows[0] === undefined) {
        notFound(res, `checklist item ${checklistItemId} not found`);
        return;
      }

      // The key is generated, never derived from the filename: a caller cannot choose where
      // its bytes land or overwrite another item's document.
      const storageKey = `checklist-items/${checklistItemId}/${randomUUID()}.${accepted.extension}`;
      // Storage first, metadata second: a failed upload leaves no row pointing at bytes that
      // are not there (spec edge case), and the client can simply retry.
      await storage.put(storageKey, body, contentType);

      const documentId = randomUUID();
      const filename = displayFilename(req.get("x-filename"), accepted.extension);
      const { rows: created } = await database.query<DocumentRow>(
        `INSERT INTO documents (id, checklist_item_id, filename, content_type, size_bytes, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, checklist_item_id, filename, content_type, size_bytes, uploaded_at`,
        [documentId, checklistItemId, filename, contentType, body.byteLength, storageKey],
      );
      res.status(201).json(documentView(created[0] as DocumentRow));
    }),
  );

  router.get(
    "/documents/:id/url",
    handle(async (req, res) => {
      const documentId = req.params.id ?? "";
      if (rejectMalformedId(documentId, res, "document id")) return;
      const { rows } = await database.query<{ storage_key: string; filename: string }>(
        "SELECT storage_key, filename FROM documents WHERE id = $1",
        [documentId],
      );
      const document = rows[0];
      if (document === undefined) {
        notFound(res, `document ${documentId} not found`);
        return;
      }
      res.json({
        url: await storage.signedDownloadUrl(document.storage_key, DOWNLOAD_URL_TTL_SECONDS),
        filename: document.filename,
        expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
      });
    }),
  );

  // Router-level failures: an oversized body is rejected by the body parser before the route
  // runs, and it must answer in JSON like every other error rather than as an HTML stack.
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { type?: string }).type === "entity.too.large"
    ) {
      res.status(413).json({ error: `document must be ${MAX_DOCUMENT_BYTES} bytes or smaller` });
      return;
    }
    respondWithFailure(res, error, "checklist request failed");
  });

  return router;
}
