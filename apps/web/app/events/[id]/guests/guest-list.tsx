"use client";

import { useEffect, useState } from "react";
import { cancelGuest, loadGuestList, type GuestList } from "./guests-api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GuestListProps = {
  eventId: string;
  apiBaseUrl: string;
};

export function GuestListView({ eventId, apiBaseUrl }: GuestListProps) {
  const [list, setList] = useState<GuestList | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!UUID.test(eventId)) {
      setFailure("That event link is not valid.");
      return;
    }
    let cancelled = false;
    void loadGuestList(apiBaseUrl, eventId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setFailure(result.message);
        return;
      }
      setList(result.list);
    });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, eventId]);

  if (failure !== null && list === null) {
    return (
      <div className="guests">
        <h1>Guest list</h1>
        <p className="guests__error" role="alert">
          {failure}
        </p>
      </div>
    );
  }

  if (list === null) {
    return (
      <div className="guests">
        <p className="guests__lede" role="status">
          Loading guest list…
        </p>
      </div>
    );
  }

  const onCancel = async (rsvpId: string) => {
    setFailure(null);
    setCancellingId(rsvpId);
    const result = await cancelGuest(apiBaseUrl, eventId, rsvpId);
    setCancellingId(null);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    setList(result.list);
  };

  return (
    <div className="guests">
      <h1>{list.event.name}</h1>
      <p className="guests__lede">Guest list · {list.event.event_date}</p>
      <p className="guests__count" aria-live="polite">
        {list.confirmed_count} of {list.event.headcount} confirmed
      </p>
      <p className="guests__note">
        Synthetic demo data only (AD-12). Capacity uses intake headcount. Public RSVP button waits
        on the event page (F-301 / issue #100).
      </p>

      {failure !== null && (
        <p className="guests__error" role="alert">
          {failure}
        </p>
      )}

      {list.rsvps.length === 0 ? (
        <p className="guests__empty">No RSVPs yet.</p>
      ) : (
        <ul className="guests__list">
          {list.rsvps.map((rsvp) => (
            <li
              key={rsvp.id}
              className={
                rsvp.status === "cancelled" ? "guests__row guests__cancelled" : "guests__row"
              }
            >
              <div className="guests__identity">
                <span className="guests__name">{rsvp.name}</span>
                <span className="guests__meta">
                  {rsvp.email}
                  {rsvp.phone !== null ? ` · ${rsvp.phone}` : ""}
                  {rsvp.status === "cancelled" ? " · cancelled" : ""}
                </span>
              </div>
              {rsvp.status === "confirmed" && (
                <button
                  type="button"
                  className="guests__cancel"
                  disabled={cancellingId === rsvp.id}
                  onClick={() => {
                    void onCancel(rsvp.id);
                  }}
                >
                  {cancellingId === rsvp.id ? "Cancelling…" : "Cancel RSVP"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
