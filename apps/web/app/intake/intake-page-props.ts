import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseIntakeContract, type IntakeContract } from "@pop-engine/engine";

// The questionnaire is derived from the published ruleset (AD-2): the registry is read
// on the server and handed to the form. `RULES_FILE` matches the api's variable so both
// services read the same artifact in a deployment; the relative default resolves against
// the Next app's own directory, which is its working directory in dev and in build.

export async function intakeFormProps(): Promise<{
  contract: IntakeContract;
  apiBaseUrl: string;
}> {
  const rulesFile = resolve(process.env.RULES_FILE ?? "../../rules/nyc-rules.v2.2.json");
  return {
    contract: parseIntakeContract(JSON.parse(await readFile(rulesFile, "utf8"))),
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
  };
}
