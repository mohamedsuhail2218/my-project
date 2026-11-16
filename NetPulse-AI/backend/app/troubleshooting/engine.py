"""Explainable rule-based troubleshooting engine.

The engine only recommends diagnostic actions. It never changes router, switch,
firewall or access-point configuration, and no automated remediation is run.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AccessPoint,
    IssueTicket,
    NetworkMeasurement,
    TroubleshootingRecommendation,
)
from app.services.settings import get_setting

SAFETY_NOTE = (
    "Diagnostic guidance only. NetPulse AI never changes router or access-point "
    "configuration automatically. Confirm authorization before checking any network device."
)


def _related_tickets(db: Session, issue_type: str) -> list[int]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = db.scalars(
        select(IssueTicket)
        .where(
            IssueTicket.issue_type == issue_type,
            IssueTicket.created_at >= cutoff,
        )
        .order_by(IssueTicket.created_at.desc())
        .limit(5)
    ).all()
    return [row.id for row in rows]


def _make_recommendation(
    db: Session,
    *,
    issue_type: str,
    severity: str,
    issue: str,
    causes: list[str],
    steps: list[str],
    measurement_id: int | None = None,
    access_point_id: int | None = None,
) -> TroubleshootingRecommendation:
    recommendation = TroubleshootingRecommendation(
        measurement_id=measurement_id,
        access_point_id=access_point_id,
        issue_type=issue_type,
        severity=severity,
        detected_issue=issue,
        possible_causes=causes,
        recommended_steps=steps,
        related_incident_ids=_related_tickets(db, issue_type),
        safety_note=SAFETY_NOTE,
        generated_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(recommendation)
    db.commit()
    db.refresh(recommendation)
    return recommendation


def generate_recommendation(
    db: Session, access_point_id: int | None = None
) -> TroubleshootingRecommendation:
    ap = db.get(AccessPoint, access_point_id) if access_point_id else None

    if ap and ap.is_simulated:
        return _make_recommendation(
            db,
            issue_type="simulated_access_point",
            severity="Low",
            issue=(
                f"{ap.name} is a simulated access point. NetPulse AI cannot diagnose "
                "a real device from a simulation record."
            ),
            causes=[
                "The access point was registered as a demonstration/simulated record.",
                "No authorized management interface is configured for this IP address.",
            ],
            steps=[
                "Add a real access point with its authorized management IP address.",
                "Ensure the device is on a network you own or administer.",
                "Use Check Now on the real record to collect availability measurements.",
            ],
            access_point_id=ap.id,
        )

    query = select(NetworkMeasurement).where(NetworkMeasurement.data_origin == "live")
    if ap:
        query = query.where(NetworkMeasurement.access_point_id == ap.id)
    latest = db.scalar(query.order_by(NetworkMeasurement.recorded_at.desc()).limit(1))

    if latest is None:
        return _make_recommendation(
            db,
            issue_type="insufficient_data",
            severity="Low",
            issue="No live measurement is available for this scope.",
            causes=[
                "Network monitoring has not run since the application started.",
                "The selected access point has not been checked yet.",
            ],
            steps=[
                "Open Network Monitoring and select Run Live Check.",
                "If diagnosing an access point, select Check Now on that AP.",
                "Ensure the Windows host has permission to use ICMP echo requests.",
            ],
            access_point_id=ap.id if ap else None,
        )

    latency_threshold = float(get_setting(db, "latency_threshold_ms", 150))
    loss_threshold = float(get_setting(db, "packet_loss_threshold_pct", 5))
    scope = f" for {ap.name}" if ap else ""

    if ap and ap.status == "offline":
        return _make_recommendation(
            db,
            issue_type="ap_unavailable",
            severity="High",
            issue=f"{ap.name} ({ap.ip_address}) is not responding to availability probes{scope}.",
            causes=[
                "The access point may be powered off or rebooting.",
                "The management network or VLAN route may be unavailable.",
                "An IP address change or firewall rule may be blocking ICMP.",
                "The device may be isolated by a switching or PoE fault.",
            ],
            steps=[
                "Do not change configuration automatically; confirm the device is in your authorized scope.",
                "Verify the access point has power and check PoE/switch port status.",
                "Confirm the management IP address is still correct.",
                "Check the local gateway and authorized management network connectivity.",
                "Inspect the AP management console if authorized, then run Check Now again.",
            ],
            measurement_id=latest.id,
            access_point_id=ap.id,
        )

    if not latest.is_online:
        return _make_recommendation(
            db,
            issue_type="connectivity_down",
            severity="Critical",
            issue=(
                f"The latest live probe to {latest.probe_target} received no replies "
                f"(100% loss) at {latest.recorded_at.isoformat()}."
            ),
            causes=[
                "The host may be disconnected from the local Wi-Fi or Ethernet network.",
                "The default gateway or upstream internet provider may be unavailable.",
                "A local firewall, captive portal or VPN may block ICMP traffic.",
                "DNS/ICMP may be blocked while web traffic still works.",
            ],
            steps=[
                "Check the Windows network adapter and confirm it has an IP address.",
                "Ping the local default gateway to separate LAN and internet failures.",
                "Open a browser and use the separately labelled TCP fallback check if ICMP is blocked.",
                "If other users are affected, contact the authorized network administrator or ISP.",
                "Do not attempt to reconfigure infrastructure without authorization.",
            ],
            measurement_id=latest.id,
        )

    if latest.packet_loss_pct >= loss_threshold:
        return _make_recommendation(
            db,
            issue_type="packet_loss",
            severity="High" if latest.packet_loss_pct < 20 else "Critical",
            issue=(
                f"The latest probe recorded {latest.packet_loss_pct:.1f}% packet loss. "
                f"The configured threshold is {loss_threshold:.1f}%."
            ),
            causes=[
                "Weak Wi-Fi signal, interference, or excessive distance from the AP.",
                "Network congestion or an oversubscribed uplink.",
                "Cabling, switch port, or wireless retransmission problems.",
                "Local interference from other 2.4/5 GHz devices.",
            ],
            steps=[
                "Compare the result with the access point and interface statistics.",
                "Test from a wired connection where possible to isolate the wireless link.",
                "Check whether latency and loss rise together during known busy periods.",
                "Ask the authorized network administrator to inspect AP channel utilization and switch errors.",
                "Repeat Run Live Check to confirm the loss is sustained rather than transient.",
            ],
            measurement_id=latest.id,
            access_point_id=ap.id if ap else None,
        )

    if latest.latency_ms is not None and latest.latency_ms >= latency_threshold:
        return _make_recommendation(
            db,
            issue_type="high_latency",
            severity="High" if latest.latency_ms < latency_threshold * 2 else "Critical",
            issue=(
                f"The latest probe measured {latest.latency_ms:.1f} ms average latency. "
                f"The configured threshold is {latency_threshold:.1f} ms."
            ),
            causes=[
                "Network congestion on the wireless link or upstream path.",
                "Wi-Fi interference, low signal, or roaming between access points.",
                "An overloaded gateway, VPN, or bandwidth-heavy application.",
                "A distant probe destination or upstream routing path.",
            ],
            steps=[
                "Compare latency to the local gateway and to the probe target.",
                "Review the live latency chart for a sustained or repeating pattern.",
                "Pause large downloads/backups and repeat Run Live Check.",
                "Move closer to a known authorized access point and observe the change.",
                "Escalate to the network administrator if latency remains above threshold.",
            ],
            measurement_id=latest.id,
            access_point_id=ap.id if ap else None,
        )

    return _make_recommendation(
        db,
        issue_type="no_issue_detected",
        severity="Low",
        issue=(
            f"Live measurements are currently within configured thresholds"
            f"{scope}. Latest latency: {latest.latency_ms} ms; loss: {latest.packet_loss_pct:.1f}%."
        ),
        causes=["No current fault is indicated by the rule-based diagnostic checks."],
        steps=[
            "Continue periodic monitoring to establish a baseline.",
            "Review AI anomaly events for unusual patterns that fixed thresholds may miss.",
            "Re-run diagnosis if users report an issue not yet visible in the latest sample.",
        ],
        measurement_id=latest.id,
        access_point_id=ap.id if ap else None,
    )


def recent_recommendations(db: Session, limit: int = 30) -> list[TroubleshootingRecommendation]:
    return list(
        db.scalars(
            select(TroubleshootingRecommendation)
            .order_by(TroubleshootingRecommendation.generated_at.desc())
            .limit(limit)
        )
    )
