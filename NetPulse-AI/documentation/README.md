# NetPulse AI — Documentation

This folder contains the complete final-year project documentation for
**NetPulse AI: Intelligent Wi-Fi Network Monitoring & Diagnostics Platform**.

The documentation is split into focused chapters so each part can be reviewed,
printed or submitted separately. A consolidated report is also provided.

## Reading guide

| Order | Document | What it covers |
|---|---|---|
| — | [Final-Year-Project-Report.md](Final-Year-Project-Report.md) | Consolidated submission-ready report |
| 1 | [01-abstract-and-introduction.md](01-abstract-and-introduction.md) | Abstract, problem statement, objectives, scope, existing systems, methodology |
| 2 | [02-system-architecture.md](02-system-architecture.md) | Architecture, components, data flow, deployment, design decisions |
| 3 | [03-database-design.md](03-database-design.md) | ER model, data dictionary, normalization, indexes, integrity, sample queries |
| 4 | [04-uml-and-process-models.md](04-uml-and-process-models.md) | Use case, class, sequence, activity, state, DFD and deployment models |
| 5 | [05-testing-and-results.md](05-testing-and-results.md) | Strategy, 79 backend + 18 E2E results, 84% coverage, test cases, defects |
| 6 | [06-user-manual.md](06-user-manual.md) | Installation, module walkthrough, roles, workflows, error handling |
| 7 | [07-conclusion-and-future-work.md](07-conclusion-and-future-work.md) | Achievements, limitations, future roadmap |
| 8 | [08-references.md](08-references.md) | Standards, research and library references |
| — | [data-dictionary.generated.md](data-dictionary.generated.md) | Complete column-level dictionary generated from the SQLAlchemy model |
| — | [test-inventory.generated.md](test-inventory.generated.md) | Every backend and browser test, generated from the final JUnit XML |

The consolidated report is assembled from the eight chapter files by
[build_report.py](build_report.py). It adds the cover, declaration, certificate,
acknowledgements, abbreviations, screenshot list, generated table of contents,
and appendices A-E (API, configuration, test inventory, screenshot index and
submission checklist).

## Screenshot gallery

All screenshots were captured from the running application by
`frontend/scripts/capture-docs.mjs` using Playwright and the installed Chrome
channel. They show the real application with real or clearly-labelled simulated
records; no screenshot is a static mock-up.

### 01 — Login

![Login screen](screenshots/01-login.png)

JWT sign-in with password visibility toggle, security notice and a link to the
privacy/authorized-use policy.

### 02 — Overview dashboard

![Overview dashboard](screenshots/02-overview.png)

Live health index, availability, latency, packet loss, AP state, AI anomalies,
open tickets, device governance, recent probes and alerts.

### 03 — Network monitoring

![Network monitoring](screenshots/03-network-monitoring.png)

Real OS probe timeline, latest measurement, scheduler state, probe target and
live network interfaces.

### 04 — Access points

![Access points](screenshots/04-access-points.png)

Authorized AP inventory with search, simulation filter, status, last check and
administrator actions.

### 05 — Access point detail

![Access point detail](screenshots/05-access-point-detail.png)

Registered metadata, simulation notice, availability history, performance chart
and configuration audit trail.

### 06 — Connected devices

![Connected devices](screenshots/06-connected-devices.png)

Read-only ARP-cache discovery, approval state, hashed identity, masked MAC,
observation history and privacy notice.

### 07 — AI anomaly detection

![AI anomaly detection](screenshots/07-ai-anomaly-detection.png)

Isolation Forest events with severity, score, detection time, model provenance,
robust-z explanation and cold-start disclosure.

### 08 — Smart troubleshooting

![Smart troubleshooting](screenshots/08-smart-troubleshooting.png)

Rule-based diagnosis, possible causes, ordered diagnostic steps, related tickets
and the permanent safety guardrail.

### 09 — Issue management

![Issue management](screenshots/09-issue-management.png)

Ticket statistics, filters, priority/status workflow, source and assignment
information.

### 10 — Create issue ticket

![Create issue ticket](screenshots/10-create-ticket.png)

Manual ticket dialog with validation, priority selection and AP association.

