import { PlanView } from "../../../plan/plan-view";

// The plan route. The plan and the ruleset meta are both fetched from the browser, because the
// Cloudflare Access cookie is the browser's and not this server's (BASELINE.md provider baseline).
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  return <PlanView apiBaseUrl={apiBaseUrl} eventId={id} />;
}
