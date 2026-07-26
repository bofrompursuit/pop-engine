# F-401 · App-less QR Check-in (STRETCH)

**Status:** APPROVED (2026-07-25) · **Reviewer/approver:** product owner + affected lane owners via the approval PR · **Owner:** see Lane below · see `docs/BASELINE.md`.
**Phase:** 1.5 (first in stretch retention order) · **Lane:** Dev 4 (parallel Track B; core blockers outrank it) · **Depends on:** F-101 event record; optional F-302 integration adds pre-registered lookup · **Feeds:** F-402

## User Story

As an attendee arriving at the event, I scan a poster QR with my own phone and I'm checked in within 20 seconds, no app install, no line.

## Inputs / Outputs

- Printed QR encoding `https://<web>/e/:eventId/checkin`.
- Mobile-web page: 2 fields (name, email or phone), one submit.
- `GET /api/events/:id/checkins` → `{event: {id, name}}`, the name-only public projection used to open the form without exposing the F-101 organizer/intake response.
- `POST /api/events/:id/checkins` → `checkins` row (linked to an `rsvps` row when the contact matches). It is public only while the route-specific Cloudflare Access bypass in `DEPLOY.md` §5 is open for the rehearsal/demo window.

## Acceptance Criteria

1. Scan → rendered form in under 3 seconds on a phone over cellular; total scan-to-checked-in under 20 seconds (PRD metric, stretch-conditional).
2. Exactly 2 fields; no account, no app, no email verification.
3. Success screen confirms by name; duplicate submission (same contact, same event) updates rather than double-counts.
4. Walk-in check-in works without F-302. When F-302 is present, a matching RSVP contact links to the guest-list row.
5. Demo: audience phones submit organizer-provided synthetic name/contact aliases, never attendee identities; the live check-ins appear on F-402 within its polling window.
6. Nothing in this feature may degrade the core: core blockers outrank it for anyone holding one, and the green gate decides demo inclusion. If unfinished, it is dropped from the demo, not mocked (DESIGN.md).
7. Outside the rehearsal/demo window, unauthenticated GET and POST requests are stopped by Cloudflare Access before Express and create no `checkins` row. The deployment smoke check opens only the public check-in path for the window, verifies its name-only GET and POST, then closes it and verifies both methods are blocked again.

## Edge Cases

- Event at confirmed `events.capacity`: check-in still records (door policy is the organizer's call) but flags over-capacity on F-402. If capacity is unset, check-in records without a capacity claim.
- Malformed/expired event id in QR → friendly error page, no stack trace. In MVP, expired means `event_date` is before the current `America/New_York` calendar date; same-day check-in remains open.
- Phone contact accepts `+`, spaces, parentheses, and hyphens around 10–15 digits; other characters or digit counts are rejected before normalization.
- Duplicate name with different contact: treated as distinct attendees (contact is the identity key).

## Answer-Key Scenarios Exercised

None (check-in is outside the rules engine's ground truth). Demo uses the Scenario A rescoped event.
