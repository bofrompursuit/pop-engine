// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  capacitySummary,
  DashboardView,
  lastUpdatedLabel,
} from "./dashboard-view";
import type { EventStats } from "./dashboard-api";

const here = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_EVENT_ID = "22222222-2222-4222-8222-222222222222";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const stats = (overrides: Partial<EventStats> = {}): EventStats => ({
  checkins_total: 0,
  checkins_registered: 0,
  checkins_walk_in: 0,
  rsvps_total: 0,
  capacity: null,
  checkins_last_10min: 0,
  ...overrides,
});

const totalLabel = (node: HTMLElement | null): string =>
  node?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("capacitySummary", () => {
  it("says capacity not set and invents no percentage when capacity is null", () => {
    expect(capacitySummary(stats({ checkins_total: 12, capacity: null }))).toEqual({
      label: "capacity not set",
      overCapacity: false,
      percentLabel: null,
    });
  });

  it("flags over-capacity when check-ins exceed confirmed capacity", () => {
    const summary = capacitySummary(stats({ checkins_total: 11, capacity: 10 }));
    expect(summary.overCapacity).toBe(true);
    expect(summary.label).toBe("11 of 10 capacity");
    expect(summary.percentLabel).toBe("110%");
  });
});

describe("lastUpdatedLabel", () => {
  it("states the age of the last successful poll in seconds", () => {
    expect(lastUpdatedLabel(1_000, 6_500)).toBe("last updated 5s ago");
  });
});

