# NetPulse AI — Database Guide

NetPulse AI ships with two database options:

| Mode | Used for | Configuration |
|---|---|---|
| **SQLite** (default) | Zero-setup local demo and automated tests | No configuration; `backend/data/netpulse.db` is created automatically. |
| **MySQL 8** | Production-style deployment / project demonstration | Import `schema.sql` and set `DATABASE_URL` in `backend/.env`. |

The SQLAlchemy models in `backend/app/models/models.py` are the single source of
truth for both databases. The MySQL DDL in this folder mirrors those models.

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Complete MySQL 8 initial schema. Creates the `netpulse_ai` database, all tables, indexes and foreign keys. Safe to run more than once. |
| `migrations/001_initial_schema.sql` | Versioned migration for an existing database. Tracks itself in `schema_migrations`. |
| `README.md` | This setup and reference guide. |

> The 12 domain tables are: `users`, `access_points`, `access_point_history`,
> `devices`, `device_activity`, `network_measurements`, `anomaly_events`,
> `troubleshooting_recommendations`, `issue_tickets`, `issue_comments`,
> `automated_test_results` and `app_settings`. A 13th table,
> `schema_migrations`, records applied migrations.

## Option A — Docker (recommended for MySQL)

Docker Desktop is **not installed on the current development machine**, so this
path could not be executed here. The compose file is provided for a machine with
Docker. SQLite remains the verified local runtime.

1. From the `NetPulse-AI` folder, copy `.env.docker.example` to `.env.docker`
   and change every password.
2. Start MySQL and phpMyAdmin:

   ```powershell
   docker compose --env-file .env.docker up -d mysql phpmyadmin
   ```

3. Wait until the health check reports `healthy`:

   ```powershell
   docker compose ps
   ```

   The container automatically imports `database/schema.sql` on its first start
   through `/docker-entrypoint-initdb.d/001-schema.sql`.

4. Point the backend at MySQL in `backend/.env`:

   ```dotenv
   DATABASE_URL=mysql+pymysql://netpulse:YOUR_PASSWORD@127.0.0.1:3307/netpulse_ai?charset=utf8mb4
   ```

   Port **3307** is used on the host so an existing local MySQL installation on
   3306 is not disturbed. Change `MYSQL_HOST_PORT` in `.env.docker` if needed.

5. Start the backend. It creates the administrator and default settings on the
   first run, and adds two clearly labelled `[DEMO]` access points.

6. Verify:

   ```powershell
   mysql -h 127.0.0.1 -P 3307 -u netpulse -p -e "USE netpulse_ai; SHOW TABLES;"
   ```

   phpMyAdmin is available at <http://127.0.0.1:8081>.

Stop the containers without deleting data:

```powershell
docker compose down
```

Delete the database volume (destructive):

```powershell
docker compose down -v
```

## Option B — Installed MySQL 8

1. Create a dedicated database user. Do not use `root` for the application.

   ```sql
   CREATE DATABASE IF NOT EXISTS netpulse_ai
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'netpulse'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
     ON netpulse_ai.* TO 'netpulse'@'localhost';
   FLUSH PRIVILEGES;
   ```

2. Import the schema:

   ```powershell
   mysql -u root -p < database/schema.sql
   ```

   For a database that already exists and is managed by migrations:

   ```powershell
   mysql -u netpulse -p netpulse_ai < database/migrations/001_initial_schema.sql
   ```

3. Set the connection string in `backend/.env`:

   ```dotenv
   DATABASE_URL=mysql+pymysql://netpulse:replace-with-a-strong-password@127.0.0.1:3306/netpulse_ai?charset=utf8mb4
   ```

4. Start the backend. SQLAlchemy's `create_all()` runs as a safety net and the
   seed service adds the first administrator, runtime settings and demo APs.

## Verifying the installation

```sql
USE netpulse_ai;
SHOW TABLES;
SELECT version, description, applied_at FROM schema_migrations;
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'netpulse_ai';
SELECT `key`, `value` FROM app_settings;
```

Expected table count: **13** (12 domain tables + `schema_migrations`).
The first backend request also verifies connectivity through
`GET /api/health`, which reports `"database": "connected"`.

## Table reference

### `users`
Stores administrator, analyst and viewer accounts. `password_hash` contains an
Argon2 hash; plaintext passwords are never persisted. `role` is one of
`admin`, `analyst`, `viewer`.

