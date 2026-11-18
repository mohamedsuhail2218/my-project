# 1. Abstract and Introduction

## Cover information

| Field | Value |
|---|---|
| Project title | **NetPulse AI — Intelligent Wi-Fi Network Monitoring & Diagnostics Platform** |
| Programme | Bachelor of Science (B.Sc.) — Final-Year Project |
| Student name | _[Student Name]_ |
| Roll number / registration | _[Roll Number]_ |
| Department | _[Department]_ |
| Institution | _[College / University]_ |
| Academic year | _[Year]_ |
| Supervisor | _[Supervisor Name]_ |
| Repository | `NetPulse-AI/` |

> Replace the bracketed placeholders before printing or submitting the report.

---

## Abstract

Wireless networks have become the primary access path for teaching, laboratory
work, remote collaboration and everyday communication. Yet the tools available
to students and small network administrators are often split between expensive
enterprise platforms that require SNMP credentials and infrastructure agents,
and low-level utilities that produce raw output without interpretation. As a
result, intermittent latency, packet loss, jitter and access-point outages are
difficult to reproduce, explain and document.

**NetPulse AI** is a full-stack, local-first Wi-Fi monitoring and diagnostics
platform designed for authorized college laboratory and home networks. It
combines real operating-system measurements with machine learning, rule-based
reasoning and incident automation. A background scheduler executes ICMP echo
probes against a configurable target, records latency, packet loss and jitter,
and stores each observation with an explicit data origin. An Isolation Forest
model identifies statistical outliers and explains them with robust z-scores.
A deterministic troubleshooting engine converts observations into possible
causes and safe diagnostic steps. Threshold breaches and high-severity anomalies
create deduplicated issue tickets with priorities, statuses and comments. A
privacy-preserving device inventory reads only the local ARP cache, hashes MAC
identities and masks their display. Ten workspace modules and eight PDF report
types make the results presentable to a supervisor or network administrator.

The system is implemented with React 18, Vite, Tailwind CSS and Recharts on the
frontend, and FastAPI, SQLAlchemy, Pydantic, scikit-learn and ReportLab on the
backend. It supports SQLite for zero-setup operation and MySQL 8 for deployment.
Role-based access control, Argon2 password hashing, JWT sessions, login
throttling, security headers and an allow-listed test runner address the main
security concerns of a network-facing student project.

The final verification run executed **89 backend Pytest tests** and **20
Playwright end-to-end tests**, all passing, with **82% backend line coverage**.
Seventeen screenshots were captured from the running application. A key design
principle is that the platform **never fabricates live telemetry**: simulated
records are explicitly labelled, excluded from live health calculations and
disclosed in both the interface and the database.

**Keywords:** Wi-Fi monitoring, network diagnostics, Isolation Forest, anomaly
detection, explainable AI, FastAPI, React, SQLAlchemy, automated testing, PDF
reporting, network operations.

---

## 1.1 Introduction

Modern campuses depend on Wi-Fi for lectures, online examinations, laboratory
submissions, video calls and cloud services. When the network degrades, users
typically report only a symptom: “the internet is slow” or “the connection keeps
dropping”. Diagnosing that symptom requires three different kinds of evidence:

1. **Measurements** — how latency, packet loss and jitter change over time.
2. **Context** — which access point, interface or device is involved.
3. **Interpretation** — whether the values are normal for this network and what
   should be checked next.

Enterprise monitoring suites provide these capabilities, but they assume a
managed infrastructure: SNMP community strings, monitoring agents, dedicated
servers, alerting integrations and often commercial licences. A student or a
small lab administrator rarely has all of them. Conversely, command-line tools
such as `ping`, `tracert` and `arp` provide accurate raw measurements but no
history, no statistics, no explanation and no incident workflow.

NetPulse AI was built to close that gap. It treats a single authorized Windows
machine as a lightweight observation point. The platform performs only
non-invasive measurements, stores them in a relational database, applies
unsupervised machine learning to detect unusual behaviour, and presents the
results through a professional dashboard. It does not attempt to replace an
enterprise network management system; it provides a transparent, reproducible
and defensible monitoring workflow for a small, authorized environment.

### 1.1.1 Motivation

The project was motivated by five practical observations:

- **Intermittent faults are hard to prove.** A single ping cannot demonstrate
  that packet loss recurs every evening. Historical measurements can.
- **Raw metrics are not explanations.** A latency value of 180 ms is only
  meaningful relative to a baseline. The platform therefore reports both the
  value and its statistical deviation.
