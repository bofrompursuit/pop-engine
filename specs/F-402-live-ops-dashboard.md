# F-402 · Live Ops Dashboard (STRETCH)

**Phase:** 1.5 (second in retention order) · **Lane:** Dev 4 (post green gate) · **Depends on:** F-401

## User Story

As an organizer during the event, I watch check-in counts climb against my capacity on my phone, so I know how the door is doing without standing at it.

## Inputs / Outputs

- `GET /api/events/:id/stats` → `{checkins_total, rsvps_total, capacity (headcount), checkins_last_10min}`; polled every ~5 seconds (no websockets in MVP).
- Dashboard page: count, capacity gauge, RSVP-vs-checked-in comparison.

## Acceptance Criteria

1. A new check-in appears on the dashboard within 10 seconds (one polling cycle + render).
2. Capacity gauge reads against F-101 headcount; over-capacity renders a visible warning state.
3. **Honest telemetry:** counts are labeled "check-ins", never "occupancy" or "foot traffic" (no exit tracking in MVP; occupancy claims require F-410).
4. Works on a phone browser (the organizer is on their feet).
5. Survives refresh/reconnect with no state loss (all state server-side).

## Edge Cases

- Zero check-ins: renders an explicit zero state, not a blank.
- Polling failure (network blip): dashboard shows "last updated Xs ago" staleness indicator rather than silently freezing.

## Answer-Key Scenarios Exercised

None (outside the rules engine). Demo finale per DESIGN.md step 6.
