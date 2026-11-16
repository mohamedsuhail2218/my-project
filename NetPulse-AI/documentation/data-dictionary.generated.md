### `app_settings`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `key` | VARCHAR(80) | no | unique |
| `value` | JSON | no |  |
| `updated_at` | DATETIME | no |  |

Indexes: `ix_app_settings_key` (key) UNIQUE

### `automated_test_results`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `run_id` | VARCHAR(50) | no |  |
| `suite` | VARCHAR(60) | no |  |
| `test_name` | VARCHAR(255) | no |  |
| `status` | VARCHAR(20) | no |  |
| `duration_ms` | FLOAT | no |  |
| `details` | TEXT | yes |  |
| `executed_at` | DATETIME | no |  |

Indexes: `ix_automated_test_results_status` (status); `ix_test_results_executed` (executed_at); `ix_automated_test_results_run_id` (run_id); `ix_automated_test_results_suite` (suite); `ix_test_results_run` (run_id)

### `users`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `email` | VARCHAR(255) | no | unique |
| `full_name` | VARCHAR(120) | no |  |
| `password_hash` | VARCHAR(255) | no |  |
| `role` | VARCHAR(20) | no |  |
| `is_active` | BOOL | no |  |
| `last_login_at` | DATETIME | yes |  |
| `created_at` | DATETIME | no |  |
| `updated_at` | DATETIME | no |  |

Indexes: `ix_users_email` (email) UNIQUE; `ix_users_role` (role)

### `access_points`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `name` | VARCHAR(120) | no |  |
| `location` | VARCHAR(160) | no |  |
| `ip_address` | VARCHAR(45) | no |  |
| `mac_address` | VARCHAR(32) | yes |  |
| `vendor` | VARCHAR(100) | yes |  |
| `model` | VARCHAR(100) | yes |  |
| `is_simulated` | BOOL | no |  |
| `status` | VARCHAR(20) | no |  |
| `last_checked_at` | DATETIME | yes |  |
| `notes` | TEXT | yes |  |
| `created_by` | INTEGER | yes | FK -> users.id (SET NULL) |
| `created_at` | DATETIME | no |  |
| `updated_at` | DATETIME | no |  |

Indexes: `ix_access_points_is_simulated` (is_simulated); `ix_access_points_status` (status)

### `devices`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `identifier_hash` | VARCHAR(64) | no | unique |
| `display_name` | VARCHAR(120) | yes |  |
| `hostname` | VARCHAR(255) | yes |  |
| `ip_address` | VARCHAR(45) | no |  |
| `mac_masked` | VARCHAR(24) | yes |  |
| `is_approved` | BOOL | no |  |
| `is_active` | BOOL | no |  |
| `first_seen_at` | DATETIME | no |  |
| `last_seen_at` | DATETIME | no |  |
| `notes` | TEXT | yes |  |
| `approved_by` | INTEGER | yes | FK -> users.id (SET NULL) |
| `created_at` | DATETIME | no |  |
| `updated_at` | DATETIME | no |  |

Indexes: `ix_devices_approval_seen` (is_approved, last_seen_at)

### `access_point_history`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `access_point_id` | INTEGER | no | FK -> access_points.id (CASCADE) |
| `change_type` | VARCHAR(30) | no |  |
| `changes` | JSON | no |  |
| `changed_by` | INTEGER | yes | FK -> users.id (SET NULL) |
| `changed_at` | DATETIME | no |  |

Indexes: `ix_access_point_history_access_point_id` (access_point_id)

### `device_activity`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `device_id` | INTEGER | no | FK -> devices.id (CASCADE) |
| `ip_address` | VARCHAR(45) | no |  |
| `seen_at` | DATETIME | no |  |

Indexes: `ix_device_activity_seen` (seen_at); `ix_device_activity_device_id` (device_id)

