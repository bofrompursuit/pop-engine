# F-302 · RSVP / Guest List (STRETCH)

**Phase:** 1.5 (fourth in retention order) · **Lane:** Dev 3 (post green gate) · **Depends on:** F-301 · **Feeds:** F-401 (guest-list lookup at check-in)

## User Story

As an attendee who found the event page, I RSVP with name and email in seconds; as the organizer, I see my guest list fill against capacity.

## Inputs / Outputs

- `POST /api/events/:id/rsvps` (public, from the event page): name, email, optional phone → `rsvps` row.
- Organizer view: guest list with count vs. F-101 headcount.

## Acceptance Criteria

1. RSVP from the public page takes under 30 seconds, no account.
2. Capacity-aware: at headcount, new RSVPs are refused with a friendly "event is full" (no waitlist in MVP; that's F-306).
3. Duplicate contact for the same event updates the existing RSVP, no double-count.
4. Guest list is available to F-401: a check-in matching an RSVP contact links to it (registered vs. walk-in distinction on F-402).
5. Organizer can cancel an RSVP (status → cancelled; frees capacity).

## Edge Cases

- Concurrent RSVPs at the capacity boundary: enforce at insert (transactional count check), not in the UI.
- RSVP after event date: refused with "this event has passed."

## Answer-Key Scenarios Exercised

None. Demo: one seeded RSVP plus one live RSVP if time allows (seeded RSVP data is a permitted fallback per DESIGN.md).
