import { defineConfig } from "vitest/config";

// Single root config runs every workspace test suite (`pnpm test`).
// Coverage is scoped to the code that exists today (engine + api src) and enforced
// at 90% per CONTRIBUTING.md. Each lane widens `coverage.include` as it adds code;
// apps/web joins when F-101 lands real components.
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/api/src/**/*.test.ts"],
    // Workspace packages export TypeScript source; force Vite to transform them.
    server: { deps: { inline: ["@pop-engine/engine"] } },
    coverage: {
      provider: "v8",
      include: ["packages/engine/src/**", "apps/api/src/**"],
      exclude: ["**/*.test.ts", "apps/api/src/index.ts"],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
      reporter: ["text", "html"],
    },
  },
});