- **Incident handling is usually manual.** A monitoring alert should become a
  trackable ticket with an owner, priority and audit trail.
- **Privacy matters.** Device discovery is often implemented with active scans or
  packet capture. NetPulse AI deliberately uses only the operating system ARP
  cache and never stores a raw MAC address.
- **Student projects should use real data.** A dashboard filled with random
  numbers is visually attractive but academically weak. Every live metric in
  NetPulse AI originates from a real OS probe, and every simulated record is
  labelled as such.

---

## 1.2 Problem statement

Small and medium wireless environments lack an integrated, affordable and
privacy-aware way to answer the following questions:

1. What is the current quality of the network, expressed through latency,
   packet loss, jitter and availability?
2. Which observations are statistically abnormal relative to recent history?
3. Which access points are authorized, reachable and healthy?
4. Which devices have been observed locally, and have they been approved?
5. What are the likely causes of a detected problem, and which safe diagnostic
   steps should be attempted first?
6. Which incidents are still open, who owns them and what has been done?
7. How can the evidence be exported for a report or supervisor review?
8. How can the platform itself be verified so that its claims are trustworthy?

Existing general-purpose tools answer some of these questions but not in one
coherent workflow. A monitoring tool may graph latency but not explain it; a
ticketing tool may track incidents but not measure them; a machine-learning demo
may detect anomalies but not prove that the data is real. NetPulse AI integrates
the workflow end to end while keeping the measurement policy explicit.

### 1.2.1 Formal problem statement

> Design and implement a secure, local-first Wi-Fi monitoring and diagnostics
> platform that collects real network observations, detects and explains
> statistical anomalies, generates actionable troubleshooting guidance, manages
> authorized access points and locally observed devices, automates issue
> tickets, produces analytical PDF reports, and is verified by automated tests
> and complete documentation.

---

## 1.3 Objectives

The project pursued the following objectives:

| ID | Objective | Success criterion |
|---|---|---|
| O1 | Build a complete full-stack application | React frontend and FastAPI backend running together with authentication and ten modules |
| O2 | Collect real network measurements | Live latency, loss and jitter from OS ICMP probes; no fabricated live values |
| O3 | Detect anomalies with machine learning | Isolation Forest over persisted observations with severity and human-readable explanation |
| O4 | Provide rule-based troubleshooting | Deterministic causes and ordered diagnostic steps for offline, loss, latency and jitter conditions |
| O5 | Manage authorized access points | CRUD, availability checks, performance history, audit trail and explicit simulation labels |
| O6 | Provide privacy-preserving device visibility | Read-only ARP-cache discovery, SHA-256 identity, masked MAC, approval workflow |
| O7 | Automate incident management | Deduplicated automatic tickets, manual tickets, priorities, statuses and comments |
| O8 | Generate analytical reports | Eight PDF report types generated from stored data and downloadable through the API |
| O9 | Verify the implementation | Pytest and Playwright suites with JUnit evidence and documented results |
| O10 | Document the project professionally | Architecture, database, UML/DFD, test cases, user manual, screenshots, conclusion and references |

### 1.3.1 Non-functional objectives

- **Integrity:** no invented live measurements; simulation provenance stored.
- **Security:** Argon2 hashes, JWT expiry, role checks, throttling, CORS and
  security headers.
- **Usability:** responsive dark/light interface, loading/error states, dialogs,
  search, filters and keyboard navigation.
- **Maintainability:** layered backend, shared UI primitives, typed schemas,
  seed service, migration file and environment-based configuration.
- **Reproducibility:** deterministic test fixtures, fixed test commands and
  written setup instructions.

---

## 1.4 Scope

### 1.4.1 In scope

- Monitoring from one authorized Windows 11 host (the implementation also runs on
  Linux and macOS where the OS probe commands are available).
- ICMP echo measurements to a configurable target, with a genuine TCP fallback
  when the OS ping utility is unavailable.
- Persistence of measurement history and aggregation over configurable windows.
- Isolation Forest anomaly detection with statistical explanations.
- Rule-based troubleshooting for a defined set of network conditions.
- Access-point inventory, simulation labels, availability checks and audit trail.
- Local ARP-cache device discovery with hashed identity and approval workflow.
- Automatic and manual issue tickets with duplicate suppression and comments.
- PDF analytics reports generated from persisted data.
- A built-in, allow-listed backend test runner with JUnit import.
- JWT authentication and three roles: administrator, analyst and viewer.
- SQLite as the verified default database and MySQL 8 as a deployment option.
- Automated backend and browser tests, documentation screenshots and a full
  project report.

