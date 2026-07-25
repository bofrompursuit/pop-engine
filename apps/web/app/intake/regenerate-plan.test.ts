import { afterEach, describe, expect, it, vi } from "vitest";
import { regeneratePlan } from "./regenerate-plan";

// The plan endpoint itself ships with F-201 (issue #4), so this pins the request intake
// makes and how each answer is reported. `fetch` is stubbed; nothing here needs a server.

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("regeneratePlan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetch = (implementation: typeof fetch) => {
    const fetchMock = vi.fn(implementation);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("posts to the event's plan endpoint with the Access cookie attached", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { verdict: "feasible" }));

    await expect(regeneratePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/events/event-1/plan", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("reports the api's own error message", async () => {
    stubFetch(async () => jsonResponse(409, { error: "event has no intake to evaluate" }));

    await expect(regeneratePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      message: "event has no intake to evaluate",
    });
  });

  it("falls back to the status when the failure body carries no message", async () => {
    stubFetch(async () => new Response("<html>gateway</html>", { status: 502 }));

    await expect(regeneratePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      message: "The plan could not be regenerated (HTTP 502).",
    });
  });

  it("falls back to the status when the failure body is JSON without an error string", async () => {
    stubFetch(async () => jsonResponse(500, { error: 42 }));

    await expect(regeneratePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      message: "The plan could not be regenerated (HTTP 500).",
    });
  });

  it("reports an unreachable api instead of throwing", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(regeneratePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      message: "The API could not be reached.",
    });
  });
});
