import type { FindingKind } from "@pop-engine/engine";

/**
 * A fee the ruleset does not publish, said explicitly rather than left blank.
 *
 * A blank cell reads as a rendering fault, and a zero would be an amount no source states, so where
 * the artifact is known to charge and carries no amount, the absence is rendered as itself. Which
 * findings those are is `isFeeBearing` below, and it is narrower than "a filing". Fees are never
 * summed, for the same reason the amount is never reformatted: `output.fee.display` is published
 * TEXT, and a total would be a number this product computes and no agency publishes.
 */
export const FEE_NOT_PUBLISHED = "fee not published";

/**
 * Whether a finding is the kind of thing the artifact is EVIDENCED to charge for.
 *
 * "fee not published" makes two claims at once: that a price exists, and that its amount was not
 * published. Rendering it needs grounds for both. A kind qualifies here only because some rule of
 * that kind publishes an amount somewhere in the artifact, which is what shows the kind is charged
 * for at all: eighteen of twenty-one `permit` rules and one of two `insurance` rules do.
 *
 * DECIDED ON KIND BECAUSE IT CANNOT BE DECIDED ON THE FEE. `ruleset.ts` collapses an absent `fee`
 * and an explicit `fee: null` to one value, and `Finding` carries only `feeDisplay: string | null`,
 * so at the point of rendering "this has no price" and "this has a price nobody published" are the
 * same input. Nothing downstream distinguishes them.
 *
 * `notification` AND `registration` ARE DELIBERATELY ABSENT, AND ARE NOT AN OVERSIGHT. Both are
 * filings an organizer submits, which is the reasoning that first put them here, and it is not
 * enough: being a filing does not establish that it is charged for. The artifact publishes an amount
 * on nought of one `notification` rule (`DOHMH-ORGANIZER-NOTIFY-001`) and nought of one
 * `registration` rule (`DEP-GENERATOR-REG-001`); both carry an explicit `fee: null`, which cannot be
 * told from an absent one. So there are no grounds for either claim, and asserting both from the
 * kind alone is the same defect as asserting them from a null fee. Omitting the row is not a claim
 * that the filing is free: it is the absence of a claim, which is what the absence of evidence
 * licenses. Re-add a kind here only when a rule of that kind publishes an amount, or when some field
 * separates an unpublished fee from no fee; `fee.test.ts` fails if the set and the evidence part.
 *
 * The other kinds describe a condition rather than a filing, which is F-201's own line: "advisory,
 * note and classification findings describe a condition rather than a filing".
 *
 * Narrowed in one direction only. Both callers render a published `feeDisplay` whatever the kind, so
 * a kind absent from this set still shows an amount it does publish. Only the ASSERTION of an
 * absence is limited here, never the amount itself.
 */
const FEE_BEARING_KINDS: ReadonlySet<FindingKind> = new Set<FindingKind>(["permit", "insurance"]);

export const isFeeBearing = (kind: FindingKind): boolean => FEE_BEARING_KINDS.has(kind);
