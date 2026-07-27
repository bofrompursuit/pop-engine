import { Router, type Request, type Response } from "express";
import type { Pool, QueryResult, QueryResultRow } from "pg";

// F-402 live ops dashboard stats (ARCHITECTURE.md API Surface).
// Polled ~5s from the organizer dashboard. Counts are check-ins (arrivals) only —
// there is no exit tracking in MVP (F-410), so presence claims are unsupported.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StatsDependencies = {
  database: Pool;
};

export type EventStats = {
  checkins_total: number;
  rsvps_total: number;
  capacity: number | null;
  checkins_last_10min: number;
};

type Queryable = {
  query<Row extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
};

type StatsResult =
  | { status: 200; body: EventStats }
  | { status: 400 | 404; body: { error: string } };

const asCount = (value: string | number | null | undefined): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Check-in and RSVP totals for one event, plus optional confirmed capacity.
 * `rsvps_total` is confirmed RSVPs only (same definition as the guest list).
 * `checkins_last_10min` uses the database clock so polling clients stay consistent.
 */
export async function readEventStats(database: Queryable, eventId: string): Promise<StatsResult> {
  if (!UUID.test(eventId)) {
    return { status: 400, body: { error: "That event link is not valid." } };
  }

  const { rows: eventRows } = await database.query<{ capacity: number | null }>(
    "SELECT capacity FROM events WHERE id = $1",
    [eventId],
  );
  if (eventRows[0] === undefined) {
    return { status: 404, body: { error: "That event was not found." } };
  }

  const [{ rows: checkinRows }, { rows: recentRows }, { rows: rsvpRows }] = await Promise.all([
    database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM checkins WHERE event_id = $1",
      [eventId],
    ),
    database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM checkins
       WHERE event_id = $1 AND checked_in_at >= now() - interval '10 minutes'`,
      [eventId],
    ),
    database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM rsvps
       WHERE event_id = $1 AND status = 'confirmed'`,
      [eventId],
    ),
  ]);

  return {
    status: 200,
    body: {
      checkins_total: asCount(checkinRows[0]?.count),
      rsvps_total: asCount(rsvpRows[0]?.count),
      capacity: eventRows[0].capacity,
      checkins_last_10min: asCount(recentRows[0]?.count),
    },
  };
}

const handle =
  (route: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: (error?: unknown) => void): void => {
    route(req, res).catch(next);
  };

export function createStatsRouter(dependencies: StatsDependencies): Router {
  const { database } = dependencies;
  const router = Router();

  router.get(
    "/events/:id/stats",
    handle(async (req, res) => {
      const result = await readEventStats(database, req.params.id ?? "");
      res.status(result.status).json(result.body);
    }),
  );

  return router;
}
