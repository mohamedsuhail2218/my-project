import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import {
  createInitialState,
  migrateState,
  STATE_SCHEMA_VERSION,
} from "../src/data/initialState.js";
import { config } from "./config.js";
import { PLAN_NAMES, PLAN_SEATS } from "./plans.js";

export const DEMO_PASSWORD = config.demoPassword;

const DEMO_USERS = [
  {
    name: "Alex Mercer",
    email: "alex@northwind.io",
    roleKey: "super_admin",
    title: "Security Engineering Lead",
  },
  {
    name: "Priya Nair",
    email: "priya@northwind.io",
    roleKey: "security_analyst",
    title: "Senior Threat Analyst",
  },
  {
    name: "Maya Chen",
    email: "maya@northwind.io",
    roleKey: "read_only",
    title: "Compliance Reviewer",
  },
];

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    state TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    plan TEXT NOT NULL DEFAULT 'Professional',
    trial_ends TEXT,
    session_timeout_minutes INTEGER NOT NULL DEFAULT 480,
    ip_allowlist TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    role_key TEXT NOT NULL CHECK (role_key IN ('super_admin','security_analyst','read_only')),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT,
    ip TEXT,
    user_agent TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT,
    user_id TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    prev_hash TEXT,
    entry_hash TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

  -- Live telemetry. Events are immutable after ingestion and scoped to a
  -- workspace. The anomaly columns are filled by the server-side model.
  CREATE TABLE IF NOT EXISTS telemetry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_uid TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    received_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    host TEXT NOT NULL DEFAULT '',
    event TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'allow',
    ip TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    raw TEXT,
    dst_ip TEXT NOT NULL DEFAULT '',
    dst_port INTEGER,
    proto TEXT NOT NULL DEFAULT '',
    bytes INTEGER,
    duration_ms INTEGER,
    direction TEXT NOT NULL DEFAULT '',
    sensor TEXT NOT NULL DEFAULT '',
    anomaly_score REAL,
    anomaly_severity TEXT,
    anomaly_explanation TEXT,
    blocked TEXT,
    ingested_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_telemetry_workspace_time
    ON telemetry_events(workspace_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_telemetry_workspace_score
    ON telemetry_events(workspace_id, anomaly_score DESC);
  CREATE INDEX IF NOT EXISTS idx_telemetry_workspace_host
    ON telemetry_events(workspace_id, host);

  -- Rule-based detections. One row per rule/entity/time bucket so repeated
  -- evaluations are idempotent while a new hour can raise a fresh detection.
  CREATE TABLE IF NOT EXISTS detections (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','closed')),
    entity TEXT NOT NULL,
    detail TEXT NOT NULL,
    technique TEXT NOT NULL DEFAULT '',
    event_count INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    evidence TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(workspace_id, dedupe_key)
  );
  CREATE INDEX IF NOT EXISTS idx_detections_workspace_status
    ON detections(workspace_id, status, last_seen DESC);
  CREATE INDEX IF NOT EXISTS idx_detections_workspace_severity
    ON detections(workspace_id, severity, last_seen DESC);

  -- Last connector test/pull outcome. Credentials live only in environment
  -- variables; this table stores no secrets.
  CREATE TABLE IF NOT EXISTS connector_state (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    connector_id TEXT NOT NULL,
    last_test_at TEXT,
    last_test_ok INTEGER,
    last_test_detail TEXT,
    last_pull_at TEXT,
    last_pull_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, connector_id)
  );

  CREATE TABLE IF NOT EXISTS telemetry_tokens (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    prefix TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_by TEXT,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_telemetry_tokens_workspace
    ON telemetry_tokens(workspace_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS anomaly_models (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    trained_at TEXT NOT NULL,
    samples INTEGER NOT NULL,
    threshold REAL NOT NULL,
    metadata TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS intel_cache (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    indicator TEXT NOT NULL,
    payload TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, indicator)
  );

  -- Approval-gated response. A proposal never changes enforcement state until
  -- an authorised approver records a decision.
  CREATE TABLE IF NOT EXISTS response_actions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    incident_id TEXT,
    detection_id TEXT,
    event_id INTEGER,
    playbook_id TEXT NOT NULL,
    target TEXT NOT NULL,
    rationale TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','executed','failed','reverted')),
    automated INTEGER NOT NULL DEFAULT 0,
    requested_by TEXT NOT NULL,
    requested_by_id TEXT,
    requested_at TEXT NOT NULL,
    decided_by TEXT,
    decided_by_id TEXT,
    decided_at TEXT,
    decision_note TEXT,
    executed_at TEXT,
    result TEXT,
    previous_state TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_response_actions_workspace
    ON response_actions(workspace_id, requested_at DESC);
  CREATE INDEX IF NOT EXISTS idx_response_actions_incident
    ON response_actions(workspace_id, incident_id);
  CREATE INDEX IF NOT EXISTS idx_response_actions_status
    ON response_actions(workspace_id, status);

  CREATE TABLE IF NOT EXISTS response_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    action_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('ip','host','identity')),
    value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_response_blocks_lookup
    ON response_blocks(workspace_id, kind, value, active);

  CREATE TABLE IF NOT EXISTS response_rules (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    playbook_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    min_score REAL NOT NULL DEFAULT 0.75,
    updated_by TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, playbook_id)
  );
