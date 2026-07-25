// Browser calls for F-401 check-in. Web and api are separate origins behind
// Cloudflare Access (AD-12), so every call sends credentials.

export const CREDENTIALED = {
  credentials: "include",
  headers: { "Content-Type": "application/json" },
} as const satisfies RequestInit;

export type CheckinRecord = {
  id: string;
  event_id: string;
  rsvp_id: string | null;
  name: string;
  contact: string;
  checked_in_at: string;
};

export type EventLookup = { ok: true; name: string } | { ok: false; message: string };

export type CheckinResult = { ok: true; checkin: CheckinRecord } | { ok: false; message: string };

const UNREACHABLE = "The check-in service could not be reached.";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function failureMessage(body: unknown, fallback: string): string {
  const error = asRecord(body)?.error;
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

/** Confirm the QR target is a real event before asking for attendee details. */
export async function loadCheckinEvent(apiBaseUrl: string, eventId: string): Promise<EventLookup> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/events/${eventId}`, { ...CREDENTIALED });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      message: failureMessage(
        body,
        response.status === 404
          ? "That event was not found."
          : `This check-in link could not be opened (HTTP ${response.status}).`,
      ),
    };
  }

  const event = asRecord(asRecord(body)?.event);
  const name = event?.name;
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, message: "That event was not found." };
  }
  return { ok: true, name };
}

/** Two-field check-in: name + email-or-phone contact. */
export async function submitCheckin(
  apiBaseUrl: string,
  eventId: string,
  input: { name: string; contact: string },
): Promise<CheckinResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/events/${eventId}/checkins`, {
      method: "POST",
      ...CREDENTIALED,
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }

  const body = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      message: failureMessage(body, `Check-in could not be recorded (HTTP ${response.status}).`),
    };
  }

  const checkin = asRecord(asRecord(body)?.checkin);
  if (checkin === null || typeof checkin.name !== "string") {
    return { ok: false, message: "The API returned a check-in this page cannot read." };
  }
  return { ok: true, checkin: checkin as CheckinRecord };
}
