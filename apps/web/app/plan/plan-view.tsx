"use client";

import { useEffect, useState } from "react";
import { loadPlan, loadRulesMeta, type PlanResponse, type RulesMetaResponse } from "./plan-api";
import { PlanLine } from "./plan-line";
import { SnapshotBanner } from "./snapshot-banner";

// The plan view. F-206 owns what this page is for: the snapshot banner and the per-line citation
// and verification-status rendering. The verdict is shown as the plan states it; F-102's branch
// tables and rescope ladder are its own feature.

const humanize = (token: string): string => token.replace(/_/g, " ").toLowerCase();

export function PlanView({ apiBaseUrl, eventId }: { apiBaseUrl: string; eventId: string }) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [meta, setMeta] = useState<RulesMetaResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let abandoned = false;
    void Promise.all([loadPlan(apiBaseUrl, eventId), loadRulesMeta(apiBaseUrl)]).then(
      ([planResult, metaResult]) => {
        if (abandoned) return;
        if (planResult.ok) setPlan(planResult.plan);
        else setFailure(planResult.message);
        // The banner still states the plan's own version when the live one cannot be read; only
        // the "a newer ruleset exists" comparison needs the api's file.
        if (metaResult.ok) setMeta(metaResult.meta);
        setLoading(false);
      },
    );
    return () => {
      abandoned = true;
    };
  }, [apiBaseUrl, eventId]);

  if (loading) {
    return (
      <p className="intake__lede" role="status">
        Loading your permit plan…
      </p>
    );
  }

  if (plan === null) {
    return (
      <p className="intake__error" role="alert">
        {failure}
      </p>
    );
  }

  return (
    <main className="plan">
      <h1>Your permit plan</h1>
      {/* AC 4: the version this plan was generated from, read off the plan itself, so a plan
          viewed after a rules update still names the ruleset that produced it. */}
      <SnapshotBanner rulesetVersion={plan.rulesetVersion} meta={meta} />

      <p className="plan__verdict">
        <strong>{humanize(plan.verdict)}</strong> · generated {plan.generatedAt.slice(0, 10)} ·
        revision {plan.eventRevision}
      </p>

      <div className="plan__lines">
        {plan.findings.map((finding) => (
          <PlanLine key={finding.ruleIds.join("+")} finding={finding} />
        ))}
      </div>
    </main>
  );
}
