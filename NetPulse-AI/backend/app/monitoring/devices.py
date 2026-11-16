"""Read-only local device discovery from the OS ARP cache.

NetPulse AI deliberately does not run port scans, packet captures, or active
subnet sweeps. Discovery only reflects neighbours the operating system has
already observed on an interface subnet. MAC addresses are hashed for identity
and masked before storage.
"""

from __future__ import annotations

import hashlib
import ipaddress
import logging
import platform
import re
import socket
import subprocess
from datetime import datetime, timezone

import psutil
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Device, DeviceActivity

logger = logging.getLogger("netpulse.devices")
MAC_LINE = re.compile(
    r"^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F]{2}(?:[-:][0-9a-fA-F]{2}){5})",
    re.MULTILINE,
)


def local_subnets() -> list[ipaddress.IPv4Network]:
    networks: list[ipaddress.IPv4Network] = []
    for addr_list in psutil.net_if_addrs().values():
        for addr in addr_list:
            if addr.family != socket.AF_INET or not addr.netmask:
                continue
            try:
                network = ipaddress.ip_network(f"{addr.address}/{addr.netmask}", strict=False)
            except ValueError:
                continue
            if network.is_loopback or network.is_link_local or network.prefixlen >= 31:
                continue
            networks.append(network)
    return networks


def parse_arp_output(output: str, allowed_networks: list[ipaddress.IPv4Network]) -> list[dict]:
    entries: list[dict] = []
    seen: set[str] = set()
    own_addresses = {
        addr.address
        for addrs in psutil.net_if_addrs().values()
        for addr in addrs
        if addr.family == socket.AF_INET
    }
    for match in MAC_LINE.finditer(output):
        ip_text, mac = match.group(1), match.group(2).lower().replace("-", ":")
        try:
            ip = ipaddress.ip_address(ip_text)
        except ValueError:
            continue
        if ip_text in own_addresses or mac in seen:
            continue
        if not any(ip in network for network in allowed_networks):
            continue
        if str(ip).endswith(".255") or str(ip).endswith(".0"):
            continue
        seen.add(mac)
        entries.append({"ip_address": str(ip), "mac": mac})
    return entries


def read_arp_cache(allowed_networks: list[ipaddress.IPv4Network]) -> list[dict]:
    command = ["arp", "-a"]
    try:
        completed = subprocess.run(
            command, capture_output=True, text=True, timeout=10, shell=False, check=False
        )
        if completed.returncode != 0:
            logger.warning("ARP cache command failed: %s", completed.stderr[:200])
            return []
        return parse_arp_output(completed.stdout, allowed_networks)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        logger.warning("Unable to read ARP cache: %s", type(exc).__name__)
        return []


def _mask_mac(mac: str) -> str:
    parts = mac.split(":")
    return "**:**:**:" + ":".join(parts[-3:])


def discover_devices(db: Session) -> dict:
    networks = local_subnets()
    if not networks:
        return {
            "discovered": 0,
            "new_devices": 0,
            "duplicates_ignored": 0,
            "method": f"{platform.system()} ARP cache (read-only)",
            "message": "No active local IPv4 subnet was available for discovery.",
            "devices": [],
        }

    entries = read_arp_cache(networks)
    now = datetime.now(timezone.utc)
    newly_created: list[Device] = []
    duplicates = 0
    discovered_devices: list[Device] = []

    for entry in entries:
        identifier = hashlib.sha256(entry["mac"].encode("utf-8")).hexdigest()
        device = db.scalar(select(Device).where(Device.identifier_hash == identifier))
        if device is None:
            device = Device(
                identifier_hash=identifier,
                ip_address=entry["ip_address"],
                mac_masked=_mask_mac(entry["mac"]),
                is_approved=False,
                is_active=True,
                first_seen_at=now,
                last_seen_at=now,
            )
            db.add(device)
            db.flush()
            newly_created.append(device)
        else:
            duplicates += 1
            device.ip_address = entry["ip_address"]
            device.last_seen_at = now
            device.is_active = True
        db.add(DeviceActivity(device_id=device.id, ip_address=entry["ip_address"], seen_at=now))
        discovered_devices.append(device)

    db.commit()
    for device in newly_created:
        db.refresh(device)
    for device in discovered_devices:
        db.refresh(device)

    return {
        "discovered": len(entries),
        "new_devices": len(newly_created),
        "duplicates_ignored": duplicates,
        "method": f"{platform.system()} ARP cache (read-only, local subnets only)",
        "message": (
            f"Observed {len(entries)} local neighbour(s); {len(newly_created)} new. "
            "New devices await administrator approval."
        ),
        "devices": discovered_devices,
    }