`;

const DB_FILES = new WeakMap();

function ensureColumn(db, table, name, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function truncate(value, max) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, max);
}

function timeoutLabel(minutes) {
  const value = Number(minutes) || config.sessionIdleMinutes;
  if (value % 60 === 0) {
    const hours = value / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${value} minutes`;
}

export function sanitizeWorkspace(state) {
  const { user, toasts, scenarios, security, ...rest } = state || {};
  const org = { ...(rest.org || {}) };
  delete org.plan;
  delete org.trialEnds;
  delete org.seats;
  delete org.sso;
  delete org.mfaRequired;
  const settings = { ...(rest.settings || {}) };
  delete settings.mfaRequired;
  delete settings.sessionTimeout;
  delete settings.sessionTimeoutMinutes;
  delete settings.ipAllowlist;
  return {
    ...rest,
    org,
    settings,
    schemaVersion: STATE_SCHEMA_VERSION,
  };
}

export function workspaceForClient(row) {
  let parsed = {};
  try {
    parsed = JSON.parse(row.state);
  } catch {
    parsed = {};
  }
  const migrated = migrateState(parsed, { orgName: row.name });
  const plan = PLAN_NAMES.includes(row.plan) ? row.plan : "Professional";
  const seats = PLAN_SEATS[plan] ?? 10;
  const sessionTimeoutMinutes = Number(row.session_timeout_minutes) || config.sessionIdleMinutes;
  const ipAllowlist = row.ip_allowlist || "";
  return {
    ...migrated,
    org: {
      ...migrated.org,
      name: migrated.org?.name || row.name,
      plan,
      seats,
      trialEnds: row.trial_ends || null,
      sso: false,
      mfaRequired: false,
    },
    settings: {
      ...migrated.settings,
      mfaRequired: false,
      sessionTimeout: timeoutLabel(sessionTimeoutMinutes),
      sessionTimeoutMinutes,
      ipAllowlist,
    },
    security: {
      plan,
      seats,
      trialEnds: row.trial_ends || null,
      sessionTimeoutMinutes,
      ipAllowlist,
    },
    schemaVersion: STATE_SCHEMA_VERSION,
  };
}

