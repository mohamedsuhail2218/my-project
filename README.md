# Digital Twin Cyber War — HUNTER AI

A production-shaped cyber-range workspace: model a network as a digital twin,
rehearse attacks against it, investigate the resulting telemetry with HUNTER AI,
and prove which controls break the path — without touching production.

This repository contains the React application, a Node/Express API, a SQLite
database, session authentication with role-based access control (RBAC), a
versioned state migration layer, Vitest API/unit tests, Playwright end-to-end
tests and a GitHub Actions pipeline.

> All infrastructure, users, telemetry and findings in the demo are fictional.
> The simulation engine is deterministic and never sends traffic to real hosts.

---

## Quick start

Requirements: **Node.js 24 or newer** (the API uses the built-in `node:sqlite`
module, which is not available on older Node releases).

```bash
npm ci
npm run dev
```

`npm run dev` starts both processes:

| Process | URL | Purpose |
| --- | --- | --- |
| Vite | http://localhost:5173 | React UI with HMR and `/api` proxy |
| Express | http://127.0.0.1:8787 | API, sessions, RBAC, SQLite |

The API creates `server/data/dtcw.sqlite` and seeds the Northwind workspace on
first boot.

Production-style run:

```bash
npm run build
npm run start:prod   # http://127.0.0.1:8787
```

`npm run start:prod` sets `NODE_ENV=production`, enables Secure cookies/HSTS and
runs strict startup validation.

### Demo credentials

| User | Email | Password | Role |
| --- | --- | --- | --- |
| Alex Mercer | `alex@northwind.io` | `TwinDemo!2026` | Super Admin |
| Priya Nair | `priya@northwind.io` | `TwinDemo!2026` | Security Analyst |
| Maya Chen | `maya@northwind.io` | `TwinDemo!2026` | Read Only |

Demo users are seeded only when the database has no workspaces and
`SEED_DEMO_USERS` is enabled (the default outside production). The password is
configurable with `DEMO_PASSWORD` **before** first seed. It is never compiled
into the browser bundle. Production refuses to boot with the published default,
and `SEED_DEMO_USERS` defaults to `false` there.

Self-service signup creates an isolated Starter workspace and returns a generic
`202`; it does **not** create a session. The user signs in afterwards. Signup is
disabled by default in production and requires `SIGNUP_INVITE_CODE` when enabled.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│ Browser                                                          │
│  React 18 + React Router 7 (HashRouter)                          │
│  Route-level lazy chunks · ErrorBoundary · versioned cache        │
└───────────────┬──────────────────────────────────────────────────┘
                │ same-origin fetch, httpOnly session cookie
┌───────────────▼──────────────────────────────────────────────────┐
│ Express 5 API (server/)                                          │
│  helmet CSP · JSON limits · zod validation · rate limiting       │
│  session auth · RBAC middleware · audit logging                  │
└───────────────┬──────────────────────────────────────────────────┘
                │ node:sqlite (WAL)
