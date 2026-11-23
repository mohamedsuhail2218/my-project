# 7. Conclusion and Future Work

## 7.1 Project recap

NetPulse AI was built to answer a practical question: can a final-year student
deliver a network-monitoring platform that produces trustworthy measurements,
explains statistical findings and supports a complete incident workflow without
pretending to be an enterprise product?

The result is a working full-stack application with ten workspace modules, a
FastAPI backend, a React frontend, real OS-level probes, a privacy-preserving
device inventory, an Isolation Forest detector, a deterministic troubleshooting
engine, automated ticketing, eight PDF report types, a built-in test runner and a
documented verification trail.

The project deliberately chose depth over breadth. It does not claim to replace a
commercial network management system. It demonstrates a coherent, defensible
slice of one, with explicit boundaries and evidence for every claim.

---

## 7.2 Objective attainment

The objectives from Chapter 1 are repeated with the evidence that demonstrates
attainment.

| ID | Objective | Evidence | Status |
|---|---|---|---|
| O1 | Build a complete full-stack application | React SPA with login and ten modules; FastAPI API; shared authentication; responsive shell; verified in 21 Playwright tests | Achieved |
| O2 | Collect real network measurements | OS ICMP probes persist latency, loss and jitter; failures are stored as real failures; simulation is separated by `data_origin`; 8 monitoring tests | Achieved |
| O3 | Detect anomalies with machine learning | Isolation Forest over live observations; robust-z explanation; severity; model provenance; cold-start disclosure; 7 anomaly tests | Achieved |
| O4 | Provide rule-based troubleshooting | Deterministic rules for outage, latency, loss, simulation and insufficient data; causes, ordered steps, related tickets and safety note; 4 tests | Achieved |
| O5 | Manage authorized access points | CRUD, availability checks, performance history, configuration audit trail, duplicate protection and simulation labels; 8 tests | Achieved |
| O6 | Provide privacy-preserving device visibility | Read-only ARP-cache discovery, SHA-256 identity, masked MAC, approval workflow and observation history; 6 tests | Achieved |
| O7 | Automate incident management | Deduplicated automatic tickets, manual tickets, priorities, three workflow statuses, comments and statistics; 5 tests | Achieved |
| O8 | Generate analytical reports | Eight PDF types generated from stored data, report library, secure download and path-traversal protection; 7 tests | Achieved |
| O9 | Verify the implementation | 103 Pytest tests, 21 Playwright tests, 80% backend line coverage, JUnit XML, HTML report and built-in runner evidence | Achieved |
| O10 | Document the project professionally | Nine chapters, architecture and UML/DFD models, generated data dictionary, test inventory, 21 screenshots and consolidated report | Achieved |

### 7.2.1 Non-functional outcomes

| Quality | Outcome |
|---|---|
| Usability | Responsive dark/light interface, command palette, notifications, explicit empty/error/loading states |
| Security | Argon2, JWT, role checks, login throttling, CORS, security headers, report path protection, fixed test command |
| Performance | Dashboard aggregation over indexed queries; measurement limits; polling intervals; modest local footprint |
| Reliability | Scheduler exceptions are recorded and do not terminate the loop; failed probes are persisted as failures |
| Maintainability | Layered backend, typed schemas, service boundaries, focused React pages and shared UI primitives |
| Portability | SQLite default; MySQL DDL and Docker Compose provided |
| Testability | Isolated test database, blocked live probes, recursive-runner protection, service and API tests |
| Integrity | Explicit `data_origin`, model provenance, cold-start disclosure and simulation isolation |

---

## 7.3 Contributions

### 7.3.1 Provenance-first data design

Most student monitoring projects mix generated demonstration rows with real
measurements. NetPulse AI makes provenance a first-class database attribute.
Every measurement is `live` or `simulation`; every anomaly records its model
version and whether the cold-start baseline was used; every ticket records its
source and fingerprint. Dashboard queries filter to live data, and tests assert
that simulation never contributes to health.

This is a small design decision with a large effect: the application can be
demonstrated safely without misleading the audience.

### 7.3.2 An end-to-end operational workflow

The modules are not isolated demos. A measurement can become an anomaly, an
anomaly can become a ticket, a ticket can be diagnosed and resolved, and every
step can appear in a report. The same persisted records feed the dashboard, the
AI detector, the rule engine, the PDF generator and the automated tests.

### 7.3.3 Explainable anomaly detection

The Isolation Forest supplies the outlier decision, but the interface does not
stop at a score. Robust z-scores identify which metrics departed from the
baseline, and the explanation states that the result is a statistical
observation rather than a prediction. Cold-start behaviour is disclosed instead
of hidden.

