import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPublicEvent, submitPublicRsvp } from "./public-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("loadPublicEvent", () => {
  it("loads a published event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Demo Night",
          event_date: "2026-08-26",
          venue: "Lot",
          borough: "brooklyn",
          description: "Hello",
          map_url: "https://maps.google.com/?q=Lot",
          rsvp_enabled: true,
        }),
      ),
    );
    const result = await loadPublicEvent(
      "https://api.example.com",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.title).toBe("Demo Night");
  });

  it("maps unpublished to a friendly message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(404, { error: "That event page is not available." })),
    );
    await expect(
      loadPublicEvent("https://api.example.com", "11111111-1111-4111-8111-111111111111"),
    ).resolves.toEqual({
      ok: false,
      message: "That event page is not available.",
    });
  });
});

describe("submitPublicRsvp", () => {
  it("posts to the F-302 RSVP endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { rsvp: { id: "r1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      submitPublicRsvp("https://api.example.com", "11111111-1111-4111-8111-111111111111", {
        name: "Ada",
        email: "ada@example.com",
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/events/11111111-1111-4111-8111-111111111111/rsvps",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces unpublished RSVP refusals as a friendly page message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(404, { error: "That event page is not available." })),
    );
    await expect(
      submitPublicRsvp("https://api.example.com", "11111111-1111-4111-8111-111111111111", {
        name: "Ada",
        email: "ada@example.com",
      }),
    ).resolves.toEqual({
      ok: false,
      message: "That event page is not available.",
    });
  });
});