### 11 — Automation testing

![Automation testing](screenshots/11-automation-testing.png)

Allow-listed Pytest runner, suite-level pass/fail summary and persisted run
history imported from JUnit XML.

### 12 — Reports

![Reports](screenshots/12-reports.png)

Eight PDF report types generated from real stored observations, with report
library and authenticated downloads.

### 13 — Settings

![Settings](screenshots/13-settings.png)

Runtime thresholds, automation guardrails, workspace identity, appearance,
system status and team access management.

### 14 — Command palette

![Command palette](screenshots/14-command-palette.png)

`Ctrl+K` navigation across all ten modules with search.

### 15 — Light theme

![Light theme overview](screenshots/15-overview-light.png)

Beige, wine, and white light theme with persistent browser preference.

### 16 — Mobile overview

![Mobile overview](screenshots/16-mobile-overview.png)

Responsive 390 × 844 layout with stacked cards and charts.

### 17 — Mobile navigation

![Mobile navigation](screenshots/17-mobile-navigation.png)

Slide-in mobile navigation drawer with all workspace modules.

## Evidence summary

| Evidence | Result | Location |
|---|---|---|
| Backend Pytest suite | **79 passed, 0 failed** | `reports/test-runs/backend-junit.xml` |
| Backend line coverage | **84%** (2216 statements, 350 missed) | `reports/test-runs/coverage.xml` |
| Frontend Playwright suite | **18 passed, 0 failed** | `reports/test-runs/frontend-junit.xml` |
| Built-in test runner | 79 passed, 0 failed in run `run-20261115-090130-a8cc` | `reports/test-runs/` |
| PDF report generation | `%PDF-` verified for all 8 report types | `reports/*.pdf` |
| MySQL DDL | Generated from SQLAlchemy metadata; runtime import **not verified** (MySQL/Docker unavailable) | `database/schema.sql` |
| Documentation screenshots | 17 images captured from the running build | `documentation/screenshots/` |

> **Honesty note:** The MySQL schema is provided for deployment but was not
> executed on this machine because neither MySQL nor Docker is installed. The
> verified runtime uses SQLite. This limitation is repeated in the testing and
> conclusion chapters rather than hidden.

## Regenerating the evidence

```powershell
# Everything from the project root
powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1

# Rebuild the generated test inventory from the JUnit XML
backend\.venv\Scripts\python.exe documentation\generate_test_inventory.py

# Rebuild the consolidated submission report
backend\.venv\Scripts\python.exe documentation\build_report.py
```

The individual commands behind `test-all.ps1` are:

```powershell
# Backend tests + JUnit + coverage
cd backend
.\.venv\Scripts\python.exe -m pytest --junitxml=..\reports\test-runs\backend-junit.xml --cov=app --cov-report=xml:..\reports\test-runs\coverage.xml

# Frontend E2E + JUnit + HTML report
cd ..\frontend
npm.cmd run test:e2e

# Documentation screenshots (requires both servers running)
npm.cmd run docs:screenshots
```

## Diagram conventions

- Architecture, flow, use-case, sequence, activity and DFD diagrams use
  **Mermaid** fenced blocks. GitHub renders them automatically; VS Code needs a
  Markdown Mermaid extension or preview support.
- ER diagrams use Mermaid `erDiagram` syntax.
- The unified modelling language chapter follows UML 2.5 naming conventions.
- All timestamps in the application and documentation are UTC unless explicitly
  labelled local time.

## Submission checklist

- [x] Source code for backend and frontend
- [x] MySQL schema, migration and database guide
- [x] Automated test suites and JUnit evidence
- [x] PDF report generation
- [x] 17 application screenshots
- [x] Abstract, introduction, objectives and scope
- [x] Architecture and design chapters
- [x] Database design, ER model and data dictionary
- [x] UML and process models
- [x] Testing strategy, results and test cases
- [x] User manual
- [x] Conclusion, limitations and future work
- [x] References
- [x] Generated data dictionary and test inventory
- [x] Consolidated submission report with appendices A-E
- [ ] Replace the placeholders on the report cover with student/college details
- [ ] Import and smoke-test the MySQL schema on a host with MySQL 8 before a live demo
