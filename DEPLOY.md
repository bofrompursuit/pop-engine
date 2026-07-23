# PopEngine — Deployment Runbook (Phase 0)

Provider baseline (`docs/BASELINE.md`): **Railway** (host) · **Supabase** (Postgres + S3-compatible storage) · **Resend** (email) · **Twilio** (SMS) · **Cloudflare Access** (demo gate, AD-12). Synthetic data only until F-701.

The scaffold builds and tests locally with no cloud accounts. This runbook provisions the gated demo environment. Every step needs your own account and secrets; nothing here is automated.

## 0. Prerequisites

- Accounts: Railway, Supabase, Resend, Twilio, Cloudflare (free tiers cover the demo).
- The repo pushed to GitHub.

## 1. Supabase (Postgres + storage)

1. Create a project. Copy the connection string into `DATABASE_URL`.
2. Storage, create a private bucket `pop-engine-documents`.
3. Project Settings, Storage, S3 access keys, generate a keypair. Fill `S3_ENDPOINT` (`https://<project-ref>.supabase.co/storage/v1/s3`), `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`. The api signs standard SigV4 URLs, so F-202 storage code stays vendor-neutral.

## 2. Resend (email)

1. Create an account, add and verify a sending domain (or use the onboarding domain for the demo).
2. Create an API key into `RESEND_API_KEY`. Set `SMTP_FROM` to a verified sender.

## 3. Twilio (SMS), start today (T-1)

1. Create an account, buy a number: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
2. Start A2P 10DLC registration now. Until it clears, email sends live and SMS renders as a labeled in-product simulation (`docs/DESIGN.md` fallback). Track the approval date.

## 4. Railway (host, two services)

One project, two services from this monorepo. Set each service's root directory to the repo root; Railway installs the pnpm workspace.

- **api**: start command `pnpm --filter api start`. No build step (runs via tsx).
- **web**: build command `pnpm --filter web build`, start command `pnpm --filter web start`.

1. New Project, Deploy from GitHub repo, `jzeng151/pop-engine`.
2. Add the two services with the commands above.
3. Set env vars per service from `apps/api/.env.example` and `apps/web/.env.example`. Point `WEB_ORIGIN` (api) at the web URL and `NEXT_PUBLIC_API_BASE_URL` (web) at the api URL.
4. Connect the deploy branch. The demo environment is seeded once and not redeployed after final rehearsal.

## 5. Cloudflare Access (demo gate, AD-12)

The gate is host-level; there is no in-app auth (AD-5).

1. Put both Railway URLs behind Cloudflare (proxy the hostnames, or use a Cloudflare Tunnel to the Railway URLs).
2. Zero Trust, Access, Applications: add a self-hosted app per hostname.
3. Policy: allow the team's emails (email-OTP), or an IP allowlist. Everything else is denied.
4. For the rehearsal and demo window only, open the public routes the demo needs (`/e/:eventId`, RSVP, check-in) with a bypass policy, then close them again.

## 6. Verify

- `GET https://<api-host>/health` returns `{"status":"ok",...}` behind the gate. This is a liveness probe only: it does not attest that `RULES_FILE` is present, well-formed, or the expected version. The boot-time ruleset validation that aborts loudly on failure (`docs/ARCHITECTURE.md`, "Rules loading") lands with F-201; until then a green `/health` says nothing about ruleset validity.
- The web service loads behind the gate.
- A seeded deadline fires a real email (SMS labeled-simulation until A2P clears).

## Env reference

`apps/api/.env.example` and `apps/web/.env.example` are the source of truth for variable names. Never commit real secrets; synthetic data only (AD-12).
