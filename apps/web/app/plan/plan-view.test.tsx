// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { CONFIRM_WITH_AGENCY, type Finding } from "@pop-engine/engine";
import PlanPage from "../events/[id]/plan/page";
import { PlanView } from "./plan-view";
import { SnapshotBanner, formatSnapshotDate } from "./snapshot-banner";

// Component tests for F-206. Regulatory prose in the assertions is read out of the published
// ruleset rather than retyped here, so a rule edit moves the test the same way it moves the
// screen. Resolved from the repo root, which is vitest's working directory.
const publishedRuleset: {
  ruleset_version: string;
  snapshot_date: string;
  rules: {
    id: string;
    output: Record<string, string>;
    source?: { citation: string; urls: string[] };
    verification: { status: string };
  }[];
} = JSON.parse(readFileSync(resolve("rules/nyc-rules.v2.3.json"), "utf8"));

const publishedRule = (id: string) => {
  const rule = publishedRuleset.rules.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new Error(`ruleset has no rule ${id}`);
  return rule;
};

/** The exactly-20 conflict: two official readings, three pages between them. */
const CONFLICT_RULE = publishedRule("PARKS-EVENT-EXACTLY-20-001");

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  ruleIds: ["PARKS-EVENT-001"],
  kind: "permit",
  disposition: "required",
  name: "Special Event Permit",
  agency: "NYC Parks",
  deadline: null,
  deadlineDisplay: null,
  latestApplyDate: null,
  applyAfterDate: null,
  deadlineStatus: "not_applicable",
  slackDays: null,
  feeDisplay: null,
  portalName: null,
  portalUrl: null,
  portalInstructions: null,
  notes: [],
  noteText: null,
  deadlineUnknownFields: [],
  timelineUnresolvedReason: null,
  conflictText: null,
  sources: [
    { ruleId: "PARKS-EVENT-001", citation: "Parks FAQ", urls: ["https://example.gov/faq"] },
  ],
  verificationStatus: "SOURCE_CONFIRMED",
  triggeredBy: [],
  ...overrides,
});

