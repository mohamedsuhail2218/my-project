# NetPulse AI

**Intelligent Wi-Fi Network Monitoring & Diagnostics Platform**

A complete B.Sc. final-year project that combines real local network probing,
machine-learning anomaly detection, rule-based troubleshooting, device
governance, automated incident ticketing, PDF reporting and a full automated
test suite in one responsive web application.

> **Live-data integrity:** NetPulse AI never invents live measurements. Every
> probe result is a real operating-system network observation. Records created
> for demonstrations are explicitly labelled `simulation` and excluded from the
> live health index.

---

## Overview

NetPulse AI monitors a Wi-Fi or hybrid network from an authorized Windows
machine and turns raw observations into actionable insight:

1. **Observe** — ICMP latency, packet loss and jitter are measured against a
   configurable target; the local ARP cache supplies read-only device visibility.
2. **Detect** — an Isolation Forest model scores observations and explains each
   outlier using robust z-scores.
3. **Diagnose** — a deterministic rule engine proposes likely causes and safe
   diagnostic steps; it never changes router or access-point configuration.
4. **Act** — incidents become deduplicated tickets with priorities, statuses and
   an audit trail.
5. **Prove** — Pytest and Playwright suites verify the platform; JUnit results and
   PDF analytics reports are available inside the application.

The application is built for a college lab or home network, requires no cloud
account, and runs locally on Windows 11.

| Item | Value |
|---|---|
| Frontend | React 18, Vite 6, Tailwind CSS, Recharts, Axios, React Router |
| Backend | FastAPI, SQLAlchemy 2, Pydantic 2, JWT, Argon2 |
| AI | scikit-learn Isolation Forest with robust-z explanations |
| Database | SQLite (verified local default) · MySQL 8 (deployment schema included) |
| Testing | 88 Pytest tests · 20 Playwright E2E tests |
| Reports | 8 report types, generated as PDF by ReportLab |
| Modules | 10 workspace modules plus login, command palette and responsive shell |

---

## Screenshots

### Overview dashboard

![Overview dashboard](documentation/screenshots/02-overview.png)

### AI anomaly detection

![AI anomaly detection](documentation/screenshots/07-ai-anomaly-detection.png)

### Smart troubleshooting

![Smart troubleshooting](documentation/screenshots/08-smart-troubleshooting.png)

### Mobile layout

<img src="documentation/screenshots/16-mobile-overview.png" alt="Mobile overview" width="360" />

The full 17-image gallery (login, every module, dialogs, light theme, command
palette, mobile navigation) is in
[`documentation/screenshots/`](documentation/screenshots/) and is referenced
throughout the project report.

---

## Modules

| Module | What it provides |
|---|---|
| **Authentication** | JWT login, Argon2 password hashing, session restore, login throttling, role-based access (admin / analyst / viewer). |
| **Overview** | Live health index, latency and packet-loss trends, AP state, device summary, recent AI findings and alerts. |
| **Network Monitoring** | Real OS probes with latency, jitter, loss and online state; scheduler status; recent history and network identity information. |
| **Access Points** | Authorized AP CRUD, simulation labels, availability checks, performance history and an append-only configuration audit trail. Administrators can read the backend host's current Wi-Fi association to prefill and check the local gateway. |
| **Connected Devices** | Read-only ARP-cache discovery, SHA-256 identity hashing, masked MAC addresses, approval workflow and observation timeline. |
| **AI Anomaly Detection** | Isolation Forest detection over persisted observations, severity scoring, robust-z explanations, model metadata and cold-start disclosure. |
| **Smart Troubleshooting** | Rule-based diagnosis for offline, high-latency, packet-loss and jitter conditions; possible causes, ordered diagnostic steps and safety guardrails. |
| **Issue Management** | Automatic and manual tickets, priority/status workflow, duplicate suppression by fingerprint, comments and statistics. |
| **Automation Testing** | Fixed, allow-listed Pytest runner, JUnit import, suite summary and recent run history. |
| **Reports** | Eight PDF report types generated from real stored data, report library and authenticated download. |
| **Settings** | Runtime latency/loss thresholds, automation toggles, theme and organisation settings, system diagnostics. |