### `access_points`
Authorized access-point inventory. `is_simulated = 1` marks demonstration data
that is excluded from live health statistics. A `(name, ip_address)` pair must be
unique among active inventory records.

### `access_point_history`
Append-only audit log of configuration changes. `changes` is JSON containing
the previous and new values. Deleting an AP cascades its history.

### `devices`
Locally observed devices from the operating system ARP cache. `identifier_hash`
is a SHA-256 hash of the normalized MAC address; `mac_masked` stores only a
partially masked form (for example `A4:5E:**:**:**:9F`). No packet capture or
active network scanning takes place.

### `device_activity`
One row per observation of a device, used by the read-only history timeline.

### `network_measurements`
Raw probe results. `data_origin` is `live` for real OS measurements and
`simulation` for clearly labelled demonstrations. `probe_target` names the host
or IP that was measured. Simulated records are never presented as live data.

### `anomaly_events`
Isolation Forest findings. `anomaly_score` is the normalized decision-function
score, `severity` is derived from that score, `features` stores the observed
latency/loss/jitter values, `explanation` gives a robust-z explanation and
`model_version` records the model configuration. `used_sample_baseline` is true
only for cold-start models trained on a synthetic baseline.

### `troubleshooting_recommendations`
Rule-based diagnosis output. `possible_causes` and `recommended_steps` are JSON
arrays; `related_incident_ids` references relevant tickets. Every row carries a
`safety_note`; the platform never changes router or AP configuration.

### `issue_tickets`
Incident tickets created manually or by the automation engine. `fingerprint`
supports duplicate suppression while a ticket is open. `ticket_number` is unique
and human-readable (for example `NP-20261115-0007`).

### `issue_comments`
Audit trail of analyst/administrator comments attached to a ticket.

### `automated_test_results`
Imported JUnit results from backend Pytest and frontend Playwright runs. Each
row is one test case, grouped by `run_id`.

### `app_settings`
Runtime-editable settings stored as JSON values: latency threshold, packet-loss
threshold, automatic ticket creation, automatic anomaly detection, default theme
and organization name.

## Entity relationships

```text
users 1 ──< access_points        (created_by, SET NULL)
users 1 ──< access_point_history (changed_by, SET NULL)
users 1 ──< devices              (approved_by, SET NULL)
users 1 ──< issue_tickets        (assigned_to, SET NULL)
users 1 ──< issue_comments       (user_id, SET NULL)

access_points 1 ──< access_point_history   (CASCADE)
access_points 1 ──< network_measurements   (CASCADE)
access_points 1 ──< anomaly_events         (CASCADE)
access_points 1 ──< troubleshooting_recommendations (SET NULL)
access_points 1 ──< issue_tickets          (SET NULL)

devices 1 ──< device_activity              (CASCADE)

network_measurements 1 ──< anomaly_events  (CASCADE)
network_measurements 1 ──< troubleshooting_recommendations (SET NULL)

anomaly_events 1 ──< issue_tickets         (SET NULL)

issue_tickets 1 ──< issue_comments         (CASCADE)
```

A full Mermaid ER diagram and data dictionary are in
`documentation/03-database-design.md`.

## Operational notes

- **Time zone.** All datetimes are UTC. The schema sets
  `time_zone = '+00:00'` for the import session; the backend writes UTC values.
- **Reset a demo database.** Drop and recreate `netpulse_ai`, re-import
  `schema.sql`, then restart the backend. The admin account is re-seeded.
- **Backup.** `mysqldump -u netpulse -p --single-transaction netpulse_ai > netpulse_backup.sql`.
- **Restore.** `mysql -u netpulse -p netpulse_ai < netpulse_backup.sql`.
- **Migrations.** Add future changes as `migrations/002_description.sql` and
  record the version in `schema_migrations`. Never edit an applied migration.
- **No secrets in SQL files.** The repository contains no real passwords. The
  administrator password comes from `ADMIN_PASSWORD` in `backend/.env`; if it is
  absent or left as a placeholder, the backend generates a random password and
  prints it once in the server log.

## Verified status on this machine

| Check | Result |
|---|---|
| SQLite schema creation and seed | Passed, used by the running application |
| 79 backend Pytest tests | Passed against SQLite |
| MySQL DDL syntax | Generated from SQLAlchemy 2.x metadata for the MySQL dialect |
| MySQL runtime import | Not executed — MySQL and Docker are not installed on this machine |

The MySQL files are provided for deployment and review. They should be imported
and smoke-tested on a host with MySQL 8 before being presented as runtime-verified.
