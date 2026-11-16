"""Issue ticket lifecycle, comments and duplicate suppression."""

from __future__ import annotations

from app.models import AnomalyEvent, IssueTicket
from app.services.ticketing import create_ticket, evaluate_anomaly_ticket


def test_manual_ticket_lifecycle(client, accounts, admin_headers):
    analyst = accounts["analyst"]["headers"]
    created = client.post(
        "/api/tickets",
        headers=analyst,
        json={
            "title": "Projector Wi-Fi drops during lectures",
            "description": "Users report repeated disconnects in Room 204.",
            "priority": "High",
            "issue_type": "manual",
        },
    )
    assert created.status_code == 201, created.text
    ticket = created.json()
    assert ticket["ticket_number"].startswith("NP-")
    assert ticket["status"] == "Open"
    assert ticket["source"] == "manual"
    assert ticket["priority"] == "High"
    ticket_id = ticket["id"]

    detail = client.get(f"/api/tickets/{ticket_id}", headers=admin_headers)
    assert detail.status_code == 200
    assert detail.json()["title"] == "Projector Wi-Fi drops during lectures"

    comment = client.post(
        f"/api/tickets/{ticket_id}/comments",
        headers=analyst,
        json={"comment": "Confirmed with the lab technician."},
    )
    assert comment.status_code == 201
    assert comment.json()["author_name"] == "Test Analyst"

    progress = client.patch(
        f"/api/tickets/{ticket_id}", headers=analyst, json={"status": "In Progress"}
    )
    assert progress.status_code == 200
    assert progress.json()["status"] == "In Progress"
    assert progress.json()["resolved_at"] is None

    resolved = client.patch(
        f"/api/tickets/{ticket_id}",
        headers=analyst,
        json={"status": "Resolved", "priority": "Medium"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "Resolved"
    assert resolved.json()["resolved_at"] is not None
    assert len(resolved.json()["comments"]) == 1


def test_ticket_list_filters_and_stats(client, admin_headers, accounts):
    created = client.post(
        "/api/tickets",
        headers=accounts["analyst"]["headers"],
        json={
            "title": "Unique filter test issue",
            "description": "Searchable description for the filter test.",
            "priority": "Critical",
            "issue_type": "manual",
        },
    )
    assert created.status_code == 201

    search = client.get(
        "/api/tickets?search=Unique filter test", headers=admin_headers
    )
    assert search.status_code == 200
    assert search.json()["tickets"]
    stats = client.get("/api/tickets/stats", headers=admin_headers)
    assert stats.status_code == 200
    body = stats.json()
    assert {"open", "in_progress", "resolved", "critical", "total"} == set(body)
    assert body["total"] >= 1
    assert body["critical"] >= 1

    invalid = client.get("/api/tickets?status=Broken", headers=admin_headers)
    assert invalid.status_code == 422


def test_duplicate_suppression_and_resolution_reopens_fingerprint(db):
    fingerprint = "automated-test:duplicate"
    first, created_first = create_ticket(
        db,
        title="Repeated latency incident",
        description="First occurrence",
        priority="High",
        issue_type="high_latency",
        fingerprint=fingerprint,
    )
    assert created_first is True
    second, created_second = create_ticket(
        db,
        title="Repeated latency incident",
        description="Second occurrence",
        priority="High",
        issue_type="high_latency",
        fingerprint=fingerprint,
    )
    assert created_second is False
    assert second.id == first.id

    first.status = "Resolved"
    db.commit()

    third, created_third = create_ticket(
        db,
        title="Repeated latency incident",
        description="New occurrence after resolution",
        priority="High",
        issue_type="high_latency",
        fingerprint=fingerprint,
    )
    assert created_third is True
    assert third.id != first.id


def test_automatic_ticket_policy_ignores_low_anomaly(db, make_measurement):
    measurement = make_measurement(latency_ms=44.0)
    event = AnomalyEvent(
        measurement_id=measurement.id,
        anomaly_score=0.51,
        severity="Low",
        explanation="Small outlier",
        features={"latency_ms": 44.0},
        model_version="test",
        used_sample_baseline=False,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    assert evaluate_anomaly_ticket(db, event) is None


def test_ticket_validation_and_permissions(client, accounts, admin_headers):
    invalid = client.post(
        "/api/tickets",
        headers=accounts["analyst"]["headers"],
        json={"title": "x", "description": "", "priority": "Urgent"},
    )
    assert invalid.status_code == 422

    create = client.post(
        "/api/tickets",
        headers=accounts["viewer"]["headers"],
        json={
            "title": "Viewer attempt",
            "description": "Viewers must not create tickets.",
            "priority": "Low",
        },
    )
    assert create.status_code == 403

    assert (
        client.get("/api/tickets/999999", headers=admin_headers).status_code == 404
    )