The sidebar also includes a command palette (`Ctrl+K`), notification panel,
theme switch, user menu and a responsive mobile drawer.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser (React 18 + Vite + Tailwind + Recharts)                          │
│  Login · Overview · Monitoring · APs · Devices · AI · Troubleshooting    │
│  Issues · Testing · Reports · Settings                                   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ HTTPS/JSON · JWT Bearer
┌───────────────────────────────▼──────────────────────────────────────────┐
│ FastAPI backend                                                          │
│  Routers → Services → SQLAlchemy models → SQLite / MySQL                 │
│                                                                          │
│  Monitoring scheduler ──► OS ICMP probe ──► network_measurements         │
│  Isolation Forest ──────► anomaly_events ──► ticket automation           │
│  Rule engine ───────────► troubleshooting_recommendations                │
│  ARP adapter ───────────► devices + device_activity                      │
│  ReportLab ─────────────► PDF reports in reports/                        │
│  Pytest runner ─────────► JUnit XML ──► automated_test_results           │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│ SQLite (default, verified)  or  MySQL 8 (schema + compose provided)      │
│ 12 domain tables + schema_migrations                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

Detailed architecture, sequence diagrams, DFDs and deployment views are in
[`documentation/02-system-architecture.md`](documentation/02-system-architecture.md)
and [`documentation/04-uml-and-process-models.md`](documentation/04-uml-and-process-models.md).

---

## Quick start (Windows 11)

### Prerequisites

- **Python 3.11+** — <https://www.python.org/downloads/> (enable *Add python.exe to PATH*)
- **Node.js 18 LTS+** — <https://nodejs.org/>
- **Google Chrome** — required by the Playwright suite on this machine because
  the bundled headless shell is blocked by an Application Control policy
- Optional: **MySQL 8** and **Docker Desktop** for the MySQL deployment path

### One-command setup

From the `NetPulse-AI` folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

The script:

- verifies Python and Node versions;
- creates `backend\.venv` and installs `backend\requirements.txt`;
- creates `backend\.env` from the example with a random JWT secret and a random
  administrator password (it never overwrites an existing `.env`);
- installs frontend dependencies;
- prints the administrator credentials once.

### Run the application

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1
```

This opens two PowerShell windows:

| Service | URL |
|---|---|
| Frontend | <http://127.0.0.1:5173> |
| Backend API | <http://127.0.0.1:8000> |
| Swagger UI | <http://127.0.0.1:8000/docs> |
| ReDoc | <http://127.0.0.1:8000/redoc> |

Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `backend\.env`. If the
setup script generated them, they were printed at the end of setup.

### Manual start

```powershell
# Terminal 1 - backend
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 - frontend
cd frontend
npm.cmd run dev -- --port 5173 --strictPort
```

On Windows PowerShell, use `npm.cmd` rather than `npm` when script execution is
disabled by policy.

### Production-style build

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1
```

The built frontend is written to `frontend\dist`. FastAPI automatically serves it
from <http://127.0.0.1:8000> on the next backend start, so the whole application
runs from one port.

### Vercel deployment

The public production deployment is <https://netpulse-ai-two.vercel.app>. It runs
as one Vercel project (`warrior-074c/netpulse-ai`): `server.py` exposes the
FastAPI application, the Vite frontend is built into `frontend/dist`, and FastAPI
serves both `/api` and the SPA from the same origin.

The deployment is configured by:

- `vercel.json` - FastAPI framework preset, frontend build command, function
  duration and bundled files;
- `server.py` - adds `backend` to `sys.path` and exports the FastAPI `app`;
- `requirements.txt`, `pyproject.toml`, `uv.lock` and `.python-version` - runtime
  dependencies and Python 3.12;
- `.vercelignore` - excludes secrets, local virtual environments, databases,
  tests, reports and Node modules from the upload.

Deploy from the `NetPulse-AI` directory after `vercel login`:

```powershell
npx.cmd --yes vercel@latest deploy --prod --yes
```

Production environment values are stored in the Vercel project. The current
demo deployment uses:

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Prisma Postgres connection URL (stored as a production secret in Vercel) |
| `REPORTS_DIR` | `/tmp/reports` |
| `MONITORING_ENABLED` | `false` |
| `MONITOR_ON_STARTUP` | `false` |
| `DEVICE_DISCOVERY_ENABLED` | `false` |
| `TEST_RUNNER_ENABLED` | `false` |

