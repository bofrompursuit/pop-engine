# F-401 · App-less QR Check-in (STRETCH)

**Phase:** 1.5 (first in stretch retention order) · **Lane:** Dev 4 (post green gate) · **Depends on:** F-302 for pre-registered lookup (walk-in flow works without it) · **Feeds:** F-402

## User Story

As an attendee arriving at the event, I scan a poster QR with my own phone and I'm checked in within 20 seconds, no app install, no line.

## Inputs / Outputs

- Printed QR encoding `https://<web>/e/:eventId/checkin`.
- Mobile-web page: 2 fields (name, email or phone), one submit.
- `POST /api/events/:id/checkins` → `checkins` row (linked to an `rsvps` row when the contact matches).

## Acceptance Criteria

1. Scan → rendered form in under 3 seconds on a phone over cellular; total scan-to-checked-in under 20 seconds (PRD metric, stretch-conditional).
2. Exactly 2 fields; no account, no app, no email verification.
3. Success screen confirms by name; duplicate submission (same contact, same event) updates rather than double-counts.
4. Check-in works for both RSVP'd attendees (matched to guest list) and walk-ins (new row).
5. Demo: live check-ins from audience phones appear on F-402 within its polling window.
6. Nothing in this feature may degrade the core: it ships only after the green gate, and if unfinished it is dropped from the demo, not mocked (DESIGN.md).

## Edge Cases

- Event at capacity (headcount reached): check-in still records (door policy is the organizer's call) but flags over-capacity on F-402.
- Malformed/expired event id in QR → friendly error page, no stack trace.
- Duplicate name with different contact: treated as distinct attendees (contact is the identity key).

## Answer-Key Scenarios Exercised

None (check-in is outside the rules engine's ground truth). Demo uses the Scenario A rescoped event.
