import { defineConfig } from "vitest/config";

// Single root config runs every workspace test suite (`pnpm test`).
// Coverage is enforced at 90% per CONTRIBUTING.md across the engine, the api, and the
// web app, components included.
export default defineConfig({
  // React components are transformed by esbuild's automatic JSX runtime. Tests need no
  // React import and the app keeps Next's own build untouched (`jsx: preserve`).
  esbuild: { jsx: "automatic" },
  test: {
    // The default stays node: the engine and api suites are pure and must stay fast.
    // Component tests opt into jsdom per file with a `@vitest-environment jsdom`
    // docblock, so only those files pay for a DOM.
    environment: "node",
    // Discovery covers every workspace, so a new app's tests run the day they land.
    // Next.js keeps its code in `app/`, not `src/`, so that tree is listed too.
    // `scripts/` is listed because the baseline check is CI's own guard, and a guard with no test
    // proves only that it does not false-positive on a good tree. Nothing proved it still FAILS on
    // a bad one until its suite existed.
    include: [
      "{apps,packages}/*/src/**/*.test.{ts,tsx}",
      "apps/web/app/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
    ],
    // Workspace packages export TypeScript source; force Vite to transform them.
    server: { deps: { inline: ["@pop-engine/engine"] } },
    coverage: {
      provider: "v8",
      include: ["packages/engine/src/**", "apps/api/src/**", "apps/web/app/**"],
      exclude: ["**/*.test.{ts,tsx}", "apps/api/src/index.ts"],
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