const plan = (overrides: Record<string, unknown> = {}) => ({
  id: "plan-1",
  eventId: "event-1",
  eventRevision: 1,
  rulesetVersion: publishedRuleset.ruleset_version,
  verdict: "CONDITIONAL",
  today: "2026-07-25",
  generatedAt: "2026-07-25T12:00:00.000Z",
  findings: [finding()],
  ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const liveMeta = {
  ruleset_version: publishedRuleset.ruleset_version,
  snapshot_date: publishedRuleset.snapshot_date,
};

/** Answers the plan call and the rules-meta call by URL, the way the api does. */
const stubApi = (
  planBody: unknown,
  metaBody: unknown = liveMeta,
  planStatus = 200,
  metaStatus = 200,
) => {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith("/rules/meta")
      ? jsonResponse(metaStatus, metaBody)
      : jsonResponse(planStatus, planBody),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const renderPlan = () =>
  render(<PlanView apiBaseUrl="https://api.example.com" eventId="event-1" />);

beforeEach(() => {
  stubApi(plan());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the snapshot banner (AC 1)", () => {
  it("states the ruleset version and the date it was published", async () => {
    renderPlan();
    const banner = await screen.findByRole("complementary", { name: "Rules snapshot" });

    expect(banner.textContent).toContain(`Rules snapshot ${publishedRuleset.ruleset_version}`);
    expect(banner.textContent).toContain(`published ${formatSnapshotDate(liveMeta.snapshot_date)}`);
  });

  it("never says the rules were verified as of that date", () => {
    // A snapshot date is published-on, not all-facts-verified-on. Each line's own verification
    // status is what carries that claim, and this wording has been wrong once already.
    render(<SnapshotBanner rulesetVersion="nyc.v2.3" meta={liveMeta} />);
    const banner = screen.getByRole("complementary", { name: "Rules snapshot" });

    expect(banner.textContent?.toLowerCase()).not.toContain("verified");
    expect(banner.textContent?.toLowerCase()).toContain("published");
  });

  it("takes the version and the date from the artifact rather than from copy", () => {
    render(
      <SnapshotBanner
        rulesetVersion="nyc.v9.9"
        meta={{ ruleset_version: "nyc.v9.9", snapshot_date: "2030-01-31" }}
      />,
    );
    const banner = screen.getByRole("complementary", { name: "Rules snapshot" });

    expect(banner.textContent).toContain("Rules snapshot nyc.v9.9");
    expect(banner.textContent).toContain("published January 31, 2030");
  });

  it("reads the published date as a calendar day, not an instant", () => {
    // Parsing "2026-07-25" as local midnight would render July 24 anywhere west of Greenwich.
    expect(formatSnapshotDate("2026-07-25")).toBe("July 25, 2026");
    expect(formatSnapshotDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatSnapshotDate("not-a-date")).toBe("not-a-date");
  });
});

describe("a plan pinned to an older ruleset (AC 4)", () => {
  it("shows the version that produced the plan, not the one now published", async () => {
    stubApi(plan({ rulesetVersion: "nyc.v2.1" }));
    renderPlan();
    const banner = await screen.findByRole("complementary", { name: "Rules snapshot" });

    expect(banner.textContent).toContain("Rules snapshot nyc.v2.1");
    expect(banner.textContent).not.toContain(publishedRuleset.ruleset_version.replace("nyc.", "v"));
    expect(banner.textContent).toContain(
      `a newer ruleset (${publishedRuleset.ruleset_version}) exists; regenerate to update`,
    );
  });

  it("does not date a superseded plan with the live file's publication date", async () => {
    // The api only knows when the version it has loaded was published. Stating that date beside
    // an older pinned version would date the plan wrongly.
    stubApi(plan({ rulesetVersion: "nyc.v2.1" }));
    renderPlan();
    const banner = await screen.findByRole("complementary", { name: "Rules snapshot" });

    expect(banner.textContent).not.toContain("published");
  });

  it("still names the plan's version when the live ruleset cannot be read", async () => {
    stubApi(plan(), {}, 200, 503);
    renderPlan();
    const banner = await screen.findByRole("complementary", { name: "Rules snapshot" });

    expect(banner.textContent).toContain(`Rules snapshot ${publishedRuleset.ruleset_version}`);
    expect(banner.textContent).not.toContain("published");
    expect(banner.textContent).not.toContain("newer ruleset");
  });
});

describe("per-line citations and status (AC 2, AC 3)", () => {
  const lineFor = async (only: Finding) => {
    stubApi(plan({ findings: [only] }));
    renderPlan();
    return within(await screen.findByRole("article"));
  };

  it("shows each line's citation with click-through to the official page", async () => {
    const line = await lineFor(finding());

    expect(line.getByText("Parks FAQ")).toBeDefined();
    expect(line.getByRole("link", { name: /source/ }).getAttribute("href")).toBe(
      "https://example.gov/faq",
    );
  });

  it("renders every status the schema allows, visibly", async () => {
    const line = await lineFor(finding({ verificationStatus: "SOURCE_CONFIRMED" }));
    expect(line.getByText("SOURCE CONFIRMED")).toBeDefined();
  });

  it("renders RESEARCH_REQUIRED as confirm with agency, on the line and not in a tooltip", async () => {
    const line = await lineFor(finding({ verificationStatus: "RESEARCH_REQUIRED" }));

    const note = line.getByRole("note");
    expect(note.textContent).toBe(CONFIRM_WITH_AGENCY);
    // Visible text, not an attribute a pointer has to hover to reveal.
    expect(note.getAttribute("title")).toBeNull();
    expect(line.getByText("RESEARCH REQUIRED")).toBeDefined();
  });

  it("renders both readings of an official conflict with every source behind them", async () => {
    const conflict = finding({
      ruleIds: [CONFLICT_RULE.id],
      name: CONFLICT_RULE.output.permit_name ?? null,
      verificationStatus: "OFFICIAL_CONFLICT",
      conflictText: CONFLICT_RULE.output.note_text ?? null,
      sources: [
        {
          ruleId: CONFLICT_RULE.id,
          citation: CONFLICT_RULE.source?.citation ?? "",
          urls: CONFLICT_RULE.source?.urls ?? [],
        },
      ],
    });
    const line = await lineFor(conflict);

    // Both readings, verbatim from the rule that publishes them.
    expect(line.getByText(String(CONFLICT_RULE.output.note_text))).toBeDefined();
    expect(line.getByText("OFFICIAL CONFLICT")).toBeDefined();
    expect(line.getByText(String(CONFLICT_RULE.source?.citation))).toBeDefined();

    // Every page the two readings rest on is reachable, not just the first.
    const urls = CONFLICT_RULE.source?.urls ?? [];
    expect(urls.length).toBeGreaterThan(1);
    const hrefs = line.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(urls);
  });

  it("shows a conflict's text once when the rule publishes it as both note and conflict", async () => {
    // PARKS-EVENT-EXACTLY-20-001 publishes one string that is both its note and its conflict
    // reading; rendering it twice would read as two separate official statements.
    const shared = String(CONFLICT_RULE.output.note_text);
    const line = await lineFor(
      finding({ verificationStatus: "OFFICIAL_CONFLICT", conflictText: shared, noteText: shared }),
    );

    expect(line.getAllByText(shared)).toHaveLength(1);
  });

  it("renders a citation with no resolved URL as text, with no dead link", async () => {
    const line = await lineFor(
      finding({
        sources: [
          { ruleId: "PARKS-EVENT-001", citation: "Parks borough office, by phone", urls: [] },
        ],
      }),
    );

    expect(line.getByText("Parks borough office, by phone")).toBeDefined();
    expect(line.queryAllByRole("link")).toEqual([]);
  });

  it("renders a finding that publishes no source at all without a citation block", async () => {
    // ADV-ALCOHOL-PUBLIC-001 is a COVERAGE_GAP advisory: it asserts nothing and cites nothing.
    const line = await lineFor(
      finding({
        ruleIds: ["ADV-ALCOHOL-PUBLIC-001"],
        kind: "advisory",
        disposition: "advisory",
        agency: null,
        sources: [],
        verificationStatus: "COVERAGE_GAP",
      }),
    );

    expect(line.queryAllByRole("link")).toEqual([]);
    expect(line.getByText("COVERAGE GAP")).toBeDefined();
  });

  it("omits the agency label on findings that publish no agency", async () => {
    const withAgency = await lineFor(finding({ agency: "NYC Parks" }));
    expect(withAgency.getByText("NYC Parks")).toBeDefined();
    cleanup();

    const line = await lineFor(finding({ agency: null, name: "Insurance determined at review" }));
    expect(line.queryByText("NYC Parks")).toBeNull();
    // The line still reads as a complete row rather than showing an empty label.
    expect(line.getByRole("heading").textContent).toBe("Insurance determined at review");
  });

  it("renders the filing route for a rule that publishes instructions instead of a URL", async () => {
    // NYPD-SOUND-001 publishes the precinct and form PD 656-041A and no portal URL; that text is
    // the entire filing route for the line.
    const instructions = "File at the precinct where the device will be used; form PD 656-041A.";
    const line = await lineFor(
      finding({ ruleIds: ["NYPD-SOUND-001"], portalUrl: null, portalInstructions: instructions }),
    );

    expect(line.getByText(instructions)).toBeDefined();
  });

  it("links the portal when the rule publishes one, and names it plainly when it has no URL", async () => {
    const linked = await lineFor(
      finding({
        portalUrl: "https://fires.fdnycloud.org/CitizenAccess/Default.aspx",
        portalName: "FDNY Business",
        feeDisplay: "$105 filing fee",
      }),
    );
    expect(linked.getByRole("link", { name: "FDNY Business" }).getAttribute("href")).toBe(
      "https://fires.fdnycloud.org/CitizenAccess/Default.aspx",
    );
    expect(linked.getByText("$105 filing fee")).toBeDefined();
    cleanup();

    // A portal named but not yet resolved to a URL renders as text rather than a dead link.
    const unlinked = await lineFor(finding({ portalUrl: null, portalName: "Borough office" }));
    expect(unlinked.getByText("Borough office")).toBeDefined();
    expect(unlinked.queryByRole("link", { name: "Borough office" })).toBeNull();
  });

  it("renders every published note on the line", async () => {
    // PARKS-INSURANCE-NOTE-001's whole content is its note text: dropping it would leave the line
    // asserting a requirement the rule explicitly says is not automatic.
    const noteText =
      "Insurance determined by borough office at review — not automatically required.";
    const line = await lineFor(
      finding({
        kind: "note",
        disposition: "no_new_requirement",
        noteText,
        notes: ["Community board recommendation required", "Sequencing caveat: Parks decides first"],
      }),
    );

    expect(line.getByText(noteText)).toBeDefined();
    expect(line.getByText("Community board recommendation required")).toBeDefined();
    expect(line.getByText("Sequencing caveat: Parks decides first")).toBeDefined();
  });

  it("falls back to the rule ids when a finding publishes no name", async () => {
    const line = await lineFor(finding({ name: null, ruleIds: ["SAPO-SCOPE-001"] }));
    expect(line.getByRole("heading").textContent).toBe("SAPO-SCOPE-001");
  });

  it("keeps the published deadline qualification rather than showing only a date", async () => {
    const line = await lineFor(
      finding({
        deadlineDisplay: "at least 21 days before the event; processing 21–30 days",
        latestApplyDate: "2026-08-26",
        deadlineStatus: "on_track",
        timelineUnresolvedReason: "no published holiday list; business-day math not computed",
        deadlineUnknownFields: ["plaza_level"],
      }),
    );

    expect(line.getByText(/at least 21 days before the event/)).toBeDefined();
    expect(line.getByText(/apply by 2026-08-26/)).toBeDefined();
    expect(line.getByText(/on track/)).toBeDefined();
    expect(line.getByText(/no published holiday list/)).toBeDefined();
    expect(line.getByText(/plaza level/)).toBeDefined();
  });
});

describe("the plan route", () => {
  it("renders the plan for the event in the path", async () => {
    stubApi(plan());
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    render(await PlanPage({ params: Promise.resolve({ id: "event-1" }) }));

    await waitFor(() =>
      expect(screen.getByRole("complementary", { name: "Rules snapshot" })).toBeDefined(),
    );
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("https://api.example.com/api/events/event-1/plan");
  });
});

describe("the plan view's own states", () => {
  it("says it is loading before the plan arrives", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderPlan();
    expect(screen.getByRole("status").textContent).toBe("Loading your permit plan…");
  });

  it("drops a plan that arrives after the view has gone", async () => {
    let releasePlan: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (url: string) =>
          new Promise<Response>((resolvePromise) => {
            if (url.endsWith("/rules/meta")) resolvePromise(jsonResponse(200, liveMeta));
            else releasePlan = resolvePromise;
          }),
      ),
    );
    renderPlan();
    cleanup();

    releasePlan(jsonResponse(200, plan()));
    // Nothing to assert on screen: the point is that the late answer updates no state and the
    // test does not blow up on an unmounted component.
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("reports why a plan could not be shown, with no banner claiming a snapshot", async () => {
    stubApi({}, liveMeta, 404);
    renderPlan();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No plan has been generated for this event yet.",
    );
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("renders one line per finding, each with its own citation", async () => {
    stubApi(
      plan({
        findings: [
          finding({ ruleIds: ["PARKS-EVENT-001"], name: "Special Event Permit" }),
          finding({
            ruleIds: ["NYPD-SOUND-001"],
            name: "Sound Device Permit",
            sources: [
              { ruleId: "NYPD-SOUND-001", citation: "Admin Code §10-108", urls: ["https://a.gov"] },
            ],
          }),
        ],
      }),
    );
    renderPlan();

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(screen.getByText("Parks FAQ")).toBeDefined();
    expect(screen.getByText("Admin Code §10-108")).toBeDefined();
  });
});
