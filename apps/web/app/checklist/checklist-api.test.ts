import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONSUMED_ITEM_FIELDS,
  createChecklist,
  documentRejection,
  documentUrl,
  loadChecklist,
  MAX_DOCUMENT_BYTES,
  updateChecklistItem,
  uploadDocument,
} from "./checklist-api";
import { checklistBody, planContext, trackedItem } from "./checklist-fixtures";

// `fetch` is stubbed; the api's own behavior is covered by apps/api. What is pinned here is the
// request this page makes and how each answer is reported.

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubFetch = (implementation: typeof fetch) => {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const omit = (record: Record<string, unknown>, field: string): Record<string, unknown> => {
  const { [field]: _dropped, ...rest } = record;
  return rest;
};

const pdf = (name = "permit.pdf", size = 1024): File =>
  new File([new Uint8Array(size)], name, { type: "application/pdf" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadChecklist", () => {
  it("gets the event's checklist with the Access cookie attached", async () => {
    const body = checklistBody({ created: true, items: [trackedItem()] });
    const fetchMock = stubFetch(async () => jsonResponse(200, body));

    const result = await loadChecklist("https://api.example.com", "event-1");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/events/event-1/checklist",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("reports a 404 as the event having no plan, which is a different fact from a failure", async () => {
    stubFetch(async () => jsonResponse(404, { error: "no plan generated for event event-1" }));

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      noPlan: true,
      message: "no plan generated for event event-1",
    });
  });

  it("reports any other status as unavailable rather than as a missing plan", async () => {
    stubFetch(async () => jsonResponse(500, {}));

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      noPlan: false,
      message: "The checklist could not be loaded (HTTP 500).",
    });
  });

  it("reports an unreachable api rather than throwing at the caller", async () => {
    stubFetch(async () => {
      throw new TypeError("network down");
    });

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      noPlan: false,
      message: "The API could not be reached.",
    });
  });

  it("refuses a body that is not a checklist", async () => {
    stubFetch(async () => jsonResponse(200, { items: "not an array" }));

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toMatchObject({
      ok: false,
      message: "The API returned a checklist this page cannot read.",
    });
  });

  it("refuses a body whose non-JSON content cannot even be parsed", async () => {
    stubFetch(async () => new Response("<html>Access denied</html>", { status: 403 }));

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      noPlan: false,
      message: "The checklist could not be loaded (HTTP 403).",
    });
  });

  // The point of the consumed-type discipline: a field this page reads cannot go unvalidated.
  // Dropping any one of them has to be refused, whichever it is.
  it.each(CONSUMED_ITEM_FIELDS)("refuses a checklist row missing %s", async (field) => {
    stubFetch(async () =>
      jsonResponse(200, checklistBody({ items: [omit(trackedItem(), field)] })),
    );

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toMatchObject({
      ok: false,
      message: "The API returned a checklist this page cannot read.",
    });
  });

  it("refuses a row whose source plan is missing its snapshot pair", async () => {
    stubFetch(async () =>
      jsonResponse(
        200,
        checklistBody({
          items: [{ ...trackedItem(), sourcePlan: { rulesetVersion: "nyc.v2.7" } }],
        }),
      ),
    );

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toMatchObject({
      ok: false,
    });
  });

  it("accepts a source plan whose snapshot date was never recorded", async () => {
    stubFetch(async () =>
      jsonResponse(
        200,
        checklistBody({
          items: [
            { ...trackedItem(), sourcePlan: { rulesetVersion: "nyc.v2.5", snapshotDate: null } },
          ],
        }),
      ),
    );

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toMatchObject({
      ok: true,
    });
  });

  it("refuses a context line that is not shaped like plan context", async () => {
    stubFetch(async () =>
      jsonResponse(200, checklistBody({ contextItems: [omit(planContext(), "disposition")] })),
    );

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toMatchObject({
      ok: false,
    });
  });

  it("refuses a status the engine does not publish", async () => {
    stubFetch(async () =>
      jsonResponse(200, checklistBody({ items: [{ ...trackedItem(), status: "filed" }] })),
    );

    await expect(loadChecklist("https://api.example.com", "event-1")).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe("createChecklist", () => {
  it("posts once and installs the checklist the api answered with", async () => {
    const body = checklistBody({ created: true, items: [trackedItem()] });
    const fetchMock = stubFetch(async () => jsonResponse(201, body));

    const result = await createChecklist("https://api.example.com", "event-1");

    expect(result).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/events/event-1/checklist",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  // Edge case: created twice is idempotent. The api answers 200 with the checklist that already
  // exists rather than 201 with a second one, and the client treats both as the current checklist.
  it("takes a 200 as the existing checklist, not as a second one", async () => {
    const existing = checklistBody({ created: true, items: [trackedItem({ id: "item-1" })] });
    stubFetch(async () => jsonResponse(200, existing));

    const result = await createChecklist("https://api.example.com", "event-1");

    expect(result.ok && result.checklist.items.map((item) => item.id)).toEqual(["item-1"]);
  });

  it("reports a refused conversion with the api's own reason", async () => {
    stubFetch(async () =>
      jsonResponse(409, { error: "plan was generated against revision 1, but the event is at 2" }),
    );

    await expect(createChecklist("https://api.example.com", "event-1")).resolves.toEqual({
      ok: false,
      noPlan: false,
      message: "plan was generated against revision 1, but the event is at 2",
    });
  });

  it("reports an unreachable api", async () => {
    stubFetch(async () => {
      throw new TypeError("network down");
    });

    await expect(createChecklist("https://api.example.com", "event-1")).resolves.toMatchObject({
      ok: false,
      message: "The API could not be reached.",
    });
  });

  it("reports a 404 as the event having no plan to convert", async () => {
    stubFetch(async () => jsonResponse(404, {}));

    await expect(createChecklist("https://api.example.com", "event-1")).resolves.toMatchObject({
      ok: false,
      noPlan: true,
    });
  });

  it("refuses a created checklist it cannot read", async () => {
    stubFetch(async () => jsonResponse(201, { created: "yes" }));

    await expect(createChecklist("https://api.example.com", "event-1")).resolves.toMatchObject({
      ok: false,
      message: "The API returned a checklist this page cannot read.",
    });
  });
});

describe("updateChecklistItem", () => {
  it("patches a status and returns the row the api stored", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, { id: "item-1", planItemId: "pi-1", status: "submitted", notes: null }),
    );

    const result = await updateChecklistItem("https://api.example.com", "item-1", {
      status: "submitted",
    });

    expect(result).toEqual({
      ok: true,
      item: { id: "item-1", planItemId: "pi-1", status: "submitted", notes: null },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/api/checklist-items/item-1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ status: "submitted" }),
    });
  });

  it("patches notes, including clearing them", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, { id: "item-1", status: "not_started", notes: null }),
    );

    await updateChecklistItem("https://api.example.com", "item-1", { notes: "" });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: JSON.stringify({ notes: "" }) });
  });

  it("reports the api's reason for refusing an update", async () => {
    stubFetch(async () => jsonResponse(404, { error: "checklist item item-9 not found" }));

    await expect(
      updateChecklistItem("https://api.example.com", "item-9", { status: "approved" }),
    ).resolves.toEqual({ ok: false, message: "checklist item item-9 not found" });
  });

  it("reports an unreachable api", async () => {
    stubFetch(async () => {
      throw new TypeError("network down");
    });

    await expect(
      updateChecklistItem("https://api.example.com", "item-1", { status: "approved" }),
    ).resolves.toEqual({ ok: false, message: "The API could not be reached." });
  });

  it("falls back to a status-bearing message when the api sends no reason", async () => {
    stubFetch(async () => jsonResponse(500, {}));

    await expect(
      updateChecklistItem("https://api.example.com", "item-1", { status: "approved" }),
    ).resolves.toEqual({ ok: false, message: "The item could not be updated (HTTP 500)." });
  });

  it("refuses an updated row it cannot read", async () => {
    stubFetch(async () => jsonResponse(200, { id: "item-1", status: "filed", notes: null }));

    await expect(
      updateChecklistItem("https://api.example.com", "item-1", { status: "approved" }),
    ).resolves.toEqual({ ok: false, message: "The API returned an item this page cannot read." });
  });
});

