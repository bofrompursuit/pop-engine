# pop-engine

PopEngine, NYC event permit planning. Monorepo:

- `apps/web` — Next.js frontend (organizer UI, plan rendering)
- `apps/api` — Express API + in-process alert poller
- `packages/engine` — pure TypeScript rules engine (no DB, HTTP, or clock)

Read `docs/BASELINE.md` for current artifact versions, `docs/ARCHITECTURE.md` for the technical design, and `CONTRIBUTING.md` before writing any code.

## Develop

Requires Node 22+ and pnpm.

```
pnpm install
pnpm test           # Vitest across the workspace
pnpm test:coverage  # enforces the 90% gate
pnpm typecheck
pnpm lint
```

Run the apps locally:

```
pnpm --filter api dev   # http://localhost:3001  (GET /health)
pnpm --filter web dev   # http://localhost:3000
```

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local` for local config.

## Deploy

See `DEPLOY.md`. The demo is access-gated and uses synthetic data only (ARCHITECTURE AD-12).
