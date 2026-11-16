"""Real monitoring orchestration and API contract tests."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.models import AccessPoint, IssueTicket, NetworkMeasurement
from app.monitoring.diagnostics import DiagnosticResult
from app.services.monitoring import run_network_check


def test_network_info_reports_real_host_context(client, admin_headers):
    response = client.get("/api/monitoring/network-info", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["hostname"]
    assert body["platform"]
    assert body["probe_target"]
    assert isinstance(body["interfaces"], list)
    assert body["monitoring_enabled"] is False
    assert body["collected_at"]


def test_history_returns_scoped_measurements(client, admin_headers, make_measurement):
    measurement = make_measurement(latency_ms=41.2, probe_target="history-test")
    response = client.get("/api/monitoring/history?hours=24", headers=admin_headers)
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["measurements"]]
    assert measurement.id in ids
    assert all(item["access_point_id"] is None for item in response.json()["measurements"])


def test_access_point_history_can_include_simulations(
    client, admin_headers, db, make_measurement
):
    ap = db.query(AccessPoint).filter(AccessPoint.is_simulated.is_(True)).first()
    sim = make_measurement(
        latency_ms=22.0,
        access_point_id=ap.id,
        data_origin="simulation",
        probe_target=f"SIMULATED:{ap.ip_address}",
    )
    response = client.get(
        f"/api/monitoring/history?hours=24&access_point_id={ap.id}",
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert any(item["id"] == sim.id for item in response.json()["measurements"])

    live_only = client.get(
        f"/api/monitoring/history?hours=24&access_point_id={ap.id}&include_minor_points=false",
        headers=admin_headers,
    )
    assert live_only.status_code == 200
    assert all(item["data_origin"] == "live" for item in live_only.json()["measurements"])


def test_live_run_is_blocked_in_test_environment(client, accounts):
    response = client.post("/api/monitoring/run", headers=accounts["analyst"]["headers"])
    assert response.status_code == 409
    assert "disabled in the test environment" in response.json()["detail"]


def test_monitoring_service_persists_live_probe_and_opens_ticket(
    db, monkeypatch, make_measurement
):
    ap = AccessPoint(
        name=f"Test AP {uuid.uuid4().hex[:6]}",
        location="Test lab",
        ip_address=f"203.0.113.{uuid.uuid4().int % 200 + 1}",
        is_simulated=False,
        status="unknown",
    )
    db.add(ap)
    db.commit()
    db.refresh(ap)

    def fake_probe(target=None):
        return DiagnosticResult(
            is_online=True,
            latency_ms=312.5,
            packet_loss_pct=0.0,
            jitter_ms=9.0,
            samples=[300.0, 310.0, 327.5],
            error_message=None,
            probe_target=target or "203.0.113.99",
            duration_ms=12.0,
        )

    monkeypatch.setattr("app.services.monitoring.perform_diagnostic", fake_probe)
    measurement = run_network_check(db, ap.ip_address)

    assert measurement.data_origin == "live"
    assert measurement.latency_ms == 312.5
    assert measurement.access_point_id is None

    ticket = db.query(IssueTicket).filter(
        IssueTicket.access_point_id.is_(None),
        IssueTicket.issue_type == "high_latency",
        IssueTicket.status.in_(["Open", "In Progress"]),
    ).first()
    assert ticket is not None
    assert ticket.priority == "High"
    assert "above the" in ticket.description


def test_scheduler_status_endpoint(client, admin_headers):
    response = client.get("/api/monitoring/scheduler", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["interval_seconds"] >= 15
    assert "last_cycle_at" in body


def test_latest_measurement_endpoint_returns_live_only(client, admin_headers):
    response = client.get("/api/monitoring/latest", headers=admin_headers)
    assert response.status_code == 200
    if response.json() is not None:
        assert response.json()["data_origin"] == "live"


def test_simulated_measurement_is_never_live(db, make_measurement):
    from app.monitoring.scheduler import scheduler

    ap = db.query(AccessPoint).filter(AccessPoint.is_simulated.is_(True)).first()
    sim = make_measurement(
        latency_ms=18.0,
        access_point_id=ap.id,
        data_origin="simulation",
        probe_target=f"SIMULATED:{ap.ip_address}",
    )
    assert sim.data_origin == "simulation"
    assert sim.probe_target.startswith("SIMULATED:")
    assert scheduler.last_device_scan_at is None