┌───────────────▼──────────────────────────────────────────────────┐
│ SQLite                                                           │
│  workspaces · users · sessions · audit_log                       │
└──────────────────────────────────────────────────────────────────┘
```

### Frontend

- `src/App.jsx` — routes, `RequireAuth`, `RequireRole`, Suspense boundaries.
- `src/state/AppState.jsx` — reducer, API bootstrap, auth actions, debounced
  server persistence, local cache.
- `src/data/initialState.js` — `STATE_SCHEMA_VERSION`, seed factory, `migrateState`,
  cache read/write/clear.
- `src/lib/engine.js` — deterministic risk and attack-path engine.
- `src/lib/api.js` — typed client for telemetry, detections, network flows and connectors.
- `src/lib/useLiveHunter.js` — server telemetry/detection/connector state plus the SSE stream.
- `src/lib/api.js` — typed-ish fetch wrapper with `ApiError`.
- `src/components/ErrorBoundary.jsx` — top-level render recovery.
- `src/components/RouteLoading.jsx` — lazy-route and session-loading surface.

### Backend

- `server/index.js` — startup validation, bootstrap admin, timeouts, graceful shutdown.
- `server/app.js` — routes, security middleware, static production serving.
- `server/config.js` — validated environment configuration and fail-closed production checks.
- `server/auth.js` — async password verification, sessions, permissions, audit helper.
- `server/db.js` — schema/migrations, demo/self-service seeding, workspace helpers, hash-chained audit.
- `server/rateLimit.js` — bounded, pruned rate limiters and per-email failure delay.
- `server/ip.js` — IP/CIDR validation and allowlist matching.
- `server/plans.js` — server-owned plan and seat catalogue.
- `server/validation.js` — zod request schemas and payload limits.
- `server/telemetry.js` — authenticated ingestion, SSE fan-out, retention, shipper tokens.
- `server/network.js` — Zeek, Suricata, NetFlow and generic flow normalisation.
- `server/detections.js` — stateful brute-force, port-scan, beaconing, fan-out,
  known-bad and blocked-egress rules with rolling windows and deduplication.
- `server/simulation.js` — controlled synthetic attacks that exercise the live pipeline.
- `server/connectors/` — real Splunk, Elastic, Sentinel, Defender, CrowdStrike,
  Wazuh and generic SIEM/EDR HTTP pull clients.
- `collectors/flow-shipper.mjs` — Zeek TSV/JSON, Suricata and NetFlow log shipper.
- `server/ml/anomaly.js` — per-workspace isolation forest, scoring and explanations.
- `server/services/threatIntel.js` — keyless RDAP plus optional AbuseIPDB and OTX.
- `server/services/assistant.js` — OpenAI-compatible chat client with explicit unavailability.
- `server/hunterContext.js` — bounded evidence retrieval and citation references.
- `server/response.js` — approval-gated response playbooks, automation rules and blocks.

### Authentication and RBAC

- Passwords are hashed with bcrypt at cost 12 in production and cost 10 outside
  production. Inputs longer than 72 bytes are rejected because bcrypt would
  silently truncate them.
- Session tokens are 32 random bytes; only their SHA-256 hash is stored.
- The cookie is `httpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when
  `NODE_ENV=production`. Production uses the `__Host-dtcw_session` prefix.
- Sessions have an absolute lifetime (7 days with “keep me signed in”, otherwise
  8 hours) plus a workspace-configurable idle timeout enforced on every request.
- Failed logins use a dummy bcrypt comparison for unknown emails, a per-IP
  limiter, and a capped per-email delay. There is no hard account lockout that an
  attacker could use to deny service.
- Registration always returns the same generic `202` response and performs one
  bcrypt hash whether or not the email exists.
- Plan, seat and trial entitlements live in server-owned database columns. A
  workspace save cannot change them; only a Super Admin can call
  `PATCH /api/workspace/plan`.
- Session idle timeout and IP allowlists are stored server-side and enforced at
  sign-in and on every authenticated request.
- Demand-driven state JSON is never parsed while resolving a session.
- Audit entries are hash-chained per workspace. `GET /api/audit` verifies the
  chain and reports the first broken entry. In-place edits and mid-chain
  deletions are detectable; truncating the newest rows or replacing the entire
  chain needs an external anchor (or the optional `AUDIT_HMAC_KEY`). An
  interrupted insert with a NULL hash is skipped rather than permanently
  breaking verification.

| Capability | Super Admin | Security Analyst | Read Only |
| --- | --- | --- | --- |
| Read workspace | Yes | Yes | Yes |
| Save workspace / run simulations | Yes | Yes | No |
| Reset workspace | Yes | No | No |
| Read audit log | Yes | No | No |
| Open `/app/admin` | Yes | No | No |

Enforcement happens on the server (`requirePermission`, explicit role checks).
The UI additionally hides the Super Admin navigation and route for other roles.