function seedDemoData(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM workspaces").get();
  if (existing.count > 0) return;
  if (!config.seedDemoUsers) return;

  if (!DEMO_PASSWORD) {
    throw new Error("[db] DEMO_PASSWORD is required when SEED_DEMO_USERS is enabled.");
  }

  const now = new Date().toISOString();
  const workspaceId = "northwind";
  const workspaceState = sanitizeWorkspace(
    createInitialState({ orgName: "Northwind Systems", plan: "Professional" })
  );

  db.prepare(
    `INSERT INTO workspaces
       (id, name, state, schema_version, plan, trial_ends, session_timeout_minutes, ip_allowlist, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    workspaceId,
    "Northwind Systems",
    JSON.stringify(workspaceState),
    STATE_SCHEMA_VERSION,
    "Professional",
    null,
    config.sessionIdleMinutes,
    "",
    now,
    now
  );

  // Seeding runs once at startup, so a synchronous hash avoids making database
  // creation async. Interactive verification and registration use async bcrypt.
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, config.bcryptCost);
  const insertUser = db.prepare(
    `INSERT INTO users (id, workspace_id, email, name, title, role_key, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  DEMO_USERS.forEach((user) => {
    insertUser.run(
      randomUUID(),
      workspaceId,
      normalizeEmail(user.email),
      user.name,
      user.title,
      user.roleKey,
      passwordHash,
      now
    );
  });
}

export function createDatabase(filename = config.dbPath) {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  DB_FILES.set(db, filename);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA secure_delete = ON;");
  db.exec(SCHEMA);

  // Upgrade databases created by earlier releases without losing data.
  ensureColumn(db, "workspaces", "plan", "TEXT NOT NULL DEFAULT 'Professional'");
  ensureColumn(db, "workspaces", "trial_ends", "TEXT");
  ensureColumn(db, "workspaces", "session_timeout_minutes", "INTEGER NOT NULL DEFAULT 480");
  ensureColumn(db, "workspaces", "ip_allowlist", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "sessions", "last_seen_at", "TEXT");
  ensureColumn(db, "sessions", "ip", "TEXT");
  ensureColumn(db, "sessions", "user_agent", "TEXT");
  ensureColumn(db, "audit_log", "workspace_id", "TEXT");
  ensureColumn(db, "audit_log", "user_agent", "TEXT");
  ensureColumn(db, "audit_log", "prev_hash", "TEXT");
  ensureColumn(db, "audit_log", "entry_hash", "TEXT");
  ensureColumn(db, "telemetry_events", "dst_ip", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "telemetry_events", "dst_port", "INTEGER");
  ensureColumn(db, "telemetry_events", "proto", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "telemetry_events", "bytes", "INTEGER");
  ensureColumn(db, "telemetry_events", "duration_ms", "INTEGER");
  ensureColumn(db, "telemetry_events", "direction", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "telemetry_events", "sensor", "TEXT NOT NULL DEFAULT ''");

  db.exec("UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_log(workspace_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_chain ON audit_log(workspace_id, id)");

  // Normalise existing addresses and enforce case-insensitive uniqueness. If a
  // pre-existing duplicate blocks the index, log loudly instead of deleting data.
  try {
    db.exec("UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email))");
    const duplicates = db
      .prepare("SELECT lower(email) AS email, COUNT(*) AS count FROM users GROUP BY lower(email) HAVING count > 1")
      .all();
    if (duplicates.length === 0) {
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email))");
    } else {
      console.error(
        "[db] Duplicate case-insensitive email addresses exist; resolve them before relying on login uniqueness."
      );
    }
  } catch (error) {
    console.error("[db] Could not enforce case-insensitive email uniqueness:", error.message);
  }

  seedDemoData(db);
  return db;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptCost);
}

export function getUserByEmail(db, email) {
  return db
    .prepare(
      `SELECT u.id, u.workspace_id, u.email, u.name, u.title, u.role_key, u.password_hash, u.created_at,
              w.name AS workspace_name, w.plan, w.trial_ends,
              w.session_timeout_minutes, w.ip_allowlist
       FROM users u JOIN workspaces w ON w.id = u.workspace_id
       WHERE lower(u.email) = lower(?)
       ORDER BY u.created_at ASC
       LIMIT 1`
    )
    .get(email);
}

export function getUserById(db, id) {
  return db
    .prepare(
      `SELECT u.id, u.workspace_id, u.email, u.name, u.title, u.role_key, u.password_hash, u.created_at,
              w.name AS workspace_name, w.plan, w.trial_ends,
              w.session_timeout_minutes, w.ip_allowlist
       FROM users u JOIN workspaces w ON w.id = u.workspace_id
       WHERE u.id = ?`
    )
    .get(id);
}

export function countWorkspaces(db) {
  return db.prepare("SELECT COUNT(*) AS count FROM workspaces").get().count;
}

export function countUsers(db) {
  return db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
}

function quotaError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function assertStorageAvailable(db, upcomingBytes = 0) {
  const filename = DB_FILES.get(db);
  if (!filename || filename === ":memory:") return;
  let bytes = 0;
  for (const suffix of ["", "-wal"]) {
    try {
      bytes += fs.statSync(path.resolve(`${filename}${suffix}`)).size;
    } catch {
      // A missing WAL file is normal.
    }
  }
  if (bytes + upcomingBytes > config.maxDbBytes) {
    throw quotaError("storage_quota", "Workspace storage capacity has been reached.");
  }
}