### 1.4.2 Out of scope

- Active wireless scanning, channel hopping, RF spectrum analysis or packet
  capture.
- SNMP polling of switches, routers or wireless controllers.
- Automatic remediation of router, firewall or access-point configuration.
- Multi-tenant SaaS deployment, billing or organizational onboarding.
- Native Android/iOS applications.
- Distributed scheduling across multiple API workers.
- Long-term time-series warehousing or predictive failure forecasting.
- Legal or organizational network policy enforcement.

### 1.4.3 Assumptions

- The operator owns or is explicitly authorized to monitor the network.
- The monitoring host has a working IPv4 interface and can execute `ping`.
- The backend and database run on a trusted local machine.
- The default probe target (`1.1.1.1`) is reachable; operators may change it.
- A single backend process owns the scheduler; horizontal scaling would require
  an external lock or task queue.

---

## 1.5 Existing systems and their limitations

| Category | Representative tools | Strengths | Limitations for this project |
|---|---|---|---|
| Enterprise monitoring | Nagios, Zabbix, PRTG | Mature polling, alerting, dashboards, scalability | Requires infrastructure access, SNMP/agents, configuration effort and often licensing |
| Packet analysis | Wireshark, tcpdump | Deep protocol visibility | Produces raw captures, requires expertise, may raise privacy/legal concerns, not a monitoring workflow |
| Wi-Fi analyzers | OS Wi-Fi analyzers, commercial survey tools | Signal/channel/AP visibility | Focus on RF survey rather than end-to-end latency, ticketing and reporting |
| Command-line utilities | `ping`, `tracert`, `arp` | Accurate, ubiquitous, no dependencies | No history, no database, no explanation, no dashboard, no incident workflow |
| Uptime services | Public uptime monitors | Simple availability checks | External vantage point, limited LAN visibility, subscription-dependent |
| Academic ML demos | Notebook-based anomaly detection | Demonstrate algorithms | Often disconnected from real measurement, security and operational workflow |

NetPulse AI does not claim that these tools are inadequate in their own domain.
It addresses a different problem: integrating a small set of real measurements,
explainable analytics and an incident workflow into one locally deployable
application that a student can operate and defend academically.

### 1.5.1 Gap analysis

The gap is not the absence of network tools; it is the absence of an **integrated,
transparent and reproducible workflow** for a small authorized environment. The
following capabilities are usually spread across separate products:

- real measurement collection;
- statistical anomaly explanation;
- safe troubleshooting guidance;
- inventory and approval;
- ticket automation;
- report export;
- automated verification.

NetPulse AI combines them and makes the data-origin policy visible at every
layer: database (`data_origin`), API responses, UI badges and report disclaimers.

---

## 1.6 Proposed solution

NetPulse AI is organized as a layered web application.

### 1.6.1 Presentation layer

A React single-page application provides a responsive dashboard shell with a
sidebar, header, command palette, notifications and a light/dark theme. Ten
modules cover the operational workflow:

1. Overview
2. Network Monitoring
3. Access Points
4. Connected Devices
5. AI Anomaly Detection
6. Smart Troubleshooting
7. Issue Management
8. Automation Testing
9. Reports
10. Settings

### 1.6.2 Application layer

FastAPI routers validate requests with Pydantic schemas, enforce role-based
dependencies and delegate business logic to services. The backend exposes a
consistent `/api` surface, returns structured errors and documents itself through
Swagger UI and ReDoc.

### 1.6.3 Monitoring layer

A background scheduler runs a real probe on startup and at a configured interval.
It also refreshes device observations and checks real access points every five
minutes. Overlapping cycles are prevented by an asyncio lock. Failures are
recorded as real offline observations, not hidden or replaced with fake values.

### 1.6.4 Intelligence layer

The Isolation Forest is trained on recent live measurements when at least the
configured minimum number of samples exists. During cold start, a deterministic
synthetic baseline is used solely to fit the model; this is disclosed through
`used_sample_baseline` and never written to the measurement table. Each detected
event stores the normalized score, severity, feature vector, robust z-scores and
a textual explanation.

### 1.6.5 Operations layer