### `network_measurements`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `access_point_id` | INTEGER | yes | FK -> access_points.id (CASCADE) |
| `latency_ms` | FLOAT | yes |  |
| `packet_loss_pct` | FLOAT | no |  |
| `jitter_ms` | FLOAT | yes |  |
| `is_online` | BOOL | no |  |
| `probe_target` | VARCHAR(255) | no |  |
| `data_origin` | VARCHAR(20) | no |  |
| `error_message` | TEXT | yes |  |
| `recorded_at` | DATETIME | no |  |

Indexes: `ix_measurements_online_time` (is_online, recorded_at); `ix_measurements_recorded_at` (recorded_at); `ix_network_measurements_data_origin` (data_origin); `ix_network_measurements_access_point_id` (access_point_id)

### `anomaly_events`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `measurement_id` | INTEGER | yes | unique, FK -> network_measurements.id (CASCADE) |
| `access_point_id` | INTEGER | yes | FK -> access_points.id (CASCADE) |
| `anomaly_score` | FLOAT | no |  |
| `severity` | VARCHAR(20) | no |  |
| `detected_at` | DATETIME | no |  |
| `explanation` | TEXT | no |  |
| `features` | JSON | no |  |
| `model_version` | VARCHAR(80) | no |  |
| `used_sample_baseline` | BOOL | no |  |

Indexes: `ix_anomaly_events_access_point_id` (access_point_id); `ix_anomalies_detected` (detected_at); `ix_anomaly_events_severity` (severity); `ix_anomaly_events_measurement_id` (measurement_id) UNIQUE

### `troubleshooting_recommendations`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `measurement_id` | INTEGER | yes | FK -> network_measurements.id (SET NULL) |
| `access_point_id` | INTEGER | yes | FK -> access_points.id (SET NULL) |
| `issue_type` | VARCHAR(60) | no |  |
| `severity` | VARCHAR(20) | no |  |
| `detected_issue` | TEXT | no |  |
| `possible_causes` | JSON | no |  |
| `recommended_steps` | JSON | no |  |
| `related_incident_ids` | JSON | no |  |
| `safety_note` | TEXT | no |  |
| `generated_at` | DATETIME | no |  |
| `is_active` | BOOL | no |  |

Indexes: `ix_troubleshooting_recommendations_access_point_id` (access_point_id); `ix_troubleshooting_recommendations_measurement_id` (measurement_id); `ix_recommendations_generated` (generated_at)

### `issue_tickets`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `ticket_number` | VARCHAR(32) | no | unique |
| `title` | VARCHAR(200) | no |  |
| `description` | TEXT | no |  |
| `priority` | VARCHAR(20) | no |  |
| `status` | VARCHAR(20) | no |  |
| `issue_type` | VARCHAR(60) | no |  |
| `fingerprint` | VARCHAR(120) | no |  |
| `source` | VARCHAR(30) | no |  |
| `access_point_id` | INTEGER | yes | FK -> access_points.id (SET NULL) |
| `anomaly_event_id` | INTEGER | yes | FK -> anomaly_events.id (SET NULL) |
| `assigned_to` | INTEGER | yes | FK -> users.id (SET NULL) |
| `resolved_at` | DATETIME | yes |  |
| `created_at` | DATETIME | no |  |
| `updated_at` | DATETIME | no |  |

Indexes: `ix_issue_tickets_anomaly_event_id` (anomaly_event_id); `ix_issue_tickets_priority` (priority); `ix_tickets_status_priority` (status, priority); `ix_tickets_fingerprint_status` (fingerprint, status); `ix_issue_tickets_issue_type` (issue_type); `ix_issue_tickets_ticket_number` (ticket_number) UNIQUE; `ix_issue_tickets_fingerprint` (fingerprint); `ix_issue_tickets_access_point_id` (access_point_id); `ix_issue_tickets_status` (status)

### `issue_comments`

| Column | Type | Nullable | Key / Notes |
|---|---|---|---|
| `id` | INTEGER | no | PK |
| `ticket_id` | INTEGER | no | FK -> issue_tickets.id (CASCADE) |
| `user_id` | INTEGER | yes | FK -> users.id (SET NULL) |
| `comment` | TEXT | no |  |
| `created_at` | DATETIME | no |  |

Indexes: `ix_issue_comments_ticket_id` (ticket_id)

