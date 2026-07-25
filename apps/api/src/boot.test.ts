// Boot ordering: a malformed ruleset must be refused before anything is written.
//
// "Aborts boot" and "writes nothing" are different claims, and only the second protects the api
// instances already running. syncPermitRules deletes and reseeds permit_rules for the version it
// loads, so validation running after the sync would let a bad artifact replace every other
// instance's rules and only then fail. This drives the real bootstrap in a subprocess rather than
// asserting the order by reading the file.
//
// The probe points boot at its own empty database, so the two runs below say something exact:
// with a malformed artifact the failure is the validation error, and with a good one the failure
// is the missing table. The second is what proves the first — the sync is reached when validation
// passes, so not reaching it is the ordering working rather than the sync being inert. A separate
// database also keeps this off the shared permit_rules table, which other suites sync concurrently.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rulesFilePath } from "./ruleset";

const databaseUrl = process.env.DATABASE_URL ?? "";
const apiDirectory = fileURLToPath(new URL("..", import.meta.url));
const PROBE_DATABASE = "pop_engine_boot_probe";

const probeUrl = (): string => {
  const url = new URL(databaseUrl);
  url.pathname = `/${PROBE_DATABASE}`;
  return url.toString();
};

/** The published ruleset with two intake fields that scope each other — parseable, but cyclic. */
async function cyclicRulesetFile(): Promise<string> {
  const published: { intake_fields: unknown[] } = JSON.parse(
    await readFile(rulesFilePath(), "utf8"),
  );
  published.intake_fields = [
    ...published.intake_fields,
    { field: "left_gate", type: "boolean", asked_when: "right_gate" },
    { field: "right_gate", type: "boolean", asked_when: "left_gate" },
  ];
  const file = join(mkdtempSync(join(tmpdir(), "pop-engine-boot-")), "cyclic.json");
  writeFileSync(file, JSON.stringify(published));
  return file;
}

function runBoot(rulesFile: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((settle) => {
    const child = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: apiDirectory,
      env: { ...process.env, RULES_FILE: rulesFile, DATABASE_URL: probeUrl(), PORT: "0" },
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (code) => settle({ code, stderr }));
  });
}

describe.runIf(databaseUrl.length > 0)("boot refuses a malformed ruleset before writing", () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${PROBE_DATABASE}`);
    await admin.query(`CREATE DATABASE ${PROBE_DATABASE}`);
  }, 30_000);

  afterAll(async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${PROBE_DATABASE}`);
    await admin.end();
  }, 30_000);

  it("fails on the artifact and never reaches the read model", async () => {
    const result = await runBoot(await cyclicRulesetFile());

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/scoping is cyclic/);
    // The probe database has no permit_rules. Had the sync run first, that is the error we
    // would see instead, so its absence is the proof that nothing was written.
    expect(result.stderr).not.toMatch(/permit_rules/);
  }, 90_000);

  it("does reach the read model once the artifact is valid", async () => {
    const result = await runBoot(rulesFilePath());

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/permit_rules/);
    expect(result.stderr).not.toMatch(/scoping is cyclic/);
  }, 90_000);
});
