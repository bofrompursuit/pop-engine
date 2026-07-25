import { PromoteView } from "./promote-view";
import "./promote.css";

// Organizer promote controls for F-301 (description, publish toggle, share URL).

export default async function PromotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const webOrigin = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "http://localhost:3000";
  return <PromoteView eventId={id} apiBaseUrl={apiBaseUrl} webOrigin={webOrigin} />;
}
