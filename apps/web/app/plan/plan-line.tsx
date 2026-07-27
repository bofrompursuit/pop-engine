import { useEffect } from "react";
import { CONFIRM_WITH_AGENCY, type FindingSource } from "@pop-engine/engine";
import { PortalBlock } from "../portal-block";
import { NOT_COVERED_BY_RULESET } from "../verification-copy";
import type { ConsumedFinding } from "./plan-api";

// F-206 AC 2 and AC 3: every plan line carries its citation and its verification status, both
// visible. Nothing here composes regulatory prose — every string an organizer reads is either
// published in the rules artifact and carried through the plan, or one of the schema's own
// status/kind tokens.

const humanize = (token: string): string => token.replace(/_/g, " ");

/**
 * Whether this line has anything to say about timing. `deadlineStatus` is always set, so
 * `not_applicable` with no dates, no prose and no published deadline means there is nothing to
 * render.
 */
const hasDeadlineData = (finding: ConsumedFinding): boolean =>
  finding.deadlineDisplay !== null ||
  finding.latestApplyDate !== null ||
  finding.applyAfterDate !== null ||
  finding.deadlineStatus !== "not_applicable" ||
  finding.deadline !== null;

/**
 * The published deadline's own type, for a rule that states a kind of deadline but no prose and
 * no computable date. SAPO-INSURANCE-001 publishes `{type: "before_issuance"}` and nothing else:
 * "before issuance" is the whole timing requirement, and dropping it leaves the line silent about
 * when the insurance has to exist.
 */
const deadlineTypeLabel = (finding: ConsumedFinding): string | null =>
  finding.deadlineDisplay === null &&
  finding.latestApplyDate === null &&
  finding.applyAfterDate === null &&
  finding.deadlineStatus === "not_applicable" &&
  finding.deadline !== null
    ? humanize(finding.deadline.type)
    : null;

/**
 * The status is the plan item's stored `verification_status` (canonical, NOT NULL). The nullable
 * `verified_status` column in migration 001 is a deprecated duplicate and is never read.
 */
function VerificationBadge({ status }: { status: ConsumedFinding["verificationStatus"] }) {
  return (
    <span className={`line__status line__status--${status.toLowerCase()}`}>{humanize(status)}</span>
  );
}

/**
 * A citation with click-through to each official page it rests on. A source with no resolved URL
 * renders its citation text and nothing clickable, so a line never offers a dead link.
 *
 * F-206's Edge Cases pair that fallback with "log loudly", and loudly is the operative half. The
 * state should be unreachable — every rule in the published ruleset carries at least one URL on its
 * source — so reaching it means a stored plan has lost its click-through, and a plan row is
 * immutable with nothing re-deriving it, so no later read repairs or reports it. The log is the
 * only way an operator finds out. Not surfaced to the organizer: they can do nothing with it, and
 * the citation text they see is still correct.
 */
function Citation({ source }: { source: FindingSource }) {
  const hasNoUrl = source.urls.length === 0;

  useEffect(() => {
    if (!hasNoUrl) return;
    console.error(
      "F-206: a stored plan finding carries citation text with no source URL; rendering the citation without a link",
      { ruleId: source.ruleId, citation: source.citation },
    );
  }, [hasNoUrl, source.ruleId, source.citation]);

  return (
    <li className="line__citation">
      <span className="line__citation-text">{source.citation}</span>
      {hasNoUrl ? null : (
        <span className="line__citation-links">
          {source.urls.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer noopener">
              source {source.urls.length > 1 ? index + 1 : ""}
            </a>
          ))}
        </span>
      )}
    </li>
  );
}