### 7.3.4 Safety-first automation

NetPulse AI automates observation, analysis, ticket creation and reporting. It
does not automate configuration changes. The troubleshooting engine is advisory,
the test runner is allow-listed, the probe target is environment-managed and the
"automatic configuration changes" control is permanently disabled. These are
product decisions that reduce the risk of a demonstration causing real damage.

### 7.3.5 Reproducible verification

The project ships its evidence: 103 backend tests, 21 browser tests, JUnit XML,
coverage XML, a Playwright HTML report, a built-in runner, a generated test
inventory and 21 screenshots. A reviewer can rerun the commands rather than
trust a claim in a slide.

---

## 7.4 Limitations

A credible conclusion must state what the project does not establish.

### 7.4.1 Radio-layer visibility

NetPulse AI measures IP reachability, latency, loss and jitter. The **Use
current Wi-Fi** form reads the host's current association and displays its
signal/RSSI, band and channel as descriptive metadata, but the project does
**not** perform an RF survey or read SNR, channel utilization, retry rate,
airtime or neighbouring AP interference. Real access-point checks use the
management IP, not a controller or SNMP agent. Because the detected gateway is
usually a private address, the feature is limited to a backend running on the
same Wi-Fi network and is unavailable in the serverless deployment.

This is the most important scope limitation for a project with "Wi-Fi" in its
title. The application observes the network experience above the radio layer. A
production Wi-Fi monitor would integrate the Windows WLAN API, a vendor
controller or SNMP.

### 7.4.2 Model evaluation

The detector is unsupervised. The project did not have a labelled incident
dataset, so precision, recall, F1, ROC-AUC and calibration were not measured.
Testing verifies deterministic behaviour, cold-start disclosure, explanation
content and escalation policy, not detection accuracy on a representative
network.

The contamination parameter is a modelling assumption, not a measured base rate.
Anomaly quality will vary with network conditions and improves only after enough
real observations exist.

### 7.4.3 Scale and concurrency

The scheduler runs inside a single API process. There is no distributed lock,
queue or worker pool. Multi-worker deployment would duplicate probes or require
an external scheduler. The project was tested with a single local user and a
small dataset, not with hundreds of concurrent operators or thousands of APs.

### 7.4.4 Database verification

SQLite is the verified runtime. MySQL 8 schema, migration and Docker Compose
files are provided, but MySQL and Docker were unavailable on the development
machine, so the import was not executed. This remains the main deployment risk.

### 7.4.5 Security scope

- Logout is client-side because the JWT is stateless; there is no token denylist.
- There is no refresh-token rotation, MFA, SSO or self-service password reset.
- Login throttling is in-memory and per-process.
- HTTP is used locally; TLS termination is a deployment responsibility.
- No penetration test, dependency audit or formal threat model was completed.
- Database-level `CHECK` constraints are not used; validation is application-side.

### 7.4.6 Operational scope

- No automatic data retention or partitioning; measurement history grows.
- No email, SMS, webhook or push alerting.
- Reports are generated on demand, not scheduled.
- No mobile application; the responsive web interface is the mobile experience.
- No multi-tenancy, asset ownership groups or per-site isolation.
- No read-audit trail; only changes and comments are auditable.
- No automated configuration change or remediation, by design.

### 7.4.7 Evaluation scope

- Tested only on Windows 11 and Chrome.
- No long-duration soak test, load test or failover test.
- No formal accessibility audit or screen-reader test.
- No real AP hardware beyond the authorized local target and labelled demo
  records.
- No comparative benchmark against commercial or open-source NMS products.

These limitations are stated so that a reviewer can judge the project for what
it is: a carefully verified academic prototype, not a production NMS.

---

## 7.5 Lessons learned

### 7.5.1 Data integrity must be architectural

Adding a "demo" flag late in development would not have been enough. Provenance
had to influence the schema, every query, the AI training set, the ticket rules
and the tests. The earliest design decision that paid off most was separating
`live` from `simulation` at the storage layer.

### 7.5.2 Network applications need hostile test isolation

A test that accidentally sends a real ping or starts the scheduler is slow,
unreliable and potentially disruptive. The isolated test database, blocked live
probes and disabled nested test runner made the suite fast and repeatable. This
is a reusable pattern for any project that touches the operating system.

### 7.5.3 Explanations create trust

A bare anomaly score invites either blind trust or dismissal. Showing which
metrics deviated, disclosing the cold-start baseline and stating the limits of
the method made the AI module defensible in review. Explainability was not an
afterthought; it shaped the event schema and the interface.

### 7.5.4 Safety constraints clarify the product

