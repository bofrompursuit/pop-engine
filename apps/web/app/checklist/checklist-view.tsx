"use client";

import { useEffect, useRef, useState } from "react";
import { CHECKLIST_STATUSES, type ChecklistStatus } from "@pop-engine/engine";
import { SnapshotBanner } from "../plan/snapshot-banner";
import {
  createChecklist,
  documentUrl,
  loadChecklist,
  updateChecklistItem,
  uploadDocument,
  type ChecklistItem,
  type ChecklistResponse,
  type ChecklistResult,
  type SourcePlan,
} from "./checklist-api";
import { ChecklistItemCard, ContextLine } from "./checklist-item";

// The checklist view (F-202): the execution surface for a permit plan. One click converts the
// latest plan into trackable rows (AC 1), each row keeps its link to the plan item and therefore
// to its rule, deadline, citation and portal, and nothing is ever removed from it (AC 6).
//
// What this page can be showing is written down as states rather than inferred from booleans,
// which is the shape the plan view arrived at after three "a failure path was not considered"
// findings. The distinctions that matter here: an event with no plan cannot have a checklist and
// is sent to the plan view, an unreadable checklist is not an absent one, and a plan with zero
// trackable requirements is a real answer rather than a failure.

type ChecklistState =
  | { status: "loading" }
  /** The event has no plan yet, so there is nothing to convert. */
  | { status: "no_plan"; message: string }
  /** Anything else went wrong. A checklist may well exist; we just could not read it. */
  | { status: "unavailable"; message: string }
  | { status: "ready"; checklist: ChecklistResponse };

const stateFrom = (result: ChecklistResult): ChecklistState =>
  result.ok
    ? { status: "ready", checklist: result.checklist }
    : result.noPlan
      ? { status: "no_plan", message: result.message }
      : { status: "unavailable", message: result.message };

/**
 * AC 2's rollup, counted over the rows on screen rather than taken from the response.
 *
 * The api sends the same count, and it is right when it is sent. But a status change updates one
 * row and not the response that carried it, so a stored rollup starts disagreeing with the rows
 * beneath it at the first click — and a rollup that disagrees with visible rows is the exact
 * failure the criterion's second sentence names. Counted here, the two cannot come apart.
 *
 * Current-plan rows only, which is the criterion's first sentence; retained rows are counted and
 * labelled separately by the caller so nothing visible goes unaccounted for.
 */
function rollupOf(items: readonly ChecklistItem[]): readonly [ChecklistStatus, number][] {
  const current = items.filter((item) => item.inLatestPlan);
  return CHECKLIST_STATUSES.map(
    (status) =>
      [status, current.filter((item) => item.status === status).length] as [
        ChecklistStatus,
        number,
      ],
  ).filter(([, count]) => count > 0);
}

const humanize = (token: string): string => token.replace(/_/g, " ");