`JWT_SECRET_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and the database URL are
stored as production secrets in Vercel; they are not committed to the
repository. Use the **pooled** connection string for application traffic and
the direct string only for migrations or administration. The application
normalises both `postgres://` and `postgresql://` URLs to the bundled
`psycopg2` driver.

> **Serverless deployment notes:** the database is a managed Prisma Postgres
> instance, so accounts, access points, measurements, anomalies, tickets and
> settings are shared by every function instance and survive cold starts.
> Startup table creation and first-run seeding run under a PostgreSQL advisory
> lock, which prevents duplicate administrators when several instances boot at
> once. PDF reports are still written under `/tmp` and are therefore
> instance-local; generate and download a report in the same session. Background
> monitoring, ARP discovery and the Pytest runner are disabled because they need
> a long-running local host. The **Use current Wi-Fi** action is also local-only:
> the function has no wireless association and cannot reach a private gateway.
> It returns an explicit unavailable explanation instead of probing anything.

> **Production database:** the production database is a managed Prisma
> Postgres instance in the Prisma workspace. Its connection URL is stored as a
> Vercel production secret; replace `DATABASE_URL` in Vercel and redeploy if the
> database is ever recreated. Application accounts, access points, measurements,
> anomalies, tickets and settings are stored there, so they survive deployments
> and cold starts.

---

## Configuration

Backend configuration lives in `backend\.env` (ignored by Git). Start from
`backend\.env.example`.

| Variable | Purpose | Default |
|---|---|---|
| `ENVIRONMENT` | `development`, `testing` or `production` | `development` |
| `DATABASE_URL` | SQLAlchemy connection string | `sqlite:///./data/netpulse.db` |
| `JWT_SECRET_KEY` | Token signing key; must be strong in production | generated locally |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session lifetime | `480` |
| `CORS_ORIGINS` | Allowed browser origins | localhost Vite ports |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-run administrator bootstrap | set locally |
| `MONITOR_TARGET` | Real probe target | `1.1.1.1` |
| `MONITOR_PACKET_COUNT` / `MONITOR_TIMEOUT_MS` | Probe shape and timeout | `4` / `1500` |
| `MONITORING_INTERVAL_SECONDS` | Scheduler interval | `60` |
| `MONITORING_ENABLED` / `MONITOR_ON_STARTUP` | Scheduler switches | `true` |
| `DEVICE_DISCOVERY_ENABLED` | ARP-cache discovery switch | `true` |
| `LATENCY_THRESHOLD_MS` / `PACKET_LOSS_THRESHOLD_PCT` | Alert thresholds | `150` / `5` |
| `AUTO_TICKETS_ENABLED` | Create tickets from incidents | `true` |
| `AUTO_ANOMALY_DETECTION` | Run detection after probes | `true` |
| `ANOMALY_MIN_SAMPLES` / `ANOMALY_CONTAMINATION` | Model training policy | `30` / `0.08` |
| `TEST_RUNNER_ENABLED` | Allow the built-in test runner | `true` |
| `REPORTS_DIR` | PDF output folder | `../reports` |

Thresholds and automation toggles can also be changed at runtime from
**Settings** (stored in `app_settings`).

---

## Testing

### Backend — Pytest

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

- **89 tests passed** in the final verification run.
- Tests use a throw-away SQLite database, disable the scheduler, block live
  probes and prevent recursive test-runner execution.
- JUnit output: `reports\test-runs\backend-junit.xml`.

Coverage includes authentication and RBAC, dashboard aggregation, monitoring,
AP CRUD/history, Wi-Fi association parsing, Isolation Forest behaviour, tickets
and deduplication, PDF reports, ARP parsing and device governance,
troubleshooting rules, settings, security headers and JUnit parsing.

### Frontend — Playwright

```powershell
cd frontend
npm.cmd run test:e2e
```

- **20 tests passed** in the final verification run.
- Uses the installed Chrome channel (`PLAYWRIGHT_CHANNEL=chrome`) and starts or
  reuses both servers.
- Covers login/redirect/logout, incorrect-password handling, every sidebar
  module, console errors, AP detail/check/CRUD, current Wi-Fi prefill and
  unavailable-cloud messaging, device discovery, AI detection, troubleshooting,
  ticket lifecycle, PDF generation/download, settings save, theme persistence,
  command palette, notifications, mobile navigation and horizontal overflow.

