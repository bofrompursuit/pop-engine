"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadEventStats,
  STATS_POLL_MS,
  type EventStats,
} from "./dashboard-api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stable production clock — an inline default would recreate each render and restart the poll effect. */
const systemNow = (): number => Date.now();

export type DashboardViewProps = {
  eventId: string;
  apiBaseUrl: string;
  /** Injectable clock for tests; production uses Date.now. */
  now?: () => number;
  /** Injectable poll interval; production uses STATS_POLL_MS. */
  pollMs?: number;
};

/**
 * Capacity gauge copy. Never invents a percentage when capacity is unset — that would be
 * inventing a number from an unknown denominator (F-402 edge case / same class as AC 3).
 */
export function capacitySummary(stats: EventStats): {
  label: string;
  overCapacity: boolean;
  percentLabel: string | null;
} {
  if (stats.capacity === null) {
    return { label: "capacity not set", overCapacity: false, percentLabel: null };
  }
  const overCapacity = stats.checkins_total > stats.capacity;
  const percent = Math.round((stats.checkins_total / stats.capacity) * 100);
  return {
    label: `${stats.checkins_total} of ${stats.capacity} capacity`,
    overCapacity,
    percentLabel: `${percent}%`,
  };
}

/** Staleness line after a failed poll; a frozen live-looking number is worse than an honest age. */
export function lastUpdatedLabel(lastSuccessAt: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - lastSuccessAt) / 1000));
  return `last updated ${seconds}s ago`;
}

export function DashboardView({
  eventId,
  apiBaseUrl,
  now = systemNow,
  pollMs = STATS_POLL_MS,
}: DashboardViewProps) {
  const [stats, setStats] = useState<EventStats | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [staleTick, setStaleTick] = useState(0);
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    if (!UUID.test(eventId)) {
      setFailure("That event link is not valid.");
      return;
    }

    let alive = true;
    let inFlight = false;

    const refresh = async () => {
      // Serialize polls: if latency exceeds pollMs, overlapping requests would each
      // supersede the last and the dashboard would never leave "Loading check-ins…".
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await loadEventStats(apiBaseUrl, eventId);
        if (!alive) return;
        if (!result.ok) {
          setFailure(result.message);
          return;
        }
        setFailure(null);
        setStats(result.stats);
        setLastSuccessAt(nowRef.current());
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    const poll = window.setInterval(() => {
      void refresh();
    }, pollMs);
    const staleClock = window.setInterval(() => {
      setStaleTick((tick) => tick + 1);
    }, 1000);

    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(staleClock);
    };
  }, [apiBaseUrl, eventId, pollMs]);

  if (failure !== null && stats === null) {
    return (
      <div className="ops">
        <h1>Live ops</h1>
        <p className="ops__error" role="alert">
          {failure}
        </p>
      </div>
    );
  }

  if (stats === null) {
    return (
      <div className="ops">
        <p className="ops__lede" role="status">
          Loading check-ins…
        </p>
      </div>
    );
  }

  const gauge = capacitySummary(stats);
  const showStale = failure !== null && lastSuccessAt !== null;
  // staleTick forces a re-render each second so the age label advances while polling is down.
  void staleTick;

  return (
    <div className="ops">
      <p className="ops__eyebrow">Door</p>
      <h1>Live ops</h1>
      <p className="ops__lede">
        Arrivals only — labeled check-ins, not how many people are still on site.
      </p>

      <p className="ops__total" data-testid="checkins-total">
        <span className="ops__total-number">{stats.checkins_total}</span>
        <span className="ops__total-label"> check-ins</span>
      </p>

      {stats.checkins_total === 0 && (
        <p className="ops__zero" role="status" data-testid="zero-state">
          0 check-ins so far.
        </p>
      )}

      <p className="ops__recent" data-testid="checkins-last-10min">
        {stats.checkins_last_10min} check-ins in the last 10 minutes
      </p>

      <section
        className={gauge.overCapacity ? "ops__gauge ops__gauge--over" : "ops__gauge"}
        aria-label="Capacity"
        data-testid="capacity-gauge"
      >
        <p className="ops__gauge-label">{gauge.label}</p>
        {gauge.percentLabel !== null && (
          <p className="ops__gauge-percent">{gauge.percentLabel}</p>
        )}
        {gauge.overCapacity && (
          <p className="ops__warning" role="status">
            Check-ins are over the confirmed capacity.
          </p>
        )}
      </section>

      <p className="ops__compare" data-testid="rsvp-compare">
        {stats.rsvps_total} RSVPs confirmed · {stats.checkins_total} check-ins
      </p>
      <p className="ops__split" data-testid="checkin-split">
        {stats.checkins_registered} registered · {stats.checkins_walk_in} walk-ins
      </p>

      {showStale && lastSuccessAt !== null && (
        <p className="ops__stale" role="status" data-testid="stale-indicator">
          {lastUpdatedLabel(lastSuccessAt, now())}
        </p>
      )}
      {failure !== null && showStale && (
        <p className="ops__error" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}
