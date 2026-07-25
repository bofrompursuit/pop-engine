import { EventPageView } from "./event-page-view";
import "./event-page.css";

// Public event page (F-301). Data from GET /e/:eventId; RSVP posts to F-302.

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  return <EventPageView eventId={eventId} apiBaseUrl={apiBaseUrl} />;
}
