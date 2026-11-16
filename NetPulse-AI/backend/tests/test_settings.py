"""Runtime settings, validation, RBAC and system status tests."""

from __future__ import annotations


def test_get_settings_contract(client, admin_headers):
    response = client.get("/api/settings", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert {
        "latency_threshold_ms",
        "packet_loss_threshold_pct",
        "monitoring_interval_seconds",
        "monitor_target",
        "auto_tickets_enabled",
        "auto_anomaly_detection",
        "device_discovery_enabled",
        "theme_default",
        "organization_name",
    } == set(body)
    assert body["monitor_target"]
    assert body["monitoring_interval_seconds"] >= 15


def test_admin_can_update_and_restore_settings(client, admin_headers):
    original = client.get("/api/settings", headers=admin_headers).json()
    updated = client.patch(
        "/api/settings",
        headers=admin_headers,
        json={
            "latency_threshold_ms": 210.5,
            "packet_loss_threshold_pct": 4.5,
            "auto_tickets_enabled": False,
            "auto_anomaly_detection": False,
            "theme_default": "light",
            "organization_name": "NetPulse Test College",
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["latency_threshold_ms"] == 210.5
    assert body["packet_loss_threshold_pct"] == 4.5
    assert body["auto_tickets_enabled"] is False
    assert body["auto_anomaly_detection"] is False
    assert body["theme_default"] == "light"
    assert body["organization_name"] == "NetPulse Test College"

    restored = client.patch(
        "/api/settings",
        headers=admin_headers,
        json={
            "latency_threshold_ms": original["latency_threshold_ms"],
            "packet_loss_threshold_pct": original["packet_loss_threshold_pct"],
            "auto_tickets_enabled": original["auto_tickets_enabled"],
            "auto_anomaly_detection": original["auto_anomaly_detection"],
            "theme_default": original["theme_default"],
            "organization_name": original["organization_name"],
        },
    )
    assert restored.status_code == 200


def test_invalid_settings_are_rejected(client, admin_headers):
    assert (
        client.patch(
            "/api/settings",
            headers=admin_headers,
            json={"latency_threshold_ms": 0},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            "/api/settings",
            headers=admin_headers,
            json={"packet_loss_threshold_pct": 101},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            "/api/settings",
            headers=admin_headers,
            json={"theme_default": "neon"},
        ).status_code
        == 422
    )


def test_analyst_cannot_change_settings(client, accounts):
    response = client.patch(
        "/api/settings",
        headers=accounts["analyst"]["headers"],
        json={"organization_name": "No permission"},
    )
    assert response.status_code == 403


def test_system_status_reports_runtime_and_safety(client, admin_headers):
    response = client.get("/api/settings/system", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["environment"] == "testing"
    assert body["monitoring_enabled"] is False
    assert body["test_runner_enabled"] is False
    assert "never scans external networks" in body["safety"]
    assert body["time_utc"]
