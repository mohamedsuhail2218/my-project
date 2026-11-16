-- ============================================================================
-- NetPulse AI - Complete MySQL 8 schema
-- ----------------------------------------------------------------------------
-- Project : NetPulse AI - Intelligent Wi-Fi Monitoring & Diagnostics
-- Engine  : InnoDB
-- Charset : utf8mb4 / utf8mb4_unicode_ci
-- Version : 1.0.0 (initial schema, migration 001)
--
-- Usage (fresh install):
--   mysql -u root -p < database/schema.sql
--
-- All indexes are declared inside their tables so this script can safely be
-- executed more than once. It never drops existing tables or data.
-- The application stores every timestamp in UTC. MySQL DATETIME columns do not
-- carry a timezone, so the backend always writes and interprets them as UTC.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS netpulse_ai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE netpulse_ai;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ----------------------------------------------------------------------------
-- Migration bookkeeping
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(20)  NOT NULL,
    description VARCHAR(255) NOT NULL,
    applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('001', 'Initial NetPulse AI schema');

-- ----------------------------------------------------------------------------
-- 1. Application settings
-- Runtime-configurable thresholds edited from the Settings module.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    id         INTEGER     NOT NULL AUTO_INCREMENT,
    `key`      VARCHAR(80) NOT NULL,
    `value`    JSON        NOT NULL,
    updated_at DATETIME    NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ix_app_settings_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Automated test results
