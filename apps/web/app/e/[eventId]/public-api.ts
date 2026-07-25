// Public event page + RSVP client (F-301 + F-302). Credentialed for Access (AD-12).

export const CREDENTIALED = {
  credentials: "include",
  headers: { "Content-Type": "application/json" },
} as const satisfies RequestInit;

export type PublicEvent = {
  id: string;
  title: string;
  event_date: string;
  venue: string | null;
  borough: string;
  description: string | null;
  map_url: string;
  rsvp_enabled: boolean;
};

export type LoadPublicResult = { ok: true; event: PublicEvent } | { ok: false; message: string };

const UNREACHABLE = "The event page could not be reached.";

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

export async function loadPublicEvent(
  apiBaseUrl: string,
  eventId: string,
): Promise<LoadPublicResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/e/${eventId}`, { ...CREDENTIALED });
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
          ? "That event page is not available."
          : `This page could not be opened (HTTP ${response.status}).`,
      ),
    };
  }
  const event = asRecord(body);
  if (event === null || typeof event.title !== "string" || typeof event.id !== "string") {
    return { ok: false, message: "That event page is not available." };
  }
  return { ok: true, event: event as PublicEvent };
}

export async function submitPublicRsvp(
  apiBaseUrl: string,
  eventId: string,
  input: { name: string; email: string; phone?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  let response: Response;
  try {
    // Server enforces public_page_published on POST (F-301 visibility); stale tabs get a 404.
    response = await fetch(`${apiBaseUrl}/api/events/${eventId}/rsvps`, {
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
      message: failureMessage(
        body,
        response.status === 404
          ? "That event page is not available."
          : `RSVP could not be saved (HTTP ${response.status}).`,
      ),
    };
  }
  return { ok: true };
}
