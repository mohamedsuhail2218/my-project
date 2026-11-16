"""Real local network diagnostics.

All latency, jitter and packet-loss numbers originate from operating-system
ICMP echo requests. When a probe cannot run, the measurement is marked offline
with an error; values are never invented.
"""

from __future__ import annotations

import logging
import platform
import re
import socket
import statistics
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import psutil

from app.core.config import settings

logger = logging.getLogger("netpulse.monitoring")


@dataclass(slots=True)
class DiagnosticResult:
    is_online: bool
    latency_ms: float | None
    packet_loss_pct: float
    jitter_ms: float | None
    samples: list[float]
    error_message: str | None
    probe_target: str
    duration_ms: float


def _build_ping_command(target: str, count: int, timeout_ms: int) -> list[str]:
    if platform.system().lower() == "windows":
        return ["ping", "-n", str(count), "-w", str(timeout_ms), target]
    if platform.system().lower() == "darwin":
        return ["ping", "-c", str(count), "-W", str(timeout_ms), target]
    return ["ping", "-c", str(count), "-W", str(max(1, timeout_ms // 1000)), target]


def _run_ping_once(target: str) -> DiagnosticResult:
    timeout_ms = settings.monitor_timeout_ms
    count = settings.monitor_packet_count
    command = _build_ping_command(target, count, timeout_ms)
    started = datetime.now(timezone.utc)
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=(count * timeout_ms / 1000) + 6,
            shell=False,
            check=False,
        )
        output = f"{completed.stdout}\n{completed.stderr}"
        times = [float(v) for v in re.findall(r"(?:time|Time)[=<]\s*(\d+(?:\.\d+)?)\s*ms", output)]
        if not times:
            times = [float(v) for v in re.findall(r"time=(\d+(?:\.\d+)?)", output)]

        loss_match = re.search(r"\((\d+(?:\.\d+)?)%\s*loss\)", output)
        sent_match = re.search(r"Sent\s*=\s*(\d+)", output)
        received_match = re.search(r"Received\s*=\s*(\d+)", output)
        sent = int(sent_match.group(1)) if sent_match else count
        received = int(received_match.group(1)) if received_match else len(times)
        if loss_match:
            packet_loss = float(loss_match.group(1))
        else:
            packet_loss = max(0.0, round((sent - received) / sent * 100, 2)) if sent else 100.0

        duration = (datetime.now(timezone.utc) - started).total_seconds() * 1000
        if times:
            avg_latency = round(statistics.fmean(times), 2)
            jitter = round(statistics.pstdev(times), 2) if len(times) > 1 else 0.0
            return DiagnosticResult(
                is_online=True,
                latency_ms=avg_latency,
                packet_loss_pct=packet_loss,
                jitter_ms=jitter,
                samples=[round(v, 2) for v in times],
                error_message=None,
                probe_target=target,
                duration_ms=round(duration, 2),
            )
        error = "No ICMP echo replies received"
        if completed.returncode != 0 and output.strip():
            error = output.strip().splitlines()[-1][:300]
        return DiagnosticResult(
            is_online=False,
            latency_ms=None,
            packet_loss_pct=100.0,
            jitter_ms=None,
            samples=[],
            error_message=error,
            probe_target=target,
            duration_ms=round(duration, 2),
        )
    except FileNotFoundError:
        # Fall back to real TCP handshakes when the OS ping utility is missing.
        return _tcp_fallback(target)
    except subprocess.TimeoutExpired:
        duration = (datetime.now(timezone.utc) - started).total_seconds() * 1000
        return DiagnosticResult(
            is_online=False,
            latency_ms=None,
            packet_loss_pct=100.0,
            jitter_ms=None,
            samples=[],
            error_message="Network probe timed out",
            probe_target=target,
            duration_ms=round(duration, 2),
        )
    except Exception as exc:  # defensive: monitoring must not crash the app
        logger.exception("Network probe failed")
        duration = (datetime.now(timezone.utc) - started).total_seconds() * 1000
        return DiagnosticResult(
            is_online=False,
            latency_ms=None,
            packet_loss_pct=100.0,
            jitter_ms=None,
            samples=[],
            error_message=f"Probe error: {type(exc).__name__}",
            probe_target=target,
            duration_ms=round(duration, 2),
        )


def _tcp_fallback(target: str, port: int = 443) -> DiagnosticResult:
    """Measure genuine TCP handshakes if ICMP utilities are unavailable."""
    attempts = settings.monitor_packet_count
    timeout_s = settings.monitor_timeout_ms / 1000
    times: list[float] = []
    started = datetime.now(timezone.utc)
    for _ in range(attempts):
        probe_started = datetime.now(timezone.utc)
        try:
            with socket.create_connection((target, port), timeout=timeout_s):
                elapsed = (datetime.now(timezone.utc) - probe_started).total_seconds() * 1000
                times.append(round(elapsed, 2))
        except OSError:
            continue
    duration = (datetime.now(timezone.utc) - started).total_seconds() * 1000
    if times:
        return DiagnosticResult(
            is_online=True,
            latency_ms=round(statistics.fmean(times), 2),
            packet_loss_pct=round((attempts - len(times)) / attempts * 100, 2),
            jitter_ms=round(statistics.pstdev(times), 2) if len(times) > 1 else 0.0,
            samples=times,
            error_message=None,
            probe_target=f"{target}:{port} (TCP fallback)",
            duration_ms=round(duration, 2),
        )
    return DiagnosticResult(
        is_online=False,
        latency_ms=None,
        packet_loss_pct=100.0,
        jitter_ms=None,
        samples=[],
        error_message=f"ICMP unavailable; TCP connect to port {port} also failed",
        probe_target=f"{target}:{port} (TCP fallback)",
        duration_ms=round(duration, 2),
    )


def perform_diagnostic(target: str | None = None) -> DiagnosticResult:
    target = (target or settings.monitor_target).strip()
    return _run_ping_once(target)


def _safe_interface_addresses() -> list[dict]:
    addresses = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    rows = []
    for name, addr_list in addresses.items():
        rendered = []
        for addr in addr_list:
            if addr.family in (socket.AF_INET, socket.AF_INET6):
                rendered.append(addr.address)
        if not rendered:
            continue
        stat = stats.get(name)
        rows.append(
            {
                "name": name,
                "addresses": rendered,
                "is_up": bool(stat.isup) if stat else False,
                "speed_mbps": stat.speed if stat and stat.speed else None,
            }
        )
    return sorted(rows, key=lambda item: (not item["is_up"], item["name"]))


def network_info() -> dict:
    return {
        "hostname": socket.gethostname(),
        "platform": f"{platform.system()} {platform.release()}",
        "interfaces": _safe_interface_addresses(),
        "probe_target": settings.monitor_target,
        "monitoring_enabled": settings.monitoring_enabled,
        "monitoring_interval_seconds": settings.monitoring_interval_seconds,
        "collected_at": datetime.now(timezone.utc),
    }


def result_as_dict(result: DiagnosticResult) -> dict:
    return asdict(result)
