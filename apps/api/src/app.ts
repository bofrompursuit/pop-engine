import express, { type Express } from "express";
import { describeEngine } from "@pop-engine/engine";
import { createEventsRouter, type EventsDependencies } from "./events";

// Event dates are local calendar dates in the ruleset's jurisdiction (US-NY-NYC), not
// UTC instants. Deriving "today" in UTC rejects a same-day event all evening, once UTC
// has rolled over and New York has not.
const JURISDICTION_TIME_ZONE = "America/New_York";
const JURISDICTION_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: JURISDICTION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The clock the API stamps requests with. The engine always receives it as a value. */
export const jurisdictionToday = (now: Date = new Date()): string => {
  const parts = new Map(
    JURISDICTION_DAY.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
};

export type AppDependencies = Omit<EventsDependencies, "today"> & { today?: () => string };

// The Express app factory. Kept separate from the server bootstrap (index.ts) so tests
// can drive it with supertest without opening a port.
export function createApp(dependencies: AppDependencies): Express {
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

  app.use(
    "/api",
    createEventsRouter({ ...dependencies, today: dependencies.today ?? jurisdictionToday }),
  );

  return app;
}
