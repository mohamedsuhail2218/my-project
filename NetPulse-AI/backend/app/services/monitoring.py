"""Monitoring orchestration: real probes, persistence and AP availability."""

from __future__ import annotations

import logging
import random
from datetime import datetime, timezone

import psutil
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AccessPoint, NetworkMeasurement, TrafficSample
from app.monitoring.diagnostics import perform_diagnostic, result_as_dict
from app.services.ticketing import evaluate_access_point_ticket, evaluate_measurement_ticket

logger = logging.getLogger("netpulse.monitoring")


def record_traffic_sample(db: Session) -> TrafficSample | None:
    """Persist host interface throughput derived from real OS counters.

    These are host-level counters, not per-access-point figures. The sample is
    labelled ``live`` and the API states the measurement scope explicitly.
    """
    counters = psutil.net_io_counters()
    if counters is None:
        return None
    previous = db.scalar(
        select(TrafficSample)
        .where(TrafficSample.data_origin == "live")
        .order_by(TrafficSample.recorded_at.desc())
        .limit(1)
    )
    now = datetime.now(timezone.utc)
    bytes_per_sec = None
    packets_per_sec = None
    utilization = None
    if previous is not None and previous.recorded_at is not None:
        recorded = previous.recorded_at
        if recorded.tzinfo is None:
            recorded = recorded.replace(tzinfo=timezone.utc)
        elapsed = (now - recorded).total_seconds()
        if 0 < elapsed <= 900:
            sent = counters.bytes_sent - int(previous.bytes_sent or 0)
            received = counters.bytes_recv - int(previous.bytes_recv or 0)
            sent_packets = counters.packets_sent - int(previous.packets_sent or counters.packets_sent)
            received_packets = counters.packets_recv - int(
                previous.packets_recv or counters.packets_recv
            )
            if sent >= 0 and received >= 0:
                bytes_per_sec = round((sent + received) / elapsed, 2)
                packets_per_sec = round((sent_packets + received_packets) / elapsed, 2)
    speed_mbps = None
    try:
        speeds = [
            stats.speed
            for stats in psutil.net_if_stats().values()
            if stats.isup and stats.speed and stats.speed > 0
        ]
        speed_mbps = float(max(speeds)) if speeds else None
    except Exception:
        speed_mbps = None
    if bytes_per_sec is not None and speed_mbps:
        utilization = round(bytes_per_sec * 8 / (speed_mbps * 1_000_000) * 100, 3)
    sample = TrafficSample(
        recorded_at=now,
        bytes_sent=counters.bytes_sent,
        bytes_recv=counters.bytes_recv,
        packets_sent=counters.packets_sent,
        packets_recv=counters.packets_recv,
        bytes_per_sec=bytes_per_sec,
        packets_per_sec=packets_per_sec,
        utilization_pct=utilization,
        link_speed_mbps=speed_mbps,
        data_origin="live",
    )
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return sample



def record_measurement(
    db: Session,
    diagnostic,
    *,
    access_point_id: int | None = None,
    data_origin: str = "live",
) -> NetworkMeasurement:
    measurement = NetworkMeasurement(
        access_point_id=access_point_id,
        latency_ms=diagnostic.latency_ms,
        packet_loss_pct=diagnostic.packet_loss_pct,
        jitter_ms=diagnostic.jitter_ms,
        is_online=diagnostic.is_online,
        probe_target=diagnostic.probe_target,
        data_origin=data_origin,
        error_message=diagnostic.error_message,
        recorded_at=datetime.now(timezone.utc),
    )
    db.add(measurement)
    db.commit()
    db.refresh(measurement)
    return measurement


def run_network_check(db: Session, target: str | None = None) -> NetworkMeasurement:
    """Execute a real network probe and persist the observation."""
    diagnostic = perform_diagnostic(target)
    measurement = record_measurement(db, diagnostic, data_origin="live")
    try:
        record_traffic_sample(db)
    except Exception:
        logger.debug("Traffic sample could not be recorded", exc_info=True)
    evaluate_measurement_ticket(db, measurement)
    logger.info(
        "Live measurement stored: online=%s latency=%sms loss=%s%% target=%s",
        measurement.is_online,
        measurement.latency_ms,
        measurement.packet_loss_pct,
        measurement.probe_target,
    )
    return measurement


def _simulated_diagnostic(access_point: AccessPoint, db: Session):
    """Create a clearly-labelled simulation for demonstration APs only.

    This is persisted with data_origin='simulation' and is excluded from every
    network-health calculation and automatic ticket rule.
    """
    from app.monitoring.diagnostics import DiagnosticResult

    previous = db.scalar(
        select(NetworkMeasurement)
        .where(
            NetworkMeasurement.access_point_id == access_point.id,
            NetworkMeasurement.data_origin == "simulation",
        )
        .order_by(NetworkMeasurement.recorded_at.desc())
    )
    rng = random.Random(f"{access_point.id}-{datetime.now(timezone.utc).strftime('%Y-%m-%d-%H')}")
    online = rng.random() > 0.08
    latency = round(rng.uniform(18, 62), 2) if online else None
    return DiagnosticResult(
        is_online=online,
        latency_ms=latency,
        packet_loss_pct=round(rng.uniform(0, 2.4), 2) if online else 100.0,
        jitter_ms=round(rng.uniform(0.5, 7), 2) if online else None,
        samples=[latency] if latency else [],
        error_message=None if online else "Simulated offline event",
        probe_target=f"SIMULATED:{access_point.ip_address}",
        duration_ms=0.0,
    )


def check_access_point(db: Session, access_point: AccessPoint) -> NetworkMeasurement:
    if access_point.is_simulated:
        diagnostic = _simulated_diagnostic(access_point, db)
        measurement = record_measurement(
            db, diagnostic, access_point_id=access_point.id, data_origin="simulation"
        )
        access_point.status = "simulated"
        access_point.last_checked_at = measurement.recorded_at
        db.commit()
        return measurement

    diagnostic = perform_diagnostic(access_point.ip_address)
    measurement = record_measurement(db, diagnostic, access_point_id=access_point.id)
    access_point.status = "online" if diagnostic.is_online else "offline"
    access_point.last_checked_at = measurement.recorded_at
    db.commit()
    db.refresh(access_point)
    evaluate_access_point_ticket(db, access_point)
    logger.info("Access point %s checked: %s", access_point.name, access_point.status)
    return measurement


def measured_summary(measurement: NetworkMeasurement) -> dict:
    return {
        "id": measurement.id,
        "online": measurement.is_online,
        "latency_ms": measurement.latency_ms,
        "packet_loss_pct": measurement.packet_loss_pct,
        "jitter_ms": measurement.jitter_ms,
        "target": measurement.probe_target,
        "recorded_at": measurement.recorded_at.isoformat(),
        "data_origin": measurement.data_origin,
    }
