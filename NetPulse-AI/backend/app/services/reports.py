"""PDF analytics reports generated from persisted observations."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from statistics import fmean, median

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    AccessPoint,
    AnomalyEvent,
    AutomatedTestResult,
    IssueTicket,
    NetworkMeasurement,
)

logger = logging.getLogger("netpulse.reports")

REPORT_TITLES = {
    "executive": "Executive Network Performance Report",
    "uptime": "Network Uptime Report",
    "latency": "Network Latency Report",
    "packet_loss": "Packet Loss Report",
    "access_points": "Access Point Performance Report",
    "anomalies": "AI Anomaly Detection Report",
    "issues": "Issue Management Report",
    "testing": "Automated Testing Report",
}
REPORT_TYPES = set(REPORT_TITLES)
WINE = colors.HexColor("#6B1E31")
WINE_SOFT = colors.HexColor("#81233A")
ROSE = colors.HexColor("#9E3049")
MUTED = colors.HexColor("#7A5F62")
SAND = colors.HexColor("#F9F0DE")
CREAM = colors.HexColor("#FBF4E9")
BORDER = colors.HexColor("#E2C7A8")
BODY = colors.HexColor("#3F2A2E")
OCHRE = colors.HexColor("#8F521A")
RUST = colors.HexColor("#983527")
WHITE = colors.white


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "NP Title", parent=base["Title"], fontSize=22, leading=27, textColor=WINE, alignment=TA_LEFT
        ),
        "subtitle": ParagraphStyle(
            "NP Subtitle", parent=base["Normal"], fontSize=10, textColor=MUTED, leading=14
        ),
        "h1": ParagraphStyle(
            "NP H1", parent=base["Heading1"], fontSize=15, leading=19, textColor=WINE, spaceBefore=12
        ),
        "h2": ParagraphStyle(
            "NP H2", parent=base["Heading2"], fontSize=12, leading=16, textColor=ROSE
        ),
        "body": ParagraphStyle("NP Body", parent=base["BodyText"], fontSize=9, leading=13, textColor=BODY),
        "small": ParagraphStyle("NP Small", parent=base["BodyText"], fontSize=7.5, leading=10, textColor=MUTED),
        "cell": ParagraphStyle("NP Cell", parent=base["BodyText"], fontSize=7.5, leading=10, textColor=BODY),
        "cell_bold": ParagraphStyle(
            "NP Cell Bold", parent=base["BodyText"], fontSize=7.5, leading=10, textColor=WINE
        ),
        "note": ParagraphStyle(
            "NP Note", parent=base["BodyText"], fontSize=8, leading=11, textColor=OCHRE
        ),
    }


STYLES = _styles()


def _fmt(value, suffix: str = "") -> str:
    if value is None:
        return "No data"
    return f"{value}{suffix}"


def _iso(value: datetime | None) -> str:
    if value is None:
        return "—"
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _p(value: object, style: str = "cell") -> Paragraph:
    return Paragraph(escape(str(value)), STYLES[style])


def _table(headers: list[str], rows: list[list], widths: list[float] | None = None) -> Table:
    data = [[_p(header, "cell_bold") for header in headers]]
    for row in rows:
        data.append([_p(value) for value in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), SAND),
                ("TEXTCOLOR", (0, 0), (-1, 0), WINE),
                ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, CREAM]),
            ]
        )
    )
    return table


def _summary_table(rows: list[tuple[str, str]]) -> Table:
    data = [[_p(label, "cell_bold"), _p(value)] for label, value in rows]
    table = Table(data, colWidths=[55 * mm, 100 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), SAND),
                ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def _page_decorator(report_title: str):
    def decorate(canvas, doc):
        canvas.saveState()
        width, height = A4
        canvas.setFillColor(WINE)
        canvas.rect(0, height - 12 * mm, width, 12 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(18 * mm, height - 7.8 * mm, "NETPULSE AI")
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(SAND)
        canvas.drawRightString(width - 18 * mm, height - 7.8 * mm, report_title)
        canvas.setStrokeColor(BORDER)
        canvas.line(18 * mm, 15 * mm, width - 18 * mm, 15 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(18 * mm, 10 * mm, "Generated from local network observations · not a future-failure guarantee")
        canvas.drawRightString(width - 18 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    return decorate


def _measurement_stats(measurements: list[NetworkMeasurement]) -> dict:
    online = sum(1 for m in measurements if m.is_online)
    latencies = [m.latency_ms for m in measurements if m.latency_ms is not None]
    losses = [m.packet_loss_pct for m in measurements]
    jitters = [m.jitter_ms for m in measurements if m.jitter_ms is not None]
    return {
        "total": len(measurements),
        "online": online,
        "uptime_pct": round(online / len(measurements) * 100, 2) if measurements else None,
        "avg_latency": round(fmean(latencies), 2) if latencies else None,
        "median_latency": round(median(latencies), 2) if latencies else None,
        "max_latency": max(latencies) if latencies else None,
        "avg_loss": round(fmean(losses), 2) if losses else None,
        "max_loss": max(losses) if losses else None,
        "avg_jitter": round(fmean(jitters), 2) if jitters else None,
    }


def _scope_data(db: Session, hours: int) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    measurements = db.scalars(
        select(NetworkMeasurement)
        .where(
            NetworkMeasurement.data_origin == "live",
            NetworkMeasurement.recorded_at >= cutoff,
        )
        .order_by(NetworkMeasurement.recorded_at.asc())
    ).all()
    access_points = db.scalars(select(AccessPoint).order_by(AccessPoint.is_simulated.asc(), AccessPoint.name)).all()
    anomalies = db.scalars(
        select(AnomalyEvent)
        .where(AnomalyEvent.detected_at >= cutoff)
        .order_by(AnomalyEvent.detected_at.desc())
        .limit(100)
    ).all()
    tickets = db.scalars(
        select(IssueTicket).order_by(IssueTicket.created_at.desc()).limit(100)
    ).all()
    latest_run = db.scalar(
        select(AutomatedTestResult).order_by(AutomatedTestResult.executed_at.desc()).limit(1)
    )
    test_results = []
    if latest_run:
        test_results = db.scalars(
            select(AutomatedTestResult).where(AutomatedTestResult.run_id == latest_run.run_id)
        ).all()
    return {
        "cutoff": cutoff,
        "measurements": measurements,
        "access_points": access_points,
        "anomalies": anomalies,
        "tickets": tickets,
        "test_results": test_results,
        "stats": _measurement_stats(measurements),
    }


def _build_executive(story, data, hours):
    stats = data["stats"]
    story.extend(
        [
            Paragraph("Network snapshot", STYLES["h1"]),
            _summary_table(
                [
                    ("Reporting window", f"Last {hours} hours"),
                    ("Live probes", str(stats["total"])),
                    ("Network uptime", _fmt(stats["uptime_pct"], "%")),
                    ("Average latency", _fmt(stats["avg_latency"], " ms")),
                    ("Average packet loss", _fmt(stats["avg_loss"], "%")),
                    ("AI anomaly events", str(len(data["anomalies"]))),
                    ("Access points registered", str(len(data["access_points"]))),
                    ("Issue tickets (all time)", str(len(data["tickets"]))),
                ]
            ),
            Spacer(1, 5 * mm),
            Paragraph("Recent live measurements", STYLES["h1"]),
            _table(
                ["Timestamp", "Status", "Latency", "Loss", "Jitter", "Target"],
                [
                    [_iso(m.recorded_at), "Online" if m.is_online else "Offline", _fmt(m.latency_ms, " ms"), _fmt(m.packet_loss_pct, "%"), _fmt(m.jitter_ms, " ms"), m.probe_target]
                    for m in data["measurements"][-20:]
                ] or [["No live measurements in this reporting window", "—", "—", "—", "—", "—"]],
                [34 * mm, 20 * mm, 22 * mm, 18 * mm, 20 * mm, 40 * mm],
            ),
            Paragraph("Access point inventory", STYLES["h1"]),
            _table(
                ["Name", "Location", "IP", "Type", "Status", "Last checked"],
                [
                    [ap.name, ap.location, ap.ip_address, "Simulated" if ap.is_simulated else "Real", ap.status, _iso(ap.last_checked_at)]
                    for ap in data["access_points"]
                ]
                or [["No access points registered", "—", "—", "—", "—", "—"]],
                [35 * mm, 38 * mm, 24 * mm, 18 * mm, 18 * mm, 30 * mm],
            ),
            Paragraph("AI anomaly summary", STYLES["h1"]),
            _table(
                ["Detected", "Severity", "Score", "Explanation"],
                [
                    [_iso(e.detected_at), e.severity, f"{e.anomaly_score:.3f}", e.explanation[:360]]
                    for e in data["anomalies"][:15]
                ]
                or [["No anomaly events in this window", "—", "—", "—"]],
                [28 * mm, 17 * mm, 18 * mm, 100 * mm],
            ),
            Paragraph("Issue management", STYLES["h1"]),
            _table(
                ["Ticket", "Title", "Priority", "Status", "Created"],
                [
                    [t.ticket_number, t.title, t.priority, t.status, _iso(t.created_at)]
                    for t in data["tickets"][:15]
                ]
                or [["No issue tickets", "—", "—", "—", "—"]],
                [28 * mm, 65 * mm, 18 * mm, 20 * mm, 30 * mm],
            ),
        ]
    )


def _build_measurement_report(story, data, metric: str):
    stats = data["stats"]
    label = "latency" if metric == "latency" else "packet loss"
    story.extend(
        [
            Paragraph(f"{label.title()} statistics", STYLES["h1"]),
            _summary_table(
                [
                    ("Live probes analysed", str(stats["total"])),
                    ("Online observations", str(stats["online"])),
                    ("Network uptime", _fmt(stats["uptime_pct"], "%")),
                    ("Average latency", _fmt(stats["avg_latency"], " ms")),
                    ("Average packet loss", _fmt(stats["avg_loss"], "%")),
                    ("Maximum packet loss", _fmt(stats["max_loss"], "%")),
                    ("Average jitter", _fmt(stats["avg_jitter"], " ms")),
                ]
            ),
            Paragraph(f"Recent {label} measurements", STYLES["h1"]),
            _table(
                ["Timestamp", "Status", "Latency", "Packet loss", "Jitter", "Target"],
                [
                    [
                        _iso(m.recorded_at),
                        "Online" if m.is_online else "Offline",
                        _fmt(m.latency_ms, " ms"),
                        _fmt(m.packet_loss_pct, "%"),
                        _fmt(m.jitter_ms, " ms"),
                        m.probe_target,
                    ]
                    for m in data["measurements"][-80:]
                ]
                or [["No live measurements in this window", "—", "—", "—", "—", "—"]],
                [34 * mm, 20 * mm, 22 * mm, 22 * mm, 20 * mm, 36 * mm],
            ),
            Paragraph(
                "Packet loss is derived from ICMP echo replies over repeated probes. "
                "Latency is the mean round-trip time reported by the operating system. "
                "No measurement in this report is synthetic.",
                STYLES["note"],
            ),
        ]
    )


def _build_access_points(story, data):
    story.append(Paragraph("Registered access point performance", STYLES["h1"]))
    rows = []
    for ap in data["access_points"]:
        ap_measurements = [m for m in data["measurements"] if m.access_point_id == ap.id]
        stats = _measurement_stats(ap_measurements)
        rows.append(
            [
                ap.name,
                ap.location,
                ap.ip_address,
                "Simulated" if ap.is_simulated else "Real",
                ap.status,
                str(stats["total"]),
                _fmt(stats["uptime_pct"], "%"),
                _fmt(stats["avg_latency"], " ms"),
                _fmt(stats["avg_loss"], "%"),
            ]
        )
    story.extend(
        [
            _table(
                ["Name", "Location", "IP", "Type", "Status", "Checks", "Uptime", "Avg latency", "Avg loss"],
                rows or [["No access points registered", "—", "—", "—", "—", "—", "—", "—", "—"]],
                [30 * mm, 32 * mm, 21 * mm, 16 * mm, 16 * mm, 12 * mm, 15 * mm, 18 * mm, 16 * mm],
            ),
            Paragraph(
                "Simulated access points are demonstration records. Their generated check results are "
                "clearly labelled and excluded from live health and uptime metrics.",
                STYLES["note"],
            ),
        ]
    )


def _build_anomalies(story, data):
    rows = [
        [_iso(e.detected_at), e.severity, f"{e.anomaly_score:.3f}", e.model_version, "Yes" if e.used_sample_baseline else "No", e.explanation]
        for e in data["anomalies"]
    ]
    story.extend(
        [
            Paragraph("AI anomaly events", STYLES["h1"]),
            _summary_table(
                [
                    ("Algorithm", "Isolation Forest (scikit-learn)"),
                    ("Events in window", str(len(data["anomalies"]))),
                    ("Critical", str(sum(1 for e in data["anomalies"] if e.severity == "Critical"))),
                    ("High", str(sum(1 for e in data["anomalies"] if e.severity == "High"))),
                    ("Detector used sample baseline", "Yes" if any(e.used_sample_baseline for e in data["anomalies"]) else "No"),
                ]
            ),
            Spacer(1, 4 * mm),
            _table(
                ["Detected", "Severity", "Score", "Model", "Cold start", "Explanation"],
                rows or [["No anomaly events in this window", "—", "—", "—", "—", "—"]],
                [25 * mm, 15 * mm, 15 * mm, 31 * mm, 14 * mm, 67 * mm],
            ),
            Paragraph(
                "Isolation Forest identifies statistical outliers in measured latency, packet loss and jitter. "
                "An anomaly is not proof of a fault and is not a prediction of future network failure.",
                STYLES["note"],
            ),
        ]
    )


def _build_issues(story, data):
    rows = [
        [t.ticket_number, t.title, t.priority, t.status, t.source, _iso(t.created_at), _iso(t.resolved_at)]
        for t in data["tickets"]
    ]
    story.extend(
        [
            Paragraph("Issue ticket register", STYLES["h1"]),
            _summary_table(
                [
                    ("Total tickets", str(len(data["tickets"]))),
                    ("Open", str(sum(1 for t in data["tickets"] if t.status == "Open"))),
                    ("In Progress", str(sum(1 for t in data["tickets"] if t.status == "In Progress"))),
                    ("Resolved", str(sum(1 for t in data["tickets"] if t.status == "Resolved"))),
                    ("Critical unresolved", str(sum(1 for t in data["tickets"] if t.priority == "Critical" and t.status != "Resolved"))),
                ]
            ),
            Spacer(1, 4 * mm),
            _table(
                ["Ticket", "Title", "Priority", "Status", "Source", "Created", "Resolved"],
                rows or [["No issue tickets", "—", "—", "—", "—", "—", "—"]],
                [24 * mm, 53 * mm, 16 * mm, 18 * mm, 16 * mm, 27 * mm, 25 * mm],
            ),
            Paragraph(
                "Tickets are generated once per ongoing incident fingerprint. Duplicate suppression "
                "prevents repeated alerts for the same unresolved condition.",
                STYLES["note"],
            ),
        ]
    )


def _build_testing(story, data):
    results = data["test_results"]
    passed = sum(1 for r in results if r.status == "passed")
    failed = sum(1 for r in results if r.status == "failed")
    skipped = sum(1 for r in results if r.status == "skipped")
    run_id = results[0].run_id if results else "No run"
    story.extend(
        [
            Paragraph("Automated backend test results", STYLES["h1"]),
            _summary_table(
                [
                    ("Test runner", "pytest (backend API, services and database)"),
                    ("Latest run ID", run_id),
                    ("Tests passed", str(passed)),
                    ("Tests failed", str(failed)),
                    ("Tests skipped", str(skipped)),
                    ("Browser automation", "Playwright E2E suite is run with: cd frontend && npm run test:e2e"),
                ]
            ),
            Spacer(1, 4 * mm),
            _table(
                ["Suite", "Test", "Status", "Duration", "Details"],
                [
                    [r.suite, r.test_name, r.status, f"{r.duration_ms:.1f} ms", (r.details or "")[:240]]
                    for r in results
                ]
                or [["No test runs recorded", "—", "—", "—", "—"]],
                [28 * mm, 55 * mm, 20 * mm, 22 * mm, 70 * mm],
            ),
        ]
    )


def generate_pdf_report(db: Session, report_type: str, hours: int = 168) -> dict:
    if report_type not in REPORT_TITLES:
        raise ValueError("Unknown report type")
    data = _scope_data(db, hours)
    title = REPORT_TITLES[report_type]
    reports_dir = settings.reports_path
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"netpulse_{report_type}_{stamp}.pdf"
    path = reports_dir / filename
    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=title,
        author="NetPulse AI",
        subject="Wi-Fi network monitoring analytics",
    )
    story = [
        Paragraph(title, STYLES["title"]),
        Paragraph(
            f"Generated {_iso(datetime.now(timezone.utc))} · Reporting window: last {hours} hours · "
            "Scope: live network observations collected on this host",
            STYLES["subtitle"],
        ),
        Spacer(1, 3 * mm),
        Paragraph(
            "This report was generated from persisted local monitoring data. Simulated AP records are labelled. "
            "AI findings are statistical anomaly observations, not guaranteed forecasts of network failure.",
            STYLES["note"],
        ),
        Spacer(1, 3 * mm),
    ]
    if report_type == "executive":
        _build_executive(story, data, hours)
    elif report_type in {"uptime", "latency", "packet_loss"}:
        _build_measurement_report(story, data, "latency" if report_type == "latency" else "packet_loss")
    elif report_type == "access_points":
        _build_access_points(story, data)
    elif report_type == "anomalies":
        _build_anomalies(story, data)
    elif report_type == "issues":
        _build_issues(story, data)
    elif report_type == "testing":
        _build_testing(story, data)

    # Ensure the final story never ends in a dangling page break.
    while story and isinstance(story[-1], PageBreak):
        story.pop()
    doc.build(story, onFirstPage=_page_decorator(title), onLaterPages=_page_decorator(title))
    logger.info("Generated PDF report %s", path)
    return {
        "filename": filename,
        "title": title,
        "report_type": report_type,
        "size_bytes": path.stat().st_size,
        "generated_at": datetime.now(timezone.utc),
        "download_url": f"/api/reports/download/{filename}",
    }


def _report_type_from_filename(filename: str) -> str:
    """Resolve multi-word report types such as access_points and packet_loss."""
    for report_type in sorted(REPORT_TITLES, key=len, reverse=True):
        if filename.startswith(f"netpulse_{report_type}_"):
            return report_type
    return "executive"


def list_reports() -> list[dict]:
    reports = []
    for path in settings.reports_path.glob("netpulse_*.pdf"):
        report_type = _report_type_from_filename(path.name)
        generated = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        reports.append(
            {
                "filename": path.name,
                "title": REPORT_TITLES.get(report_type, "Network Report"),
                "report_type": report_type,
                "size_bytes": path.stat().st_size,
                "generated_at": generated,
                "download_url": f"/api/reports/download/{path.name}",
            }
        )
    return sorted(reports, key=lambda item: item["generated_at"], reverse=True)


def resolve_report_path(filename: str) -> Path:
    base = settings.reports_path.resolve()
    candidate = (base / Path(filename).name).resolve()
    if candidate.parent != base or candidate.suffix.lower() != ".pdf":
        raise ValueError("Invalid report path")
    return candidate