### API

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Database liveness only; no version details |
| GET | `/api/auth/config` | Public | Signup availability and password policy |
| POST | `/api/auth/login` | Public | Rate-limited, generic failures, sets session cookie |
| POST | `/api/auth/register` | Public | Generic `202`, isolated Starter workspace, no auto-login |
| GET | `/api/auth/session` | Public | `{ user: null }` when signed out |
| POST | `/api/auth/logout` | Public | Destroys session and clears cookie |
| PATCH | `/api/auth/profile` | Session | Name and title only; strict schema |
| GET | `/api/workspace` | Session | Hydrates workspace, server policy, role and schema version |
| PUT | `/api/workspace` | Session + `workspace:write` | Validates collections and size; plan/seats stripped |
| POST | `/api/workspace/reset` | Super Admin | Re-seeds the caller’s workspace |
| PATCH | `/api/workspace/plan` | Super Admin | Server-owned plan change |
| PATCH | `/api/workspace/security` | Super Admin | Idle timeout and CIDR IP allowlist |
| GET | `/api/connectors` | Session | Real SIEM/EDR connector registry, network status and detection rule health |
| POST | `/api/connectors/:id/test` | Session + `hunter:write` | Authenticated vendor health check; unconfigured vendors report honestly |
| POST | `/api/connectors/:id/pull` | Session + `hunter:write` | Pull, normalise and ingest vendor events through the live pipeline |
| GET | `/api/audit` | Super Admin | Paginated events plus hash-chain verification |
| POST | `/api/telemetry/ingest` | Session + `hunter:write`, or bearer token | Validated batch; stored, scored and matched against blocks |
| GET | `/api/telemetry` | Session | Search stored telemetry with cursor pagination |
| GET | `/api/telemetry/stats` | Session | Counts, source mix, retention and model metadata |
| GET | `/api/telemetry/stream` | Session | Server-Sent Events stream of new events and detections |
| GET/POST/DELETE | `/api/telemetry/tokens` | Super Admin | List, create and revoke workspace-scoped ingestion tokens |
| POST | `/api/network/flows` | Session + `hunter:write`, or bearer token | Normalise and ingest Zeek, Suricata, NetFlow or generic flows |
| GET | `/api/network/status` | Session | Flow totals, source count, latest timestamp and formats |
| GET | `/api/detections` | Session | Rule detections with filters plus severity/category statistics |
| GET | `/api/detections/rules` | Session | Rule catalogue, thresholds and enabled state |
| PATCH | `/api/detections/:id` | Session + `hunter:write` | Move a detection between open, triaged and closed |
| POST | `/api/detections/simulate` | Session + `hunter:write` | Run a labelled synthetic attack; sends no packets |
| GET | `/api/ml/model` | Session | Model status and feature catalogue |
| POST | `/api/ml/train` | Session + `hunter:write` | Retrain the isolation forest on stored events |
| GET | `/api/ml/anomalies` | Session | Highest-scoring events with explanations |
| GET | `/api/intel/providers` | Session | Provider configured/unconfigured status |
| GET | `/api/intel/lookup` | Session | Live RDAP/AbuseIPDB/OTX lookup with workspace cache |
| GET | `/api/hunter/assistant/status` | Session | Whether an LLM endpoint is configured |
| POST | `/api/hunter/assistant` | Session + `hunter:write` | Cited answer from retrieved workspace evidence |
| GET | `/api/response/playbooks` | Session | Available containment playbooks |
| GET | `/api/response/actions` | Session | Proposals, decisions and active blocks |
| POST | `/api/response/actions` | Session + `hunter:write` | Queue a proposal; never executes immediately |
| POST | `/api/response/actions/:id/decision` | Super Admin | Approve (execute) or reject a pending proposal |
| POST | `/api/response/actions/:id/revert` | Super Admin | Deactivate a reversible block |
| GET/PUT | `/api/response/rules` | Session / Super Admin | Automation thresholds; automation only queues proposals |

All `/api` responses send `Cache-Control: no-store` and `Vary: Cookie`.
State-changing requests are rejected when the browser supplies a cross-site
`Origin` or `Sec-Fetch-Site` header. JSON parsers are scoped per route (16 kB for
auth, 5 MB for workspace) and run only after the global limiter. Invalid JSON
returns `400`; oversized bodies return `413`.

### Data model

