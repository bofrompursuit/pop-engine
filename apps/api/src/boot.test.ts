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

/**
 * The published ruleset with one rule's `verification.last_verified_date` replaced.
 *
 * Every value passed here is shaped like a date and accepted by any string check, and the field is
 * written to a Postgres `date` column — so a validator that lets one through moves the failure from
 * boot to every plan generation that reaches that rule, one organizer at a time, on an api that
 * booted clean.
 */
async function verificationDateRulesetFile(date: string, name: string): Promise<string> {
  const published: { rules: { verification: { last_verified_date?: string } }[] } = JSON.parse(
    await readFile(rulesFilePath(), "utf8"),
  );
  const rule = published.rules[0];
  if (rule === undefined) throw new Error("published ruleset has no rules");
  rule.verification.last_verified_date = date;
  const file = join(mkdtempSync(join(tmpdir(), "pop-engine-boot-")), name);
  writeFileSync(file, JSON.stringify(published));
  return file;
}

/**
 * The published ruleset with an unusable reminder offset. F-203 reads these from the artifact rather
 * than from a constant, so a bad value that boots clean becomes an alert that never sends or one
 * that fires after the deadline it warns about, discovered per organizer.
 */
async function badAlertOffsetRulesetFile(): Promise<string> {
  const published: { config: { alert_offsets: { deadline_reminder: unknown } } } = JSON.parse(
    await readFile(rulesFilePath(), "utf8"),
  );
  published.config.alert_offsets.deadline_reminder = { days_before: [7, -1] };
  const file = join(mkdtempSync(join(tmpdir(), "pop-engine-boot-")), "bad-alert-offset.json");
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

  it("fails on a verification date no calendar has, before any plan could be written", async () => {
    // The point of catching this here rather than at the INSERT: a `date` column would refuse it
    // too, but only once an organizer generated a plan, one plan at a time, on a running api that
    // booted clean. Boot validation exists so a bad artifact never gets that far (F-201 AC 6).
    const result = await runBoot(await verificationDateRulesetFile("2026-13-45", "bad-date.json"));

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/last_verified_date must be an ISO date/);
    expect(result.stderr).not.toMatch(/permit_rules/);
  }, 90_000);

  it("fails on ISO year zero, which the calendar round trip alone lets through", async () => {
    // The one value where a JS date check and a Postgres `date` cast disagree. ISO 8601 has a year
    // zero and ECMAScript implements it, so "0000-01-01" is correctly shaped AND round-trips
    // unchanged — it passed the validator, booted the api clean, and would have failed at the
    // INSERT instead: the deferred failure boot validation exists to prevent, reached through the
    // validator rather than around it. Driven as a real boot because that is the claim being made.
    const result = await runBoot(await verificationDateRulesetFile("0000-01-01", "year-zero.json"));

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/last_verified_date has no year 0000/);
    expect(result.stderr).not.toMatch(/permit_rules/);
  }, 90_000);

  it("fails on a reminder offset that would fire after the deadline", async () => {
    // config.alert_offsets is an authoritative input for F-203 (its spec states the offsets are
    // config, not code), so an unusable one is refused here rather than at the first send. A
    // negative offset is the clearest case: it schedules the warning after the date it warns about.
    const result = await runBoot(await badAlertOffsetRulesetFile());

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/days_before\[1\] must be a positive whole number/);
    expect(result.stderr).not.toMatch(/permit_rules/);
  }, 90_000);

  it("does reach the read model once the artifact is valid", async () => {
    const result = await runBoot(rulesFilePath());

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/permit_rules/);
    expect(result.stderr).not.toMatch(/scoping is cyclic/);
  }, 90_000);
});
