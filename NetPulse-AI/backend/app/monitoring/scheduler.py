"""Background monitoring scheduler (live probes only)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.ai.anomaly import detect_anomalies
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AccessPoint
from app.monitoring.devices import discover_devices
from app.services.monitoring import check_access_point, run_network_check

logger = logging.getLogger("netpulse.scheduler")


class MonitoringScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._cycle_lock = asyncio.Lock()
        self.last_cycle_at: datetime | None = None
        self.last_device_scan_at: datetime | None = None
        self.last_ap_scan_at: datetime | None = None
        self.last_error: str | None = None

    async def start(self) -> None:
        if not settings.monitoring_enabled:
            logger.info("Background monitoring disabled by configuration")
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run_loop(), name="netpulse-monitor-loop")
        logger.info(
            "Background monitoring started (target=%s, interval=%ss)",
            settings.monitor_target,
            settings.monitoring_interval_seconds,
        )

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        logger.info("Background monitoring stopped")

    async def _run_loop(self) -> None:
        if settings.monitor_on_startup:
            await asyncio.sleep(1.0)
            await self.run_cycle(initial=True)
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(
                    self._stop.wait(), timeout=settings.monitoring_interval_seconds
                )
            except asyncio.TimeoutError:
                await self.run_cycle()
            except asyncio.CancelledError:
                break

    async def run_cycle(self, initial: bool = False) -> None:
        if self._cycle_lock.locked():
            logger.debug("Skipping overlapping monitoring cycle")
            return
        async with self._cycle_lock:
            try:
                await asyncio.to_thread(self._run_live_check)
                await self._maybe_run_auxiliary_checks(initial=initial)
                self.last_cycle_at = datetime.now(timezone.utc)
                self.last_error = None
            except Exception as exc:
                self.last_error = f"{type(exc).__name__}: {exc}"
                logger.exception("Monitoring cycle failed")

    def _run_live_check(self) -> None:
        with SessionLocal() as db:
            run_network_check(db)
            if bool(settings.auto_anomaly_detection):
                # Rules inside the service also check the runtime Settings value.
                detect_anomalies(db)
            logger.info("Live monitoring cycle completed")

    async def _maybe_run_auxiliary_checks(self, initial: bool = False) -> None:
        now = datetime.now(timezone.utc)
        check_devices = initial or self.last_device_scan_at is None or (
            now - self.last_device_scan_at >= timedelta(minutes=5)
        )
        check_aps = initial or self.last_ap_scan_at is None or (
            now - self.last_ap_scan_at >= timedelta(minutes=5)
        )
        if check_devices and settings.device_discovery_enabled:
            try:
                await asyncio.to_thread(self._run_device_discovery)
                self.last_device_scan_at = now
            except Exception:
                logger.exception("Device discovery cycle failed")
        if check_aps:
            try:
                await asyncio.to_thread(self._run_access_point_checks)
                self.last_ap_scan_at = now
            except Exception:
                logger.exception("Access point availability cycle failed")

    @staticmethod
    def _run_device_discovery() -> None:
        with SessionLocal() as db:
            result = discover_devices(db)
            logger.info("Device discovery: %s", result["message"])

    @staticmethod
    def _run_access_point_checks() -> None:
        with SessionLocal() as db:
            access_points = db.scalars(
                select(AccessPoint).where(AccessPoint.is_simulated.is_(False))
            ).all()
            for ap in access_points:
                check_access_point(db, ap)


scheduler = MonitoringScheduler()