describe("DashboardView", () => {
  it("renders an explicit zero check-ins state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, stats({ checkins_total: 0 }))),
    );
    render(<DashboardView eventId={EVENT_ID} apiBaseUrl="https://api.example.com" pollMs={60_000} />);

    expect((await screen.findByTestId("zero-state")).textContent).toBe("0 check-ins so far.");
    expect(screen.getByTestId("checkins-total").textContent).toContain("0");
    expect(screen.getByTestId("checkins-total").textContent).toContain("check-ins");
    expect(screen.getByTestId("capacity-gauge").textContent).toContain("capacity not set");
    expect(screen.getByTestId("checkin-split").textContent).toBe(
      "0 registered check-ins · 0 walk-in check-ins",
    );
  });

  it("shows capacity percentage, over-capacity warning, and the registered/walk-in split", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          200,
          stats({
            checkins_total: 12,
            checkins_registered: 7,
            checkins_walk_in: 5,
            rsvps_total: 20,
            capacity: 10,
          }),
        ),
      ),
    );
    render(<DashboardView eventId={EVENT_ID} apiBaseUrl="https://api.example.com" pollMs={60_000} />);

    const gauge = await screen.findByTestId("capacity-gauge");
    expect(gauge.textContent).toContain("12 of 10 capacity");
    expect(gauge.textContent).toContain("120%");
    expect(gauge.textContent).toContain("Check-ins are over the confirmed capacity.");
    expect(screen.getByTestId("rsvp-compare").textContent).toBe(
      "20 RSVPs confirmed · 12 check-ins",
    );
    expect(screen.getByTestId("checkin-split").textContent).toBe(
      "7 registered check-ins · 5 walk-in check-ins",
    );
  });

  it("keeps the last totals and shows last-updated age when a poll fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, stats({ checkins_total: 3, capacity: 100 })))
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    let clock = 10_000;
    render(
      <DashboardView
        eventId={EVENT_ID}
        apiBaseUrl="https://api.example.com"
        pollMs={20}
        now={() => clock}
      />,
    );

    expect((await screen.findByTestId("checkins-total")).textContent).toContain("3");

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    clock = 15_000;
    await waitFor(() => {
      expect(screen.getByTestId("stale-indicator").textContent).toBe("last updated 5s ago");
    });
    expect(screen.getByTestId("checkins-total").textContent).toContain("3");
  });

  it("skips starting a new poll while one is still in flight", async () => {
    let resolveFirst!: (value: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue(jsonResponse(200, stats({ checkins_total: 4 })));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DashboardView
        eventId={EVENT_ID}
        apiBaseUrl="https://api.example.com"
        pollMs={20}
        fetchTimeoutMs={60_000}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirst(jsonResponse(200, stats({ checkins_total: 4 })));
    expect(totalLabel(await screen.findByTestId("checkins-total"))).toBe("4 check-ins");
  });

  it("expires a hung poll so the next interval can recover", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      )
      .mockResolvedValue(jsonResponse(200, stats({ checkins_total: 2 })));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DashboardView
        eventId={EVENT_ID}
        apiBaseUrl="https://api.example.com"
        pollMs={30}
        fetchTimeoutMs={20}
      />,
    );

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1), {
      timeout: 2_000,
    });
    expect(totalLabel(await screen.findByTestId("checkins-total"))).toBe("2 check-ins");
  });

  it("clears the previous event's totals as soon as the event id changes", async () => {
    let resolveSecond!: (value: Response) => void;
    const second = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, stats({ checkins_total: 3 })))
      .mockReturnValueOnce(second);
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <DashboardView
        eventId={EVENT_ID}
        apiBaseUrl="https://api.example.com"
        pollMs={60_000}
        fetchTimeoutMs={60_000}
      />,
    );
    expect(totalLabel(await screen.findByTestId("checkins-total"))).toBe("3 check-ins");

    rerender(
      <DashboardView
        eventId={OTHER_EVENT_ID}
        apiBaseUrl="https://api.example.com"
        pollMs={60_000}
        fetchTimeoutMs={60_000}
      />,
    );
    expect(screen.queryByTestId("checkins-total")).toBeNull();
    expect(screen.getByText("Loading check-ins…")).toBeDefined();

    resolveSecond(jsonResponse(200, stats({ checkins_total: 9 })));
    expect(totalLabel(await screen.findByTestId("checkins-total"))).toBe("9 check-ins");
  });

  it("discards an in-flight poll after the event id changes", async () => {
    let resolveFirst!: (value: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue(jsonResponse(200, stats({ checkins_total: 9 })));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <DashboardView
        eventId={EVENT_ID}
        apiBaseUrl="https://api.example.com"
        pollMs={60_000}
        fetchTimeoutMs={60_000}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <DashboardView
        eventId={OTHER_EVENT_ID}
        apiBaseUrl="https://api.example.com"
        pollMs={60_000}
        fetchTimeoutMs={60_000}
      />,
    );
    expect(totalLabel(await screen.findByTestId("checkins-total"))).toBe("9 check-ins");

    resolveFirst(jsonResponse(200, stats({ checkins_total: 1 })));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(totalLabel(screen.getByTestId("checkins-total"))).toBe("9 check-ins");
  });

  it("labels every rendered check-in count as check-ins, never occupancy or foot traffic", async () => {
    // AC 3: honest telemetry — labels must say check-ins; presence claims need F-410.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          200,
          stats({
            checkins_total: 4,
            checkins_registered: 3,
            checkins_walk_in: 1,
            checkins_last_10min: 2,
          }),
        ),
      ),
    );
    render(<DashboardView eventId={EVENT_ID} apiBaseUrl="https://api.example.com" pollMs={60_000} />);

    const split = (await screen.findByTestId("checkin-split")).textContent ?? "";
    expect(split).toContain("registered check-ins");
    expect(split).toContain("walk-in check-ins");
    expect(screen.getByTestId("checkins-total").textContent).toContain("check-ins");
    expect(screen.getByTestId("checkins-last-10min").textContent).toContain("check-ins");
    expect(screen.getByTestId("rsvp-compare").textContent).toContain("check-ins");

    const viewSource = readFileSync(resolve(here, "dashboard-view.tsx"), "utf8");
    const pageSource = readFileSync(resolve(here, "page.tsx"), "utf8");
    const cssSource = readFileSync(resolve(here, "dashboard.css"), "utf8");
    const combined = `${viewSource}\n${pageSource}\n${cssSource}`.toLowerCase();
    expect(combined.includes("occupancy")).toBe(false);
    expect(combined.includes("foot traffic")).toBe(false);
  });
});
