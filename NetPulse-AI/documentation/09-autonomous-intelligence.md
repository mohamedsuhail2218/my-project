# 09 — Autonomous Network Intelligence & Cybersecurity

This chapter documents the intelligence layer added on top of the original
monitoring, anomaly, troubleshooting, device-governance and ticketing platform.
It covers the four analysis engines, their shared guarantees, the notification
and live-update transports, reporting, API contracts, testing and deployment
constraints.

> **Design rule:** the platform must never invent a threat, failure, root cause or
> optimisation saving. Every engine reads persisted live measurements or local
> security evidence. When there is not enough evidence, it returns an explicit
> `insufficient_data` state with the available and required counts.

---

## 1. Purpose and scope

The original application answered *what is happening now*. The intelligence layer
adds four forward-looking and explanatory questions:

| Question | Engine | Output |
|---|---|---|
| How likely is a failure in the next 24 hours? | Prediction | Per-scope risk score, severity, confidence, weighted features, primary driver |
| Why is the network unhealthy? | Root cause | Probable cause, measured evidence, ranked actions, confidence, workflow status |
| Are there locally observable security concerns? | Security | Defensive findings for unapproved devices and sign-in failure bursts, posture score |
| What measured conditions could be improved? | Optimisation | Advisory recommendations tied to loss, latency, jitter or availability thresholds |

These are **decision-support** features. They do not configure devices, block
traffic, scan ports, capture packets or claim certainty.

---

## 2. Architecture

```text
network_measurements ──┐
anomaly_events ────────┼──► Prediction engine ──► prediction_results ──┐
access_points ─────────┘                                               │
                                                                       │
latest measurement ─────► Root-cause engine ──► root_cause_investigations
anomaly_events, tickets ┘                                              │
                                                                       ├──► notifications
devices, login_attempts ┐                                             │
access_points ──────────┼──► Defensive scanner ──► security_events ─────┤
                                                                       │
live measurements ──────┴──► Optimisation engine ──► optimization_recommendations
                                                                       │
                                        ┌──────────────────────────────┘
                                        ▼
                           FastAPI routers / REST + WSS
                                        │
                         React intelligence pages, notification centre,
                         overview roll-up, PDF brief and CSV exports
```

All engines are implemented in `backend/app/intelligence/`:

| Module | Responsibility |
|---|---|
| `common.py` | Timezone helpers, means, spread, severity mapping, formatting |
| `prediction.py` | Failure-risk scoring and feed |
| `rca.py` | Evidence correlation, cause rules, investigation workflow |
| `security.py` | Defensive findings, de-duplication, posture score |
| `optimization.py` | Threshold-based advisory recommendations |
| `rollup.py` | Compact summary for the Overview page |

The scheduler runs prediction, security and optimisation every 15 minutes while
the API process is alive. Root-cause investigations are generated manually (or by
an operator action) so that a human can choose the measurement under review.

---

## 3. Shared state model

Every feed returns the same envelope shape:

```json
{
  "status": "ready | not_run | insufficient_data | clear",
  "message": "Human-readable explanation of the current state",
  "available_points": 4,
  "minimum_required": 8,
  "window_hours": 72,
  "method": "Weighted threshold model (...)",
  "disclaimer": "Risk scores are statistical estimates...",
  "generated_at": "2026-11-23T18:00:00+00:00"
}
```

Meaning:

- **ready** — persisted results exist and are being returned.
- **not_run** — enough evidence exists, but the engine has not run yet. The UI
  offers a run action to analysts and administrators.
- **insufficient_data** — not enough live evidence. Results are empty; no fallback
  values are generated.
- **clear** — root cause only: the latest measurement is healthy and no fault
  signature exists.

Simulated measurements (`data_origin = "simulation"`) are excluded from every
intelligence query. The production database and the local database therefore
produce honest cold-start states until real probes accumulate.

---

## 4. Predictive analytics

### 4.1 Model

