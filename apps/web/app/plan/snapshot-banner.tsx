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
 * AC 4's copy for a plan whose `snapshot_date` is null — one generated before migration 002 added
 * the column. The version alone is still the honest answer to "which rules produced this"; the
 * live file's date is not, and the column is never backfilled, because the plan does not record
 * which artifact it read and a derived date would assert provenance nothing witnessed.
 */
const DATE_NOT_RECORDED = "publication date not recorded for this plan";

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

/**
 * `nyc.vMAJOR.MINOR` is the only ruleset version shape BASELINE.md declares, so the parts are
 * parsed and compared as numbers. String comparison would order v2.10 below v2.9.
 */
const RULESET_VERSION = /^([a-z-]+)\.v(\d+)\.(\d+)$/;

type ParsedVersion = { jurisdiction: string; major: number; minor: number };

export function parseRulesetVersion(version: string): ParsedVersion | null {
  const parsed = RULESET_VERSION.exec(version);
  if (parsed === null) return null;
  return {
    jurisdiction: parsed[1] ?? "",
    major: Number(parsed[2]),
    minor: Number(parsed[3]),
  };
}

/**
 * How the service's live ruleset stands relative to the one a plan pinned.
 *
 * "different" covers a version either side cannot be parsed, and versions from two different
 * jurisdictions, because neither can be ordered. A rollback is a real operation now that three
 * versions are published, and telling an organizer to regenerate onto an OLDER ruleset would
 * downgrade their plan — so directional copy is only used when the direction is actually known.
 */
export function compareToPinned(
  live: string,
  pinned: string,
): "same" | "newer" | "older" | "different" {
  if (live === pinned) return "same";
  const liveVersion = parseRulesetVersion(live);
  const pinnedVersion = parseRulesetVersion(pinned);
  if (
    liveVersion === null ||
    pinnedVersion === null ||
    liveVersion.jurisdiction !== pinnedVersion.jurisdiction
  ) {
    return "different";
  }
  if (liveVersion.major !== pinnedVersion.major) {
    return liveVersion.major > pinnedVersion.major ? "newer" : "older";
  }
  if (liveVersion.minor === pinnedVersion.minor) return "different";
  return liveVersion.minor > pinnedVersion.minor ? "newer" : "older";
}

export function SnapshotBanner({
  rulesetVersion,
  snapshotDate,
  meta,
}: {
  /** The version to state. On a plan this is the plan's pinned version, never the live file's. */
  rulesetVersion: string;
  /**
   * The publication date that version carried, pinned on the same row (AC 4). Null means the plan
   * predates migration 002 and never recorded one.
   */
  snapshotDate: string | null;
  /**
   * What the api's loaded rules file says about itself; null when it could not be read. Used for
   * one thing: how the live ruleset stands relative to the pinned one. It is not where either
   * value in the pair above comes from.
   */
  meta: RulesMetaResponse | null;
}) {
  const standing = meta === null ? null : compareToPinned(meta.ruleset_version, rulesetVersion);

  return (
    <aside className="snapshot" aria-label="Rules snapshot">
      {/* The pair, both read off the plan's own row. Pairing this version with the live file's
          date would render a combination that never existed on any artifact. */}
      <span className="snapshot__version">Rules snapshot {rulesetVersion}</span>
      {snapshotDate === null ? (
        <span className="snapshot__undated">
          {" · "}
          {DATE_NOT_RECORDED}
        </span>
      ) : (
        <span className="snapshot__published">
          {" · "}
          {PUBLISHED_PREFIX} {formatSnapshotDate(snapshotDate)}
        </span>
      )}
      {/* Everything below compares the plan's pinned version with the api's live one, so it
          renders only when the live one could be read. */}
      {meta !== null && (
        <>
          {/* Only the "newer" case tells an organizer to regenerate. Regenerating onto an older
              ruleset would replace their plan with one built from superseded rules, and a version
              that cannot be ordered says nothing about which way round the two stand. */}
          {standing === "newer" && (
            <span className="snapshot__superseded">
              {" · "}a newer ruleset ({meta.ruleset_version}) exists; regenerate to update
            </span>
          )}
          {standing === "older" && (
            <span className="snapshot__superseded">
              {" · "}the service is running an older ruleset ({meta.ruleset_version})
            </span>
          )}
          {standing === "different" && (
            <span className="snapshot__superseded">
              {" · "}the service is running a different ruleset ({meta.ruleset_version})
            </span>
          )}
        </>
      )}
    </aside>
  );
}