Refusing to change router configuration could look like a missing feature. In
practice it sharpened the product: the system is an adviser and evidence
recorder, not a risky remote-control tool. The permanent disabled control makes
the boundary visible to the user.

### 7.5.5 Incremental verification finds real defects

The test suites found modal crashes, chart clipping, suite-mapping errors,
label conflicts and stale evidence. Those defects would have been difficult to
notice in a scripted happy-path demonstration. Running the suites repeatedly
after each change was more valuable than a single final test pass.

### 7.5.6 Honest limitations strengthen the report

Stating that MySQL was not executed, that radio metrics are absent and that the
model has no labelled accuracy estimate makes the achieved results more
credible, not less. A reviewer can distinguish verified behaviour from planned
work.

---

## 7.6 Future work

The roadmap is ordered by value and risk.

### 7.6.1 Near-term priorities

| Priority | Item | Rationale |
|---|---|---|
| P1 | Import and smoke-test the MySQL schema on a MySQL 8 host | Remove the main deployment uncertainty |
| P1 | Add a password-change and administrator reset flow | Close a basic account-management gap |
| P1 | Add retention jobs and measurement partitioning | Bound long-running database growth |
| P1 | Add a distributed lock or external scheduler | Support more than one API worker |
| P1 | Add unit tests for scheduler timing and diagnostics branches | Raise coverage where it is currently lowest |
| P1 | Add CI (lint, tests, build) | Prevent regressions between demonstrations |

### 7.6.2 Medium-term enhancements

| Priority | Item | Rationale |
|---|---|---|
| P2 | Integrate Windows WLAN API or a vendor controller for RSSI, SNR and channel data | Make the Wi-Fi monitoring claim complete |
| P2 | Add SNMP polling for AP CPU, memory, clients and interface counters | Turn AP checks into real device monitoring |
| P2 | Add email/webhook alerting with severity routing | Make incidents actionable outside the UI |
| P2 | Schedule recurring PDF reports | Support management reporting |
| P2 | Add token rotation, server-side revocation and MFA | Strengthen authentication |
| P2 | Add model drift monitoring and periodic retraining reports | Keep anomaly detection relevant |
| P2 | Add a labelled incident dataset and measure precision/recall | Evaluate the model scientifically |
| P2 | Add SHAP or feature-attribution explanations | Deepen model interpretability |
| P2 | Complete a WCAG 2.2 AA audit and screen-reader test | Improve accessibility |
| P2 | Commission a penetration test and dependency audit | Validate the security posture |

### 7.6.3 Longer-term direction

| Priority | Item | Rationale |
|---|---|---|
| P3 | Move measurements to a time-series store or partitioned MySQL tables | Support months of high-frequency data |
| P3 | Introduce a task queue (Celery/RQ) and distributed workers | Scale collection and analysis |
| P3 | Add multi-site and multi-tenant isolation | Support an institutional deployment |
| P3 | Add a supervised or hybrid model trained on confirmed incidents | Improve detection quality |
| P3 | Build a PWA or mobile companion | Improve operator mobility |
| P3 | Add SSO (OIDC/SAML) and directory integration | Fit college IT environments |
| P3 | Add configuration backup and drift detection for APs (read-only) | Extend governance without automated changes |

### 7.6.4 What should not change

The following principles should survive future development:

1. Live and simulated data remain distinguishable at the storage layer.
2. A failed probe is recorded as a failure, never replaced with a plausible
   value.
3. AI findings remain explanations, not guarantees.
4. Automated configuration changes remain out of scope unless a separate,
   explicitly authorized change-management design is introduced.
5. Test evidence remains reproducible from the repository.

---

## 7.7 Conclusion

NetPulse AI met its ten objectives. It delivers a real, working monitoring and
diagnostics platform with a coherent data model, a complete operational
workflow, an explainable machine-learning component and a substantial automated
verification trail. The final build passed 124 automated tests, produced 80%
backend line coverage, generated eight report types, and documented its design
with architecture, database, UML, DFD, test and user-manual chapters.

The project also demonstrates the value of constraints. Refusing to fabricate
telemetry, refusing to change configuration automatically and refusing to hide
the cold-start baseline made the system more credible. The unresolved items are
clearly identified: radio-layer visibility, MySQL runtime validation, model
accuracy evaluation, concurrency, retention and several security hardening
steps.

For a B.Sc. final-year project, the result is both a usable prototype and a
defensible engineering argument: observe honestly, explain carefully, act only
with human authorization, and keep the evidence.

---

## 7.8 Chapter summary

This chapter evaluated the project against its objectives, summarised its
contributions, stated its limitations and proposed a prioritised roadmap. The
next chapter lists the standards, research and technical documentation that
supported the work.
