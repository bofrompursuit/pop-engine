import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePlan, loadPlan, loadRulesMeta } from "./plan-api";

// `fetch` is stubbed; the api's own behavior is covered by apps/api. What is pinned here is the
// request this page makes and how each answer is reported.

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubFetch = (implementation: typeof fetch) => {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const storedPlan = {
  id: "plan-1",
  eventId: "event-1",
  eventRevision: 2,
  rulesetVersion: "nyc.v2.3",
  snapshotDate: "2026-07-25",
  verdict: "CONDITIONAL",
  today: "2026-07-25",
  generatedAt: "2026-07-25T12:00:00.000Z",
  findings: [],
};

const omit = (plan: Record<string, unknown>, field: string): Record<string, unknown> => {
  const { [field]: _dropped, ...rest } = plan;
  return rest;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadPlan", () => {
  it("gets the event's plan with the Access cookie attached", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, storedPlan));

    await expect(loadPlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: true,
      plan: storedPlan,
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/events/event-1/plan", {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("says plainly when no plan has been generated yet", async () => {
    stubFetch(async () => jsonResponse(404, {}));
    await expect(loadPlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      missing: true,
      message: "No plan has been generated for this event yet.",
    });
  });

  it("repeats the api's own message when it explains the refusal", async () => {
    stubFetch(async () => jsonResponse(500, { error: "plan lookup failed" }));
    await expect(loadPlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      missing: false,
      message: "plan lookup failed",
    });
  });

  it("falls back to the status when the failure body carries no message", async () => {
    stubFetch(async () => new Response("<html>gateway</html>", { status: 502 }));
    await expect(loadPlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      missing: false,
      message: "The plan could not be loaded (HTTP 502).",
    });
  });

  it("refuses a success body it cannot read as a plan", async () => {
    stubFetch(async () => jsonResponse(200, { findings: [] }));
    await expect(loadPlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      missing: false,
      message: "The API returned a plan this page cannot read.",
    });
  });

  it("keeps a null snapshot date, which is what a pre-migration-002 plan carries", async () => {
    stubFetch(async () => jsonResponse(200, { ...storedPlan, snapshotDate: null }));
    const result = await loadPlan("https://api.example.com", "event-1");
    expect(result.ok && result.plan.snapshotDate).toBeNull();
  });

  it("refuses a plan that omits the snapshot date rather than reading it as null", async () => {
    // Null means "generated before migration 002", which the banner says out loud. An absent field
    // means the api and this page disagree, and must not be reported as a fact about the plan.
    const { snapshotDate: _omitted, ...withoutDate } = storedPlan;
    stubFetch(async () => jsonResponse(200, withoutDate));
    await expect(loadPlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      missing: false,
      message: "The API returned a plan this page cannot read.",
    });
  });

  // Every field the plan view consumes without checking it first is checked here. Validating a
  // subset is the defect: `generatedAt` was read with `.slice()` and turned an intended
  // "cannot read this plan" message into a client render failure under an api/web rollout skew.
  it.each([
    ["generatedAt is missing", (p: typeof storedPlan) => omit(p, "generatedAt")],
    [
      "generatedAt is not a string",
      (p: typeof storedPlan) => ({ ...p, generatedAt: 1753444800000 }),
    ],
    ["eventRevision is missing", (p: typeof storedPlan) => omit(p, "eventRevision")],
    ["eventRevision is not a number", (p: typeof storedPlan) => ({ ...p, eventRevision: "2" })],
    ["verdict is missing", (p: typeof storedPlan) => omit(p, "verdict")],
    ["verdict is not one the copy covers", (p: typeof storedPlan) => ({ ...p, verdict: "MAYBE" })],
    ["rulesetVersion is missing", (p: typeof storedPlan) => omit(p, "rulesetVersion")],
    ["findings is not an array", (p: typeof storedPlan) => ({ ...p, findings: {} })],
    [
      "a finding carries no ruleIds",
      (p: typeof storedPlan) => ({ ...p, findings: [{ name: "x" }] }),
    ],
  ])("refuses a plan whose %s", async (_case, mutate) => {
    stubFetch(async () => jsonResponse(200, mutate(storedPlan)));
    await expect(loadPlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      missing: false,
      message: "The API returned a plan this page cannot read.",
    });
  });

  it("does not refuse a plan over a field the view never reads", async () => {
    // Rejecting a body for `id`, `eventId` or `today` would refuse a plan the page renders
    // correctly. The rule is what the view consumes unchecked, not everything the type declares.
    stubFetch(async () =>
      jsonResponse(200, omit(omit(omit(storedPlan, "id"), "eventId"), "today")),
    );
    const result = await loadPlan("https://api.example.com", "event-1");
    expect(result.ok).toBe(true);
  });

  it("reports an unreachable api instead of throwing", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(loadPlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      missing: false,
      message: "The API could not be reached.",
    });
  });
});

describe("loadRulesMeta", () => {
  it("reads the version and snapshot date the api publishes", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, { ruleset_version: "nyc.v2.3", snapshot_date: "2026-07-25" }),
    );

    await expect(loadRulesMeta("https://api.example.com")).resolves.toEqual({
      ok: true,
      meta: { ruleset_version: "nyc.v2.3", snapshot_date: "2026-07-25" },
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/rules/meta", {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("refuses a body that does not carry both values", async () => {
    stubFetch(async () => jsonResponse(200, { ruleset_version: "nyc.v2.3" }));
    await expect(loadRulesMeta("https://api.example.com")).resolves.toEqual({
      ok: false,
      message: "The API returned a ruleset version this page cannot read.",
    });
  });

  it("reports a refusal and an unreachable api", async () => {
    stubFetch(async () => jsonResponse(503, {}));
    await expect(loadRulesMeta("https://api.example.com")).resolves.toEqual({
      ok: false,
      message: "The ruleset version could not be read (HTTP 503).",
    });

    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(loadRulesMeta("https://api.example.com")).resolves.toEqual({
      ok: false,
      message: "The API could not be reached.",
    });
  });
});

describe("generatePlan", () => {
  it("returns the plan the POST stored, asking for nothing more", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, storedPlan));

    await expect(generatePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: true,
      plan: storedPlan,
    });
    // One call: the POST. A second would be re-reading a plan already in hand.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/events/event-1/plan", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("re-reads only when the POST's own body cannot be read", async () => {
    // The one case where a re-read is genuinely necessary: a row was written, so reporting a failure
    // would misstate what happened and POSTing again would write a second row for one action.
    const fetchMock = stubFetch(async (_url, init) =>
      (init as RequestInit | undefined)?.method === "POST"
        ? jsonResponse(201, omit(storedPlan, "generatedAt"))
        : jsonResponse(200, storedPlan),
    );

    await expect(generatePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: true,
      plan: storedPlan,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says a plan was stored even when neither the POST body nor the re-read can be read", async () => {
    stubFetch(async (_url, init) =>
      (init as RequestInit | undefined)?.method === "POST"
        ? jsonResponse(201, omit(storedPlan, "generatedAt"))
        : jsonResponse(500, { error: "plan lookup failed" }),
    );

    await expect(generatePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      stored: true,
      message: "The API returned a plan this page cannot read.",
    });
  });

  it("says no plan was stored when the POST itself failed", async () => {
    stubFetch(async () => jsonResponse(500, { error: "plan generation failed" }));
    await expect(generatePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      stored: false,
      message: "plan generation failed",
    });

    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(generatePlan("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      stored: false,
      message: "The API could not be reached.",
    });
  });
});
