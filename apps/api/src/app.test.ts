import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";

describe("api scaffold", () => {
  it("GET /health returns ok and resolves the engine package", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      service: "pop-engine-api",
      engine: "pop-engine-engine ready",
    });
  });
});
