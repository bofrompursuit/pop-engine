import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseIntakeContract } from "@pop-engine/engine";
import { IntakeForm } from "./intake-form";

// The questionnaire is derived from the published ruleset (AD-2): the registry is read
// here, on the server, and handed to the form. `RULES_FILE` matches the api's variable
// so both services read the same artifact in a deployment.
const rulesFile = resolve(process.env.RULES_FILE ?? "../../rules/nyc-rules.v2.1.json");

export default async function IntakePage() {
  const contract = parseIntakeContract(JSON.parse(await readFile(rulesFile, "utf8")));
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  return <IntakeForm contract={contract} apiBaseUrl={apiBaseUrl} />;
}
