"use client";

import { useEffect, useState } from "react";
import { regeneratePlan } from "../intake/events-api";
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

  useEffect(() => {
    let abandoned = false;

    // Everything on screen belongs to one event. Navigating to another one clears it first, so a
    // previous event's regulatory plan can never be read under a different event's id — not while
    // the new request runs, and not if the new request fails.
    setPlan(null);
    setMeta(null);
    setFailure(null);
    setLoading(true);

    void loadPlan(apiBaseUrl, eventId).then((result) => {
      if (abandoned) return;
      if (result.ok) setPlan(result.plan);
      else setFailure(result.message);
      setLoading(false);
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

  /** First run for an event: no plan exists yet, so generate one and show it. */
  const generate = async () => {
    setGenerating(true);
    setFailure(null);
    const generated = await regeneratePlan(apiBaseUrl, eventId);
    if (!generated.ok) {
      setFailure(generated.message);
      setGenerating(false);
      return;
    }
    const result = await loadPlan(apiBaseUrl, eventId);
    if (result.ok) setPlan(result.plan);
    else setFailure(result.message);
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

  return (
    <main className="plan">
      <h1>Your permit plan</h1>
      {/* AC 4: the version this plan was generated from, read off the plan itself, so a plan
          viewed after a rules update still names the ruleset that produced it. */}
      <SnapshotBanner rulesetVersion={plan.rulesetVersion} meta={meta} />

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