export async function createWorkspaceUser(
  db,
  { name, email, org, password, title = "", roleKey = "super_admin", plan = "Starter", trialDays = 14 }
) {
  if (countWorkspaces(db) >= config.maxWorkspaces) {
    throw quotaError("workspace_quota", "Workspace capacity has been reached.");
  }

  const now = new Date().toISOString();
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const trialEnds =
    trialDays === null || trialDays === undefined
      ? null
      : new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
  const state = sanitizeWorkspace(createInitialState({ orgName: org, plan, trialEnds }));
  const payloadBytes = Buffer.byteLength(JSON.stringify(state), "utf8");
  assertStorageAvailable(db, payloadBytes);
  const passwordHash = await hashPassword(password);

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO workspaces
         (id, name, state, schema_version, plan, trial_ends, session_timeout_minutes, ip_allowlist, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      workspaceId,
      org,
      JSON.stringify(state),
      STATE_SCHEMA_VERSION,
      plan,
      trialEnds,
      config.sessionIdleMinutes,
      "",
      now,
      now
    );
    db.prepare(
      `INSERT INTO users (id, workspace_id, email, name, title, role_key, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      workspaceId,
      normalizeEmail(email),
      name,
      title,
      roleKey,
      passwordHash,
      now
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getUserById(db, userId);
}

export async function bootstrapAdmin(db, { email, password, name, org }) {
  if (countUsers(db) > 0) return null;
  return createWorkspaceUser(db, {
    name: name || "Workspace Owner",
    email,
    org: org || "Workspace",
    password,
    roleKey: "super_admin",
    plan: "Professional",
    trialDays: null,
  });
}

export function getWorkspaceRow(db, workspaceId) {
  return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId);
}

export function saveWorkspace(db, workspaceId, state) {
  const sanitized = sanitizeWorkspace(state);
  const serialized = JSON.stringify(sanitized);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > config.maxWorkspaceBytes) {
    throw quotaError("workspace_too_large", "Workspace payload exceeds the server limit.");
  }
  assertStorageAvailable(db, bytes);
  const updatedAt = new Date().toISOString();
  db.prepare(
    "UPDATE workspaces SET name = ?, state = ?, schema_version = ?, updated_at = ? WHERE id = ?"
  ).run(
    sanitized.org?.name || "Workspace",
    serialized,
    STATE_SCHEMA_VERSION,
    updatedAt,
    workspaceId
  );
  return updatedAt;
}

export function resetWorkspace(db, workspaceId) {
  const row = getWorkspaceRow(db, workspaceId);
  if (!row) return null;
  const state = sanitizeWorkspace(
    createInitialState({
      orgName: row.name,
      plan: PLAN_NAMES.includes(row.plan) ? row.plan : "Professional",
      trialEnds: row.trial_ends || null,
    })
  );
  const updatedAt = new Date().toISOString();
  db.prepare(
    "UPDATE workspaces SET state = ?, schema_version = ?, updated_at = ? WHERE id = ?"
  ).run(JSON.stringify(state), STATE_SCHEMA_VERSION, updatedAt, workspaceId);
  return workspaceForClient(getWorkspaceRow(db, workspaceId));
}

export function setPlan(db, workspaceId, plan) {
  if (!PLAN_NAMES.includes(plan)) {
    const error = new Error("Unknown plan.");
    error.code = "invalid_plan";
    throw error;
  }
  const updatedAt = new Date().toISOString();
  db.prepare("UPDATE workspaces SET plan = ?, updated_at = ? WHERE id = ?").run(plan, updatedAt, workspaceId);
  return { plan, seats: PLAN_SEATS[plan], updatedAt };
}

export function updateSecurityPolicy(db, workspaceId, { sessionTimeoutMinutes, ipAllowlist }) {
  const updatedAt = new Date().toISOString();
  db.prepare(
    "UPDATE workspaces SET session_timeout_minutes = ?, ip_allowlist = ?, updated_at = ? WHERE id = ?"
  ).run(sessionTimeoutMinutes, ipAllowlist, updatedAt, workspaceId);
  return { sessionTimeoutMinutes, ipAllowlist, updatedAt };
}

export function newToken() {
  return randomBytes(32).toString("hex");
}

function auditDigest(payload) {
  return config.auditHmacKey
    ? createHmac("sha256", config.auditHmacKey).update(payload).digest("hex")
    : createHash("sha256").update(payload).digest("hex");
}

function canonicalAuditEntry({
  id,
  workspaceId,
  userId,
  action,
  detail,
  ip,
  userAgent,
  createdAt,
  prevHash,
}) {
  return JSON.stringify([
    id,
    workspaceId ?? null,
    userId ?? null,
    action,
    detail ?? null,
    ip ?? null,
    userAgent ?? null,
    createdAt,
    prevHash,
  ]);
}

export function audit(
  db,
  { workspaceId = null, userId = null, action, detail = null, ip = null, userAgent = null }
) {
  if (!action) throw new Error("Audit action is required.");
  const safeAction = truncate(action, 80);
  const safeDetail = truncate(detail, 500);
  const safeIp = truncate(ip, 64);
  const safeAgent = truncate(userAgent, 300);
  const bucket = workspaceId ?? "";
  const previous = db
    .prepare(
      `SELECT entry_hash FROM audit_log
       WHERE COALESCE(workspace_id, '') = ? AND entry_hash IS NOT NULL AND entry_hash <> ''
       ORDER BY id DESC LIMIT 1`
    )
    .get(bucket);
  const prevHash = previous?.entry_hash || "";
  const createdAt = new Date().toISOString();

  // The hash is filled in by an UPDATE below. If the process dies between the
  // INSERT and UPDATE, the row keeps a NULL hash and is skipped by verification
  // instead of permanently breaking every later entry in the chain.
  const result = db
    .prepare(
      `INSERT INTO audit_log
         (workspace_id, user_id, action, detail, ip, user_agent, created_at, prev_hash, entry_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(workspaceId, userId, safeAction, safeDetail, safeIp, safeAgent, createdAt, prevHash);

  const id = Number(result.lastInsertRowid);
  const entryHash = auditDigest(
    canonicalAuditEntry({
      id,
      workspaceId,
      userId,
      action: safeAction,
      detail: safeDetail,
      ip: safeIp,
      userAgent: safeAgent,
      createdAt,
      prevHash,
    })
  );
  db.prepare("UPDATE audit_log SET entry_hash = ? WHERE id = ?").run(entryHash, id);
  return id;
}

export function verifyAuditChain(db, workspaceId, { limit = config.auditVerifyLimit } = {}) {
  const rows = db
    .prepare(
      `SELECT id, workspace_id, user_id, action, detail, ip, user_agent, created_at, prev_hash, entry_hash
       FROM audit_log
       WHERE COALESCE(workspace_id, '') = ? AND entry_hash IS NOT NULL AND entry_hash <> ''
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(workspaceId ?? "", limit + 1);

  const truncated = rows.length > limit;
  const selected = truncated ? rows.slice(0, limit) : rows;
  let expectedPrev = "";
  for (const row of selected) {
    if (row.prev_hash !== expectedPrev) {
      return { ok: false, checked: selected.indexOf(row), brokenAt: row.id, truncated };
    }
    const digest = auditDigest(
      canonicalAuditEntry({
        id: row.id,
        workspaceId: row.workspace_id,
        userId: row.user_id,
        action: row.action,
        detail: row.detail,
        ip: row.ip,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        prevHash: row.prev_hash,
      })
    );
    if (digest !== row.entry_hash) {
      return { ok: false, checked: selected.indexOf(row), brokenAt: row.id, truncated };
    }
    expectedPrev = row.entry_hash;
  }
  return { ok: true, checked: selected.length, brokenAt: null, truncated };
}

export function pruneSessions(db) {
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT s.token_hash, s.expires_at, s.last_seen_at, w.session_timeout_minutes
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN workspaces w ON w.id = u.workspace_id`
    )
    .all();
  const remove = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  let deleted = 0;
  for (const row of rows) {
    const expires = new Date(row.expires_at).getTime();
    const lastSeen = new Date(row.last_seen_at || row.expires_at).getTime();
    const idleMs = (Number(row.session_timeout_minutes) || config.sessionIdleMinutes) * 60 * 1000;
    if (!Number.isFinite(expires) || expires <= now || now - lastSeen > idleMs) {
      remove.run(row.token_hash);
      deleted += 1;
    }
  }
  return deleted;
}

export function pruneLegacyAudit(db) {
  const cutoff = new Date(Date.now() - config.auditRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db
    .prepare(
      "DELETE FROM audit_log WHERE (entry_hash IS NULL OR entry_hash = '') AND created_at < ?"
    )
    .run(cutoff);
  return Number(result.changes || 0);
}
