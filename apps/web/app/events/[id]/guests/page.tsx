import { GuestListView } from "./guest-list";
import "./guests.css";

// Organizer guest list for F-302. Public RSVP UI waits on F-301 (SPEC-CONFLICT #100).

export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  return <GuestListView eventId={id} apiBaseUrl={apiBaseUrl} />;
}