```sql
workspaces(id PK, name, state JSON, schema_version, plan, trial_ends,
           session_timeout_minutes, ip_allowlist, created_at, updated_at)
users(id PK, workspace_id FK, email UNIQUE, name, title,
      role_key CHECK(super_admin|security_analyst|read_only),
      password_hash, created_at)
sessions(token_hash PK, user_id FK, created_at, expires_at, last_seen_at,
         ip, user_agent)
audit_log(id PK, workspace_id, user_id, action, detail, ip, user_agent,
          created_at, prev_hash, entry_hash)
telemetry_events(id PK, workspace_id, event_uid, timestamp, received_at, source,
                 host, event, action, status, ip, username, message, raw,
                 anomaly_score, anomaly_severity, anomaly_explanation, blocked,
                 ingested_by, dst_ip, dst_port, proto, bytes, duration_ms,
                 direction, sensor)
telemetry_tokens(id PK, workspace_id, label, prefix, token_hash, created_by,
                 created_at, last_used_at, revoked_at)
detections(id PK, workspace_id, rule_id, category, title, severity, confidence,
           status, entity, detail, technique, event_count, first_seen,
           last_seen, dedupe_key UNIQUE(workspace_id, dedupe_key), evidence,
           created_at, updated_at)
connector_state(workspace_id, connector_id, last_test_at, last_test_ok,
                last_test_detail, last_pull_at, last_pull_count,
                PRIMARY KEY(workspace_id, connector_id))
anomaly_models(workspace_id PK, version, trained_at, samples, threshold, metadata)
intel_cache(workspace_id, indicator, payload, fetched_at, expires_at,
            PRIMARY KEY(workspace_id, indicator))
response_actions(id PK, workspace_id, incident_id, detection_id, event_id,
                 playbook_id, target, rationale, status, automated,
                 requested_by, requested_by_id, requested_at, decided_by,
                 decided_by_id, decided_at, decision_note, executed_at,
                 result, previous_state)
response_blocks(id PK, workspace_id, action_id, kind, value, created_at, active)
response_rules(workspace_id, playbook_id, enabled, min_score, updated_by,
               updated_at, PRIMARY KEY(workspace_id, playbook_id))
```

The workspace state is stored as a JSON document in SQLite for demo simplicity.
Each collection is validated before write, and every response is run through the
same migration function as the browser cache. Plan and trial values are columns,
not workspace JSON, so a client save cannot forge entitlements. Audit reads are
scoped to the caller’s workspace and chained per workspace. In a larger
deployment, the document store can be normalised to PostgreSQL without changing
the API contract.

New signups get a unique index on `lower(email)` to close case-variant races.
Older databases are migrated in place; existing workspaces default to the
Professional plan and existing sessions receive a `last_seen_at` value.

### Versioned state migration

Current version: **2**.

- v1: localStorage-only snapshot, no `scenarios`, embedded trusted `user`.
- v2: server-backed workspace; authentication comes from the session; the
  scenario library is code-owned; missing/corrupt collections are restored from
  seed defaults; completed v1 runs receive explicit empty `plan`/`executed`.
- Cache key: `dtcw-workspace-cache-v2`; the legacy `dtcw-workspace-v1` key is
  migrated and removed.
- `toasts` and `user` are never persisted. The local cache is a rendering hint;
  the API response is authoritative.

### SIEM and EDR connectors

`server/connectors/` contains real HTTP pull clients for Splunk, Elastic,
Microsoft Sentinel, Microsoft Defender for Endpoint, CrowdStrike Falcon, Wazuh
and a generic SIEM/EDR JSON API. Each connector reports `mode: "live"` only when
all of its credentials are present in the server environment; otherwise it
reports `mode: "unconfigured"` and a pull attempt returns `409
connector_not_configured`. Mock events are never substituted.

- `POST /api/connectors/:id/test` performs an authenticated health check.
- `POST /api/connectors/:id/pull` fetches vendor events, normalises common field
  names into the telemetry contract and runs them through anomaly scoring,
  detection rules and SSE exactly like push ingestion.
- Credentials stay in environment variables. The database stores only last
  test/pull status, never a secret.
