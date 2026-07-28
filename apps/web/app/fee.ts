import type { FindingKind } from "@pop-engine/engine";

/**
 * A fee the ruleset does not publish, said explicitly rather than left blank.
 *
 * A blank cell reads as a rendering fault, and a zero would be an amount no source states, so for a
 * FILING whose amount the artifact does not carry the absence is rendered as itself. Fees are never
 * summed, for the same reason the amount is never reformatted: `output.fee.display` is published
 * TEXT, and a total would be a number this product computes and no agency publishes.
 */
export const FEE_NOT_PUBLISHED = "fee not published";

/**
 * Whether a finding is the kind of thing that has a price at all.
 *
 * These four kinds are filings an organizer submits and can be charged for. The other five describe
 * a condition rather than a filing — F-201 draws the same line in its own words, that "advisory,
 * note and classification findings describe a condition rather than a filing" — and saying "fee not
 * published" of a prohibition, an exemption or a no-new-requirement note tells the organizer that a
 * price exists and was withheld. That is a claim about the world no source supports, made by the
 * renderer rather than by a rule.
 *
 * DECIDED ON KIND BECAUSE IT CANNOT BE DECIDED ON THE FEE. The parser normalises an absent `fee` and
 * an explicit `fee: null` to one value, so at the point of rendering "this has no price" and "this
 * has a price nobody published" are the same input. The kind separates them; nothing else on the
 * finding does.
 *
 * Two properties make this safe in the direction that matters. No advisory, note, eligibility,
 * prohibition or dependency rule in v2.8 publishes a fee, so excluding them suppresses nothing that
 * exists (`fee.test.ts` holds that against the artifact). And both callers render a published
 * `feeDisplay` whatever the kind, so a future kind that does publish an amount still shows it —
 * only the ASSERTION of an absence is limited to this set, never the amount itself.
 */
const FEE_BEARING_KINDS: ReadonlySet<FindingKind> = new Set<FindingKind>([
  "permit",
  "insurance",
  "notification",
  "registration",
]);

export const isFeeBearing = (kind: FindingKind): boolean => FEE_BEARING_KINDS.has(kind);
