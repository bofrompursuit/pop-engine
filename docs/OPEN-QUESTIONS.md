# PopEngine — Open Questions & Interpretation Register (v2)

**Status:** Living document, rebuilt 2026-07-22 for the nyc.v2.2 baseline. The v1-era register (interpretations I-1–I-12, items S-1–S-5, P-1–P-5) is superseded; resolved decisions were carried into the ruleset, `ARCHITECTURE.md`, and `DESIGN.md`, and its history is in git. This register lists only what is genuinely open, with owners.
**Rule:** nothing here is authority for implementation (`DOCUMENTATION-GOVERNANCE.md` §1). An open item means "don't guess" — render "confirm with agency," ask the team, or wait for the owner.

## 1. Blocking the baseline (resolve before feature branches; see BASELINE.md)

| # | Item | Owner | Detail |
|---|---|---|---|
| B-1 | ~~Verification-owner sign-off of nyc.v2.2's SOURCE_CONFIRMED facts~~ | Dev 4 | **RESOLVED 2026-07-22:** baseline ratified; per-fact promotion to VERIFIED continues during the build via the verification issue (evidence pre-collected in `VERIFICATION-SOURCES.md`). |
| B-2 | ~~Team ratification of the corrected baseline~~ | All 4 | **RESOLVED 2026-07-22:** ruleset v2.1 + fixtures v3 + re-anchored demo approved. |
| B-3 | `events` schema sign-off | All 4 | The migration mirrors the ruleset's `intake_fields` registry (ARCHITECTURE schema section). Day-1 Phase 0 gate, unchanged. |

## 2. Regulatory research items (owner: Dev 4; primary sources only)

| # | Item | Blocks | Notes |
|---|---|---|---|
| R-1 | SAPO street-event size CRITERIA (what makes Small vs Medium vs Large) | Demo anchor quality | Deadline/fee mapping per size is source-confirmed; the classification criteria are not published on fetched pages. Until resolved, the intake asks the user to classify per SAPO guidance, `unknown` → CONDITIONAL. Likely requires calling SAPO or reading the E-Apply flow. |
| R-2 | FDNY lead times: fuel, open flame, generator | Timeline completeness (D, E) | No published lead located in two passes. v1's "45–60 days" cited the Parks special-event guide, which was not specifically re-checked for that sentence — one targeted look before declaring it wrong. |
| R-3 | Parks→NYPD sound sequencing (permission vs. issued-before-filed) | C's timeline copy | Encoded as "permission precedes pursuit; confirm exact sequencing." |
| R-4 | TPA lead wording: "earlier than 10 days" (DOB code notes) vs "10 business days" (external critique) | F's branch copy | Pin exact wording before UI copy ships. |
| R-5 | Single Block Festival deadline OFFICIAL_CONFLICT (90 days vs Dec 31 prior year) | Nothing in MVP (out-of-scope class) | Render the conflict; resolve with CECM eventually. |
| R-6 | Parks exactly-20 threshold OFFICIAL_CONFLICT ("more than 20" portal/311 vs "twenty or more" FAQ) | Boundary fixture copy | Encoded as MAY_BE_REQUIRED at exactly 20. |
| R-7 | Parks TUA trigger OFFICIAL_CONFLICT (any-sale on 3 pages vs 500+ hedge in FAQ) | Future vending scenarios | Encoded leaning any-sale; confirm with Revenue Division (212) 360-1397. |
| R-8 | SAPO insurance certificate-holder/additional-insured wording per class | F-205 card copy | $1M + City-as-additional-insured + exceptions are source-confirmed; exact certificate wording per class is not. |
| R-9 | DOB instrument mapping for event tents (Alteration Type 2/3 vs Temporary Use Permit) | E's portal link | Both pages fetched; which instrument applies to a one-day event tent needs confirmation. |
| R-10 | Holiday-calendar source for `us-ny-business-days@2026` | Business-day math beyond fixture windows | Fixture windows contain no holidays; a real calendar source (NYSE? NY courts? city holidays?) must be chosen and pinned before arbitrary user dates are trusted. |
| R-11 | DOHMH vendor-permit lead times (TFSE issuance time) | A/B/E "confirm with agency" lines | Organizer's 30-day notification is confirmed; vendor permit issuance time is not. |

## 3. Technical decisions still open (team)

| # | Item | Owner | Recommendation |
|---|---|---|---|
| T-1 | Twilio A2P timing | Dev 4 | Policy set 2026-07-22: email live + labeled SMS simulation unless approval lands by day 5. Track the approval date. |
| T-2 | Migration tool, deploy hosts, email provider — the "one answer each" list | Dev 4 + team | **RESOLVED 2026-07-23 (issue #1):** Railway (host) · Supabase (Postgres + S3-compatible storage) · Resend (email) · node-pg-migrate (migrations). Recorded in `BASELINE.md`; setup in `DEPLOY.md`. |
| T-3 | Demo access-gate mechanism (basic auth vs IP allowlist) | Dev 4 | **RESOLVED 2026-07-23 (issue #1):** Cloudflare Access (host-level gate, email-OTP) chosen; satisfies AD-12 with no in-app auth (AD-5). Recorded in `BASELINE.md`; setup in `DEPLOY.md`. |

## 4. Product questions (deferred, not blocking)

- Digital entry pass stays P2 (F-401 extension), decided 2026-07-22 (v1 register P-1).
- Public-space alcohol real rules: Phase 2 ruleset research (advisory + intake warning ship in MVP).
- Full 59-rule coverage (`rules/proposals/nyc-rules.v2-full-draft.json`): post-capstone target; each adopted rule goes through the same evidence + sign-off path as v2.1.
- `ARCHITECTURE-FUTURE.md` team read + approval: schedule after the demo.

## 5. Process Note

Every promotion to VERIFIED follows the governance rules: primary sources only, record URL + date checked, update the rules file's `verification` block, named reviewer. AI output (including the research dossier) is evidence to check, never a source that promotes a fact. Anything unresolvable renders in-product as "confirm with agency." Honesty is a feature.