- Vendor URLs are operator configuration, not request input. Non-HTTP schemes and
  cloud metadata hosts are rejected.

See `.env.example` for the exact variables per vendor.

### Authorised network-flow monitoring

Raw packet capture cannot run inside Vercel Functions, so the application accepts
already-captured records from a sensor the operator controls:

- `POST /api/network/flows` accepts `{ format, sensor, flows: [...] }` where
  `format` is `auto`, `zeek`, `suricata`, `netflow` or `generic`.
- Zeek JSON, Suricata `eve.json` and NetFlow-style field names are normalised to
  `src/dst` address, port, protocol, bytes, duration, direction and sensor.
- The shipped `collectors/flow-shipper.mjs` tails Zeek TSV/JSON and Suricata
  NDJSON files, batches records and retries delivery. It supports `--stdin` for
  pipelines such as `tail -F eve.json | ...`.
- Flow ingestion uses the same session/bearer-token authentication, rate limit,
  anomaly model, detection rules and SSE stream as every other event source.
- `GET /api/network/status` reports flow totals and the latest sensor timestamp.

### Live security capabilities

Eight capabilities run on the server rather than being simulated in the browser.
`GET /api/connectors` reports connector, network and detection health.

| Capability | Implementation | Honest limitation |
| --- | --- | --- |
| Anomaly detection | Per-workspace isolation forest (80 trees, 192-point subsample) over 20 behavioural features; scores written back to each event with a feature-level explanation | Trains from the workspace's own events and needs at least 12; it detects statistical deviation, not proof of compromise |
| HUNTER assistant | Any OpenAI-compatible chat endpoint; deterministic server-side retrieval supplies incidents, detections, telemetry and intel with `[S1]` citations | Returns `503 assistant_not_configured` when no endpoint is set; it never falls back to canned answers |
| Live threat intelligence | Keyless RDAP registration lookup for IPs and domains; AbuseIPDB reputation and AlienVault OTX pulses when keys exist; bounded workspace cache | Provider errors are returned per provider; no verdict is invented and no key is exposed to the browser |
| Real-time ingestion | `POST /api/telemetry/ingest` with session RBAC or a hashed workspace bearer token; `GET /api/telemetry/stream` delivers SSE; retention and per-workspace caps apply | Push-based; the operator must run a shipper or point a sensor at the API |
| Network-flow monitoring | Zeek/Suricata/NetFlow normalisation plus the supplied flow shipper; source, destination, port, protocol and sensor are persisted | Packet capture must run on the operator's sensor, not in the serverless application |
| Rule-based detection | Stateful rolling-window rules for brute force (T1110), port scan (T1046), beaconing (T1071.001), fan-out, known-bad destinations and blocked egress; deduplicated per rule/entity/hour with event evidence | Deterministic thresholds, not a full correlation engine; tune thresholds for your environment |
| SIEM/EDR connectors | Authenticated Splunk, Elastic, Sentinel, Defender, CrowdStrike, Wazuh and generic pull clients with vendor-specific OAuth/token exchange | A vendor must be reachable from the API and configured with real credentials |
| Incident response | Playbooks for `block-ip`, `isolate-host`, `revoke-sessions` and `disable-identity`; automation only creates pending proposals; approval executes, revert deactivates reversible blocks | Only a Super Admin can approve or revert. `revoke-sessions` cannot be undone |

### Detection rules and controlled testing

Thresholds are environment-tunable (`.env.example`): brute force, distinct ports
for a scan, repeated connections to one destination, distinct destinations per
host, and blocked-egress attempts. Each detection stores the matching event ids,
hosts, users and addresses so an analyst can reproduce it.

`POST /api/detections/simulate` injects **synthetic telemetry only** labelled
`attack-simulation`; no packet is sent to any target. The HunterDashboard exposes
**Run controlled attack** and **Simulate port scan** buttons for signed-in users
with `hunter:write`. The same request can be made directly:

```bash
curl -X POST http://127.0.0.1:8787/api/detections/simulate \
  -H "Cookie: dtcw_session=..." \
  -H "Content-Type: application/json" \
  -d '{"scenario":"all"}'
```

