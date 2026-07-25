import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { types, type Pool } from "pg";
import {
  intakeColumnNames,
  intakeWarnings,
  isIntakeUnchanged,
  mergeIntakeEdit,
  validateIntake,
  type IntakeAnswers,
  type IntakeContract,
  type IntakeRecord,
} from "@pop-engine/engine";

// F-101 intake endpoints (ARCHITECTURE.md API Surface): create, read, and edit the one
// event row every later module reads. All field rules come from the engine's intake
// contract, which is parsed from the published ruleset — this file only moves rows.

// Postgres returns `date` and `numeric` as driver-specific shapes: a Date in the server's
// local zone (which can shift the calendar day) and a string. Intake stores plain
// calendar dates and small decimals, so read them back as the JSON types they went in as.
const DATE_OID = 1082;
const NUMERIC_OID = 1700;
types.setTypeParser(DATE_OID, (value) => value);
types.setTypeParser(NUMERIC_OID, Number);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventsDependencies = {
  database: Pool;
  intakeContract: IntakeContract;
  /** Injected so the past-date check is testable; the engine never reads a clock. */
  today: () => string;
};

type EventRow = Record<string, unknown> & { id: string; revision_counter: number };

const quoted = (columns: readonly string[]): string =>
  columns.map((column) => `"${column}"`).join(", ");

async function readEvent(database: Pool, id: string): Promise<EventRow | null> {
  const { rows } = await database.query<EventRow>("SELECT * FROM events WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/**
 * A plan is stale once the event has been edited past the revision the plan evaluated
 * (AD-13). No plan yet is not stale.
 */
async function isPlanStale(database: Pool, event: EventRow): Promise<boolean> {
  const { rows } = await database.query<{ event_revision: number }>(
    "SELECT event_revision FROM permit_plans WHERE event_id = $1 ORDER BY generated_at DESC LIMIT 1",
    [event.id],
  );
  const latest = rows[0];
  return latest !== undefined && latest.event_revision < event.revision_counter;
}

async function respondWithEvent(
  { database, intakeContract }: EventsDependencies,
  res: Response,
  event: EventRow,
  status: number,
): Promise<void> {
  res.status(status).json({
    event,
    warnings: intakeWarnings(intakeContract, event as IntakeAnswers),
    plan_stale: await isPlanStale(database, event),
  });
}

function readSubmission(req: Request, res: Response): Record<string, unknown> | null {
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({
      errors: [{ field: "body", code: "invalid_body", message: "body must be a JSON object" }],
      warnings: [],
    });
    return null;
  }
  return body as Record<string, unknown>;
}

/** Fail the request the way Express expects, so one thrown query cannot hang a client. */
const handle =
  (route: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: (error?: unknown) => void): void => {
    route(req, res).catch(next);
  };

export function createEventsRouter(dependencies: EventsDependencies): Router {
  const { database, intakeContract, today } = dependencies;
  const columns = intakeColumnNames(intakeContract);
  const router = Router();

  const insert = async (values: IntakeRecord): Promise<EventRow> => {
    const id = randomUUID();
    const { rows } = await database.query<EventRow>(
      `INSERT INTO events (id, ${quoted(columns)})
       VALUES ($1, ${columns.map((_column, index) => `$${index + 2}`).join(", ")})
       RETURNING *`,
      [id, ...columns.map((column) => values[column] ?? null)],
    );
    return rows[0] as EventRow;
  };

  // Every edit bumps the revision counter server-side, which is what marks an existing
  // plan stale (spec #8) — plans pin the revision they evaluated rather than being patched.
  const update = async (id: string, values: IntakeRecord): Promise<EventRow> => {
    const assignments = columns.map((column, index) => `"${column}" = $${index + 2}`).join(", ");
    const { rows } = await database.query<EventRow>(
      `UPDATE events
          SET ${assignments},
              revision_counter = revision_counter + 1,
              updated_at = current_timestamp
        WHERE id = $1
        RETURNING *`,
      [id, ...columns.map((column) => values[column] ?? null)],
    );
    return rows[0] as EventRow;
  };

  router.post(
    "/events",
    handle(async (req, res) => {
      const submission = readSubmission(req, res);
      if (submission === null) return;

      const { values, errors, warnings } = validateIntake(intakeContract, submission, today());
      if (values === null) {
        res.status(400).json({ errors, warnings });
        return;
      }
      await respondWithEvent(dependencies, res, await insert(values), 201);
    }),
  );

  router.get(
    "/events/:id",
    handle(async (req, res) => {
      const id = req.params.id ?? "";
      const event = UUID.test(id) ? await readEvent(database, id) : null;
      if (event === null) {
        res.status(404).json({ error: "event not found" });
        return;
      }
      await respondWithEvent(dependencies, res, event, 200);
    }),
  );

  router.patch(
    "/events/:id",
    handle(async (req, res) => {
      const submission = readSubmission(req, res);
      if (submission === null) return;

      const id = req.params.id ?? "";
      const stored = UUID.test(id) ? await readEvent(database, id) : null;
      if (stored === null) {
        res.status(404).json({ error: "event not found" });
        return;
      }

      // The whole intake is re-validated after the edit is applied, so an edit cannot
      // leave the row in a state the intake would have refused to create. Answers the
      // edit hides are cleared by the merge, so a rescope (street event → park) saves
      // without the client having to null out every SAPO answer by hand.
      const edited = mergeIntakeEdit(intakeContract, pickIntake(stored, columns), submission);
      const { values, errors, warnings } = validateIntake(intakeContract, edited, today());
      if (values === null) {
        res.status(400).json({ errors, warnings });
        return;
      }
      // A save that changes no answer is not an edit (AD-13), so it leaves the revision
      // counter alone. Bumping it would report a plan as stale against an intake it
      // still matches exactly, forcing a regeneration that can only produce the same
      // plan. Checked here rather than in the client so it holds for every caller.
      const event = isIntakeUnchanged(intakeContract, stored, values)
        ? stored
        : await update(stored.id, values);
      await respondWithEvent(dependencies, res, event, 200);
    }),
  );

  return router;
}

function pickIntake(row: EventRow, columns: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(columns.map((column) => [column, row[column]]));
}
