# F-301 · Public Event Page (STRETCH)

**Status:** APPROVED (2026-07-25) · **Reviewer/approver:** product owner + affected lane owners via the approval PR · **Owner:** see Lane below · see `docs/BASELINE.md`.
**Phase:** 1.5 (third in retention order) · **Lane:** Dev 3 (parallel Track B; core blockers outrank it) · **Depends on:** F-101 (generated from the same event row) · **Feeds:** F-302

## User Story

As an organizer whose event is now compliant, one click turns the same event record into a shareable public page, so the event I made legal becomes the event I promote.

## Inputs / Outputs

- Source: the `events` row (name, date, location_name, headcount, borough) + organizer-entered `description` and `public_page_published` (migration 005; resolves SPEC-CONFLICT #100).
- `GET /e/:eventId` (public, no account during the rehearsal/demo window): title, date, venue, description, map link, RSVP affordance (wired to F-302 when present). Returns friendly 404 when `public_page_published` is false. Cloudflare Access exposes this route anonymously only for the window defined in `DEPLOY.md` §5; publication state is not a substitute for that deployment gate.
- `GET` / `PATCH /api/events/:id/public-page`: organizer promote controls (description, publish toggle, shareable path, infeasible warning when latest plan verdict is infeasible).
- Shareable URL shown to the organizer with copy-to-clipboard.

## Acceptance Criteria

1. Page is generated from the event record, not re-entered content; editing the event updates the page.
2. Renders correctly on mobile (attendees open it from chat links).
3. Public page never exposes compliance internals (permit statuses, documents, verdicts): promotion view only.
4. RSVP button appears only when F-302 shipped; otherwise the page is informational (the "static page" degradation from DESIGN.md).
5. Map affordance is a search link built from `location_name` + `borough`; the MVP has no address field and no maps API integration.
6. Outside the rehearsal/demo window, an unauthenticated request is stopped by Cloudflare Access before it reaches the web origin even when `public_page_published` is true; the deployment smoke check in `DEPLOY.md` verifies the gate before opening and after closing the window.

## Edge Cases

- Event with INFEASIBLE current plan: page still renders (publishing is the organizer's call), but the organizer-side view shows a warning banner.
- Visibility: `public_page_published` on `events` (not lifecycle `status`). Organizer toggles publish via `PATCH /api/events/:id/public-page`; unpublished URL returns a friendly 404.

## Answer-Key Scenarios Exercised

None. Demo uses the Scenario A rescoped event if stretch is green.
