import { describe, expect, it } from "vitest";
import { ENGINE_NAME, describeEngine } from "./index";

describe("engine scaffold", () => {
  it("exposes a stable engine name", () => {
    expect(ENGINE_NAME).toBe("pop-engine-engine");
  });

  it("describeEngine is pure and deterministic", () => {
    expect(describeEngine()).toBe("pop-engine-engine ready");
    expect(describeEngine()).toBe(describeEngine());
  });
});
