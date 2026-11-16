"""Read-only ARP parsing, device approval and privacy tests."""

from __future__ import annotations

import ipaddress
import uuid
from datetime import datetime, timezone

from app.models import Device, DeviceActivity
from app.monitoring.devices import parse_arp_output


def test_arp_parser_filters_scope_and_duplicates():
    output = """
Interface: 192.168.244.20 --- 0x5
  Internet Address      Physical Address      Type
  192.168.244.21        aa-bb-cc-11-22-33     dynamic
  192.168.244.21        aa-bb-cc-11-22-33     dynamic
  192.168.244.37        aa-bb-cc-55-66-77     dynamic
  192.168.244.255       ff-ff-ff-ff-ff-ff     static
  10.9.9.5              aa-bb-cc-99-88-77     dynamic
  127.0.0.1             00-00-00-00-00-00     static
"""
    entries = parse_arp_output(
        output, [ipaddress.ip_network("192.168.244.0/24")]
    )
    assert len(entries) == 2
    addresses = {item["ip_address"] for item in entries}
    assert addresses == {"192.168.244.21", "192.168.244.37"}
    assert all(":" in item["mac"] for item in entries)


def test_device_list_exposes_privacy_note(client, admin_headers):
    response = client.get("/api/devices", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert {"devices", "summary", "privacy_note"} <= set(body)
    assert "No active scans" in body["privacy_note"]
    assert "approved" in body["summary"]
    assert "unrecognized" in body["summary"]


def test_device_update_approval_and_activity(client, admin_headers, db):
    device = Device(
        identifier_hash=uuid.uuid4().hex + uuid.uuid4().hex,
        ip_address="192.168.244.88",
        mac_masked="**:**:**:**:22:88",
        is_approved=False,
        is_active=True,
        first_seen_at=datetime.now(timezone.utc),
        last_seen_at=datetime.now(timezone.utc),
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    db.add(
        DeviceActivity(
            device_id=device.id,
            ip_address=device.ip_address,
            seen_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    updated = client.patch(
        f"/api/devices/{device.id}",
        headers=admin_headers,
        json={"display_name": "Meeting room TV", "notes": "Approved test device"},
    )
    assert updated.status_code == 200
    assert updated.json()["display_name"] == "Meeting room TV"
    assert updated.json()["is_approved"] is False

    approved = client.post(
        f"/api/devices/{device.id}/approve", headers=admin_headers
    )
    assert approved.status_code == 200
    assert approved.json()["is_approved"] is True

    activity = client.get(
        f"/api/devices/{device.id}/activity", headers=admin_headers
    )
    assert activity.status_code == 200
    assert activity.json()["device"]["is_approved"] is True
    assert len(activity.json()["activities"]) == 1


def test_discovery_is_mocked_and_duplicates_are_suppressed(
    client, accounts, monkeypatch
):
    monkeypatch.setattr(
        "app.monitoring.devices.local_subnets",
        lambda: [ipaddress.ip_network("192.168.250.0/24")],
    )
    monkeypatch.setattr(
        "app.monitoring.devices.read_arp_cache",
        lambda networks: [
            {"ip_address": "192.168.250.41", "mac": "aa:bb:cc:dd:ee:41"},
            {"ip_address": "192.168.250.42", "mac": "aa:bb:cc:dd:ee:42"},
        ],
    )

    first = client.post(
        "/api/devices/discover", headers=accounts["analyst"]["headers"]
    )
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["discovered"] == 2
    assert body["new_devices"] == 2
    assert body["method"].startswith("Windows")
    assert all(device["mac_masked"] for device in body["devices"])
    assert all(device["is_approved"] is False for device in body["devices"])
    assert "await administrator approval" in body["message"]

    second = client.post(
        "/api/devices/discover", headers=accounts["analyst"]["headers"]
    )
    assert second.status_code == 200
    assert second.json()["new_devices"] == 0
    assert second.json()["duplicates_ignored"] == 2


def test_viewer_cannot_discover_or_approve(client, accounts, db):
    response = client.post(
        "/api/devices/discover", headers=accounts["viewer"]["headers"]
    )
    assert response.status_code == 403
    assert client.get("/api/devices/999999/activity", headers=accounts["viewer"]["headers"]).status_code == 404


def test_device_filtering_by_approval(client, accounts, db):
    approved = client.get(
        "/api/devices?approval=approved", headers=accounts["viewer"]["headers"]
    )
    assert approved.status_code == 200
    assert all(device["is_approved"] for device in approved.json()["devices"])

    unrecognized = client.get(
        "/api/devices?approval=unrecognized", headers=accounts["viewer"]["headers"]
    )
    assert unrecognized.status_code == 200
    assert all(not device["is_approved"] for device in unrecognized.json()["devices"])
