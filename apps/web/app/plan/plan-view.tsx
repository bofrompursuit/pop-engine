"use client";

import { useEffect, useRef, useState } from "react";
import { loadEvent, type LoadResult } from "../intake/events-api";
import {
  generatePlan,
  loadPlan,
  loadRulesMeta,
  type PlanResponse,
  type PlanResult,
  type RulesMetaResponse,
} from "./plan-api";
import { PlanLine } from "./plan-line";
import { compareToPinned, SnapshotBanner } from "./snapshot-banner";
import { AT_RISK_BUFFER_NOTE, verdictCopy } from "./verdict-copy";

// The plan view. F-206 owns what this page is for: the snapshot banner and the per-line citation
// and verification-status rendering. The verdict is shown in its approved copy; F-102's branch
// tables and rescope ladder are its own feature.
//
// What this page can be showing is written down once, as two states, rather than inferred from a
// handful of booleans. Three review findings in a row were "a failure path was not considered",
// and each was a combination the booleans allowed but nobody had enumerated: a failure with a
// plan already on screen, a missing plan and an unreadable one treated alike, an action promised
// by the banner that no state offered.

/** What came back for the plan itself. */
type PlanState =
  | { status: "loading" }
  /** The plan endpoint says this event has no plan yet — the only state that can be generated from. */
  | { status: "missing"; message: string }
  /** Anything else went wrong. A plan may well exist; we just could not read it. */
  | { status: "unavailable"; message: string }
  | { status: "ready"; plan: PlanResponse };

/** What came back for the event, which is what says whether the plan is still current. */
type EventState =
  { status: "loading" } | { status: "found"; revision: number } | { status: "unavailable" };

// The plan and the event are two facts that arrive separately, and every path through this
// component applies them separately. Both mappings live here, once, rather than at each call site:
// the two review findings this component has taken about them — a pending event lookup rendering as
// confirmed, and a pending event lookup hiding an already-generated plan — were the same mistake
// made twice, and duplicated mappings are what let it be made twice.

const planStateFrom = (result: PlanResult): PlanState =>
  result.ok
    ? { status: "ready", plan: result.plan }
    : result.missing
      ? { status: "missing", message: result.message }
      : { status: "unavailable", message: result.message };

const eventStateFrom = (result: LoadResult): EventState =>
  result.ok
    ? { status: "found", revision: result.loaded.event.revision_counter }
    : { status: "unavailable" };