-- One row per JUnit test case imported from a backend or frontend test run.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automated_test_results (
    id          INTEGER      NOT NULL AUTO_INCREMENT,
    run_id      VARCHAR(50)  NOT NULL,
    suite       VARCHAR(60)  NOT NULL,
    test_name   VARCHAR(255) NOT NULL,
    status      VARCHAR(20)  NOT NULL,
    duration_ms FLOAT        NOT NULL,
    details     TEXT         NULL,
    executed_at DATETIME     NOT NULL,
    PRIMARY KEY (id),
    KEY ix_automated_test_results_run_id (run_id),
    KEY ix_automated_test_results_status (status),
    KEY ix_automated_test_results_suite (suite),
    KEY ix_test_results_executed (executed_at),
    KEY ix_test_results_run (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Users
-- Role-based access control: admin, analyst, viewer.
-- Passwords are Argon2 hashes produced by pwdlib; plaintext is never stored.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER      NOT NULL AUTO_INCREMENT,
    email         VARCHAR(255) NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    `role`        VARCHAR(20)  NOT NULL,
    is_active     BOOL         NOT NULL,
    last_login_at DATETIME     NULL,
    created_at    DATETIME     NOT NULL,
    updated_at    DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ix_users_email (email),
    KEY ix_users_role (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Access points
-- is_simulated = 1 marks demonstration records. They never contribute live
-- measurements and are excluded from the live network health index.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_points (
    id              INTEGER      NOT NULL AUTO_INCREMENT,
    name            VARCHAR(120) NOT NULL,
    location        VARCHAR(160) NOT NULL,
    ip_address      VARCHAR(45)  NOT NULL,
    mac_address     VARCHAR(32)  NULL,
    vendor          VARCHAR(100) NULL,
    model           VARCHAR(100) NULL,
    is_simulated    BOOL         NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    last_checked_at DATETIME     NULL,
    notes           TEXT         NULL,
    created_by      INTEGER      NULL,
    created_at      DATETIME     NOT NULL,
    updated_at      DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_access_point_name_ip (name, ip_address),
    KEY ix_access_points_is_simulated (is_simulated),
    KEY ix_access_points_status (status),
    CONSTRAINT fk_access_points_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Devices
-- Derived exclusively from the local OS ARP cache. MAC addresses are hashed
-- (SHA-256) and masked; no packet capture or Nmap-style scanning is performed.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
    id              INTEGER      NOT NULL AUTO_INCREMENT,
    identifier_hash VARCHAR(64)  NOT NULL,
    display_name    VARCHAR(120) NULL,
    hostname        VARCHAR(255) NULL,
    ip_address      VARCHAR(45)  NOT NULL,
    mac_masked      VARCHAR(24)  NULL,
    is_approved     BOOL         NOT NULL,
    is_active       BOOL         NOT NULL,
    first_seen_at   DATETIME     NOT NULL,
    last_seen_at    DATETIME     NOT NULL,
    notes           TEXT         NULL,
    approved_by     INTEGER      NULL,
    created_at      DATETIME     NOT NULL,
    updated_at      DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_devices_identifier_hash (identifier_hash),
    KEY ix_devices_approval_seen (is_approved, last_seen_at),
    CONSTRAINT fk_devices_approved_by
        FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Access point configuration history
-- Append-only audit trail for create, update and delete operations.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_point_history (
    id              INTEGER     NOT NULL AUTO_INCREMENT,
    access_point_id INTEGER     NOT NULL,
    change_type     VARCHAR(30) NOT NULL,
    `changes`       JSON        NOT NULL,
    changed_by      INTEGER     NULL,
    changed_at      DATETIME    NOT NULL,
    PRIMARY KEY (id),
    KEY ix_access_point_history_access_point_id (access_point_id),
    CONSTRAINT fk_ap_history_access_point
        FOREIGN KEY (access_point_id) REFERENCES access_points (id) ON DELETE CASCADE,
    CONSTRAINT fk_ap_history_changed_by
        FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Device activity observations
-- One row each time a device is observed in the ARP cache.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_activity (
    id         INTEGER     NOT NULL AUTO_INCREMENT,
    device_id  INTEGER     NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    seen_at    DATETIME    NOT NULL,
    PRIMARY KEY (id),
    KEY ix_device_activity_device_id (device_id),
    KEY ix_device_activity_seen (seen_at),
    CONSTRAINT fk_device_activity_device
        FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Network measurements
-- Raw observations. data_origin distinguishes real OS probe results ("live")
-- from explicitly labelled demonstrations ("simulation").
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_measurements (
    id              INTEGER      NOT NULL AUTO_INCREMENT,
    access_point_id INTEGER      NULL,
    latency_ms      FLOAT        NULL,
    packet_loss_pct FLOAT        NOT NULL,
    jitter_ms       FLOAT        NULL,
    is_online       BOOL         NOT NULL,
    probe_target    VARCHAR(255) NOT NULL,
    data_origin     VARCHAR(20)  NOT NULL,
    error_message   TEXT         NULL,
    recorded_at     DATETIME     NOT NULL,
    PRIMARY KEY (id),
    KEY ix_measurements_online_time (is_online, recorded_at),
    KEY ix_measurements_recorded_at (recorded_at),
    KEY ix_network_measurements_access_point_id (access_point_id),
    KEY ix_network_measurements_data_origin (data_origin),
    CONSTRAINT fk_measurements_access_point
        FOREIGN KEY (access_point_id) REFERENCES access_points (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. Anomaly events
-- Isolation Forest findings with robust-z explanation and model provenance.
-- One anomaly per measurement (unique measurement_id).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anomaly_events (
    id                   INTEGER     NOT NULL AUTO_INCREMENT,
    measurement_id       INTEGER     NULL,
    access_point_id      INTEGER     NULL,
    anomaly_score        FLOAT       NOT NULL,
    severity             VARCHAR(20) NOT NULL,
    detected_at          DATETIME    NOT NULL,
    explanation          TEXT        NOT NULL,
    features             JSON        NOT NULL,
    model_version        VARCHAR(80) NOT NULL,
    used_sample_baseline BOOL        NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ix_anomaly_events_measurement_id (measurement_id),
    KEY ix_anomalies_detected (detected_at),
    KEY ix_anomaly_events_access_point_id (access_point_id),
    KEY ix_anomaly_events_severity (severity),
    CONSTRAINT fk_anomalies_measurement
        FOREIGN KEY (measurement_id) REFERENCES network_measurements (id) ON DELETE CASCADE,
    CONSTRAINT fk_anomalies_access_point
        FOREIGN KEY (access_point_id) REFERENCES access_points (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. Troubleshooting recommendations
-- Rule-based diagnosis output. Steps are advisory only: the system never
-- changes router or access-point configuration automatically.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS troubleshooting_recommendations (
    id                   INTEGER     NOT NULL AUTO_INCREMENT,
    measurement_id       INTEGER     NULL,
    access_point_id      INTEGER     NULL,
    issue_type           VARCHAR(60) NOT NULL,
    severity             VARCHAR(20) NOT NULL,
    detected_issue       TEXT        NOT NULL,
    possible_causes      JSON        NOT NULL,
    recommended_steps    JSON        NOT NULL,
    related_incident_ids JSON        NOT NULL,
    safety_note          TEXT        NOT NULL,
    generated_at         DATETIME    NOT NULL,
    is_active            BOOL        NOT NULL,
    PRIMARY KEY (id),
    KEY ix_recommendations_generated (generated_at),
    KEY ix_troubleshooting_recommendations_access_point_id (access_point_id),
    KEY ix_troubleshooting_recommendations_measurement_id (measurement_id),
    CONSTRAINT fk_recommendations_measurement
        FOREIGN KEY (measurement_id) REFERENCES network_measurements (id) ON DELETE SET NULL,
    CONSTRAINT fk_recommendations_access_point
        FOREIGN KEY (access_point_id) REFERENCES access_points (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. Issue tickets
-- Automatic tickets are deduplicated by fingerprint while an incident is open.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_tickets (
    id               INTEGER      NOT NULL AUTO_INCREMENT,
    ticket_number    VARCHAR(32)  NOT NULL,
    title            VARCHAR(200) NOT NULL,
    description      TEXT         NOT NULL,
    priority         VARCHAR(20)  NOT NULL,
    status           VARCHAR(20)  NOT NULL,
    issue_type       VARCHAR(60)  NOT NULL,
    fingerprint      VARCHAR(120) NOT NULL,
    source           VARCHAR(30)  NOT NULL,
    access_point_id  INTEGER      NULL,
    anomaly_event_id INTEGER      NULL,
    assigned_to      INTEGER      NULL,
    resolved_at      DATETIME     NULL,
    created_at       DATETIME     NOT NULL,
    updated_at       DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ix_issue_tickets_ticket_number (ticket_number),
    KEY ix_issue_tickets_access_point_id (access_point_id),
    KEY ix_issue_tickets_anomaly_event_id (anomaly_event_id),
    KEY ix_issue_tickets_fingerprint (fingerprint),
    KEY ix_issue_tickets_issue_type (issue_type),
    KEY ix_issue_tickets_priority (priority),
    KEY ix_issue_tickets_status (status),
    KEY ix_tickets_fingerprint_status (fingerprint, status),
    KEY ix_tickets_status_priority (status, priority),
    CONSTRAINT fk_tickets_access_point
        FOREIGN KEY (access_point_id) REFERENCES access_points (id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_anomaly_event
        FOREIGN KEY (anomaly_event_id) REFERENCES anomaly_events (id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_assigned_to
        FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. Issue comments
-- Administrator/analyst audit trail for each ticket.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_comments (
    id         INTEGER  NOT NULL AUTO_INCREMENT,
    ticket_id  INTEGER  NOT NULL,
    user_id    INTEGER  NULL,
    comment    TEXT     NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_issue_comments_ticket_id (ticket_id),
    CONSTRAINT fk_comments_ticket
        FOREIGN KEY (ticket_id) REFERENCES issue_tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- End of schema. The backend seeds the first administrator, default runtime
-- settings and two clearly labelled [DEMO] access points on first start.
-- ============================================================================
