"""Build the consolidated final-year project report from the chapter files."""
from __future__ import annotations

import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUTPUT = BASE / "Final-Year-Project-Report.md"
PAGE_BREAK = '<div style="page-break-before: always;"></div>'

CHAPTER_FILES = [
    "01-abstract-and-introduction.md",
    "02-system-architecture.md",
    "03-database-design.md",
    "04-uml-and-process-models.md",
    "05-testing-and-results.md",
    "06-user-manual.md",
    "07-conclusion-and-future-work.md",
    "08-references.md",
]


def read(name: str) -> str:
    return (BASE / name).read_text(encoding="utf-8").strip()


def extract_abstract(chapter_one: str) -> str:
    match = re.search(r"## Abstract\n\n(.*?)\n\n---", chapter_one, re.S)
    if not match:
        raise SystemExit("Could not locate the abstract in chapter 1")
    return match.group(1).strip()


def slug(heading: str) -> str:
    value = heading.strip().lower()
    value = re.sub(r"[^\w\s-]", "", value)
    return re.sub(r"[\s]+", "-", value)


def toc_for(content: str) -> list[str]:
    entries: list[str] = []
    in_fence = False
    for line in content.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if line.startswith("# "):
            title = line[2:].strip()
            entries.append(f"- [{title}](#{slug(title)})")
        elif line.startswith("## "):
            title = line[3:].strip()
            entries.append(f"  - [{title}](#{slug(title)})")
    return entries


