import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { parseIntakeContract } from "@pop-engine/engine";
import { createApp, jurisdictionToday } from "./app";
import { loadRuleset } from "./ruleset";

// The scaffold routes need the app's dependencies but never reach them: the pool is
// constructed lazily by pg and opens no connection until a query runs.
const dependencies = {
  database: new Pool({ connectionString: "postgresql://unused" }),
  intakeContract: parseIntakeContract((await loadRuleset()).document),
};
const createScaffoldApp = () => createApp(dependencies);

describe("api scaffold", () => {
  afterEach(() => {
    delete process.env.WEB_ORIGIN;
  });

  it("GET /health returns ok and resolves the engine package", async () => {
    const res = await request(createScaffoldApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      service: "pop-engine-api",
      engine: "pop-engine-engine ready",
    });
  });

  it("allows the configured web origin on browser requests", async () => {
    process.env.WEB_ORIGIN = "https://web.example.com";
    const res = await request(createScaffoldApp()).get("/health");
    expect(res.headers["access-control-allow-origin"]).toBe("https://web.example.com");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("defaults the allowed origin to the local web dev server", async () => {
    const res = await request(createScaffoldApp()).get("/health");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("answers preflight requests", async () => {
    const res = await request(createScaffoldApp()).options("/health");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toBe("Content-Type");
  });
});

describe("the clock the api stamps requests with", () => {
  it("reads the calendar day in the ruleset's jurisdiction, not in UTC", () => {
    // 2026-08-12 00:30 UTC is still 2026-08-11 in New York (UTC-4 in August). An
    // organizer filing that evening for an event today must not be told it is past.
    const evening = new Date("2026-08-12T00:30:00Z");
    expect(evening.toISOString().slice(0, 10)).toBe("2026-08-12");
    expect(jurisdictionToday(evening)).toBe("2026-08-11");
  });

  it("agrees with UTC once New York has caught up", () => {
    expect(jurisdictionToday(new Date("2026-08-12T14:00:00Z"))).toBe("2026-08-12");
    // January is UTC-5, so the boundary moves with the offset rather than being fixed.
    expect(jurisdictionToday(new Date("2026-01-12T04:30:00Z"))).toBe("2026-01-11");
    expect(jurisdictionToday(new Date("2026-01-12T05:30:00Z"))).toBe("2026-01-12");
  });

  it("defaults to now when no instant is given", () => {
    expect(jurisdictionToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