export function ChecklistView({ apiBaseUrl, eventId }: { apiBaseUrl: string; eventId: string }) {
  const [state, setState] = useState<ChecklistState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [creationFailure, setCreationFailure] = useState<string | null>(null);

  /**
   * Which event this page is showing. The create handler runs outside the effect, so it cannot
   * rely on the effect's cleanup: it re-checks this after its await and drops the result if the
   * page has moved to another event in the meantime.
   */
  const showing = `${apiBaseUrl}|${eventId}`;
  const active = useRef(showing);

  useEffect(() => {
    active.current = showing;
    let abandoned = false;

    // Everything on screen belongs to one event, so navigating clears it before the new request
    // runs. One organizer's checklist must never be read under another event's id.
    setState({ status: "loading" });
    setCreationFailure(null);
    setCreating(false);

    void loadChecklist(apiBaseUrl, eventId).then((result) => {
      if (abandoned) return;
      setState(stateFrom(result));
    });

    return () => {
      abandoned = true;
    };
  }, [apiBaseUrl, eventId, showing]);

  /**
   * Convert the latest plan into a checklist, and re-run the same call to review it after a
   * regeneration. The endpoint is idempotent: a second call creates nothing and answers with the
   * checklist that already exists, so a double click cannot produce two.
   */
  const convert = async () => {
    const requested = showing;
    setCreating(true);
    setCreationFailure(null);

    const result = await createChecklist(apiBaseUrl, eventId);
    if (active.current !== requested) return;
    if (!result.ok) {
      setCreationFailure(result.message);
      setCreating(false);
      return;
    }
    // The response IS the checklist it just wrote, so it goes on screen here rather than being
    // asked for a second time.
    setState({ status: "ready", checklist: result.checklist });
    setCreating(false);
  };

  /** Replace one row, leaving everything else on the page as it was. */
  const applyToItem = (itemId: string, change: (item: ChecklistItem) => ChecklistItem) => {
    setState((previous) =>
      previous.status !== "ready"
        ? previous
        : {
            status: "ready",
            checklist: {
              ...previous.checklist,
              items: previous.checklist.items.map((item) =>
                item.id === itemId ? change(item) : item,
              ),
            },
          },
    );
  };

  const setStatus = async (itemId: string, status: ChecklistStatus): Promise<string | null> => {
    const result = await updateChecklistItem(apiBaseUrl, itemId, { status });
    if (!result.ok) return result.message;
    // The api answers with the stored row, so what goes on screen is what was written.
    applyToItem(itemId, (item) => ({ ...item, status: result.item.status }));
    return null;
  };

  const saveNotes = async (itemId: string, notes: string): Promise<string | null> => {
    const result = await updateChecklistItem(apiBaseUrl, itemId, { notes });
    if (!result.ok) return result.message;
    applyToItem(itemId, (item) => ({ ...item, notes: result.item.notes }));
    return null;
  };

  const upload = async (itemId: string, file: File) => {
    const result = await uploadDocument(apiBaseUrl, itemId, file);
    // A failed upload leaves the item exactly as it was and writes no metadata row, so there is
    // nothing to undo here and the row simply reports what happened.
    if (!result.ok) return { message: result.message, retryable: result.retryable };
    applyToItem(itemId, (item) => ({ ...item, documents: [...item.documents, result.document] }));
    return null;
  };

  const download = async (documentId: string): Promise<string | null> => {
    const result = await documentUrl(apiBaseUrl, documentId);
    if (!result.ok) return result.message;
    // The URL is short-lived and signed, so it is followed immediately rather than rendered as a
    // link an organizer might come back to after it has expired.
    window.open(result.url, "_blank", "noopener,noreferrer");
    return null;
  };

  if (state.status === "loading") {
    return (
      <p className="intake__lede" role="status">
        Loading your checklist…
      </p>
    );
  }

  if (state.status !== "ready") {
    return (
      <main className="checklist">
        <h1>Your compliance checklist</h1>
        <p className="intake__error" role="alert">
          {state.message}
        </p>
        {/* A checklist is built from a plan, so the answer to "there is no plan" is the plan
            view, not a button here that would have nothing to convert. */}
        {state.status === "no_plan" && (
          <p className="checklist__lede">
            <a href={`/events/${eventId}/plan`}>Generate the permit plan first</a>
          </p>
        )}
      </main>
    );
  }

  const { checklist } = state;
  const currentPlan: SourcePlan = {
    rulesetVersion: checklist.rulesetVersion,
    snapshotDate: checklist.snapshotDate,
  };
  const rollup = rollupOf(checklist.items);
  const retained = checklist.items.filter((item) => !item.inLatestPlan).length;

  return (
    <main className="checklist">
      <h1>Your compliance checklist</h1>

      {/* The snapshot the rows below are read against, both values off the checklist's own current
          plan. Rows from a different snapshot state their own beneath them; rows from this one do
          not repeat it. (The live-ruleset comparison is F-206's to wire in; this view states the
          pair that produced what it is showing, which is what its own AC 8 requires.) */}
      <SnapshotBanner
        rulesetVersion={checklist.rulesetVersion}
        snapshotDate={checklist.snapshotDate}
        meta={null}
      />

      {/* AD-13: a plan pins the revision it evaluated. If the event has moved on, these
          requirements answer an intake the organizer has already replaced, and the api refuses to
          materialize them — so the page says why rather than offering a button that 409s. */}
      {checklist.planStale && (
        <p className="checklist__flag" role="alert">
          The event has been edited since this plan was generated, so the plan no longer matches it.{" "}
          <a href={`/events/${eventId}/plan`}>Regenerate the plan</a> before converting it.
        </p>
      )}

      {/* AC 6: the plan was regenerated after this checklist was built. Everything is kept — new
          requirements are appended and dropped ones are struck through — and reviewing is the
          same idempotent conversion call. */}
      {checklist.created && checklist.planChanged && (
        <p className="checklist__flag" role="alert">
          The plan has changed; review items. Nothing has been removed: requirements the new plan no
          longer raises are struck through below, and new ones are added when you review.
        </p>
      )}

      {(!checklist.created || checklist.planChanged) && !checklist.planStale && (
        <div className="checklist__actions">
          <button
            className="intake__submit"
            type="button"
            onClick={() => void convert()}
            disabled={creating}
          >
            {creating
              ? "Working…"
              : checklist.created
                ? "Review items against the current plan"
                : "Create the checklist from this plan"}
          </button>
        </div>
      )}

      {creationFailure !== null && (
        <p className="intake__error" role="alert">
          {creationFailure}
        </p>
      )}

      {checklist.created && (
        <p className="checklist__rollup" aria-live="polite">
          {rollup.length === 0
            ? "No trackable requirements in the current plan."
            : rollup.map(([status, count]) => `${count} ${humanize(status)}`).join(" · ")}
          {/* Counted and labelled separately, so a rollup covering only current-plan rows never
              looks like it has omitted the retained rows visible beneath it (AC 2). */}
          {retained > 0 && ` · plus ${retained} retained from an earlier plan, not counted above`}
        </p>
      )}

      {checklist.created && checklist.items.length === 0 && (
        /* The synthetic zero-trackable-items case: creation was offered and ran, and it produced
           an empty checklist rather than a failure. The read-only context below is the rest of
           what the plan says. */
        <p className="checklist__empty">
          Nothing to track; keep confirmation notes here if you like.
        </p>
      )}

      {checklist.items.length > 0 && (
        <div className="checklist__items">
          {checklist.items.map((item) => (
            <ChecklistItemCard
              key={item.id}
              item={item}
              currentPlan={currentPlan}
              onStatusChange={(status) => setStatus(item.id, status)}
              onNotesSave={(notes) => saveNotes(item.id, notes)}
              onUpload={(file) => upload(item.id, file)}
              onDownload={download}
            />
          ))}
        </div>
      )}

      {/* Advisories, notifications and prohibitions: shown because they are part of the answer,
          never as tasks, because nothing is filed for them. */}
      {checklist.contextItems.length > 0 && (
        <section className="checklist__context" aria-label="Read-only context">
          <h2>Context, not tracked</h2>
          {checklist.contextItems.map((context) => (
            <ContextLine
              key={context.ruleIds.join("+")}
              context={context}
              currentPlan={currentPlan}
            />
          ))}
        </section>
      )}
    </main>
  );
}
