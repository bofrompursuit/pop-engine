import { CONFIRM_WITH_AGENCY, type Finding, type FindingSource } from "@pop-engine/engine";

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
const hasDeadlineData = (finding: Finding): boolean =>
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
const deadlineTypeLabel = (finding: Finding): string | null =>
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

      {/* SPEC CONFLICT, parked on issue #89 — behaviour deliberately left as it is.
          F-206 AC 2 requires every plan line to show a citation, and its edge-case note assumes a
          missing source is impossible "given rules-file validation". The rules validator (#84)
          deliberately permits a null source when `verification.status` is COVERAGE_GAP, and both
          ADV-ALCOHOL-PUBLIC-001 and ADV-SAPO-OTHER-CLASS-001 trigger with none. Two approved
          contracts therefore disagree, so a source-less line renders its advisory text and its
          COVERAGE_GAP status with no citation area. Inventing a citation is not an option and
          neither is asserting one exists; the resolution is the product owner's. */}
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
