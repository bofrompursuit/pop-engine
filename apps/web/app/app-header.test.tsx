// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppHeader } from "./app-header";

afterEach(() => cleanup());

describe("AppHeader", () => {
  it("states the brand once", () => {
    render(<AppHeader />);
    expect(screen.getByText("POPENGINE")).toBeTruthy();
  });

  it("carries an accessible name on the menu affordance", () => {
    render(<AppHeader />);
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
  });
});