Threshold breaches and high-severity anomalies create tickets through a single
service with fingerprint-based duplicate suppression. The troubleshooting engine
produces advisory recommendations with a permanent safety note. Reports are
generated by ReportLab from persisted observations and downloaded through an
authenticated endpoint.

### 1.6.6 Data layer

SQLAlchemy models define twelve domain tables. SQLite provides a zero-setup
default for development and tests. MySQL 8 DDL and a migration are provided for
deployment. Foreign keys, unique constraints and composite indexes protect
integrity and support the dashboard queries.

### 1.6.7 Verification layer

The backend test suite uses a throw-away SQLite database, disables the scheduler,
blocks live probes and prevents recursive test runs. The frontend suite drives
the real UI with Playwright against the real backend. JUnit XML is imported into
the application so test evidence is visible inside the product.

---

## 1.7 Methodology

The project followed an incremental, test-supported design-science approach.

### 1.7.1 Requirements and domain study

The first phase identified the operational questions listed in Section 1.2,
reviewed the capabilities of common tools and defined the data-integrity policy.
The policy became a hard requirement: live measurements must be real and
simulations must be labelled.

### 1.7.2 Architecture and data design

The domain was decomposed into users, access points, measurements, anomalies,
recommendations, devices, tickets and test results. The relational model was
normalized to third normal form, with JSON used only for variable-length feature
and recommendation payloads.

### 1.7.3 Incremental implementation

Backend endpoints were implemented service by service and verified with API
smoke tests. The frontend was built module by module with shared components for
cards, tables, badges, dialogs, skeletons and error panels. Each module was
connected to the real API rather than mock data.

### 1.7.4 Verification

Pytest tests cover API contracts, permissions, business rules, ML behaviour,
report generation, ARP parsing, settings and security. Playwright tests cover
the user journey through the browser, including console errors, responsive
layout and PDF downloads. Defects discovered during testing were fixed and the
suites were rerun until green.

### 1.7.5 Documentation

Screenshots were captured from the running application with a Playwright script.
The report documents architecture, database design, UML/DFD models, test cases,
results, operation and limitations. Evidence files are stored in `reports/`.

### 1.7.6 Development phases

| Phase | Main activities | Output |
|---|---|---|
| 1. Requirements | Domain study, scope, data-integrity policy, role model | Objectives and requirements |
| 2. Design | Architecture, ER model, API contracts, UI navigation | Design chapters and schemas |
| 3. Backend | Models, services, routers, scheduler, AI, reports, security | Working API |
| 4. Frontend | Design system, pages, charts, dialogs, responsiveness | Working SPA |
| 5. Verification | Pytest, Playwright, coverage, defect fixes | Test evidence |
| 6. Documentation | Screenshots, diagrams, manual, report | Submission package |

---

## 1.8 Expected outcomes and contributions

The project delivers:

1. **A working application**, not a static prototype: real login, real probes,
   real database writes, real PDFs and a real test runner.
2. **A local-first measurement model** that requires no cloud account, SNMP
   credentials or monitoring agent.
3. **Explainable anomaly detection** that pairs a machine-learning score with
   robust-z reasoning and model provenance.
4. **Privacy-preserving device visibility** based on the OS ARP cache, hashed
   identities and masked MAC display.
5. **An integrated incident workflow** from measurement to ticket to report.
6. **A reproducible verification package** with 89 backend tests, 20 E2E tests,
   82% line coverage, JUnit XML, PDFs and 17 screenshots.
7. **An explicit integrity contract** that separates live observations from
   labelled simulations throughout the database, API and interface.

### 1.8.1 Academic contribution

The project demonstrates how a final-year student can combine web engineering,
relational modelling, applied machine learning, security and software testing in
one coherent artefact. It also demonstrates a defensible approach to using AI in
an operational context: the model is treated as an observer that raises
statistical flags, not as an autonomous controller. Human authorization remains
required for every network change.

---

## 1.9 Report organization

| Chapter | Content |
|---|---|
| 1 | Abstract, introduction, problem, objectives, scope and methodology |
| 2 | System architecture, components, data flow and deployment |
| 3 | Database design, ER model, data dictionary and normalization |
| 4 | UML use case, class, sequence, activity, state and DFD models |
| 5 | Testing strategy, test cases, results, coverage and defect log |
| 6 | User manual and operational workflows |
| 7 | Conclusion, limitations and future work |
| 8 | References |
| Appendix | Generated data dictionary, screenshots and evidence files |

The consolidated report in `Final-Year-Project-Report.md` follows the same
structure for submission.