### Everything at once

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1
```

Outputs:

| Artifact | Location |
|---|---|
| Backend JUnit | `reports/test-runs/backend-junit.xml` |
| Backend coverage XML | `reports/test-runs/coverage.xml` |
| Frontend JUnit | `reports/test-runs/frontend-junit.xml` |
| Playwright HTML report | `reports/playwright-report/index.html` |
| Generated PDF reports | `reports/*.pdf` |
| Documentation screenshots | `documentation/screenshots/` |

The **Automation Testing** module also runs the backend suite through a fixed,
allow-listed command, imports JUnit results and displays pass/fail statistics.

---

## MySQL 8 deployment

SQLite is the verified local database. MySQL 8 support is provided as a complete
deployment path:

- [`database/schema.sql`](database/schema.sql) — full initial schema;
- [`database/migrations/001_initial_schema.sql`](database/migrations/001_initial_schema.sql)
  — versioned migration with `schema_migrations` tracking;
- [`docker-compose.yml`](docker-compose.yml) — MySQL 8.4 + phpMyAdmin with a
  host port of `3307` and automatic schema import;
- [`database/README.md`](database/README.md) — setup, verification, backup and
  restore instructions.

```powershell
Copy-Item .env.docker.example .env.docker
# edit the passwords in .env.docker
docker compose --env-file .env.docker up -d
```

Then set `DATABASE_URL` in `backend\.env` to the MySQL connection string shown in
the database guide and restart the backend.

> MySQL and Docker are **not installed on the development machine**, so the
> MySQL runtime import could not be executed here. The SQL mirrors the verified
> SQLAlchemy model and is marked as deployment-only, not runtime-verified.

---

## Project structure

```text
NetPulse-AI/
├── backend/
│   ├── app/
│   │   ├── ai/              Isolation Forest and synthetic cold-start baseline
│   │   ├── api/             FastAPI routers (auth, monitoring, APs, devices, AI,
│   │   │                    troubleshooting, tickets, tests, reports, settings)
│   │   ├── core/            Configuration, database, JWT/Argon2, logging
│   │   ├── models/          SQLAlchemy domain model (12 tables)
│   │   ├── monitoring/      OS probes, scheduler, ARP/Wi-Fi adapters, diagnostics
│   │   ├── schemas/         Pydantic request/response schemas
│   │   ├── services/        Monitoring, ticketing, reports, seeding, test runner
│   │   ├── troubleshooting/ Deterministic rule engine
│   │   └── main.py          Application entrypoint and static frontend serving
│   ├── tests/               88 Pytest tests with isolated fixtures
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      Shared UI primitives, charts, brand, error boundary
│   │   ├── context/         Auth, theme and toast providers
│   │   ├── hooks/           API polling hook
│   │   ├── layouts/         Responsive dashboard shell and command palette
│   │   ├── pages/           Ten workspace modules plus login and 404
│   │   └── services/        Axios client, token handling, PDF download
│   ├── e2e/                 20 Playwright tests and credential helper
│   ├── scripts/             Documentation screenshot capture
│   ├── playwright.config.js
│   └── package.json
├── database/                MySQL schema, migration and database guide
├── documentation/           Full final-year report, diagrams and screenshots
├── reports/                 PDF reports, JUnit XML, Playwright HTML report
├── scripts/                 Setup, run, test and build PowerShell scripts
├── server.py                Vercel FastAPI entrypoint
├── vercel.json              Vercel build and function configuration
├── .vercelignore            Deployment upload exclusions
├── requirements.txt         Runtime dependencies for the Vercel function
├── docker-compose.yml
├── .env.docker.example
└── README.md
```

---

## Data integrity, privacy and safety

- **No fabricated telemetry.** Live metrics come from real OS ICMP probes. If a
  probe fails, the row is marked offline with the real error; values are not
  filled in.
- **Simulation labels.** Demo APs use RFC 5737 documentation addresses and
  `data_origin = "simulation"`. The UI shows a simulation notice and the backend
  excludes them from live health calculations.
- **Read-only device discovery.** Only the operating system ARP cache is read.
  There is no packet capture, port scanning or Nmap-style active scan.
- **Read-only Wi-Fi association.** The Access Points page can read the backend
  host's *current* SSID, BSSID, signal, band, channel and default gateway through
  read-only OS commands. It never scans neighbouring networks, retrieves Wi-Fi
  passwords or stores credentials. The gateway is probed only after an
  administrator registers it as an authorized AP.
- **MAC privacy.** Device identity is a SHA-256 hash; only a masked MAC fragment
  is displayed.
- **Advisory troubleshooting.** The rule engine never modifies router or
  access-point configuration and always displays a safety note.
- **Security.** Argon2 password hashes, JWT expiry, role checks, login throttling,
  strict CORS, security headers and a fixed allow-listed test command.
- **Cold-start transparency.** When there are too few real observations, the
  Isolation Forest may use a clearly flagged synthetic baseline for the initial
  model only. The UI discloses this via `used_sample_baseline`; synthetic values
  are never stored or shown as live measurements.

---

## Documentation

| Document | Contents |
|---|---|
| [Documentation index](documentation/README.md) | Reading guide and screenshot index |
| [01 — Abstract & introduction](documentation/01-abstract-and-introduction.md) | Problem statement, objectives, scope, novelty |
| [02 — System architecture](documentation/02-system-architecture.md) | Layered architecture, components, data flow, deployment |
| [03 — Database design](documentation/03-database-design.md) | ER diagram, data dictionary, normalization, indexes |
| [04 — UML & process models](documentation/04-uml-and-process-models.md) | Use case, class, sequence, activity, DFD, state models |
| [05 — Testing & results](documentation/05-testing-and-results.md) | Strategy, 88+20 test evidence, sample test cases, screenshots |
| [06 — User manual](documentation/06-user-manual.md) | Installation, module walkthrough, troubleshooting |
| [07 — Conclusion & future work](documentation/07-conclusion-and-future-work.md) | Achievements, limitations, roadmap |
| [08 — References](documentation/08-references.md) | Standards, libraries and research references |
| [Data dictionary](documentation/data-dictionary.generated.md) | Generated column-level dictionary from the SQLAlchemy model |
| [Test inventory](documentation/test-inventory.generated.md) | Generated list of all 89 backend and 20 browser tests |
| [Final-year report](documentation/Final-Year-Project-Report.md) | Consolidated submission-ready report with appendices A-E |

All diagrams use Mermaid or ASCII so they render directly on GitHub and in
Markdown editors without external tooling.

---

## Known limitations

1. **MySQL runtime not verified on this machine** — SQLite is the tested runtime.
   The MySQL schema should be imported once on a host with MySQL 8 before a live
   demonstration.
2. **ICMP permissions** — some Windows configurations block raw ICMP. The monitor
   then reports the real failure; a labelled TCP fallback is used where the OS
   permits it.
3. **ARP visibility is local only** — devices on other VLANs or subnets may not
   appear in the cache.
4. **Single-node architecture** — the scheduler runs inside the API process; a
   multi-worker deployment would need a distributed lock or task queue.
5. **Cold-start model** — anomaly quality improves as real observations
   accumulate; the initial model uses a disclosed synthetic baseline.
6. **Playwright portability** — the suite defaults to installed Chrome because
   the bundled headless shell is blocked by this machine's Application Control
   policy. Set `PLAYWRIGHT_CHANNEL=msedge` or install Chromium on other machines.
7. **Vercel PDF reports are instance-local** — the public deployment uses
   Prisma Postgres for durable application data, but generated PDFs still live
   under `/tmp`. Download a report immediately after generating it. Object
   storage would be required to keep report files indefinitely.
8. **Current Wi-Fi is backend-local** — the public Vercel function has no Wi-Fi
   association and cannot reach private gateways such as `10.239.39.128`. The
   **Use current Wi-Fi** flow therefore explains that it is unavailable in the
   cloud; run the backend on the Wi-Fi-connected computer to register and check
   that gateway. The separate top-level live probe (`1.1.1.1`) still works in the
   cloud through the real TCP fallback.

Future work is discussed in
[`documentation/07-conclusion-and-future-work.md`](documentation/07-conclusion-and-future-work.md).

---

## Academic use

This repository was developed as a B.Sc. final-year project. It may be used for
learning, demonstration and further academic work. Third-party libraries retain
their respective licenses. Network monitoring must only be performed on networks
you own or are explicitly authorized to observe.
