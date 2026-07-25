// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RootLayout, { metadata } from "./layout";
import Home from "./page";
import IntakePage from "./intake/page";
import EditIntakePage from "./intake/[id]/page";
import { intakeFormProps } from "./intake/intake-page-props";

// The route components are thin: each one reads the published ruleset on the server and
// hands the questionnaire its props. These assert the wiring — that the contract really
// is the published registry, and that the edit route passes the id through — rather than
// re-testing the form, which has its own suite.

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

// `intakeFormProps` resolves the ruleset against the working directory, which is the
// Next app's own directory when it runs. Vitest runs from the repo root, so the tests
// point RULES_FILE at the same artifact the way a deployment does.
const useRepoRuleset = () => vi.stubEnv("RULES_FILE", "rules/nyc-rules.v2.2.json");

describe("the app shell", () => {
  it("names the product and says the demo holds synthetic data only", () => {
    expect(metadata.title).toBe("PopEngine");
    const shell = RootLayout({ children: <p>content</p> });
    expect(shell.type).toBe("html");
    expect(shell.props.lang).toBe("en");
  });

  it("links the landing page to the questionnaire", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: "Describe your event" }).getAttribute("href")).toBe(
      "/intake",
    );
  });
});

describe("intakeFormProps", () => {
  it("parses the published registry and points at the configured api", async () => {
    useRepoRuleset();
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");

    const props = await intakeFormProps();
    expect(props.contract.fields).toHaveLength(32);
    expect(props.contract.alcoholInPublicSpaceNotice.verificationStatus).toBe("COVERAGE_GAP");
    expect(props.apiBaseUrl).toBe("https://api.example.com");
  });

  it("falls back to the local api in development", async () => {
    useRepoRuleset();
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", undefined);
    expect((await intakeFormProps()).apiBaseUrl).toBe("http://localhost:3001");
  });

  it("fails loudly when the ruleset is not where it expects", async () => {
    // With no RULES_FILE the path is resolved against the working directory, which is
    // the Next app's own directory when it runs and the repo root here. A page that
    // cannot read the published ruleset must not render a questionnaire at all.
    vi.stubEnv("RULES_FILE", undefined);
    await expect(intakeFormProps()).rejects.toThrow(/nyc-rules\.v2\.2\.json/);
  });
});

describe("the intake routes", () => {
  it("renders a blank questionnaire at /intake", async () => {
    useRepoRuleset();
    render(await IntakePage());
    expect(screen.getByRole("heading").textContent).toBe("Describe your event");
    expect(screen.getByRole("group", { name: /Borough/ })).toBeDefined();
  });

  it("loads the named event at /intake/[id]", async () => {
    useRepoRuleset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(await EditIntakePage({ params: Promise.resolve({ id: "event-9" }) }));
    // The form takes it from here: it fetches the event from the browser, because the
    // Access cookie is the browser's and not this server's.
    expect(screen.getByRole("status").textContent).toBe("Loading your event…");
  });
});
