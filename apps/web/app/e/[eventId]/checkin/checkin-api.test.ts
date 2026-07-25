import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCheckinEvent, submitCheckin } from "./checkin-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("loadCheckinEvent", () => {
  it("returns the event name for a known id", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { event: { id: "event-1", name: "Bushwick Night" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadCheckinEvent("https://api.example.com", "event-1")).resolves.toEqual({
      ok: true,
      name: "Bushwick Night",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/events/event-1/checkins", {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("maps a missing event to a friendly message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(404, { error: "event not found" })),
    );
    await expect(loadCheckinEvent("https://api.example.com", "missing")).resolves.toEqual({
      ok: false,
      message: "event not found",
    });
  });

  it("reports an unreachable api", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(loadCheckinEvent("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      message: "The check-in service could not be reached.",
    });
  });

  it("rejects a payload that has no usable event name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { event: { id: "event-1" } })),
    );
    await expect(loadCheckinEvent("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      message: "That event was not found.",
    });
  });

  it("uses a status fallback when the error body is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(503, {})),
    );
    await expect(loadCheckinEvent("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      message: "This check-in link could not be opened (HTTP 503).",
    });
  });
});

describe("submitCheckin", () => {
  it("posts the two fields with credentials", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, {
        checkin: {
          id: "c1",
          event_id: "event-1",
          rsvp_id: null,
          name: "Ada",
          contact: "ada@example.com",
          checked_in_at: "2026-07-25T12:00:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitCheckin("https://api.example.com", "event-1", {
      name: "Ada",
      contact: "ada@example.com",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/events/event-1/checkins", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ada", contact: "ada@example.com" }),
    });
  });

  it("surfaces api errors without inventing detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(400, { error: "contact is required" })),
    );
    await expect(
      submitCheckin("https://api.example.com", "event-1", { name: "Ada", contact: "" }),
    ).resolves.toEqual({ ok: false, message: "contact is required" });
  });

  it("reports an unreachable api and an unreadable success body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(
      submitCheckin("https://api.example.com", "event-1", { name: "Ada", contact: "a@b.co" }),
    ).resolves.toEqual({
      ok: false,
      message: "The check-in service could not be reached.",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(201, { checkin: { id: "c1" } })),
    );
    await expect(
      submitCheckin("https://api.example.com", "event-1", { name: "Ada", contact: "a@b.co" }),
    ).resolves.toEqual({
      ok: false,
      message: "The API returned a check-in this page cannot read.",
    });
  });
});