describe("documentRejection", () => {
  it("accepts the three published types", () => {
    expect(documentRejection(pdf())).toBeNull();
    expect(documentRejection(new File(["x"], "a.png", { type: "image/png" }))).toBeNull();
    expect(documentRejection(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBeNull();
  });

  it("refuses anything else", () => {
    expect(documentRejection(new File(["x"], "a.docx", { type: "application/msword" }))).toBe(
      "Documents must be a PDF, PNG or JPG.",
    );
  });

  it("refuses a file over 10 MB at the boundary and accepts one exactly at it", () => {
    expect(documentRejection(pdf("big.pdf", MAX_DOCUMENT_BYTES + 1))).toBe(
      "Documents must be 10 MB or smaller.",
    );
    expect(documentRejection(pdf("exact.pdf", MAX_DOCUMENT_BYTES))).toBeNull();
  });

  it("refuses an empty file, which the api would refuse too", () => {
    expect(documentRejection(pdf("empty.pdf", 0))).toBe("That file is empty.");
  });
});

describe("uploadDocument", () => {
  it("streams the file with its declared type and its display name", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(201, {
        id: "doc-1",
        filename: "permit.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
        uploadedAt: "2026-07-26T00:00:00.000Z",
      }),
    );

    const result = await uploadDocument("https://api.example.com", "item-1", pdf());

    expect(result).toMatchObject({ ok: true, document: { id: "doc-1", filename: "permit.pdf" } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.com/api/checklist-items/item-1/documents",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/pdf", "X-Filename": "permit.pdf" },
    });
  });

  // Edge case: storage unreachable. The api keeps the item's state and writes no metadata row,
  // and says so with `retryable`, so the same upload can simply be sent again.
  it("passes the api's retryable flag through on a storage failure", async () => {
    stubFetch(async () =>
      jsonResponse(503, { error: "document storage is unavailable", retryable: true }),
    );

    await expect(uploadDocument("https://api.example.com", "item-1", pdf())).resolves.toEqual({
      ok: false,
      retryable: true,
      message: "document storage is unavailable",
    });
  });

  it("does not offer a retry for a rejection that would be repeated identically", async () => {
    stubFetch(async () => jsonResponse(415, { error: "content type must be one of ..." }));

    await expect(uploadDocument("https://api.example.com", "item-1", pdf())).resolves.toEqual({
      ok: false,
      retryable: false,
      message: "content type must be one of ...",
    });
  });

  it("treats an unreachable api as retryable: nothing was stored", async () => {
    stubFetch(async () => {
      throw new TypeError("network down");
    });

    await expect(uploadDocument("https://api.example.com", "item-1", pdf())).resolves.toEqual({
      ok: false,
      retryable: true,
      message: "The API could not be reached.",
    });
  });

  it("does not offer a retry when the upload succeeded but its answer is unreadable", async () => {
    stubFetch(async () => jsonResponse(201, { id: 7 }));

    await expect(uploadDocument("https://api.example.com", "item-1", pdf())).resolves.toEqual({
      ok: false,
      retryable: false,
      message: "The document was uploaded, but the API returned a response this page cannot read.",
    });
  });

  it("falls back to a status-bearing message when the api sends no reason", async () => {
    stubFetch(async () => jsonResponse(500, {}));

    await expect(uploadDocument("https://api.example.com", "item-1", pdf())).resolves.toMatchObject(
      { message: "The document could not be uploaded (HTTP 500)." },
    );
  });
});

