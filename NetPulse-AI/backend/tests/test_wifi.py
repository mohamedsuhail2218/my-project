"""Read-only Wi-Fi association detector parsing and API contract tests."""

from __future__ import annotations

from app.monitoring import wifi


WINDOWS_OUTPUT = """
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6E AX211 160MHz
    GUID                   : 237c608c-6792-49eb-aee8-cfb9288299f3
    Physical address       : dc:97:ba:65:71:e2
    Interface type         : Primary
    State                  : connected
    SSID                   : vivo V27
    AP BSSID               : 16:ea:86:4f:34:59
    Band                   : 2.4 GHz
    Channel                : 13
    Receive rate (Mbps)    : 156
    Transmit rate (Mbps)   : 144.4
    Signal                 : 83%
    Rssi                   : -57

    Name                   : Ethernet 2
    Description            : Virtual Adapter
    State                  : disconnected
"""

WINDOWS_CONFIG = """
Configuration for interface "Wi-Fi"
    DHCP enabled:                         Yes
    IP Address:                           10.239.39.229
    Subnet Prefix:                        10.239.39.0/24 (mask 255.255.255.0)
    Default Gateway:                      10.239.39.128
    Gateway Metric:                       0
"""


def test_parse_windows_interfaces_reads_connected_adapter_only():
    info = wifi._parse_windows_interfaces(WINDOWS_OUTPUT)

    assert info is not None
    assert info["interface"] == "Wi-Fi"
    assert info["ssid"] == "vivo V27"
    assert info["bssid"] == "16:ea:86:4f:34:59"
    assert info["signal_percent"] == 83
    assert info["rssi_dbm"] == -57
    assert info["band"] == "2.4 GHz"
    assert info["channel"] == 13
    assert info["receive_rate_mbps"] == 156.0
    assert info["transmit_rate_mbps"] == 144.4


def test_parse_windows_interfaces_returns_none_without_association():
    disconnected = """
    Name                   : Ethernet 2
    Description            : Virtual Adapter
    State                  : disconnected
"""
    assert wifi._parse_windows_interfaces(disconnected) is None
    assert wifi._parse_windows_interfaces("") is None


def test_parse_netsh_gateway():
    assert wifi._parse_netsh_gateway(WINDOWS_CONFIG) == "10.239.39.128"
    assert wifi._parse_netsh_gateway("Default Gateway:  \n") is None


def test_band_and_channel_from_frequency():
    assert wifi._band_channel_from_frequency(2412) == ("2.4 GHz", 1)
    assert wifi._band_channel_from_frequency(2437) == ("2.4 GHz", 6)
    assert wifi._band_channel_from_frequency(5180) == ("5 GHz", 36)
    assert wifi._band_channel_from_frequency(5955) == ("6 GHz", 1)
    assert wifi._band_channel_from_frequency(None) == (None, None)
    assert wifi._band_channel_from_frequency(900) == (None, None)


def test_connected_wifi_returns_unavailable_payload(monkeypatch):
    monkeypatch.setattr(wifi.platform, "system", lambda: "Windows")
    monkeypatch.setattr(wifi, "_windows_wifi", lambda: None)

    payload = wifi.connected_wifi()

    assert payload["available"] is False
    assert payload["hostname"]
    assert payload["platform"]
    assert "No connected Wi-Fi" in payload["reason"]
    assert "ssid" not in payload


def test_connected_wifi_reports_association_and_gateway(monkeypatch):
    monkeypatch.setattr(wifi.platform, "system", lambda: "Windows")
    monkeypatch.setattr(
        wifi,
        "_windows_wifi",
        lambda: {
            "interface": "Wi-Fi",
            "adapter": "Intel(R) Wi-Fi 6E AX211 160MHz",
            "ssid": "vivo V27",
            "bssid": "16:ea:86:4f:34:59",
            "signal_percent": 83,
            "rssi_dbm": -57,
            "band": "2.4 GHz",
            "channel": 13,
            "receive_rate_mbps": 156.0,
            "transmit_rate_mbps": 144.4,
            "gateway": "10.239.39.128",
            "ip_address": "10.239.39.229",
        },
    )

    payload = wifi.connected_wifi()

    assert payload["available"] is True
    assert payload["reason"] is None
    assert payload["ssid"] == "vivo V27"
    assert payload["gateway"] == "10.239.39.128"


def test_connected_wifi_explains_missing_gateway(monkeypatch):
    monkeypatch.setattr(wifi.platform, "system", lambda: "Windows")
    monkeypatch.setattr(
        wifi,
        "_windows_wifi",
        lambda: {"interface": "Wi-Fi", "ssid": "vivo V27", "gateway": None},
    )

    payload = wifi.connected_wifi()

    assert payload["available"] is False
    assert "default gateway" in payload["reason"]
    assert payload["ssid"] == "vivo V27"


def test_wifi_endpoint_requires_authentication(client):
    assert client.get("/api/monitoring/wifi").status_code == 401


def test_wifi_endpoint_returns_detector_payload(client, admin_headers, monkeypatch):
    monkeypatch.setattr(
        "app.api.monitoring.connected_wifi",
        lambda: {
            "hostname": "monitor-host",
            "platform": "Windows 11",
            "available": False,
            "reason": "Run the backend on the Wi-Fi-connected computer.",
        },
    )

    response = client.get("/api/monitoring/wifi", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["available"] is False
    assert "Wi-Fi-connected" in response.json()["reason"]
