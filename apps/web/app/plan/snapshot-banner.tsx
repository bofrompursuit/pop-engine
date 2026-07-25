import type { RulesMetaResponse } from "./plan-api";

// F-206 AC 1 and AC 4: every plan and checklist view states which rules snapshot produced what
// it is showing. Exported on its own so the checklist view (F-202) renders the same banner from
// the same values rather than a second copy of this copy.

/**
 * A snapshot date is the date the ruleset was PUBLISHED, not a date on which its facts were
 * re-verified. "Verified as of" would claim something the artifact does not say, and each line's
 * own verification status is what carries that claim.
 */
const PUBLISHED_PREFIX = "published";

/**
 * `2026-07-25` is a calendar date, not an instant. Parsing it as UTC midnight and formatting it
 * in UTC returns the day the artifact names; letting the browser's zone in would render the
 * previous day anywhere west of Greenwich.
 */
export function formatSnapshotDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function SnapshotBanner({
  rulesetVersion,
  meta,
}: {
  /** The version to state. On a plan this is the plan's pinned version, never the live file's. */
  rulesetVersion: string;
  /** What the api's loaded rules file says about itself; null when it could not be read. */
  meta: RulesMetaResponse | null;
}) {
  const isLiveVersion = meta !== null && meta.ruleset_version === rulesetVersion;

  return (
    <aside className="snapshot" aria-label="Rules snapshot">
      <span className="snapshot__version">Rules snapshot {rulesetVersion}</span>
      {/* The date is only known for the version the api has loaded. Stating the live file's
          publication date next to an older pinned version would date it wrongly, so a superseded
          plan names its version and says a newer ruleset exists instead. */}
      {isLiveVersion && (
        <span className="snapshot__published">
          {" · "}
          {PUBLISHED_PREFIX} {formatSnapshotDate(meta.snapshot_date)}
        </span>
      )}
      {meta !== null && !isLiveVersion && (
        <span className="snapshot__superseded">
          {" · "}a newer ruleset ({meta.ruleset_version}) exists; regenerate to update
        </span>
      )}
    </aside>
  );
}