describe("documentUrl", () => {
  it("reads the short-lived signed URL", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, {
        url: "https://storage.example.com/signed",
        filename: "permit.pdf",
        expiresInSeconds: 300,
      }),
    );

    await expect(documentUrl("https://api.example.com", "doc-1")).resolves.toEqual({
      ok: true,
      url: "https://storage.example.com/signed",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/api/documents/doc-1/url");
  });

  it("reports a missing document", async () => {
    stubFetch(async () => jsonResponse(404, { error: "document doc-9 not found" }));

    await expect(documentUrl("https://api.example.com", "doc-9")).resolves.toEqual({
      ok: false,
      message: "document doc-9 not found",
    });
  });

  it("reports an unreachable api", async () => {
    stubFetch(async () => {
      throw new TypeError("network down");
    });

    await expect(documentUrl("https://api.example.com", "doc-1")).resolves.toEqual({
      ok: false,
      message: "The API could not be reached.",
    });
  });

  it("falls back to a status-bearing message when the api sends no reason", async () => {
    stubFetch(async () => jsonResponse(500, {}));

    await expect(documentUrl("https://api.example.com", "doc-1")).resolves.toEqual({
      ok: false,
      message: "The document link could not be read (HTTP 500).",
    });
  });

  it("refuses an empty link rather than opening nothing", async () => {
    stubFetch(async () => jsonResponse(200, { url: "" }));

    await expect(documentUrl("https://api.example.com", "doc-1")).resolves.toEqual({
      ok: false,
      message: "The API returned a download link this page cannot read.",
    });
  });
});