Use the simulation to prove the end-to-end path: ingest → store → score → rule
evaluation → SSE `detection` event → dashboard queue. Every generated event
contains `simulated: true` in its raw payload.

Telemetry tokens are created in **Settings → Security & access** and shown once.
Example shipper request:

```bash
curl -X POST http://127.0.0.1:8787/api/telemetry/ingest \
  -H "Authorization: Bearer dtcw_..." \
  -H "Content-Type: application/json" \
  -d '{
    "source": "edge-firewall",
    "events": [{
      "timestamp": "2026-01-12T09:14:00.000Z",
      "host": "edge-fw-01",
      "event": "connection_denied",
      "action": "deny",
      "status": "deny",
      "ip": "198.51.100.24",
      "user": "svc_edge",
      "message": "Denied inbound 443"
    }]
  }'
```

The event is stored in SQLite, scored by the current model and published to every
SSE client in the workspace. If an approved `block-ip` action covers the source
address, the event is tagged and raised to `alert` before storage.

### Shipping network flows

The collector handles Zeek TSV (the default `conn.log`), Zeek JSON, Suricata
NDJSON and NetFlow-style JSON. Create a telemetry token, then run it beside the
sensor:

```bash
# Zeek default TSV, following the current log
node collectors/flow-shipper.mjs \
  --token "dtcw_..." --format zeek-tsv --sensor zeek-edge-01 \
  --file /opt/zeek/logs/current/conn.log

# Suricata eve.json streamed through stdin
tail -F /var/log/suricata/eve.json \
  | node collectors/flow-shipper.mjs --stdin --format suricata \
      --token "dtcw_..." --sensor suricata-edge-01

# One-off NetFlow JSON-lines backfill
node collectors/flow-shipper.mjs --once --format netflow \
  --file ./netflow-export.ndjson --token "dtcw_..."
```

The shipper batches up to 500 flows, retries with exponential backoff and keeps
a bounded in-memory buffer while the API is unavailable. It reads only records
the sensor has already written; it does not capture packets.

---

## Tests and CI

```bash
npm test          # Vitest: engine, migration, auth/RBAC, detections, connectors
npm run test:e2e  # Playwright: build must exist; starts the production server
npm run ci        # build + unit/API tests
```

The suite currently contains **59 Vitest tests** across seven files and **20
Playwright tests**. Coverage includes:

- deterministic control application, attack-path evaluation and risk bounds;
- v1 → v2 migration, corrupt input recovery and cache round-trip;
- API health/CSP/cache headers, login failure semantics, session lifecycle, logout;
- server-side validation, RBAC write/reset/audit denials, profile validation;
- generic signup flow, password strength, 72-byte boundary and duplicate email handling;
- X-Forwarded-For rate-limit and audit-attribution regressions;
- plan/seat entitlement tampering, session-state parse isolation, audit hash-chain tampering
  and interrupted audit inserts;
- workspace idle timeout, IP allowlist enforcement and cross-origin request rejection;
- telemetry ingestion with session RBAC and bearer tokens, malformed batch rejection,
  isolation-forest training/scoring, RDAP lookup and cache, assistant unavailability,
  and proposal → Super Admin approval → block enforcement → revert;
- controlled attack simulation producing brute-force, port-scan, beaconing and
  egress detections; Zeek flow normalisation; detection triage RBAC and audit;
  connector registry honesty and unconfigured pull rejection; Zeek TSV and
  JSON-lines flow-shipper parsing;
- Playwright sign-in/persistence/sign-out, signup-then-sign-in, route smoke tests,
  read-only route denial, mobile overflow, keyboard skip-link, HUNTER live-tail
  SSE ingestion, pause and resume, controlled attack → live queue → log search,
  and UPI payment/manual-verification copy.

`.github/workflows/ci.yml` installs, audits runtime dependencies, builds, runs
Vitest, installs Chromium and runs Playwright on Node 24. The Playwright report is
uploaded when a run fails.

---

## Deployment

1. Provision Node.js 24 and a persistent disk for SQLite **outside** any cloud-sync
   folder (OneDrive, Dropbox, iCloud, Google Drive).
