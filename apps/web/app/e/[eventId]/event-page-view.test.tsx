// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventPageView } from "./event-page-view";
import PublicEventPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const publicEvent = {
  id: EVENT_ID,
  title: "Demo Night",
  event_date: "2026-08-26",
  venue: "Bushwick Lot",
  borough: "brooklyn",
  description: "A street night.",
  map_url: "https://maps.google.com/?q=Bushwick",
  rsvp_enabled: true,
};

describe("EventPageView", () => {
  it("renders promotion fields and accepts an RSVP", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, publicEvent))
      .mockResolvedValueOnce(jsonResponse(201, { rsvp: { id: "r1" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<EventPageView eventId={EVENT_ID} apiBaseUrl="https://api.example.com" />);
    expect(await screen.findByRole("heading", { name: "Demo Night" })).toBeDefined();
    expect(screen.getByText("A street night.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Open map" }).getAttribute("href")).toContain(
      "maps.google.com",
    );

    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "RSVP" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/on the list/i);
    });
  });

  it("omits the map link when the API has no venue map URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { ...publicEvent, venue: null, map_url: null })),
    );
    render(<EventPageView eventId={EVENT_ID} apiBaseUrl="https://api.example.com" />);
    expect(await screen.findByRole("heading", { name: "Demo Night" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Open map" })).toBeNull();
  });

  it("shows a friendly unavailable state when unpublished", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(404, { error: "That event page is not available." })),
    );
    render(<EventPageView eventId={EVENT_ID} apiBaseUrl="https://api.example.com" />);
    expect(await screen.findByRole("heading", { name: "Event unavailable" })).toBeDefined();
  });
});

describe("PublicEventPage", () => {
  it("wires the route eventId into the view", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(await PublicEventPage({ params: Promise.resolve({ eventId: EVENT_ID }) }));
    expect(screen.getByRole("status").textContent).toBe("Opening event…");
  });
});