export function PlanLine({ finding }: { finding: ConsumedFinding }) {
  const ruleIds = finding.ruleIds.join(", ");
  const isResearchRequired = finding.verificationStatus === "RESEARCH_REQUIRED";

  return (
    /* An article rather than a list item: each finding is a self-contained requirement, and its
       citations are the list inside it. */
    <article className="line" aria-labelledby={`line-${finding.ruleIds.join("-")}`}>
      <div className="line__head">
        <h3 className="line__name" id={`line-${finding.ruleIds.join("-")}`}>
          {finding.name ?? ruleIds}
        </h3>
        <VerificationBadge status={finding.verificationStatus} />
      </div>

      <p className="line__meta">
        {/* advisory, note and classification findings legitimately publish no agency, so the
            label is omitted rather than rendered empty. */}
        {finding.agency !== null && <span className="line__agency">{finding.agency}</span>}
        <span className="line__disposition">{humanize(finding.disposition)}</span>
        <span className="line__rule-ids">{ruleIds}</span>
        {finding.lastVerifiedDate !== null && (
          <span className="line__verified-date">last verified {finding.lastVerifiedDate}</span>
        )}
      </p>

      {/* A RESEARCH_REQUIRED line has no located primary source, which the organizer has to see
          on the line itself rather than discover in a tooltip. */}
      {isResearchRequired && (
        <p className="line__research" role="note">
          {CONFIRM_WITH_AGENCY}
        </p>
      )}

      {/* Both readings of an official conflict, verbatim. The sources below carry every page the
          two readings come from. */}
      {finding.conflictText !== null && <p className="line__conflict">{finding.conflictText}</p>}
      {finding.noteText !== null && finding.noteText !== finding.conflictText && (
        <p className="line__note">{finding.noteText}</p>
      )}

      {/* The published prose is optional and ten dated rules omit it, including
          SAPO-STREET-LARGE-001 — the demo anchor's blocking finding. Gating the block on the
          prose hid the computed apply-by date and the missed status, which are the two facts
          that line exists to state. Any deadline data at all renders the block. */}
      {hasDeadlineData(finding) && (
        <p className="line__deadline">
          {finding.deadlineDisplay !== null && (
            <span className="line__deadline-display">{finding.deadlineDisplay}</span>
          )}
          {deadlineTypeLabel(finding) !== null && (
            <span className="line__deadline-type">{deadlineTypeLabel(finding)}</span>
          )}
          {finding.latestApplyDate !== null && (
            <span className="line__deadline-date">
              {finding.deadlineDisplay !== null && " · "}apply by {finding.latestApplyDate}
            </span>
          )}
          {/* When pursuit can realistically begin, NOT a bar on filing earlier. The engine dates
              this from the upstream's published processing range and says in
              findings.ts why it stops short of the stronger claim: the strictness of the
              ordering is RESEARCH_REQUIRED on the dependency rule, whose own note_text — rendered
              on this line above — states that a strict issued-before-filed sequence is not
              confirmed by located primary text. "Not before" would assert the sequencing the
              verification owner declined to assert. */}
          {finding.applyAfterDate !== null && (
            <span className="line__deadline-after">
              {" · "}earliest realistic filing {finding.applyAfterDate}
            </span>
          )}
          {finding.deadlineStatus !== "not_applicable" && (
            <span className="line__deadline-status">
              {" · "}
              {humanize(finding.deadlineStatus)}
            </span>
          )}
        </p>
      )}
      {finding.timelineUnresolvedReason !== null && (
        <p className="line__timeline">{finding.timelineUnresolvedReason}</p>
      )}
      {finding.deadlineUnknownFields.length > 0 && (
        <p className="line__unknowns">
          depends on: {finding.deadlineUnknownFields.map(humanize).join(", ")}
        </p>
      )}

      {finding.feeDisplay !== null && <p className="line__fee">{finding.feeDisplay}</p>}

      {/* F-204: application path from the rules data only. AC 4 — "apply at [portal]", new tab. */}
      <PortalBlock
        portalName={finding.portalName}
        portalUrl={finding.portalUrl}
        portalInstructions={finding.portalInstructions}
        className="line__portal"
        instructionsClassName="line__portal-instructions"
      />

      {finding.notes.map((note) => (
        <p className="line__note" key={note}>
          {note}
        </p>
      ))}

      {/* COVERAGE_GAP means this ruleset version does not model the combination, not that a
          source is missing (published legend, rules/nyc-rules.v2.8.json). Saying "no source" here
          would state RESEARCH_REQUIRED's meaning, which renders CONFIRM_WITH_AGENCY above. */}
      {finding.verificationStatus === "COVERAGE_GAP" && finding.sources.length === 0 && (
        <p className="line__not-covered">{NOT_COVERED_BY_RULESET}</p>
      )}
      {finding.sources.length > 0 && (
        <ul className="line__citations">
          {finding.sources.map((source) => (
            <Citation key={`${source.ruleId}:${source.citation}`} source={source} />
          ))}
        </ul>
      )}
    </article>
  );
}
