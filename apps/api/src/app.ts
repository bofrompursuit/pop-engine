import express, { type Express } from "express";
import { describeEngine } from "@pop-engine/engine";

// The Express app factory. Kept separate from the server bootstrap (index.ts) so tests
// can drive it with supertest without opening a port.
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  // Liveness probe for Railway / Cloudflare health checks. The `engine` field also
  // proves the @pop-engine/engine workspace package resolves end to end.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "pop-engine-api", engine: describeEngine() });
  });

  return app;
}
