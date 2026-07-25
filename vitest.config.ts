import { defineConfig } from "vitest/config";

// Single root config runs every workspace test suite (`pnpm test`).
// Coverage is scoped to the code that exists today (engine + api src) and enforced
// at 90% per CONTRIBUTING.md. Each lane widens `coverage.include` as it adds code;
// apps/web joins when F-101 lands real components.
export default defineConfig({
  test: {
    environment: "node",
    // Discovery covers every workspace, so a new app's tests run the day they land.
    // Next.js keeps its code in `app/`, not `src/`, so that tree is listed too.
    include: ["{apps,packages}/*/src/**/*.test.{ts,tsx}", "apps/web/app/**/*.test.{ts,tsx}"],
    // Workspace packages export TypeScript source; force Vite to transform them.
    server: { deps: { inline: ["@pop-engine/engine"] } },
    coverage: {
      provider: "v8",
      // apps/web's non-component modules are covered; its React components are not,
      // because component tests need jsdom + Testing Library, which is a new-dependency
      // decision for the team (CONTRIBUTING.md). Their logic lives in packages/engine.
      include: ["packages/engine/src/**", "apps/api/src/**", "apps/web/app/**/*.ts"],
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
