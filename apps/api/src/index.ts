import { readFile } from "node:fs/promises";
import { Client, Pool } from "pg";
import { parseEngineRuleset, parseIntakeContract } from "@pop-engine/engine";
import { createApp } from "./app";
import { holidayCalendarWarning, pinnedCalendar, todayInJurisdiction } from "./calendar";
import { createPlanService } from "./plan";
import { loadRuleset, rulesFilePath, syncPermitRules } from "./ruleset";

// Long-lived process (ARCHITECTURE.md AD-1). This server also hosts the in-process
// 60s alert poller once F-203 (issue #8) lands, which is why the api must stay on an
// always-on host and cannot go serverless.
const PORT = Number(process.env.PORT ?? 3001);

const ruleset = await loadRuleset();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const database = new Client({ connectionString: databaseUrl });
await database.connect();
try {
  await syncPermitRules(database, ruleset);
} finally {
  await database.end();
}

// The engine reads the same published file the boot validator just checked (AD-2).
const engineRuleset = parseEngineRuleset(JSON.parse(await readFile(rulesFilePath(), "utf8")));
const pool = new Pool({ connectionString: databaseUrl });

// One clock for the whole api: an intake date and a plan deadline are both calendar days
// in the jurisdiction the ruleset declares, so both read the day from the same function
// rather than each deciding what "today" means.
const today = () => todayInJurisdiction(engineRuleset.jurisdiction);
const planService = createPlanService(pool, engineRuleset, pinnedCalendar, today);

// Plans still generate without a published holiday list; the business-day lines in them do not
// get dates. Operators should know that before an organizer asks why.
const calendarWarning = holidayCalendarWarning(pinnedCalendar(engineRuleset.calendarId));
if (calendarWarning !== null) console.warn(calendarWarning);

createApp({
  database: pool,
  intakeContract: parseIntakeContract(ruleset.document),
  today,
  planService,
}).listen(PORT, () => {
  console.log(`pop-engine-api listening on :${PORT}`);
});
