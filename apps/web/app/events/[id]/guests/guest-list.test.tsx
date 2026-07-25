// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestListView } from "./guest-list";
import GuestsPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const RSVP_ID = "22222222-2222-4222-8222-222222222222";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const listBody = {
  event: {
    id: EVENT_ID,
    name: "Demo Night",
    headcount: 5,
    event_date: "2026-08-26",
  },
  rsvps: [
    {
      id: RSVP_ID,
      event_id: EVENT_ID,
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "5551112222",
      status: "confirmed",
      created_at: "2026-07-25T12:00:00.000Z",
    },
  ],
  confirmed_count: 1,
};

describe("GuestListView", () => {
  it("shows confirmed count vs headcount and can cancel an RSVP", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, listBody))
      .mockResolvedValueOnce(
        jsonResponse(200, { rsvp: { ...listBody.rsvps[0], status: "cancelled" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ...listBody,
          confirmed_count: 0,
          rsvps: [{ ...listBody.rsvps[0], status: "cancelled" }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GuestListView eventId={EVENT_ID} apiBaseUrl="https://api.example.com" />);
    expect(await screen.findByText("1 of 5 confirmed")).toBeDefined();
    expect(screen.getByText("Ada Lovelace")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Cancel RSVP" }));
    await waitFor(() => {
      expect(screen.getByText("0 of 5 confirmed")).toBeDefined();
    });
    expect(screen.getByText(/cancelled/i)).toBeDefined();
  });

  it("rejects a malformed event id without calling the api", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<GuestListView eventId="bad" apiBaseUrl="https://api.example.com" />);
    expect(screen.getByRole("alert").textContent).toMatch(/not valid/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GuestsPage", () => {
  it("wires the route id into the guest list", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(await GuestsPage({ params: Promise.resolve({ id: EVENT_ID }) }));
    expect(screen.getByRole("status").textContent).toBe("Loading guest list…");
  });
});
