# Deploy to Vercel

This project runs on Vercel as a static Vite build plus one Node.js Function.
`vercel.json` rewrites every `/api/*` request to `api/index.js`, which mounts the
existing Express app unchanged. The React app keeps using relative `/api` URLs.

> **Ephemeral storage warning.** Vercel Functions have a read-only filesystem
> except for `/tmp`. The SQLite database therefore lives at `/tmp/dtcw.sqlite` and
> is destroyed whenever the function cold-starts or moves to another instance.
> The bootstrap admin is recreated, but every workspace, user, simulation,
> telemetry event and audit entry is lost. Use Vercel only for a disposable
> preview. See [Persistent data](#persistent-data) before storing real records.

## Architecture

| Layer | Vercel setting |
| --- | --- |
| UI | Static Vite output in `dist/` |
| API | `api/index.js` Node.js Function, pinned to `sin1` |
| Database | SQLite at `/tmp/dtcw.sqlite` |
| API routing | Rewrite `/api/:path*` → `/api/index?__dtcw_path=:path*` |
| Runtime | Node.js 24 (`engines.node` in `package.json`) |

The rewrite marker preserves the original API path and query string. The handler
restores it before handing the request to Express. Only the rewrite entrypoint is
rewritten, so a client-supplied marker cannot change the route.

## Prerequisites

- A Vercel account (Hobby is sufficient for a preview).
- A Vercel access token from <https://vercel.com/account/tokens>.
- The repository pushed to GitHub, or the project folder available locally.

## 1. Create the project

### Option A — Vercel CLI from this folder

```bash
npx vercel@latest link
npx vercel@latest env add DTCW_DB_PATH production
# ...repeat for each variable in the table below...
npx vercel@latest --prod
```

### Option B — Vercel dashboard

1. **Add New → Project** and import the GitHub repository.
2. Framework preset: **Vite**.
3. Build command: `npm run build`; output directory: `dist`.
4. Add the environment variables from the table below to **Production**.
5. Deploy.

`vercel.json` already sets the framework, build command, output directory,
install command, region and security headers, so the dashboard values should
match it.

## 2. Environment variables

Set these for **Production** (and optionally Preview):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (Vercel sets this automatically) |
| `DTCW_DB_PATH` | `/tmp/dtcw.sqlite` |
| `TRUST_PROXY` | `1` |
| `PUBLIC_ORIGIN` | `https://<project>.vercel.app` |
| `BOOTSTRAP_ADMIN_EMAIL` | the email you will sign in with |
| `BOOTSTRAP_ADMIN_PASSWORD` | a new strong password, at least 12 characters |
| `BOOTSTRAP_ADMIN_NAME` | display name for the first Super Admin |
| `BOOTSTRAP_ADMIN_ORG` | workspace name |
| `SEED_DEMO_USERS` | `false` |
| `ALLOW_SELF_SIGNUP` | `false` |
| `AUDIT_HMAC_KEY` | 64 random hex characters |
| `APP_ORIGINS` | optional extra origins, comma separated |

Generate the secrets locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`PUBLIC_ORIGIN` can be added after the first deployment assigns the URL; until
then same-origin requests pass the fallback Host comparison. Add it and redeploy
to tighten the CSRF check.

Optional live integrations:

| Variable | Purpose |
| --- | --- |
| `HUNTER_LLM_BASE_URL` | OpenAI-compatible endpoint for the HUNTER assistant |
| `HUNTER_LLM_API_KEY` | Key for that endpoint (optional for local models) |
| `HUNTER_LLM_MODEL` | Model name, default `gpt-4o-mini` |
| `ABUSEIPDB_API_KEY` | IP reputation lookups |
| `OTX_API_KEY` | AlienVault OTX pulse context |

Without the LLM endpoint the assistant returns `503 assistant_not_configured`.
Without the reputation keys, live intelligence is limited to keyless RDAP.

Real SIEM/EDR connectors use the vendor variables documented in `.env.example`
(`SPLUNK_*`, `ELASTIC_*`, `AZURE_*`/`SENTINEL_*`, `DEFENDER_*`,
`CROWDSTRIKE_*`, `WAZUH_*`, `GENERIC_SIEM_URL`/`GENERIC_EDR_URL`). A connector is
reported `live` only when its credentials exist; otherwise it stays
`unconfigured`. The Function needs outbound HTTPS access to the vendor.

For network monitoring, create a telemetry token after sign-in and run
`collectors/flow-shipper.mjs` on the sensor host:

```bash
node collectors/flow-shipper.mjs --url https://<project>.vercel.app \
  --token "dtcw_..." --format zeek-tsv --sensor zeek-edge-01 \
  --file /opt/zeek/logs/current/conn.log
```

Raw packet capture cannot run inside a Vercel Function. The collector ships
records from your own Zeek, Suricata or NetFlow sensor; detection, anomaly
scoring and SSE all run through the same API.

## 3. Verify the deployment

```text
GET https://<project>.vercel.app/api/health
→ {"ok":true,"database":"ok"}
```

Then check the security-critical behavior:

1. Open the root URL and confirm the landing page loads with no console errors.
2. Sign in with the bootstrap email and password.
3. Confirm the session cookie is named `__Host-dtcw_session` and is
   `Secure; HttpOnly; SameSite=Lax`.
4. `POST /api/auth/login` with `alex@northwind.io` / `TwinDemo!2026` must return
   `401`; demo users are not seeded.
5. `GET /api/auth/session` returns exactly one user and one workspace after
   bootstrap.
6. Submit a workspace change and reload; it should persist until the next cold
   start.

## 4. Redeploy after changing environment variables

Vercel applies environment changes only to new deployments. Use **Redeploy** in
the dashboard or `npx vercel@latest --prod` after editing them.

## Persistent data

Vercel does not offer a persistent disk for Functions. The current storage layer
is SQLite (`node:sqlite`), so there are three realistic options:

1. **Keep Vercel for the preview** and accept that data resets. This is the
   configuration in this repository.
2. **Use a paid single-instance host with a disk** (for example the Render Starter
   plan described in [`DEPLOY-RENDER.md`](DEPLOY-RENDER.md)) when data must
   survive restarts. Run exactly one instance because SQLite is single-writer.
3. **Replace SQLite with a managed database** (Vercel Postgres/Neon, Turso, or
   another libSQL/PostgreSQL service) and move sessions and rate-limit state out
   of process memory. This is a code change, not an environment change.

## Operational constraints

- **Cold starts reset the database.** The first request to a new instance
  recreates the schema and the bootstrap Super Admin. All other data is gone.
- **Multiple instances can disagree.** Each instance has its own `/tmp`, so a
  session created on one instance may be missing on another. The function is
  pinned to `sin1` to reduce fan-out, but Vercel can still run concurrent
  instances. Do not use this deployment for multi-user production work.
- **Serverless request limits.** Request and response bodies are capped by the
  Vercel plan (about 4.5 MB on Hobby). Workspace imports close to the 4.5 MB
  application limit can be rejected by the platform before Express sees them.
- **Streaming.** `GET /api/telemetry/stream` is a long-lived SSE endpoint. Vercel
  Functions are request-scoped and capped by `maxDuration` (60 s here), so the
  live tail will reconnect rather than staying open indefinitely. Historical
  telemetry and polling still work.
- **In-memory state.** Rate-limit buckets, the login-failure backoff, SSE
  subscriber state and the isolation-forest model live in process memory and
  reset on cold starts. Detection and connector status are persisted in SQLite,
  but a new instance starts with a cold model and no live subscribers.
- **SQLite on `/tmp`.** Do not point `DTCW_DB_PATH` at the project directory;
  Vercel's deployment filesystem is read-only.
- **Payment number.** It is compiled into the signed-in Subscription page
  (`PAYMENT_UPI` in `src/pages/app/Subscription.jsx`). UPI transfers are confirmed
  manually by a Super Admin; there is no payment-gateway integration.
