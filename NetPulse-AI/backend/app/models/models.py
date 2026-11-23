"""Normalized SQLAlchemy domain model for NetPulse AI."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="viewer", nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    access_points: Mapped[list["AccessPoint"]] = relationship(back_populates="created_by_user")
    comments: Mapped[list["IssueComment"]] = relationship(back_populates="author")


class AccessPoint(Base, TimestampMixin):
    __tablename__ = "access_points"
    __table_args__ = (
        UniqueConstraint("name", "ip_address", name="uq_access_point_name_ip"),
        Index("ix_access_points_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    location: Mapped[str] = mapped_column(String(160), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    mac_address: Mapped[str | None] = mapped_column(String(32))
    vendor: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    created_by_user: Mapped[User | None] = relationship(back_populates="access_points")
    measurements: Mapped[list["NetworkMeasurement"]] = relationship(
        back_populates="access_point", cascade="all, delete-orphan"
    )
    history: Mapped[list["AccessPointHistory"]] = relationship(
        back_populates="access_point", cascade="all, delete-orphan"
    )


class AccessPointHistory(Base):
    __tablename__ = "access_point_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    access_point_id: Mapped[int] = mapped_column(
        ForeignKey("access_points.id", ondelete="CASCADE"), nullable=False, index=True
    )
    change_type: Mapped[str] = mapped_column(String(30), nullable=False)
    changes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    access_point: Mapped[AccessPoint] = relationship(back_populates="history")


class NetworkMeasurement(Base):
    __tablename__ = "network_measurements"
    __table_args__ = (
        Index("ix_measurements_recorded_at", "recorded_at"),
        Index("ix_measurements_online_time", "is_online", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    access_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_points.id", ondelete="CASCADE"), nullable=True, index=True
    )
    latency_ms: Mapped[float | None] = mapped_column(Float)
    packet_loss_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    jitter_ms: Mapped[float | None] = mapped_column(Float)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    probe_target: Mapped[str] = mapped_column(String(255), nullable=False)
    data_origin: Mapped[str] = mapped_column(String(20), default="live", nullable=False, index=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    access_point: Mapped[AccessPoint | None] = relationship(back_populates="measurements")
    anomaly_events: Mapped[list["AnomalyEvent"]] = relationship(back_populates="measurement")


class Device(Base, TimestampMixin):
    __tablename__ = "devices"
    __table_args__ = (Index("ix_devices_approval_seen", "is_approved", "last_seen_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    identifier_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120))
    hostname: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    mac_masked: Mapped[str | None] = mapped_column(String(24))
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    activities: Mapped[list["DeviceActivity"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )


class DeviceActivity(Base):
    __tablename__ = "device_activity"
    __table_args__ = (Index("ix_device_activity_seen", "seen_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    device: Mapped[Device] = relationship(back_populates="activities")


class AnomalyEvent(Base):
    __tablename__ = "anomaly_events"
    __table_args__ = (Index("ix_anomalies_detected", "detected_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    measurement_id: Mapped[int | None] = mapped_column(
        ForeignKey("network_measurements.id", ondelete="CASCADE"), unique=True, index=True
    )
    access_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_points.id", ondelete="CASCADE"), index=True
    )
    anomaly_score: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    features: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    model_version: Mapped[str] = mapped_column(String(80), nullable=False)
    used_sample_baseline: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    measurement: Mapped[NetworkMeasurement | None] = relationship(back_populates="anomaly_events")


class TroubleshootingRecommendation(Base):
    __tablename__ = "troubleshooting_recommendations"
    __table_args__ = (Index("ix_recommendations_generated", "generated_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    measurement_id: Mapped[int | None] = mapped_column(
        ForeignKey("network_measurements.id", ondelete="SET NULL"), index=True
    )
    access_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_points.id", ondelete="SET NULL"), index=True
    )
    issue_type: Mapped[str] = mapped_column(String(60), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    detected_issue: Mapped[str] = mapped_column(Text, nullable=False)
    possible_causes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    recommended_steps: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    related_incident_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    safety_note: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class IssueTicket(Base, TimestampMixin):
    __tablename__ = "issue_tickets"
    __table_args__ = (
        Index("ix_tickets_status_priority", "status", "priority"),
        Index("ix_tickets_fingerprint_status", "fingerprint", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="Open", nullable=False, index=True)
    issue_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    fingerprint: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(30), default="automatic", nullable=False)
    access_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_points.id", ondelete="SET NULL"), index=True
    )
    anomaly_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("anomaly_events.id", ondelete="SET NULL"), index=True
    )
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    comments: Mapped[list["IssueComment"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="IssueComment.created_at"
    )


class IssueComment(Base):
    __tablename__ = "issue_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("issue_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    ticket: Mapped[IssueTicket] = relationship(back_populates="comments")
    author: Mapped[User | None] = relationship(back_populates="comments")


class AutomatedTestResult(Base):
    __tablename__ = "automated_test_results"
    __table_args__ = (
        Index("ix_test_results_run", "run_id"),
        Index("ix_test_results_executed", "executed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    suite: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    test_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    duration_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    details: Mapped[str | None] = mapped_column(Text)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AppSetting(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    value: Mapped[Any] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class TrafficSample(Base):
    """Host-level network counter sample used for bandwidth analytics."""

    __tablename__ = "traffic_samples"
    __table_args__ = (Index("ix_traffic_recorded_at", "recorded_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    bytes_sent: Mapped[int | None] = mapped_column(Integer)
    bytes_recv: Mapped[int | None] = mapped_column(Integer)
    packets_sent: Mapped[int | None] = mapped_column(Integer)
    packets_recv: Mapped[int | None] = mapped_column(Integer)
    bytes_per_sec: Mapped[float | None] = mapped_column(Float)
    packets_per_sec: Mapped[float | None] = mapped_column(Float)
    utilization_pct: Mapped[float | None] = mapped_column(Float)
    link_speed_mbps: Mapped[float | None] = mapped_column(Float)
    data_origin: Mapped[str] = mapped_column(String(20), default="live", nullable=False, index=True)


class PredictionResult(Base):
    """Persisted failure-risk estimate with an explainable feature snapshot."""

    __tablename__ = "prediction_results"
    __table_args__ = (
        Index("ix_predictions_predicted_at", "predicted_at"),
        Index("ix_predictions_active_scope", "is_active", "scope"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope: Mapped[str] = mapped_column(String(30), default="network", nullable=False)
    access_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_points.id", ondelete="SET NULL"), index=True
    )
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    horizon_hours: Mapped[int | None] = mapped_column(Integer)
    data_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    data_origin: Mapped[str] = mapped_column(String(20), default="live", nullable=False)
    method: Mapped[str] = mapped_column(String(80), nullable=False)
    model_version: Mapped[str] = mapped_column(String(80), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    features: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    predicted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)


class RootCauseInvestigation(Base):
    """Explainable diagnostic investigation produced from persisted telemetry."""

    __tablename__ = "root_cause_investigations"
    __table_args__ = (Index("ix_rca_generated", "generated_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    measurement_id: Mapped[int | None] = mapped_column(
        ForeignKey("network_measurements.id", ondelete="SET NULL"), index=True
    )
    access_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_points.id", ondelete="SET NULL"), index=True
    )
    problem: Mapped[str] = mapped_column(Text, nullable=False)
    probable_cause: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    recommended_actions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    related_incident_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="Open", nullable=False, index=True)
    method: Mapped[str] = mapped_column(String(80), nullable=False)
    data_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    access_point: Mapped[AccessPoint | None] = relationship()


class SecurityEvent(Base):
    """Defensive finding derived from authorized local telemetry."""

    __tablename__ = "security_events"
    __table_args__ = (
        Index("ix_security_detected", "detected_at"),
        Index("ix_security_status_severity", "status", "severity"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(40), default="network", nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="Open", nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(60), nullable=False)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"), index=True
    )
    access_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_points.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OptimizationRecommendation(Base):
    """Advisory network optimization derived from measured telemetry."""

    __tablename__ = "optimization_recommendations"
    __table_args__ = (
        Index("ix_optimization_generated", "generated_at"),
        Index("ix_optimization_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    access_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_points.id", ondelete="SET NULL"), index=True
    )
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    actions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    expected_impact_pct: Mapped[float | None] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="Advisory", nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    data_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class Notification(Base):
    """In-app notification with severity, read state and a deep link."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_created", "created_at"),
        Index("ix_notifications_unread", "is_read", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    path: Mapped[str] = mapped_column(String(255), default="/", nullable=False)
    dedupe_key: Mapped[str | None] = mapped_column(String(120), index=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class AIModelVersion(Base):
    """Registry entry recording model inputs, sample counts and validation metrics."""

    __tablename__ = "ai_model_versions"
    __table_args__ = (UniqueConstraint("name", "version", name="uq_model_name_version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(80), nullable=False)
    algorithm: Mapped[str] = mapped_column(String(120), nullable=False)
    features: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    training_samples: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)


class LoginAttempt(Base):
    """Minimal authentication audit used by the brute-force detector.

    Only the attempted email, client address, outcome and timestamp are stored.
    Passwords are never recorded. Rows older than 30 days are pruned by the
    security scan.
    """

    __tablename__ = "login_attempts"
    __table_args__ = (
        Index("ix_login_attempted_at", "attempted_at"),
        Index("ix_login_ip_time", "ip_address", "attempted_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