def main() -> None:
    chapter_one = read(CHAPTER_FILES[0])
    abstract = extract_abstract(chapter_one)
    chapter_one_body = chapter_one.split("## 1.1 Introduction", 1)[1]
    chapter_one_body = "# 1. Abstract and Introduction\n\n## 1.1 Introduction" + chapter_one_body

    chapters = [chapter_one_body]
    for name in CHAPTER_FILES[1:]:
        chapters.append(read(name))

    content = ""
    for chapter in chapters:
        content += PAGE_BREAK + "\n\n" + chapter.strip() + "\n\n"

    inventory = read("test-inventory.generated.md")
    inventory = inventory.replace("# Automated Test Inventory", "", 1).strip()
    inventory = re.sub(r"^## ", "### ", inventory, flags=re.M)

    appendices = f"""
{PAGE_BREAK}

# Appendix A - API Reference

All routes are prefixed with `/api`. Authentication uses a Bearer JWT except for
the login and health routes. "Any authenticated" means Viewer, Analyst and
Administrator.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/login` | Public | Authenticate and issue a JWT |
| GET | `/auth/me` | Any authenticated | Return the current profile |
| POST | `/auth/logout` | Any authenticated | Acknowledge client-side logout |
| GET | `/auth/users` | Administrator | List user accounts |
| POST | `/auth/users` | Administrator | Create a user account |
| GET | `/dashboard/overview` | Any authenticated | Dashboard aggregation |
| GET | `/monitoring/network-info` | Any authenticated | Host and interface context |
| GET | `/monitoring/wifi` | Any authenticated | Read-only current Wi-Fi association |
| GET | `/monitoring/history` | Any authenticated | Live measurement history |
| GET | `/monitoring/latest` | Any authenticated | Latest live measurement |
| POST | `/monitoring/run` | Analyst+ | Run a real probe |
| GET | `/monitoring/scheduler` | Any authenticated | Scheduler state |
| GET | `/access-points` | Any authenticated | List and search APs |
| GET | `/access-points/{{access_point_id}}` | Any authenticated | AP detail and history |
| POST | `/access-points` | Administrator | Register an AP |
| PATCH | `/access-points/{{access_point_id}}` | Administrator | Update an AP |
| DELETE | `/access-points/{{access_point_id}}` | Administrator | Delete an AP |
| POST | `/access-points/{{access_point_id}}/check` | Analyst+ | Check AP availability |
| GET | `/access-points/{{access_point_id}}/performance` | Any authenticated | AP performance series |
| GET | `/devices` | Any authenticated | List observed devices |
| POST | `/devices/discover` | Analyst+ | Read the OS ARP cache |
| PATCH | `/devices/{{device_id}}` | Administrator | Edit device metadata |
| POST | `/devices/{{device_id}}/approve` | Administrator | Approve a device |
| GET | `/devices/{{device_id}}/activity` | Any authenticated | Device observation history |
| GET | `/anomalies` | Any authenticated | List anomaly events |
| POST | `/anomalies/detect` | Analyst+ | Train and score live observations |
| GET | `/anomalies/model-info` | Any authenticated | Model metadata and cold-start state |
| GET | `/troubleshooting` | Any authenticated | Recommendation history |
| POST | `/troubleshooting/run` | Analyst+ | Run the rule engine |
| GET | `/troubleshooting/latest` | Any authenticated | Latest recommendation |
| GET | `/tickets` | Any authenticated | Ticket register and statistics |
| GET | `/tickets/stats` | Any authenticated | Ticket statistics |
| GET | `/tickets/{{ticket_id}}` | Any authenticated | Ticket detail and comments |
| POST | `/tickets` | Analyst+ | Create a manual ticket |
| PATCH | `/tickets/{{ticket_id}}` | Analyst+ | Update status or priority |
| POST | `/tickets/{{ticket_id}}/comments` | Analyst+ | Add a comment |
| GET | `/tests` | Any authenticated | Testing dashboard |
| POST | `/tests/run` | Administrator | Start the fixed pytest run |
| GET | `/tests/runs/{{run_id}}` | Any authenticated | Run status and results |
| GET | `/reports` | Any authenticated | List generated reports |
| GET | `/reports/types` | Any authenticated | List report types |
| POST | `/reports/generate` | Analyst+ | Generate a PDF report |
| GET | `/reports/download/{{filename}}` | Any authenticated | Download a PDF |
| GET | `/settings` | Any authenticated | Read runtime settings |
| PATCH | `/settings` | Administrator | Update runtime settings |
| GET | `/settings/system` | Any authenticated | System capability status |
| GET | `/health` | Public | Database and service health |

Interactive documentation is available at `/docs` and `/redoc`.

---

{PAGE_BREAK}

# Appendix B - Configuration Reference

Configuration is read from `backend/.env`. Changes require a backend restart.

| Variable | Default | Purpose |
|---|---|---|
| `APP_NAME` | `NetPulse AI` | Display name |
| `ENVIRONMENT` | `development` | `development`, `testing` or `production` |
| `DEBUG` | `false` | Verbose logging |
| `API_PREFIX` | `/api` | API route prefix |
| `DATABASE_URL` | SQLite path | SQLAlchemy connection string |
| `JWT_SECRET_KEY` | generated locally | Token signing key |
| `JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Session lifetime |
| `CORS_ORIGINS` | local Vite origins | Allowed browser origins |
| `ADMIN_EMAIL` | set locally | First-run administrator email |
| `ADMIN_PASSWORD` | set locally | First-run administrator password |
| `ADMIN_FULL_NAME` | `NetPulse Administrator` | First-run administrator name |
| `MONITOR_TARGET` | `1.1.1.1` | Live probe target |
| `MONITOR_PACKET_COUNT` | `4` | ICMP echo count |
| `MONITOR_TIMEOUT_MS` | `1500` | Per-reply timeout |
| `MONITORING_INTERVAL_SECONDS` | `60` | Scheduler interval |
| `MONITORING_ENABLED` | `true` | Enable the scheduler |
| `MONITOR_ON_STARTUP` | `true` | Run one cycle at startup |
| `DEVICE_DISCOVERY_ENABLED` | `true` | Enable ARP-cache discovery |
| `LATENCY_THRESHOLD_MS` | `150` | Ticket and diagnosis threshold |
| `PACKET_LOSS_THRESHOLD_PCT` | `5` | Ticket and diagnosis threshold |
| `AUTO_TICKETS_ENABLED` | `true` | Automatic issue tickets |
| `AUTO_ANOMALY_DETECTION` | `true` | Automatic AI detection |
| `ANOMALY_MIN_SAMPLES` | `30` | Minimum real samples before real-data fitting |
| `ANOMALY_CONTAMINATION` | `0.08` | Isolation Forest contamination |
| `TEST_RUNNER_ENABLED` | `true` | Allow the built-in runner |
| `REPORTS_DIR` | `../reports` | PDF output directory |

Runtime thresholds and automation toggles are also stored in `app_settings` and
can be changed from **Settings**. Probe target, interval and discovery remain
environment-managed.

---

{PAGE_BREAK}

# Appendix C - Automated Test Inventory

This inventory is generated from the final JUnit XML files in
`reports/test-runs/` by `documentation/generate_test_inventory.py`.

{inventory}

---

{PAGE_BREAK}

# Appendix D - Screenshot Index

All screenshots were captured from the running application with Playwright and
the installed Chrome channel. Paths are relative to the `documentation/` folder.

| Figure | File | Caption |
|---|---|---|
| D.1 | `screenshots/01-login.png` | Login screen with JWT sign-in and security notice |
| D.2 | `screenshots/02-overview.png` | Overview dashboard with live health and trends |
| D.3 | `screenshots/03-network-monitoring.png` | Network monitoring timeline and scheduler state |
| D.4 | `screenshots/04-access-points.png` | Access point inventory and filters |
| D.5 | `screenshots/05-access-point-detail.png` | Access point detail, performance and history |
| D.6 | `screenshots/06-connected-devices.png` | Privacy-preserving device registry |
| D.7 | `screenshots/07-ai-anomaly-detection.png` | AI anomaly events and model configuration |
| D.8 | `screenshots/08-smart-troubleshooting.png` | Rule-based diagnosis and safety guardrails |
| D.9 | `screenshots/09-issue-management.png` | Ticket register and statistics |
| D.10 | `screenshots/10-create-ticket.png` | Manual ticket creation dialog |
| D.11 | `screenshots/11-automation-testing.png` | Built-in Pytest runner and results |
| D.12 | `screenshots/12-reports.png` | PDF report studio and library |
| D.13 | `screenshots/13-settings.png` | Thresholds, automation, system status and team access |
| D.14 | `screenshots/14-command-palette.png` | Command palette navigation |
| D.15 | `screenshots/15-overview-light.png` | Beige, wine, and white light theme |
| D.16 | `screenshots/16-mobile-overview.png` | Responsive mobile overview at 390 x 844 |
| D.17 | `screenshots/17-mobile-navigation.png` | Mobile navigation drawer |

---

{PAGE_BREAK}

# Appendix E - Submission Checklist

## E.1 Deliverables

- [x] React frontend source
- [x] FastAPI backend source
- [x] MySQL schema, migration and database guide
- [x] SQLite verified runtime database
- [x] Pytest suite with 88 passing tests
- [x] Playwright suite with 20 passing tests
- [x] JUnit XML and coverage evidence
- [x] Built-in test runner with persisted results
- [x] Eight PDF report types
- [x] Seventeen application screenshots
- [x] Architecture, database, UML/DFD, testing, user-manual, conclusion and
      reference chapters
- [x] Generated data dictionary and test inventory
- [x] Consolidated report

## E.2 Before printing or submitting

- [ ] Replace `[Student Name]` and the other cover placeholders.
- [ ] Add the institution, department, guide and academic-year details.
- [ ] Sign the declaration and obtain the certificate signature.
- [ ] Confirm the final test results after any last code change.
- [ ] Regenerate the PDF reports if the database changed after the last run.
- [ ] Import and smoke-test the MySQL schema on a MySQL 8 host if the deployment
      path will be demonstrated.
- [ ] Review the report in a Markdown renderer that supports Mermaid diagrams.
- [ ] Export to PDF or DOCX using the institution's required template if needed.
- [ ] Archive the source, database backup, reports and screenshots together.

## E.3 Final verification statement

The verified build uses SQLite and a local Windows 11 host. The final recorded
run contains **88 passing backend tests** and **20 passing Playwright tests**,
with **82% backend line coverage**. MySQL runtime import remains unverified
because MySQL and Docker were unavailable on the development machine. Simulated
records are labelled and excluded from live health. The application never
fabricates a live measurement.

---

*End of report.*
"""

    toc_lines = []
    toc_lines.append("- [Declaration](#declaration)")
    toc_lines.append("- [Certificate](#certificate)")
    toc_lines.append("- [Acknowledgements](#acknowledgements)")
    toc_lines.append("- [Abstract](#abstract)")
    toc_lines.append("- [List of Abbreviations](#list-of-abbreviations)")
    toc_lines.append("- [List of Screenshots](#list-of-screenshots)")
    toc_lines.extend(toc_for(content))
    toc_lines.append("- [Appendix A - API Reference](#appendix-a---api-reference)")
    toc_lines.append("- [Appendix B - Configuration Reference](#appendix-b---configuration-reference)")
    toc_lines.append("- [Appendix C - Automated Test Inventory](#appendix-c---automated-test-inventory)")
    toc_lines.append("- [Appendix D - Screenshot Index](#appendix-d---screenshot-index)")
    toc_lines.append("- [Appendix E - Submission Checklist](#appendix-e---submission-checklist)")
    toc = "\n".join(toc_lines)

    front = f"""<div align="center">

# NetPulse AI

## Intelligent Wi-Fi Network Monitoring & Diagnostics Platform

**A Final-Year Project Report**

Submitted in partial fulfilment of the requirements for the degree of

**Bachelor of Science (B.Sc.)**

---

| Field | Detail |
|---|---|
| Student name | _[Student Name]_ |
| Roll number / registration | _[Roll Number]_ |
| Programme | B.Sc. - Final-Year Project |
| Department | _[Department]_ |
| Institution | _[College / University]_ |
| Academic year | _[Year]_ |
| Project guide | _[Guide Name]_ |
| Submitted on | _[Submission Date]_ |

</div>

{PAGE_BREAK}

## Declaration

I declare that this report and the associated NetPulse AI implementation are my
own work, except where explicitly acknowledged. All external libraries,
standards, research papers and documentation are cited in Chapter 8. The project
was developed and tested on an authorized local network. No third-party network
was monitored, and no fabricated measurement is presented as live telemetry.

Place: _[Place]_

Date: _[Date]_

Signature: ______________________________

_[Student Name]_

---

## Certificate

This is to certify that _[Student Name]_, roll number _[Roll Number]_, has
completed the final-year project titled **NetPulse AI - Intelligent Wi-Fi Network
Monitoring & Diagnostics Platform** under my supervision. The report has been
reviewed and is submitted for evaluation.

Project guide: ______________________________

Head of department: ______________________________

External examiner: ______________________________

Date: _[Date]_

---

## Acknowledgements

I thank my project guide for guidance on scope, testing and documentation, the
department for laboratory access, and the open-source maintainers of FastAPI,
React, scikit-learn, SQLAlchemy, Playwright and the other libraries used in this
project. I also acknowledge the authors of the standards and research cited in
Chapter 8. Finally, I thank my classmates and family for their support during the
project.

---

## Abstract

{abstract}

---

## List of Abbreviations

| Abbreviation | Meaning |
|---|---|
| AI | Artificial Intelligence |
| AP | Access Point |
| API | Application Programming Interface |
| ARP | Address Resolution Protocol |
| ASVS | Application Security Verification Standard |
| CORS | Cross-Origin Resource Sharing |
| CRUD | Create, Read, Update, Delete |
| DFD | Data-Flow Diagram |
| DHCP | Dynamic Host Configuration Protocol |
| ER | Entity-Relationship |
| HTTP / HTTPS | Hypertext Transfer Protocol / Secure |
| ICMP | Internet Control Message Protocol |
| JSON | JavaScript Object Notation |
| JWT | JSON Web Token |
| MAC | Media Access Control |
| MAD | Median Absolute Deviation |
| MFA | Multi-Factor Authentication |
| ML | Machine Learning |
| NMS | Network Management System |
| OS | Operating System |
| PDF | Portable Document Format |
| RBAC | Role-Based Access Control |
| REST | Representational State Transfer |
| RSSI | Received Signal Strength Indicator |
| SHA | Secure Hash Algorithm |
| SNR | Signal-to-Noise Ratio |
| SQL | Structured Query Language |
| TLS | Transport Layer Security |
| UML | Unified Modeling Language |
| UTC | Coordinated Universal Time |
| WCAG | Web Content Accessibility Guidelines |
| Wi-Fi | Wireless Fidelity (IEEE 802.11) |

---

## List of Screenshots

| Figure | Caption |
|---|---|
| D.1 | Login |
| D.2 | Overview dashboard |
| D.3 | Network monitoring |
| D.4 | Access points |
| D.5 | Access point detail |
| D.6 | Connected devices |
| D.7 | AI anomaly detection |
| D.8 | Smart troubleshooting |
| D.9 | Issue management |
| D.10 | Create issue ticket |
| D.11 | Automation testing |
| D.12 | Reports |
| D.13 | Settings |
| D.14 | Command palette |
| D.15 | Light theme |
| D.16 | Mobile overview |
| D.17 | Mobile navigation |

---

{PAGE_BREAK}

## Table of Contents

{toc}

"""

    report = front + content + appendices
    OUTPUT.write_text(report, encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(report)} characters)")
    print(f"Chapters: {len(chapters)}, TOC entries: {len(toc_lines)}")


if __name__ == "__main__":
    main()