export function PlanView({ apiBaseUrl, eventId }: { apiBaseUrl: string; eventId: string }) {
  const [planState, setPlanState] = useState<PlanState>({ status: "loading" });
  const [eventState, setEventState] = useState<EventState>({ status: "loading" });
  const [meta, setMeta] = useState<RulesMetaResponse | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerationFailure, setRegenerationFailure] = useState<string | null>(null);

  /**
   * Which event this page is currently showing. `generate()` runs outside the effect, so it
   * cannot rely on the effect's cleanup: it re-checks this after every await and drops its
   * results if the page has moved to another event in the meantime.
   */
  const showing = `${apiBaseUrl}|${eventId}`;
  const active = useRef(showing);

  useEffect(() => {
    active.current = showing;
    let abandoned = false;

    // Everything on screen belongs to one event. Navigating to another one clears it first, so a
    // previous event's regulatory plan can never be read under a different event's id — not while
    // the new request runs, and not if the new request fails.
    setPlanState({ status: "loading" });
    setEventState({ status: "loading" });
    setMeta(null);
    setRegenerationFailure(null);
    // A generation belonging to the event we just left is no longer this page's business: its
    // result is dropped by the guard in `generate`, and its in-flight label must not sit on the
    // new event's button.
    setRegenerating(false);

    void loadPlan(apiBaseUrl, eventId).then((result) => {
      if (abandoned) return;
      setPlanState(planStateFrom(result));
    });

    // A plan pins the revision it evaluated (AD-13), and the plan endpoint serves the latest plan
    // whether or not the event has moved on since. The event's own revision is what says so, and
    // it is the same comparison the checklist API refuses on: current > pinned means stale.
    void loadEvent(apiBaseUrl, eventId).then((result) => {
      if (abandoned) return;
      setEventState(eventStateFrom(result));
    });

    // The banner states the plan's own pinned version without this, so the plan is never held up
    // waiting for it; the live version only decides how the two rulesets stand.
    void loadRulesMeta(apiBaseUrl).then((result) => {
      if (abandoned) return;
      if (result.ok) setMeta(result.meta);
    });

    return () => {
      abandoned = true;
    };
  }, [apiBaseUrl, eventId, showing]);

  /**
   * Generate a plan for the event as it stands now: the first one when none exists, the
   * replacement when an edit or a rules update has left the stored one behind.
   */
  const generate = async () => {
    const requested = showing;
    setRegenerating(true);
    setRegenerationFailure(null);

    const generated = await generatePlan(apiBaseUrl, eventId);
    if (active.current !== requested) return;
    if (!generated.ok) {
      setRegenerationFailure(generated.message);
      // A POST that answered 2xx wrote a plan even when nothing readable came back, so this event no
      // longer has "no plan" — leaving it `missing` would keep offering to generate and write a
      // second immutable row for the one that exists.
      if (generated.stored) setPlanState({ status: "unavailable", message: generated.message });
      setRegenerating(false);
      return;
    }

    // The generation's own response IS the plan it stored, so it goes on screen here. Asking for
    // the same plan again made the one the organizer had just created conditional on a second
    // request that could be slow or fail; nothing about the plan is learned by re-reading it.
    setPlanState({ status: "ready", plan: generated.plan });
    setRegenerating(false);

    // The revision this plan will be compared against is a separate question, and one this page no
    // longer knows the answer to: the event may have been edited again while the generation ran, so
    // the revision read before it is not evidence about the plan that just replaced it. Unconfirmed
    // until the re-read answers, and the plan above does not wait for it.
    setEventState({ status: "loading" });
    void loadEvent(apiBaseUrl, eventId).then((result) => {
      if (active.current !== requested) return;
      setEventState(eventStateFrom(result));
    });
  };

  if (planState.status === "loading") {
    return (
      <p className="intake__lede" role="status">
        Loading your permit plan…
      </p>
    );
  }

  const plan = planState.status === "ready" ? planState.plan : null;
  const standing =
    plan === null || meta === null
      ? null
      : compareToPinned(meta.ruleset_version, plan.rulesetVersion);

  const isStale =
    plan !== null && eventState.status === "found" && eventState.revision > plan.eventRevision;
  // The banner tells the organizer a newer ruleset exists, so the page has to offer the action it
  // names. Regeneration also needs an event to generate from: an event that cannot be read is not
  // one this page may create an immutable plan row for.
  const canGenerate =
    eventState.status === "found" &&
    (planState.status === "missing" || isStale || standing === "newer");

  return (
    <main className="plan">
      <h1>Your permit plan</h1>

      {plan !== null && (
        /* AC 4: the version this plan was generated from AND the publication date that version
           carried, both read off the plan itself, so a plan viewed after a rules update states the
           pair that produced it rather than a pinned version beside the live file's date. `meta`
           only decides how the live ruleset stands relative to this one. */
        <SnapshotBanner
          rulesetVersion={plan.rulesetVersion}
          snapshotDate={plan.snapshotDate}
          meta={meta}
        />
      )}

      {/* A missing plan and an unreadable one are different facts. Only the first can be answered
          by generating; offering it for the second would write a second immutable plan row for an
          event whose existing plan merely could not be read. */}
      {planState.status !== "ready" && (
        <p className="intake__error" role="alert">
          {planState.message}
        </p>
      )}

      {/* The plan endpoint serves the latest plan whether or not the event has moved on since it
          was generated. Presenting deadlines computed from an older headcount, date or location
          as current is the failure F-101's revision counter exists to prevent. */}
      {isStale && plan !== null && eventState.status === "found" && (
        <p className="plan__stale" role="alert">
          This plan was generated for revision {plan.eventRevision}; the event has since been edited
          and is now at revision {eventState.revision}. The dates and verdict below were computed
          from the older answers.
        </p>
      )}

      {/* Without the event we cannot say whether the plan still matches it, and silence would
          read as confirmation that it does. `loading` says that as loudly as `unavailable`: the
          two requests are independent, so a plan that resolves first renders its verdict and
          deadlines with the revision check still outstanding, and an event request that never
          settles after an edit leaves a superseded plan on screen looking current. Not-yet-checked
          and could-not-be-checked are both unconfirmed until the check comes back. */}
      {plan !== null && eventState.status !== "found" && (
        <p className="plan__unconfirmed" role="status">
          {eventState.status === "loading"
            ? "Checking whether this plan still matches the event; whether it is current is unconfirmed until then."
            : "The event could not be read, so whether this plan is still current is unconfirmed."}
        </p>
      )}

      {/* One place the regeneration action and its failure are rendered, whatever else is on
          screen. A failure that only appeared in the no-plan branch left an organizer clicking a
          re-enabled button with no idea it had failed, and each attempt writes a plan row. */}
      {(canGenerate || regenerationFailure !== null) && (
        <div className="plan__actions">
          {canGenerate && (
            <button
              className="intake__submit"
              type="button"
              onClick={() => void generate()}
              disabled={regenerating}
            >
              {regenerating
                ? "Generating plan…"
                : planState.status === "missing"
                  ? "Generate the plan"
                  : "Regenerate the plan"}
            </button>
          )}
          {regenerationFailure !== null && (
            <p className="intake__error" role="alert">
              {regenerationFailure}
            </p>
          )}
        </div>
      )}

      {plan !== null && (
        <>
          <p className="plan__verdict">
            <strong>{verdictCopy(plan.verdict, plan.verdictDetail)}</strong> · generated{" "}
            {plan.generatedAt.slice(0, 10)} · revision {plan.eventRevision}
          </p>

          {/* F-102's verdict table requires the at-risk threshold to be labelled as PopEngine's
              internal planning buffer, never an official one. On screen, beside the countdown it
              qualifies — an organizer reading "apply within 10 days" otherwise has nothing telling
              them it is not the agency's deadline. */}
          {plan.verdict === "FEASIBLE_AT_RISK" && (
            <p className="plan__buffer" role="note">
              {AT_RISK_BUFFER_NOTE}
            </p>
          )}

          {plan.findings.length === 0 ? (
            /* F-201 AC 4 and ARCHITECTURE both make the near-empty result first-class, in those
               words. An empty container under a verdict reads as an evaluation that failed or was
               dropped; the sentence is what says the evaluation ran and found nothing. (The
               ruleset's engine_conventions phrases the same statement "from the provided facts";
               the spec governs this feature's acceptance, so its wording is the one rendered.) */
            <p className="plan__empty">
              No new city event requirement identified from your answers.
            </p>
          ) : (
            <div className="plan__lines">
              {plan.findings.map((finding) => (
                <PlanLine key={finding.ruleIds.join("+")} finding={finding} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