2. Copy `.env.example` to `.env` and set:
   - `NODE_ENV=production`
   - `SEED_DEMO_USERS=false` **or** `SEED_DEMO_USERS=true` with a strong,
     non-default `DEMO_PASSWORD` (production refuses the published default)
   - alternatively `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` for the
     first Super Admin when demo users are disabled
   - `ALLOW_SELF_SIGNUP=false` (or `true` plus `SIGNUP_INVITE_CODE`)
   - `PUBLIC_ORIGIN=https://app.example.com`
   - `TRUST_PROXY=1` only when exactly one trusted proxy terminates TLS; never
     use `TRUST_PROXY=true` on a directly exposed server
   - `AUDIT_HMAC_KEY` with a long random value
   - `DTCW_DB_PATH` on the persistent volume
3. `npm ci --include=dev && npm run build`, then start with
   `NODE_ENV=production node server/index.js` (or `npm run start:prod`).
4. Terminate TLS at a reverse proxy (nginx/Caddy/ALB). Forward to
   `127.0.0.1:8787`. Production startup enables Secure cookies and HSTS.
5. Health check: `GET /api/health` (database liveness).
6. Back up the SQLite file and its WAL sidecars, or use `sqlite3 .backup` on a
   schedule. Backups contain password hashes and tenant data: encrypt them.
7. Rotate `DEMO_PASSWORD` before first boot and delete seeded sessions for shared
   environments. Expired and idle sessions are pruned lazily and by a periodic
   housekeeping task.
8. Configure only the connectors you need in `.env` (`SPLUNK_*`, `ELASTIC_*`,
   `AZURE_*`/`SENTINEL_*`/`DEFENDER_*`, `CROWDSTRIKE_*`, `WAZUH_*` or
   `GENERIC_SIEM_URL`/`GENERIC_EDR_URL`). The API needs outbound HTTPS access to
   each vendor. Then run `collectors/flow-shipper.mjs` beside your Zeek,
   Suricata or NetFlow sensor and create a workspace token for it. Tune the
   `DETECTION_*` thresholds for your environment; defaults are documented in
   `.env.example`.

Production startup fails closed when the configuration is unsafe. Warnings are
printed for a missing `PUBLIC_ORIGIN`, unkeyed audit hashing, a cloud-synced
database path, or `TRUST_PROXY=true`.

### Deploy to Vercel

`vercel.json` builds the Vite app and routes `/api/*` to a single Node.js
Function (`api/index.js`) that mounts the existing Express app. SQLite runs at
`/tmp/dtcw.sqlite` because Functions have no persistent disk, so every cold start
recreates the schema and the bootstrap admin and loses all other data. Set
`DTCW_DB_PATH=/tmp/dtcw.sqlite`, `TRUST_PROXY=1`, production bootstrap variables,
`SEED_DEMO_USERS=false` and `PUBLIC_ORIGIN=https://<project>.vercel.app`. Full
steps and serverless limitations are in [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md).

The function declares `maxDuration: 300` for the SSE stream. The dashboard reads
its five live panels sequentially and retries a 401 up to twice, which keeps a
single-user session on the same warm instance in practice. If a cold start still
routes the initial reads to the wrong instance, the dashboard retries the missing
panels once its SSE connection opens. A controlled attack applies the events and
detections from its own response instead of re-reading the panels, so the
follow-up cannot be split across instances. Vercel's strict function affinity is
not a fix for browser traffic: the edge rejects a browser-supplied
`x-vercel-affinity-id` with `FUNCTION_AFFINITY_FORBIDDEN`, and strict mode makes
the function unreachable without an internal service-binding call. A recycled
instance still loses sessions and data, and a second browser or device may land
elsewhere.

Connector credentials and a network-flow ingestion token can be added as Vercel
environment variables, but the Function must be able to reach the vendor over
outbound HTTPS. SSE subscriber state and the isolation-forest model live in
process memory, so streaming is reliable on a single warm instance and may need
reconnection when Vercel scales or suspends.