`explainable-risk-v1` is a transparent weighted threshold model. It is not a
black-box classifier and requires no external service.

For each scope (network or an individual non-simulated access point):

| Component | Maximum points | Formula |
|---|---:|---|
| Availability | 40 | `(1 − online_ratio) × 40` over the most recent 12 probes |
| Packet loss | 25 | `min(1, mean_loss / loss_threshold) × 25` |
| Latency | 20 | `min(1, mean_latency / (2 × latency_threshold)) × 20` |
| Jitter | 15 | `min(1, mean_jitter / 30 ms) × 15` |

The score is the clamped sum (0–100). Severity bands are Critical ≥ 70,
High ≥ 50, Medium ≥ 30, otherwise Low.

Confidence starts at `0.42 + points / 60`, capped at 0.92, and is fixed at 0.90
once 30 or more live points are available. This reflects sample size, not a
probabilistic guarantee.

### 4.2 Evidence and explanation

Each result stores:

- the observation window (72 hours) and point count;
- recent online ratio, mean latency, mean loss, mean jitter;
- latency trend, computed as a least-squares slope over the window expressed as a
  percentage of the mean (needs at least four readings);
- per-component point contributions and the primary driver;
- a plain-language explanation naming the measured values and thresholds.

### 4.3 Minimum evidence

- Network: 8 live measurements in the last 72 hours.
- Access point: 6 live measurements for that AP.

Below these thresholds no prediction row is written. The feed reports
`insufficient_data`. Old active predictions are deactivated so stale scores do not
masquerade as current results.

### 4.4 Staleness

A feed older than two hours is marked `stale` in the UI while preserving the last
persisted values. The user is prompted to rerun the analysis.

---

## 5. Root-cause analysis

The engine evaluates the latest live measurement (or a chosen measurement) against
configured thresholds and correlated events.

| Signature | Severity | Confidence | Typical hypothesis |
|---|---|---:|---|
| Probe offline | Critical | 0.88 | AP outage, upstream routing/DNS, adapter problem |
| Loss + high latency | High | 0.82 | Congestion, buffer pressure, degraded wireless link |
| Loss only | High / Medium | 0.76 | Interference, retries, cable/port fault, upstream congestion |
| Latency only | High / Medium | 0.70 | Upstream congestion, weak signal, overloaded AP |
| Jitter ≥ 15 ms | Medium | 0.66 | Unstable wireless link, interference, variable queueing |
| Correlated anomaly | Anomaly severity | 0.60 | Statistical outlier without a known fault |

Confidence gains 0.05 when an anomaly occurred within ±30 minutes, and loses 0.10
when the measurement is older than six hours. The confidence is capped at 0.95.

Evidence always includes the probe target, measured latency, loss and jitter with
their thresholds, plus any probe error, AP state, correlated anomalies and open
tickets. Actions come from a fixed, safe diagnostic library. The engine never
changes configuration and always returns the troubleshooting safety note.

Workflow: `Open → Acknowledged → Resolved`, with reopen supported. Analysts and
administrators can change status; viewers are read-only. Each status change is
persisted in `root_cause_investigations`.

If the latest measurement is healthy, the engine returns `clear` and does not
create a false incident.

---

## 6. Cybersecurity intelligence

The scanner is deliberately **defensive and local**. It examines:

1. **Unapproved devices** observed in the read-only ARP cache within the last 24
   hours and still active.
2. **Authentication failure bursts**: five or more failed sign-ins from the same
   IP address in the last hour (recorded in the application's `login_attempts`
   audit).
3. **Access-point inventory** state and last-seen timestamps for context.

It never performs port scanning, exploitation, packet capture, credential
testing or automatic blocking. An empty register means no locally observable
evidence was found; it is not a security certification.

Findings are de-duplicated by fingerprint within an open/acknowledged window, so
repeated scans do not create duplicates. The posture score starts at 100 and
deducts 25 per Critical, 15 per High, 8 per Medium and 3 per Low open finding,
clamped at zero. This is a local heuristic, not an industry score.

