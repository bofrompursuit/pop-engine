// One-click plan regeneration (F-101 spec #8).
//
// The endpoint is F-201's (`POST /api/events/:id/plan`, ARCHITECTURE.md API Surface);
// intake only asks for it and reports what came back. Plans are immutable snapshots
// (AD-7), so regeneration is a new plan for the current revision, never a patch.

export type PlanRegenerationResult = { ok: true } | { ok: false; message: string };

async function failureMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const { error } = body as { error: unknown };
      if (typeof error === "string" && error.length > 0) return error;
    }
  } catch {
    // A non-JSON body (a proxy error page, an Access challenge) still has a status.
  }
  return `The plan could not be regenerated (HTTP ${response.status}).`;
}

export async function regeneratePlan(
  apiBaseUrl: string,
  eventId: string,
): Promise<PlanRegenerationResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/events/${eventId}/plan`, {
      method: "POST",
      // Web and api are separate origins behind Cloudflare Access (BASELINE.md
      // provider baseline), so the Access cookie has to ride along.
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return { ok: false, message: "The API could not be reached." };
  }
  return response.ok ? { ok: true } : { ok: false, message: await failureMessage(response) };
}
