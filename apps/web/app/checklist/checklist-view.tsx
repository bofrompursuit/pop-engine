"use client";

import { useEffect, useRef, useState } from "react";
import { CHECKLIST_STATUSES, type ChecklistStatus } from "@pop-engine/engine";
import { loadRulesMeta, type RulesMetaResponse } from "../plan/plan-api";
import { compareToPinned, SnapshotBanner } from "../plan/snapshot-banner";
import {
  createChecklist,
  documentUrl,
  loadChecklist,
  updateChecklistItem,
  uploadDocument,
  type ChecklistResponse,
  type ChecklistResult,
  type SourcePlan,
  type StatusRollup,
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
 * AC 2's rollup, as the api counted it. The statuses that have rows, in the engine's own order.
 *
 * The counting rule lives in `apps/api/src/checklist.ts` and only there. Counting it again here
 * would put two implementations of one criterion in two languages, which is the drift this repo
 * spent a day removing from the answer key. What keeps it from going stale is that every mutation
 * re-reads the checklist, so the counts and the rows on screen always come from one response.
 */
const rollupOf = (rollup: StatusRollup): readonly [ChecklistStatus, number][] =>
  CHECKLIST_STATUSES.map((status) => [status, rollup[status]] as [ChecklistStatus, number]).filter(
    ([, count]) => count > 0,
  );

const humanize = (token: string): string => token.replace(/_/g, " ");

export function ChecklistView({ apiBaseUrl, eventId }: { apiBaseUrl: string; eventId: string }) {
  const [state, setState] = useState<ChecklistState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [creationFailure, setCreationFailure] = useState<string | null>(null);
  /**
   * What the api's own rules file says about itself, or null when it could not be read.
   *
   * Used for ONE thing, which F-206 AC 4 is explicit about: how the live ruleset stands relative
   * to the one this checklist's plan pinned. The version and date the banner DISPLAYS still come
   * off the plan and only off the plan — pairing a pinned version with the live file's date would
   * render a combination that never existed, and AC 4 forbids it in as many words. `/api/rules/meta`
   * is "for surfaces with no plan in context"; a checklist has one, so it is read for the
   * comparison and never for the pair.
   */
  const [meta, setMeta] = useState<RulesMetaResponse | null>(null);

  /**
   * Which event this page is showing. The create handler runs outside the effect, so it cannot
   * rely on the effect's cleanup: it re-checks this after its await and drops the result if the
   * page has moved to another event in the meantime.
   */
  const showing = `${apiBaseUrl}|${eventId}`;
  const active = useRef(showing);

  /**
   * Which re-read a reload belongs to, and which one is on screen. Two writes can be in flight at
   * once — a status change on one row while another row's note saves — and their reloads can come
   * back in either order. Without this, the older answer wins whenever it happens to land second.
   */
  const writeEpoch = useRef(0);
  const appliedEpoch = useRef(0);

  useEffect(() => {
    active.current = showing;
    let abandoned = false;

    // Everything on screen belongs to one event, so navigating clears it before the new request
    // runs. One organizer's checklist must never be read under another event's id.
    setState({ status: "loading" });
    setCreationFailure(null);
    setCreating(false);
    // Reload epochs belong to the checklist that was on screen, not to the one arriving.
    writeEpoch.current = 0;
    appliedEpoch.current = 0;

    setMeta(null);

    void loadChecklist(apiBaseUrl, eventId).then((result) => {
      if (abandoned) return;
      setState(stateFrom(result));
    });

    // The checklist never waits for this: the banner states its plan's own pinned pair without it,
    // and the live version only decides whether a newer ruleset exists.
    void loadRulesMeta(apiBaseUrl).then((result) => {
      if (abandoned) return;
      if (result.ok) setMeta(result.meta);
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
    // The conversion's own response is NOT installed, even though it is the checklist the api just
    // wrote. Reviewing is offered while the item controls are live, so a status change can commit
    // and render while this POST is in flight, and this response — assembled before that update —
    // would put the old status and the old counts back on screen. It goes through the same
    // epoch-ordered re-read every other write uses, so there is one ordering rule rather than one
    // rule and an exception.
    setCreationFailure(await reload(requested));
    setCreating(false);
  };

  /**
   * Re-read the whole checklist after a write, and report what stopped that from working.
   *
   * The write already succeeded when this runs, so nothing here can be reported as the write
   * failing. What it can report is that the page is no longer showing the current state, which an
   * organizer has to know before they read a status or a count off it.
   *
   * Applying the write's own response locally instead would be one request cheaper and wrong in a
   * specific way: the rollup is counted by the api over the rows it holds, so patching one row on
   * screen leaves the counts describing the checklist as it was before the click. Re-reading is
   * what keeps the counting rule in one place (AC 2), and it is what the guest list does after a
   * cancel for the same reason.
   */
  const reload = async (requested: string): Promise<string | null> => {
    const epoch = ++writeEpoch.current;
    const result = await loadChecklist(apiBaseUrl, eventId);
    if (active.current !== requested) return null;
    // An older reload landing after a newer one must not put the older answer back on screen.
    if (epoch < appliedEpoch.current) return null;
    appliedEpoch.current = epoch;
    if (!result.ok) {
      return `The change was saved, but the checklist could not be reloaded: ${result.message}`;
    }
    setState({ status: "ready", checklist: result.checklist });
    return null;
  };

  const setStatus = async (itemId: string, status: ChecklistStatus): Promise<string | null> => {
    const requested = showing;
    const result = await updateChecklistItem(apiBaseUrl, itemId, { status });
    if (!result.ok) return result.message;
    return reload(requested);
  };

  const saveNotes = async (itemId: string, notes: string): Promise<string | null> => {
    const requested = showing;
    const result = await updateChecklistItem(apiBaseUrl, itemId, { notes });
    if (!result.ok) return result.message;
    return reload(requested);
  };

  const upload = async (itemId: string, file: File) => {
    const requested = showing;
    const result = await uploadDocument(apiBaseUrl, itemId, file);
    if (result.ok) {
      const failure = await reload(requested);
      // The document is stored either way; a reload that failed is not a resend.
      return failure === null ? null : { message: failure, outcome: "stored" as const };
    }
    // An api that stored nothing needs no reconciling: the row is exactly as it was.
    if (result.outcome === "not_stored")
      return { message: result.message, outcome: result.outcome };

    // Anything else may be on the item already. Rather than guess, or ask the organizer to guess,
    // re-read the checklist so the document list itself is the answer — it is the same list a page
    // reload would show, which is why this is reconciling rather than disabling a button.
    const failure = await reload(requested);
    return {
      message:
        failure === null
          ? `${result.message} The checklist has been refreshed, so check whether it is listed before uploading it again.`
          : `${result.message} The checklist could not be refreshed either: ${failure}`,
      outcome: result.outcome,
    };
  };

  /**
   * Follow a document's short-lived signed URL.
   *
   * The tab is opened synchronously, on the click itself, and navigated once the URL comes back.
   * Opening it after the await is what the first version did, and it silently did nothing twice
   * over: `window.open` with `noopener` returns null by specification, so the handle was always
   * null and the null was ignored, and a browser that has since expired the click's transient
   * activation refuses the popup anyway. Both paths reported success while nothing happened.
   *
   * `opener` is cleared by hand because that is what `noopener` would have done, and it is the
   * part worth keeping: the storage origin must not get a reference back into this page.
   */
  const download = async (documentId: string): Promise<string | null> => {
    const target = window.open("", "_blank");
    if (target !== null) target.opener = null;

    const result = await documentUrl(apiBaseUrl, documentId);
    if (!result.ok) {
      target?.close();
      return result.message;
    }
    if (target === null || target.closed) {
      return "The download was blocked by the browser. Allow pop-ups for this site and try again.";
    }
    target.location.href = result.url;
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
  const rollup = rollupOf(checklist.statusRollup);
  // Only "newer" is actionable. A service running an older or unorderable ruleset is the plan
  // view's refusal case, and telling an organizer to regenerate onto it would downgrade the
  // regulatory basis of a plan that is currently sound.
  const supersededRuleset =
    meta !== null && compareToPinned(meta.ruleset_version, checklist.rulesetVersion) === "newer";
  const retained = checklist.items.filter((item) => !item.inLatestPlan).length;

  return (
    <main className="checklist">
      <h1>Your compliance checklist</h1>

      {/* The snapshot the rows below are read against, both values off the checklist's own current
          plan. Rows from a different snapshot state their own beneath them; rows from this one do
          not repeat it. `meta` supplies the live-versus-pinned comparison only — it is not where
          either displayed value comes from (F-206 AC 4). */}
      <SnapshotBanner
        rulesetVersion={checklist.rulesetVersion}
        snapshotDate={checklist.snapshotDate}
        meta={meta}
      />

      {/* The banner names an action, so the page says where it lives. Regenerating is the plan
          view's, not the checklist's: this view converts a plan, it does not produce one. Saying a
          newer ruleset exists and leaving an organizer to find the button is the failure the plan
          view already recorded about its own banner. */}
      {supersededRuleset && (
        <p className="checklist__lede">
          A newer ruleset is published than the one this plan pinned.{" "}
          <a href={`/events/${eventId}/plan`}>Regenerate the plan</a> to rebuild the checklist
          against it.
        </p>
      )}

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
