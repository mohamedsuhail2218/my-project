# Deploy to Render

The app is a single Node process that serves the built React UI and stores data in
SQLite. `render.yaml` is configured for Render's **Free** plan: no persistent
disk, so `server/data/dtcw.sqlite` is rebuilt from scratch on every restart,
spin-down, deploy or crash.

> **Free plan warning.** A Free web service spins down after inactivity and its
> filesystem is ephemeral. Every workspace, user, simulation, telemetry event and
> audit entry is lost when the service restarts. Use Free only for a disposable
> preview. Before storing real client, payment or telemetry records, upgrade to a
> paid instance and attach a persistent disk (see
> [Upgrade to persistent storage](#upgrade-to-persistent-storage)).

## Prerequisites

- A GitHub account and a repository containing this project.
- A Render account. No billing is required for the Free plan.
- The repository must include `render.yaml`, `package.json`, `package-lock.json`
  and `.node-version`. Do **not** commit `node_modules/`, `dist/`, `.env` or
  `server/data/*.sqlite`; `.gitignore` already excludes them. Render runs
  `npm ci --include=dev && npm run build`, so it builds `dist/` itself.

## 1. Put the project in a GitHub repository

### Option A — GitHub Desktop (recommended on Windows)

1. Install [GitHub Desktop](https://desktop.github.com/) and sign in.
2. **File → Add local repository**, choose the extracted project folder.
3. When prompted that it is not a Git repository, choose **create a repository**.
4. Commit the files, then **Publish repository**. Keep it **private**.

GitHub Desktop respects `.gitignore`, so `node_modules/`, `dist/`, `.env` and the
local SQLite files are not uploaded.

> **Do not upload `server/data/dtcw.sqlite`.** Bootstrap only runs when the
> database has zero users. If the demo database is uploaded, Render starts with
> the published demo accounts and the bootstrap admin is never created. If you
> accidentally committed it, delete it from the repository and redeploy.

### Option B — GitHub website upload

1. Create a new **private** repository on <https://github.com/new>.
2. Choose **uploading an existing file**.
3. Drag in the project contents **except** `node_modules/`, `dist/`, `.env` and
   `server/data/*.sqlite`.
4. The web uploader accepts up to 100 files per commit. If it rejects the batch,
   upload the top-level files first, then the `src/`, `server/`, `tests/` and
   `public/` folders in separate commits.

### Option C — Git CLI

```bash
git init
git add .
git commit -m "Deploy Digital Twin Cyber War"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2. Create the Blueprint on Render

1. Open <https://dashboard.render.com/blueprints>.
2. Choose **New Blueprint Instance**.
3. Connect GitHub and select the repository and the `main` branch.
4. Render reads `render.yaml` and asks for the two values marked `sync: false`:
   - `BOOTSTRAP_ADMIN_EMAIL` — the email you will sign in with.
   - `BOOTSTRAP_ADMIN_PASSWORD` — a new strong password (at least 12 characters).
5. Confirm the **Free** instance type and apply the Blueprint.

The first boot creates the SQLite file at `server/data/dtcw.sqlite` and, because
the database is empty, creates exactly one Super Admin from the bootstrap values.
Demo accounts are **not** seeded (`SEED_DEMO_USERS=false`), so the published
`alex@northwind.io` / `TwinDemo!2026` login does not work.

Because the Free filesystem resets, every cold start re-runs the bootstrap and
recreates that one admin — but **all other data is gone**.

## 3. Verify the deployment

Wait for the build and health check to pass, then open:

```
https://<service-name>.onrender.com/api/health
```

It should return `{"ok":true,"database":"ok"}`. Sign in at the root URL with the
bootstrap email and password. If the health check fails, open the Render logs and
confirm:

- `NODE_VERSION=24` is in effect;
- `HOST=0.0.0.0` is set;
- `DTCW_DB_PATH=server/data/dtcw.sqlite`;
- the build ran `npm ci --include=dev && npm run build` successfully. The
  `--include=dev` flag is required because `NODE_ENV=production` also applies
  during the build and would otherwise skip Vite.

## 4. Set the canonical origin

After Render assigns the public URL, add an environment variable:

```
PUBLIC_ORIGIN=https://<service-name>.onrender.com
```

Save the change; Render redeploys automatically. This tightens the CSRF origin
check. The app also accepts same-origin requests whose `Origin` matches the
request `Host`, so sign-in works before this value is added.

## 5. Optional live integrations

Add any of these in **Environment** and redeploy:

| Variable | Purpose |
| --- | --- |
| `HUNTER_LLM_BASE_URL` | OpenAI-compatible endpoint for the HUNTER assistant |
| `HUNTER_LLM_API_KEY` | Key for that endpoint (optional for local models) |
| `HUNTER_LLM_MODEL` | Model name, default `gpt-4o-mini` |
| `ABUSEIPDB_API_KEY` | IP reputation lookups |
| `OTX_API_KEY` | AlienVault OTX pulse context |

Without the LLM endpoint the assistant returns `503 assistant_not_configured`.
Without the reputation keys, live intelligence is limited to keyless RDAP.

## Upgrade to persistent storage

To keep data across restarts:

1. Change `plan: free` to `plan: starter` (or another paid instance type) in
   `render.yaml`.
2. Re-add the disk block:

   ```yaml
       disk:
         name: dtcw-data
         mountPath: /var/data
         sizeGB: 1
   ```

3. Change `DTCW_DB_PATH` to `/var/data/dtcw.sqlite`.
4. Commit and push, then apply the Blueprint again.

A persistent disk requires a paid instance type. Deleting or resizing the disk can
destroy the database; back up `/var/data/dtcw.sqlite` (plus any `-wal`/`-shm`
files) first and encrypt backups because they contain password and session hashes.

## Operational constraints

- **One instance only.** SQLite is single-writer; do not scale the service
  horizontally and do not enable multiple instances.
- **HTTPS.** Render terminates TLS. `TRUST_PROXY=1` is required so Express sees
  the forwarded protocol and sets Secure cookies. Do not set `TRUST_PROXY=true`.
- **Payment number.** It is compiled into the signed-in Subscription page. To
  change it, edit `PAYMENT_UPI` in `src/pages/app/Subscription.jsx`, commit and
  redeploy.
- **No real payment verification.** UPI transfers are confirmed manually by a
  Super Admin before the plan changes. A payment-gateway integration is required
  for automatic activation.
- **Free plan data loss.** Do not use the Free deployment to hold real client,
  payment or telemetry records.

## Alternative: API deployment

If you prefer a scripted deployment, Render's API can create the service from the
same repository. You will need:

- a Render API key (`Account Settings` → `API Keys`);
- the Render owner ID;
- the Git repository URL and a token if the repository is private.

The `render.yaml` Blueprint is the source of truth for the service and
environment variables.