Workflow: `Open → Acknowledged → Resolved`, with reopen. Findings include source,
evidence, confidence, recommended response and a simulation flag. Real findings
currently have `is_simulated = false`; no threat data is fabricated.

---

## 7. Network optimisation

The advisory engine reads live measurements from the last 24 hours and compares
them with the configured thresholds:

| Category | Trigger | Suggested focus |
|---|---|---|
| Packet loss | Mean loss above the packet-loss threshold | Uplink, interference, retries, cabling |
| Latency | Mean latency above the latency threshold | Congestion, signal quality, AP load |
| Jitter | Mean jitter above 15 ms | Stability, channel overlap, QoS |
| Availability | Online probe ratio below 80% | Power, uplink, roaming, adapter |

Recommendations are advisory only. They include measured evidence (average,
sample count, threshold, observation count), confidence, and numbered safe
actions. `expected_impact_pct` is deliberately `null`: the engine does not invent
expected gains. Items are de-duplicated by category and scope and can be marked
**Planned**, returned to **Advisory**, or **Dismissed** by analysts and
administrators. Device configuration is never modified.

---

## 8. Notifications and live updates

### 8.1 Notification centre

The `notifications` table stores in-app alerts created by prediction, RCA, security
and optimisation engines. A dedupe key with a 24-hour window prevents repeated
alerts for the same finding. Endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/notifications` | List notifications, unread count and severity breakdown |
| GET | `/api/notifications/unread-count` | Lightweight badge polling |
| PATCH | `/api/notifications/{id}/read` | Mark one as read |
| POST | `/api/notifications/read-all` | Mark all as read |
| DELETE | `/api/notifications/read` | Clear read notifications |

The header bell polls the unread count and opens the notification drawer. Alerts
link directly to the relevant intelligence page.

### 8.2 Live transport

- `GET /api/live/status` documents the transport and fallback.
- `GET /api/live/snapshot` returns the current live snapshot over REST.
- `WS /api/live/ws?token=...` pushes authenticated snapshots.
- The React `LiveContext` connects by WebSocket and automatically falls back to
  REST polling if the socket closes. The header shows **Live socket**, **Live
  polling** or **Feed offline**.

Vercel serverless functions are short-lived and cannot hold a persistent socket
or background scheduler. Production therefore uses polling unless the backend is
run as a long-lived process (local uvicorn or a container host). Manual engine
runs remain available in both modes.

---

## 9. Reporting and export

### 9.1 PDF

The **Intelligence brief** (`report_type = "intelligence"`) adds these sections to
the existing ReportLab report:

- intelligence summary counts;
- failure-risk estimates with scope, severity, confidence and horizon;
- root-cause investigations;
- defensive security findings;
- optimisation advice;
- a note explaining that empty tables mean insufficient data or not-run, not a
  zero-risk result.

PDFs are generated from persisted rows only. On Vercel they live in `/tmp` and
must be downloaded immediately.

### 9.2 CSV

`GET /api/intelligence/export.csv?kind=...` supports:

| Kind | Contents |
|---|---|
| `predictions` | Scope, risk, severity, confidence, features, explanation |
| `root-cause` | Investigation, problem, cause, evidence, actions |
| `security` | Findings, evidence, recommendation, simulation flag |
| `optimization` | Recommendations, evidence, actions, status |

The response carries `X-NetPulse-Status` (`ready`, `not_run` or
`insufficient_data`). When no rows exist, the file still has a header row and no
fabricated values.

---

## 10. API summary

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/intelligence/predictions` | any authenticated | Risk feed |
| POST | `/api/intelligence/predictions/run` | analyst/admin | Recompute risk |
| GET | `/api/intelligence/root-cause` | any authenticated | Investigation feed |
| POST | `/api/intelligence/root-cause/run` | analyst/admin | Run investigation |
| PATCH | `/api/intelligence/root-cause/{id}` | analyst/admin | Update workflow status |
| GET | `/api/intelligence/security` | any authenticated | Security feed |
| POST | `/api/intelligence/security/scan` | analyst/admin | Run defensive scan |
| PATCH | `/api/intelligence/security/{id}` | analyst/admin | Update finding status |
| GET | `/api/intelligence/optimization` | any authenticated | Advisory feed |
| POST | `/api/intelligence/optimization/scan` | analyst/admin | Regenerate advice |
| PATCH | `/api/intelligence/optimization/{id}` | analyst/admin | Update advisory status |
| GET | `/api/intelligence/summary` | any authenticated | Overview roll-up |
| GET | `/api/intelligence/export.csv` | any authenticated | CSV export |
| GET | `/api/live/status` | any authenticated | Transport capabilities |
| GET | `/api/live/snapshot` | any authenticated | REST snapshot |
| WS | `/api/live/ws` | token-authenticated | Push snapshots |

