"use client";

import { useEffect, useState } from "react";
import { loadEvent, regeneratePlan } from "../intake/events-api";
import { loadPlan, loadRulesMeta, type PlanResponse, type RulesMetaResponse } from "./plan-api";
import { PlanLine } from "./plan-line";
import { SnapshotBanner } from "./snapshot-banner";
import { verdictCopy } from "./verdict-copy";

// The plan view. F-206 owns what this page is for: the snapshot banner and the per-line citation
// and verification-status rendering. The verdict is shown in its approved copy; F-102's branch
// tables and rescope ladder are its own feature.

export function PlanView({ apiBaseUrl, eventId }: { apiBaseUrl: string; eventId: string }) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [meta, setMeta] = useState<RulesMetaResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  /** The event's revision now, or null when it could not be read. */
  const [currentRevision, setCurrentRevision] = useState<number | null>(null);

  useEffect(() => {
    let abandoned = false;

    // Everything on screen belongs to one event. Navigating to another one clears it first, so a
    // previous event's regulatory plan can never be read under a different event's id — not while
    // the new request runs, and not if the new request fails.
    setPlan(null);
    setMeta(null);
    setFailure(null);
    setCurrentRevision(null);
    setLoading(true);

    void loadPlan(apiBaseUrl, eventId).then((result) => {
      if (abandoned) return;
      if (result.ok) setPlan(result.plan);
      else setFailure(result.message);
      setLoading(false);
    });

    // A plan pins the revision it evaluated (AD-13), and the plan endpoint serves the latest plan
    // whether or not the event has moved on since. The event's own revision is what says so, and
    // it is the same comparison the checklist API refuses on: current > pinned means stale.
    void loadEvent(apiBaseUrl, eventId).then((result) => {
      if (abandoned) return;
      if (result.ok) setCurrentRevision(result.loaded.event.revision_counter);
    });

    // The banner states the plan's own pinned version without this, so the plan is never held up
    // waiting for it; the live version only decides whether to say a newer ruleset exists.
    void loadRulesMeta(apiBaseUrl).then((result) => {
      if (abandoned) return;
      if (result.ok) setMeta(result.meta);
    });

    return () => {
      abandoned = true;
    };
  }, [apiBaseUrl, eventId]);

  /**
   * Generate a plan for the event as it stands now: the first one when none exists, and the
   * replacement when an edit has left the stored plan behind.
   */
  const generate = async () => {
    setGenerating(true);
    setFailure(null);
    const generated = await regeneratePlan(apiBaseUrl, eventId);
    if (!generated.ok) {
      setFailure(generated.message);
      setGenerating(false);
      return;
    }
    const [result, event] = await Promise.all([
      loadPlan(apiBaseUrl, eventId),
      loadEvent(apiBaseUrl, eventId),
    ]);
    if (result.ok) setPlan(result.plan);
    else setFailure(result.message);
    if (event.ok) setCurrentRevision(event.loaded.event.revision_counter);
    setGenerating(false);
  };

  if (loading) {
    return (
      <p className="intake__lede" role="status">
        Loading your permit plan…
      </p>
    );
  }

  if (plan === null) {
    return (
      <main className="plan">
        <h1>Your permit plan</h1>
        <p className="intake__error" role="alert">
          {failure}
        </p>
        <button
          className="intake__submit"
          type="button"
          onClick={() => void generate()}
          disabled={generating}
        >
          {generating ? "Generating plan…" : "Generate the plan"}
        </button>
      </main>
    );
  }

  const isStale = currentRevision !== null && currentRevision > plan.eventRevision;

  return (
    <main className="plan">
      <h1>Your permit plan</h1>
      {/* AC 4: the version this plan was generated from, read off the plan itself, so a plan
          viewed after a rules update still names the ruleset that produced it. */}
      <SnapshotBanner rulesetVersion={plan.rulesetVersion} meta={meta} />

      {/* The plan endpoint serves the latest plan whether or not the event has moved on since it
          was generated. Presenting deadlines computed from an older headcount, date or location
          as current is the failure F-101's revision counter exists to prevent, so the plan is
          shown with what it was computed against and an action to replace it. */}
      {isStale && (
        <div className="plan__stale" role="alert">
          <p>
            This plan was generated for revision {plan.eventRevision}; the event has since been
            edited and is now at revision {currentRevision}. The dates and verdict below were
            computed from the older answers.
          </p>
          <button type="button" onClick={() => void generate()} disabled={generating}>
            {generating ? "Regenerating plan…" : "Regenerate the plan"}
          </button>
        </div>
      )}
      {/* Without the event we cannot say whether the plan still matches it, and silence would
          read as confirmation that it does. */}
      {currentRevision === null && (
        <p className="plan__unconfirmed" role="status">
          The event could not be read, so whether this plan is still current is unconfirmed.
        </p>
      )}

      <p className="plan__verdict">
        <strong>{verdictCopy(plan.verdict, plan.verdictDetail)}</strong> · generated{" "}
        {plan.generatedAt.slice(0, 10)} · revision {plan.eventRevision}
      </p>

      <div className="plan__lines">
        {plan.findings.map((finding) => (
          <PlanLine key={finding.ruleIds.join("+")} finding={finding} />
        ))}
      </div>
    </main>
  );
}
