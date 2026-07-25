import { readFile } from "node:fs/promises";
import { Client, Pool } from "pg";
import { parseEngineRuleset, parseIntakeContract } from "@pop-engine/engine";
import { createApp } from "./app";
import { holidayCalendarWarning, pinnedCalendar, todayInJurisdiction } from "./calendar";
import { createPlanService } from "./plan";
import { loadRuleset, rulesFilePath, syncPermitRules } from "./ruleset";
import {
  createS3DocumentStorage,
  s3ClientFor,
  s3SettingsFromEnv,
  unconfiguredDocumentStorage,
} from "./storage";

// Long-lived process (ARCHITECTURE.md AD-1). This server also hosts the in-process
// 60s alert poller once F-203 (issue #8) lands, which is why the api must stay on an
// always-on host and cannot go serverless.
const PORT = Number(process.env.PORT ?? 3001);

const ruleset = await loadRuleset();
// The engine reads the same published file the boot validator just checked (AD-2), and it runs
// BEFORE anything is written. The engine's parser is where scoping cycles and asked_when operands
// are validated, so parsing after the sync would let a malformed artifact delete and reseed
// permit_rules and only then abort: loud for the deploying process, silent for every other api
// instance still reading the read model it just replaced.
const engineRuleset = parseEngineRuleset(JSON.parse(await readFile(rulesFilePath(), "utf8")));

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

// The bucket is optional at boot so the api still runs against a bare local database
// (DEPLOY.md: the scaffold needs no cloud accounts). Without it the upload and download routes
// answer 503 rather than accepting a document nowhere stores.
const s3Settings = s3SettingsFromEnv(process.env);
if (s3Settings === null) {
  console.warn("S3_* is not configured; F-202 document upload and download will return 503");
}
const documentStorage =
  s3Settings === null
    ? unconfiguredDocumentStorage()
    : createS3DocumentStorage(s3ClientFor(s3Settings), s3Settings.bucket);

createApp({
  database: pool,
  intakeContract: parseIntakeContract(ruleset.document),
  today,
  planService,
  checklist: { database: pool, storage: documentStorage },
}).listen(PORT, () => {
  console.log(`pop-engine-api listening on :${PORT}`);
});