Vercel is suitable only for a disposable preview. Do not run it with multiple
concurrent instances for real work, and do not treat the `/tmp` database as
durable. Use the Render paid option below, or a managed database, when data must
survive restarts.

### Deploy to Render

`render.yaml` defines a Render Blueprint on the **Free** plan: no persistent
disk, `TRUST_PROXY=1`, demo users disabled and a generated audit key. Follow
[`DEPLOY-RENDER.md`](DEPLOY-RENDER.md) for the GitHub upload, bootstrap-admin and
verification steps.

On Free the SQLite database at `server/data/dtcw.sqlite` is ephemeral: Render
spins the service down after inactivity, and every restart or deploy rebuilds an
empty database. The bootstrap admin is recreated from the environment variables,
but all other data is lost. Free is suitable only for a disposable preview. To
keep data, use a paid instance with a 1 GB disk mounted at `/var/data` and set
`DTCW_DB_PATH=/var/data/dtcw.sqlite`; the upgrade steps are in the deployment
guide. Run exactly one instance because SQLite is single-writer.

### Security notes

- MFA and SAML SSO are **not implemented**. The UI labels them as unavailable
  rather than displaying fake enforcement.
- Password reset is a demo-only screen; no reset email or token is generated.
- SQLite stores tenant data and password/session hashes in plaintext on disk. Use
  full-volume encryption and restrictive ACLs, or replace the storage layer with
  SQLCipher/PostgreSQL for a real deployment.
- The local browser cache holds a rendering copy of workspace data. It is not
  authoritative for authentication or entitlements.
- CSV exports neutralize spreadsheet formula prefixes before download.

SQLite with WAL is appropriate for a single-instance demo or small team. For
horizontal scaling, replace `server/db.js` with PostgreSQL and move rate-limit
state and sessions to Redis. The API contract, validation and RBAC layer remain
unchanged.

### Accessibility and performance

- Skip link focuses the main landmark without colliding with HashRouter.
- Visible focus rings, labelled icon buttons, table column scopes and AA contrast
  for faint text.
- Mobile navigation tested at 390×844; data tables scroll inside their panel
  instead of widening the document.
- Keyboard-only sign-in and skip-link flow is covered by Playwright.
- All 30 routes are lazy-loaded. Vendor code is split into React, Router and icon
  chunks; the initial JS is roughly 325 KB raw / 100 KB gzip, with page chunks
  between 2 KB and 19 KB.

### Known limitations

- Vendor connectors are real HTTP clients, but they only become live once real
  credentials and outbound network access are configured. Unconfigured vendors
  are reported honestly, never replaced with fixtures.
- Raw packet capture is not performed by the application. Run Zeek, Suricata or a
  NetFlow exporter on infrastructure you control and ship records with
  `collectors/flow-shipper.mjs`.
- Detection rules are deterministic thresholds over a rolling window. They are
  explainable and reproducible, not a full correlation or ML detection platform.
- Controlled attacks are synthetic telemetry only; they send no packets. The
  simulation engine is not a packet-level emulator.
- SQLite is single-writer and intended for one API instance. SSE subscriber state
  and the anomaly model are in-process, so multi-instance deployments need a
  shared transport (Redis/PostgreSQL) for live streaming.
- Password reset and SSO are not implemented; the UI clearly labels them as
  unavailable instead of simulating success.
- No email delivery, billing provider or malware sandbox is connected. Plan
  payment is a manual UPI transfer to the number shown on the signed-in
  Subscription page; the app cannot verify the transfer, and a Super Admin applies
  the plan after confirming it.

---

## Verdict

The project has moved from a polished front-end prototype to a coherent
full-stack demo with real authentication, tenant-scoped persistence, RBAC,
server-side validation, migration safety, route splitting, automated tests and a
CI gate. It now also has real SIEM/EDR pull connectors, authorised network-flow
ingestion, stateful attack detection, live dashboard streaming and a controlled
end-to-end test path. It is deployable as a single-instance demonstration
environment. It is not yet a multi-region SaaS: shared SSE/pub-sub state,
PostgreSQL/Redis, SSO/password reset, and an external error pipeline remain the
production work.
