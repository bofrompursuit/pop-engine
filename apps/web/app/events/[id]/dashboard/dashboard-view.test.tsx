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

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const stats = (overrides: Partial<EventStats> = {}): EventStats => ({
  checkins_total: 0,
  rsvps_total: 0,
  capacity: null,
  checkins_last_10min: 0,
  ...overrides,
});

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
  });

  it("shows capacity percentage and an over-capacity warning when set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, stats({ checkins_total: 12, rsvps_total: 20, capacity: 10 })),
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

  it("never uses forbidden arrival labels in dashboard UI source", () => {
    // AC 3: honest telemetry — labels must say check-ins; presence claims need F-410.
    const viewSource = readFileSync(resolve(here, "dashboard-view.tsx"), "utf8");
    const pageSource = readFileSync(resolve(here, "page.tsx"), "utf8");
    const cssSource = readFileSync(resolve(here, "dashboard.css"), "utf8");
    const combined = `${viewSource}\n${pageSource}\n${cssSource}`.toLowerCase();
    expect(combined.includes("occupancy")).toBe(false);
    expect(combined.includes("foot traffic")).toBe(false);
  });
});