Viewers can read feeds and exports but cannot mutate engine state. Analysts and
administrators can run engines and update workflows. The existing JWT and role
checks are reused.

---

## 11. Data model additions

| Table | Purpose |
|---|---|
| `prediction_results` | Persisted risk estimates, features and explanation |
| `root_cause_investigations` | Problem, cause, evidence, actions, workflow |
| `security_events` | Defensive findings and posture inputs |
| `optimization_recommendations` | Advisory items and status |
| `notifications` | In-app alerts and unread state |
| `traffic_sample` | Real host-interface counters (not synthetic) |
| `ai_model_versions` | Model provenance |
| `login_attempts` | Security audit used by the scanner |

Schema creation remains startup `create_all` under an advisory lock, matching the
existing project. No destructive migration is performed. Production uses Prisma
Postgres; local development uses SQLite.

---

## 12. Testing

`backend/tests/test_intelligence.py` covers:

- insufficient-data states for prediction, RCA and optimisation;
- score components and weight transparency;
- live-only filtering (simulated measurements excluded);
- not-run versus insufficient-data distinction;
- root-cause evidence, severities and clear state;
- security de-duplication and posture score;
- API envelopes, role restrictions, CSV headers and status headers;
- notification contracts and live-feed status;
- dashboard intelligence roll-up.

The full backend suite passes 103 tests. Playwright adds 21 browser tests covering
the ten sidebar modules, legacy command-palette routes, deep links and the new
intelligence page markers.

---

## 13. Safety, privacy and limitations

- Read-only ARP cache, read-only Wi-Fi association and real ICMP/TCP probes only.
- No packet capture, Nmap-style scans, exploitation or automatic blocking.
- Device identities are SHA-256 hashed; only masked MAC fragments are shown.
- Risk scores are estimates, not guarantees.
- Intelligence needs telemetry: 8 live network points for prediction and
  optimisation; 6 per AP. A new database legitimately shows insufficient data.
- No external LLM is required. Optional external explanations, if ever added,
  must not alter scores or evidence.
- Serverless deployment cannot run the persistent scheduler or WebSocket; the UI
  uses polling and manual runs.
- The posture score and advisory confidence are local heuristics, not compliance
  certifications.

---

## 14. Operating the layer

```powershell
# Persistent backend (WebSocket + 15-minute scheduler)
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Frontend
cd ..\frontend
npm.cmd run dev
```

1. Sign in as an analyst or administrator and open **Real-Time Monitoring**.
2. Run a probe or wait for the scheduler to collect at least eight live points.
3. Open **Predictive Analytics** and choose **Run analysis**.
4. Run **Root Cause Analysis**, **Cybersecurity Intelligence** and **Network
   Optimization** from their pages.
5. Review the notification bell and the Overview roll-up.
6. Export CSVs or generate the **Intelligence brief** PDF from
   **Reports & Analytics**.

All timestamps are UTC. See the main README for environment variables, Vercel
deployment and the permanent database setup.
