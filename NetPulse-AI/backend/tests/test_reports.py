"""PDF generation, listing and secure download tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.reports import REPORT_TITLES, resolve_report_path


def test_report_types_expose_all_eight_reports(client, admin_headers):
    response = client.get("/api/reports/types", headers=admin_headers)
    assert response.status_code == 200
    types = response.json()
    assert len(types) == 8
    assert {item["type"] for item in types} == set(REPORT_TITLES)


def test_generate_list_and_download_pdf(client, admin_headers):
    generated = client.post(
        "/api/reports/generate",
        headers=admin_headers,
        json={"report_type": "executive", "hours": 168},
    )
    assert generated.status_code == 200, generated.text
    report = generated.json()
    assert report["filename"].startswith("netpulse_executive_")
    assert report["filename"].endswith(".pdf")
    assert report["size_bytes"] > 800
    assert report["download_url"].startswith("/api/reports/download/")

    listing = client.get("/api/reports", headers=admin_headers)
    assert listing.status_code == 200
    listed = next(item for item in listing.json() if item["filename"] == report["filename"])
    assert listed["report_type"] == "executive"
    assert listed["title"] == REPORT_TITLES["executive"]

    download = client.get(report["download_url"], headers=admin_headers)
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/pdf"
    assert download.content[:5] == b"%PDF-"
    assert len(download.content) == report["size_bytes"]


def test_specialised_reports_generate_with_correct_listing_metadata(client, admin_headers):
    for report_type in ("anomalies", "testing", "access_points", "packet_loss"):
        response = client.post(
            "/api/reports/generate",
            headers=admin_headers,
            json={"report_type": report_type, "hours": 24},
        )
        assert response.status_code == 200, response.text
        report = response.json()
        assert report["report_type"] == report_type

        listing = client.get("/api/reports", headers=admin_headers)
        assert listing.status_code == 200
        listed = next(item for item in listing.json() if item["filename"] == report["filename"])
        assert listed["report_type"] == report_type
        assert listed["title"] == REPORT_TITLES[report_type]


def test_invalid_report_requests_are_rejected(client, admin_headers):
    bad_type = client.post(
        "/api/reports/generate",
        headers=admin_headers,
        json={"report_type": "unknown", "hours": 24},
    )
    assert bad_type.status_code == 422

    bad_hours = client.post(
        "/api/reports/generate",
        headers=admin_headers,
        json={"report_type": "executive", "hours": 0},
    )
    assert bad_hours.status_code == 422


def test_missing_report_returns_404(client, admin_headers):
    response = client.get(
        "/api/reports/download/netpulse_missing_20990101_000000.pdf",
        headers=admin_headers,
    )
    assert response.status_code == 404


def test_report_path_traversal_is_blocked(tmp_path):
    with pytest.raises(ValueError):
        resolve_report_path("../../etc/passwd")
    with pytest.raises(ValueError):
        resolve_report_path("not-a-pdf.txt")

    # Windows backslashes are reduced to a basename, so a traversal attempt can
    # never escape the reports directory.
    resolved = resolve_report_path("..\\..\\secret.pdf")
    assert resolved.parent == resolve_report_path("safe.pdf").parent
    assert resolved.name == "secret.pdf"


def test_reports_require_authentication(client):
    assert client.get("/api/reports").status_code == 401
    assert client.get("/api/reports/types").status_code == 401
