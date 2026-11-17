"""Read-only detection of the Wi-Fi network the backend host is connected to.

This module never performs an active scan. It only reads the operating
system's current association (SSID, BSSID, signal, band, gateway) so the
dashboard can offer a live availability check against the local access point.
Private Wi-Fi addresses are only reachable when the backend runs on the same
network; a cloud deployment cannot use this endpoint to probe a home LAN.
"""

from __future__ import annotations

import logging
import platform
import re
import socket
import subprocess
from pathlib import Path
from typing import Any

import psutil

logger = logging.getLogger("netpulse.monitoring.wifi")

AIRPORT_BINARY = (
    "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport"
)
MACOS_WIFI_INTERFACE = "en0"


def _run(command: list[str], timeout: float = 6.0) -> str | None:
    """Run a read-only OS command, returning stdout or None when unavailable."""
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=timeout,
            shell=False,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None
    if completed.returncode != 0:
        return None
    return completed.stdout


def _fields(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        values[key.strip().lower()] = value.strip()
    return values


def _number(value: str | None, cast=float):
    if value is None:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    if not match:
        return None
    try:
        return cast(float(match.group(0)))
    except ValueError:
        return None


def _band_channel_from_frequency(frequency_mhz: int | None) -> tuple[str | None, int | None]:
    if frequency_mhz is None:
        return None, None
    if 2400 <= frequency_mhz < 2500:
        return "2.4 GHz", int(round((frequency_mhz - 2407) / 5))
    if 4900 <= frequency_mhz < 5925:
        return "5 GHz", int(round((frequency_mhz - 5000) / 5))
    if frequency_mhz >= 5925:
        return "6 GHz", int(round((frequency_mhz - 5950) / 5))
    return None, None


def _interface_ip(interface: str | None) -> str | None:
    if not interface:
        return None
    addresses = psutil.net_if_addrs()
    selected = addresses.get(interface)
    if selected is None:
        selected = next(
            (value for name, value in addresses.items() if name.lower() == interface.lower()),
            None,
        )
    if not selected:
        return None
    for address in selected:
        if address.family == socket.AF_INET and not address.address.startswith("169.254."):
            return address.address
    return None


def _parse_windows_interfaces(output: str) -> dict[str, Any] | None:
    """Parse `netsh wlan show interfaces` for the connected adapter."""
    blocks = re.split(r"\r?\n\s*\r?\n", output.strip())
    for block in blocks:
        fields = _fields(block)
        if not fields.get("name"):
            continue
        if fields.get("state", "").lower() != "connected":
            continue
        return {
            "interface": fields.get("name"),
            "adapter": fields.get("description"),
            "ssid": fields.get("ssid"),
            "bssid": fields.get("ap bssid") or fields.get("bssid"),
            "signal_percent": _number(fields.get("signal"), int),
            "rssi_dbm": _number(fields.get("rssi"), int),
            "band": fields.get("band"),
            "channel": _number(fields.get("channel"), int),
            "receive_rate_mbps": _number(fields.get("receive rate (mbps)")),
            "transmit_rate_mbps": _number(fields.get("transmit rate (mbps)")),
        }
    return None


def _parse_netsh_gateway(output: str) -> str | None:
    match = re.search(r"^\s*Default Gateway\s*:\s*(\S+)\s*$", output, re.MULTILINE)
    return match.group(1) if match else None


def _windows_wifi() -> dict[str, Any] | None:
    output = _run(["netsh", "wlan", "show", "interfaces"])
    if not output:
        return None
    info = _parse_windows_interfaces(output)
    if not info:
        return None
    gateway_output = _run(["netsh", "interface", "ip", "show", "config", f"name={info['interface']}"])
    info["gateway"] = _parse_netsh_gateway(gateway_output) if gateway_output else None
    info["ip_address"] = _interface_ip(info.get("interface"))
    return info


def _linux_wifi() -> dict[str, Any] | None:
    interfaces = psutil.net_if_addrs()
    interface = next(
        (
            name
            for name in interfaces
            if Path(f"/sys/class/net/{name}/wireless").exists()
            or Path(f"/sys/class/net/{name}/phy80211").exists()
        ),
        None,
    )
    if not interface:
        return None
    link = _run(["iw", "dev", interface, "link"])
    if not link or "not connected" in link.lower():
        return None
    ssid = (_run(["iwgetid", "-r", interface]) or "").strip() or None
    bssid_match = re.search(r"Connected to ([0-9a-f:]{17})", link, re.IGNORECASE)
    signal_match = re.search(r"signal:\s*(-?\d+)\s*dBm", link, re.IGNORECASE)
    frequency_match = re.search(r"freq:\s*(\d+)", link, re.IGNORECASE)
    frequency = _number(frequency_match.group(1), int) if frequency_match else None
    band, channel = _band_channel_from_frequency(frequency)
    route = _run(["ip", "route", "show", "default", "dev", interface])
    gateway_match = re.search(r"default via (\S+)", route or "")
    rssi = _number(signal_match.group(1), int) if signal_match else None
    return {
        "interface": interface,
        "adapter": None,
        "ssid": ssid,
        "bssid": bssid_match.group(1) if bssid_match else None,
        "signal_percent": max(0, min(100, 2 * (rssi + 100))) if rssi is not None else None,
        "rssi_dbm": rssi,
        "band": band,
        "channel": channel,
        "receive_rate_mbps": None,
        "transmit_rate_mbps": None,
        "gateway": gateway_match.group(1) if gateway_match else None,
        "ip_address": _interface_ip(interface),
    }


def _macos_wifi() -> dict[str, Any] | None:
    output = _run([AIRPORT_BINARY, "-I"])
    if not output:
        return None
    # macOS airport output uses "key: value" with leading whitespace.
    fields = _fields(output)
    ssid = fields.get("ssid")
    if not ssid:
        return None
    channel_value = fields.get("channel") or ""
    channel_match = re.match(r"(\d+)", channel_value)
    band_match = re.search(r"(\d+)GHz", channel_value)
    route = _run(["route", "-n", "get", "default"])
    gateway_match = re.search(r"gateway:\s*(\S+)", route or "")
    rssi = _number(fields.get("agrctlrssi"), int)
    return {
        "interface": MACOS_WIFI_INTERFACE,
        "adapter": None,
        "ssid": ssid,
        "bssid": fields.get("bssid"),
        "signal_percent": max(0, min(100, 2 * (rssi + 100))) if rssi is not None else None,
        "rssi_dbm": rssi,
        "band": f"{band_match.group(1)} GHz" if band_match else None,
        "channel": int(channel_match.group(1)) if channel_match else None,
        "receive_rate_mbps": None,
        "transmit_rate_mbps": None,
        "gateway": gateway_match.group(1) if gateway_match else None,
        "ip_address": _interface_ip(MACOS_WIFI_INTERFACE),
    }


def _base_payload() -> dict[str, Any]:
    return {
        "hostname": socket.gethostname(),
        "platform": f"{platform.system()} {platform.release()}",
    }


def connected_wifi() -> dict[str, Any]:
    """Return the backend host's current Wi-Fi association, if any."""
    system = platform.system().lower()
    try:
        if system == "windows":
            info = _windows_wifi()
        elif system == "linux":
            info = _linux_wifi()
        elif system == "darwin":
            info = _macos_wifi()
        else:
            info = None
    except Exception:  # defensive: metadata detection must never crash the API
        logger.exception("Wi-Fi detection failed")
        info = None

    if not info or not info.get("ssid"):
        return {
            **_base_payload(),
            "available": False,
            "reason": (
                "No connected Wi-Fi interface was detected on the backend host. "
                "Run the backend on the Wi-Fi-connected computer; the cloud deployment "
                "cannot reach private Wi-Fi addresses."
            ),
        }

    if not info.get("gateway"):
        return {
            **_base_payload(),
            "available": False,
            "reason": (
                "The connected Wi-Fi network was found, but its default gateway could not "
                "be determined, so a local availability check cannot be created."
            ),
            "ssid": info.get("ssid"),
            "bssid": info.get("bssid"),
            "interface": info.get("interface"),
        }

    return {
        **_base_payload(),
        "available": True,
        "reason": None,
        **info,
    }
