import express, { type Express, type Response } from "express";
import { describeEngine } from "@pop-engine/engine";
import { EvaluationError } from "@pop-engine/engine";
import { EventNotFoundError, PlanIntegrityError, type PlanService } from "./plan";

export type AppDependencies = {
  /** Absent in the scaffold's own tests; the plan routes register only when it is supplied. */
  planService?: PlanService;
};

// The Express app factory. Kept separate from the server bootstrap (index.ts) so tests
// can drive it with supertest without opening a port.
export function createApp({ planService }: AppDependencies = {}): Express {
  const app = express();

  // The web app is served from a different origin than the api in both local dev and on
  // Railway (DEPLOY.md), so browser calls need CORS. Single allowed origin per
  // ARCHITECTURE.md; CORS is not authorization (AD-5, the gate is Cloudflare Access).
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", webOrigin);
    // Behind Cloudflare Access the web host calls the api with credentials so the
    // CF_Authorization cookie rides along; credentialed CORS requires this header and a
    // single non-wildcard origin (which `webOrigin` already is).
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  // Liveness probe for Railway / Cloudflare health checks. The `engine` field also
  // proves the @pop-engine/engine workspace package resolves end to end.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "pop-engine-api", engine: describeEngine() });
  });

  if (planService !== undefined) registerPlanRoutes(app, planService);

  return app;
}

/**
 * F-201/F-102 plan routes. A rule-evaluation failure returns an explicit error and never a
 * plan with no findings, so the api can never present a failure as "nothing required" (AC 5).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A malformed id must not reach `WHERE id = $1`: Postgres raises 22P02 coercing it to uuid, which
 * would surface as a 500 carrying driver error text. Client mistakes get a client error, and
 * database internals stay on the server.
 */
function rejectMalformedId(id: string, res: Response): boolean {
  if (UUID.test(id)) return false;
  res.status(400).json({ error: "event id must be a uuid" });
  return true;
}

/** Only our own messages are safe to echo; anything else could carry driver detail. */
function respondWithFailure(res: Response, error: unknown, summary: string): void {
  if (error instanceof EvaluationError || error instanceof PlanIntegrityError) {
    res.status(500).json({ error: summary, detail: error.message });
    return;
  }
  console.error(summary, error);
  res.status(500).json({ error: summary });
}

function registerPlanRoutes(app: Express, planService: PlanService): void {
  app.post("/api/events/:id/plan", (req, res) => {
    const eventId = req.params.id;
    if (rejectMalformedId(eventId, res)) return;
    planService
      .generate(eventId)
      .then((plan) => res.status(201).json(plan))
      .catch((error: unknown) => {
        if (error instanceof EventNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        respondWithFailure(res, error, "plan generation failed");
      });
  });

  app.get("/api/events/:id/plan", (req, res) => {
    const eventId = req.params.id;
    if (rejectMalformedId(eventId, res)) return;
    planService
      .latest(eventId)
      .then((plan) => {
        if (plan === null) {
          res.status(404).json({ error: `no plan generated for event ${eventId}` });
          return;
        }
        res.json(plan);
      })
      .catch((error: unknown) => {
        if (error instanceof EventNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        respondWithFailure(res, error, "plan lookup failed");
      });
  });
}
