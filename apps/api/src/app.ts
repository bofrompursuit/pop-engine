import express, { type Express } from "express";
import { describeEngine } from "@pop-engine/engine";

// The Express app factory. Kept separate from the server bootstrap (index.ts) so tests
// can drive it with supertest without opening a port.
export function createApp(): Express {
  const app = express();

  // The web app is served from a different origin than the api in both local dev and on
  // Railway (DEPLOY.md), so browser calls need CORS. Single allowed origin per
  // ARCHITECTURE.md; CORS is not authorization (AD-5, the gate is Cloudflare Access).
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", webOrigin);
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

  return app;
}
