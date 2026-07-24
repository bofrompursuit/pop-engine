import { Client } from "pg";
import { createApp } from "./app";
import { loadRuleset, syncPermitRules } from "./ruleset";

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

createApp().listen(PORT, () => {
  console.log(`pop-engine-api listening on :${PORT}`);
});
