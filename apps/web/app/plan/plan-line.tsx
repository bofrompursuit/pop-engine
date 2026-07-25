import { CONFIRM_WITH_AGENCY, type Finding, type FindingSource } from "@pop-engine/engine";

// F-206 AC 2 and AC 3: every plan line carries its citation and its verification status, both
// visible. Nothing here composes regulatory prose — every string an organizer reads is either
// published in the rules artifact and carried through the plan, or one of the schema's own
// status/kind tokens.

const humanize = (token: string): string => token.replace(/_/g, " ");

/**
 * The status is the plan item's stored `verification_status` (canonical, NOT NULL). The nullable
 * `verified_status` column in migration 001 is a deprecated duplicate and is never read.
 */
function VerificationBadge({ status }: { status: Finding["verificationStatus"] }) {
  return (
    <span className={`line__status line__status--${status.toLowerCase()}`}>{humanize(status)}</span>
  );
}

/**
 * A citation with click-through to each official page it rests on. A source with no resolved URL
 * renders its citation text and nothing clickable, so a line never offers a dead link.
 */
function Citation({ source }: { source: FindingSource }) {
  return (
    <li className="line__citation">
      <span className="line__citation-text">{source.citation}</span>
      {source.urls.length === 0 ? null : (
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

export function PlanLine({ finding }: { finding: Finding }) {
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

      {finding.deadlineDisplay !== null && (
        <p className="line__deadline">
          <span className="line__deadline-display">{finding.deadlineDisplay}</span>
          {finding.latestApplyDate !== null && (
            <span className="line__deadline-date"> · apply by {finding.latestApplyDate}</span>
          )}
          <span className="line__deadline-status">
            {" · "}
            {humanize(finding.deadlineStatus)}
          </span>
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

      {/* Some rules publish no portal URL at all: NYPD-SOUND-001 names the precinct and the form
          number instead, and that text is the entire filing route for the line. */}
      {finding.portalUrl !== null ? (
        <p className="line__portal">
          <a href={finding.portalUrl} target="_blank" rel="noreferrer noopener">
            {finding.portalName ?? finding.portalUrl}
          </a>
        </p>
      ) : (
        finding.portalName !== null && <p className="line__portal">{finding.portalName}</p>
      )}
      {finding.portalInstructions !== null && (
        <p className="line__portal-instructions">{finding.portalInstructions}</p>
      )}

      {finding.notes.map((note) => (
        <p className="line__note" key={note}>
          {note}
        </p>
      ))}

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
