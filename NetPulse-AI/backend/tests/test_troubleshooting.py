"""Rule-based troubleshooting recommendations and safety guarantees."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.models import AccessPoint


def test_simulated_access_point_cannot_be_diagnosed_as_real(client, admin_headers):
    aps = client.get("/api/access-points", headers=admin_headers).json()
    simulated = next(ap for ap in aps if ap["is_simulated"])
    response = client.post(
        "/api/troubleshooting/run",
        headers=admin_headers,
        json={"access_point_id": simulated["id"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["issue_type"] == "simulated_access_point"
    assert body["severity"] == "Low"
    assert "cannot diagnose" in body["detected_issue"]
    assert "never changes router" in body["safety_note"]
    assert len(body["recommended_steps"]) >= 3


def test_rules_escalate_latency_loss_and_outage(client, admin_headers, db):
    ap = AccessPoint(
        name=f"Troubleshooting AP {uuid.uuid4().hex[:6]}",
        location="Diagnostics Lab",
        ip_address="198.51.100.240",
        is_simulated=False,
        status="online",
    )
    db.add(ap)
    db.commit()
    db.refresh(ap)
    now = datetime.now(timezone.utc)

    from app.models import NetworkMeasurement

    healthy = NetworkMeasurement(
        access_point_id=ap.id,
        latency_ms=24.0,
        packet_loss_pct=0.0,
        jitter_ms=2.0,
        is_online=True,
        probe_target=ap.ip_address,
        data_origin="live",
        recorded_at=now - timedelta(minutes=3),
    )
    db.add(healthy)
    db.commit()

    normal = client.post(
        "/api/troubleshooting/run",
        headers=admin_headers,
        json={"access_point_id": ap.id},
    )
    assert normal.status_code == 200
    assert normal.json()["issue_type"] == "no_issue_detected"

    high_latency = NetworkMeasurement(
        access_point_id=ap.id,
        latency_ms=345.0,
        packet_loss_pct=0.0,
        jitter_ms=18.0,
        is_online=True,
        probe_target=ap.ip_address,
        data_origin="live",
        recorded_at=now - timedelta(minutes=2),
    )
    db.add(high_latency)
    db.commit()

    latency = client.post(
        "/api/troubleshooting/run",
        headers=admin_headers,
        json={"access_point_id": ap.id},
    )
    assert latency.status_code == 200
    assert latency.json()["issue_type"] == "high_latency"
    assert latency.json()["severity"] == "Critical"
    assert "latency" in latency.json()["detected_issue"].lower()

    outage = NetworkMeasurement(
        access_point_id=ap.id,
        latency_ms=None,
        packet_loss_pct=100.0,
        jitter_ms=None,
        is_online=False,
        probe_target=ap.ip_address,
        data_origin="live",
        error_message="No replies",
        recorded_at=now,
    )
    db.add(outage)
    db.commit()
    ap.status = "offline"
    db.commit()

    unavailable = client.post(
        "/api/troubleshooting/run",
        headers=admin_headers,
        json={"access_point_id": ap.id},
    )
    assert unavailable.status_code == 200
    assert unavailable.json()["issue_type"] == "ap_unavailable"
    assert unavailable.json()["severity"] == "High"


def test_recommendation_list_and_latest(client, admin_headers):
    listing = client.get("/api/troubleshooting", headers=admin_headers)
    assert listing.status_code == 200
    assert isinstance(listing.json(), list)
    latest = client.get("/api/troubleshooting/latest", headers=admin_headers)
    assert latest.status_code == 200


def test_invalid_access_point_and_rbac(client, accounts):
    client.post(
        "/api/troubleshooting/run",
        headers=accounts["analyst"]["headers"],
        json={"access_point_id": 999999},
    )
    assert (
        client.post(
            "/api/troubleshooting/run",
            headers=accounts["analyst"]["headers"],
            json={"access_point_id": 999999},
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/troubleshooting/run",
            headers=accounts["viewer"]["headers"],
            json={},
        ).status_code
        == 403
    )
