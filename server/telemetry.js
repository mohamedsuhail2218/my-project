import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "./config.js";
import { ensureModel, getModelMetadata, scoreBatch } from "./ml/anomaly.js";

/**
 * Real-time telemetry ingestion and retrieval.
 *
 * Events arrive through an authenticated POST (session + `hunter:write`, or a
 * workspace-scoped bearer token for log shippers). They are stored in SQLite,
 * scored by the isolation-forest model, published to connected Server-Sent
 * Events clients and matched against active response blocks.
 */

const streams = new Map();
const lastPrune = new Map();

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function clampTimestamp(value) {
  const now = Date.now();
  const parsed = value ? new Date(value) : new Date(now);
  if (Number.isNaN(parsed.getTime())) return new Date(now).toISOString();
  // Guard against a shipper with a broken clock filling the index with future
  // timestamps. Events older than the retention window are accepted as-is and
  // pruned by the normal retention job.
  if (parsed.getTime() > now + 5 * 60 * 1000) return new Date(now).toISOString();
  return parsed.toISOString();
}

function normalizeEvent(event, defaultSource) {
  const timestamp = clampTimestamp(event.timestamp);
  const receivedAt = new Date().toISOString();
  return {
    eventUid: String(event.eventId || event.id || `evt_${randomUUID()}`).slice(0, 120),
    timestamp,
    receivedAt,
    source: String(event.source || defaultSource || "push").trim().slice(0, 60) || "push",
    host: String(event.host || "unknown-host").trim().slice(0, 120) || "unknown-host",
    event: String(event.event || "custom_event").trim().slice(0, 120) || "custom_event",
    action: String(event.action || "").trim().slice(0, 120),
    status: ["allow", "deny", "alert"].includes(event.status) ? event.status : "allow",
    ip: String(event.ip || "").trim().slice(0, 64),
    user: String(event.user || event.username || "").trim().slice(0, 120),
    message: String(event.message || "").slice(0, 8000),
    raw: event.raw === undefined ? null : String(event.raw).slice(0, 16000),
  };
}

function activeBlocks(db, workspaceId) {
  const rows = db
    .prepare(
      `SELECT kind, value FROM response_blocks
       WHERE workspace_id = ? AND active = 1`
    )
    .all(workspaceId);
  const blocks = { ip: new Set(), host: new Set(), identity: new Set() };
  rows.forEach((row) => blocks[row.kind]?.add(String(row.value).toLowerCase()));
  return blocks;
}

function matchBlocks(blocks, event) {
  const matches = [];
  if (event.ip && blocks.ip.has(event.ip.toLowerCase())) {
    matches.push({ kind: "ip", value: event.ip });
  }
  if (event.host && blocks.host.has(event.host.toLowerCase())) {
    matches.push({ kind: "host", value: event.host });
  }
  if (event.user && blocks.identity.has(event.user.toLowerCase())) {
    matches.push({ kind: "identity", value: event.user });
  }
  return matches;
}

export function ingestTelemetry(db, workspaceId, events, options = {}) {
  const { defaultSource = "push", actor = null, token = null } = options;
  const normalized = events.map((event) => normalizeEvent(event, defaultSource));
  const blocks = activeBlocks(db, workspaceId);

  // Training on existing events happens before this batch is inserted. The
  // first batch only establishes a baseline; subsequent batches are scored.
  ensureModel(db, workspaceId);
  const scores = scoreBatch(db, workspaceId, normalized);

  const insert = db.prepare(
    `INSERT INTO telemetry_events
       (workspace_id, event_uid, timestamp, received_at, source, host, event, action, status, ip, username,
        message, raw, anomaly_score, anomaly_severity, anomaly_explanation, blocked, ingested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const ingestedBy = token ? `token:${token.prefix}` : actor || "session";
  const results = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    normalized.forEach((event, index) => {
      const blocked = matchBlocks(blocks, event);
      const status = blocked.length ? "alert" : event.status;
      const score = scores[index];
      const stored = {
        ...event,
        status,
        blocked: blocked.length ? blocked : null,
        anomaly: score,
      };
      const info = insert.run(
        workspaceId,
        event.eventUid,
        event.timestamp,
        event.receivedAt,
        event.source,
        event.host,
        event.event,
        event.action,
        status,
        event.ip,
        event.user,
        event.message,
        event.raw,
        score ? score.score : null,
        score ? score.severity : null,
        score ? JSON.stringify(score.explanation) : null,
        blocked.length ? JSON.stringify(blocked) : null,
        ingestedBy
      );
      results.push({ id: Number(info.lastInsertRowid), ...stored });
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  maybePrune(db, workspaceId);
  return {
    events: results,
    model: getModelMetadata(db, workspaceId),
    blocked: results.filter((event) => event.blocked).length,
  };
}

export function queryTelemetry(
  db,
  workspaceId,
  { limit = 50, before = 0, q = "", status = "", host = "", source = "", minScore = null, since = "" } = {}
) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];

  if (before) {
    clauses.push("id < ?");
    params.push(before);
  }
  if (["allow", "deny", "alert"].includes(status)) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (host) {
    clauses.push("host = ?");
    params.push(host);
  }
  if (source) {
    clauses.push("source = ?");
    params.push(source);
  }
  if (Number.isFinite(minScore)) {
    clauses.push("anomaly_score IS NOT NULL AND anomaly_score >= ?");
    params.push(minScore);
  }
  if (since) {
    clauses.push("timestamp >= ?");
    params.push(since);
  }

  const tokens = String(q || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const escapeLike = (value) => String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
  tokens.forEach((token) => {
    const like = `%${escapeLike(token)}%`;
    clauses.push(
      `(lower(source) LIKE ? ESCAPE '\\' OR lower(host) LIKE ? ESCAPE '\\'
        OR lower(event) LIKE ? ESCAPE '\\' OR lower(action) LIKE ? ESCAPE '\\'
        OR lower(status) LIKE ? ESCAPE '\\' OR lower(ip) LIKE ? ESCAPE '\\'
        OR lower(username) LIKE ? ESCAPE '\\' OR lower(message) LIKE ? ESCAPE '\\'
        OR lower(raw) LIKE ? ESCAPE '\\')`
    );
    params.push(like, like, like, like, like, like, like, like, like);
  });

  const rows = db
    .prepare(
      `SELECT * FROM telemetry_events
       WHERE ${clauses.join(" AND ")}
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(...params, Math.min(500, Math.max(1, Number(limit) || 50)));

  return rows.map(serializeTelemetryRow);
}

export function serializeTelemetryRow(row) {
  let explanation = null;
  let blocked = null;
  try {
    explanation = row.anomaly_explanation ? JSON.parse(row.anomaly_explanation) : null;
  } catch {
    explanation = null;
  }
  try {
    blocked = row.blocked ? JSON.parse(row.blocked) : null;
  } catch {
    blocked = null;
  }
  return {
    id: row.id,
    eventUid: row.event_uid,
    timestamp: row.timestamp,
    receivedAt: row.received_at,
    source: row.source,
    host: row.host,
    event: row.event,
    action: row.action,
    status: row.status,
    ip: row.ip,
    user: row.username,
    message: row.message,
    raw: row.raw,
    anomalyScore: row.anomaly_score,
    anomalySeverity: row.anomaly_severity,
    anomalyExplanation: explanation,
    blocked,
    ingestedBy: row.ingested_by,
  };
}

export function telemetryStats(db, workspaceId) {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'alert' THEN 1 ELSE 0 END) AS alerts,
              SUM(CASE WHEN status = 'deny' THEN 1 ELSE 0 END) AS denied,
              SUM(CASE WHEN anomaly_score IS NOT NULL THEN 1 ELSE 0 END) AS scored,
              MAX(timestamp) AS latest,
              MIN(timestamp) AS earliest
       FROM telemetry_events WHERE workspace_id = ?`
    )
    .get(workspaceId);
  const last24h = db
    .prepare(
      `SELECT COUNT(*) AS count FROM telemetry_events
       WHERE workspace_id = ? AND timestamp >= ?`
    )
    .get(workspaceId, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).count;
  const sources = db
    .prepare(
      `SELECT source, COUNT(*) AS count FROM telemetry_events
       WHERE workspace_id = ? GROUP BY source ORDER BY count DESC LIMIT 20`
    )
    .all(workspaceId);
  const blocked = db
    .prepare(
      `SELECT COUNT(*) AS count FROM response_blocks
       WHERE workspace_id = ? AND active = 1`
    )
    .get(workspaceId).count;

  return {
    total: totals.total || 0,
    alerts: totals.alerts || 0,
    denied: totals.denied || 0,
    scored: totals.scored || 0,
    latest: totals.latest || null,
    earliest: totals.earliest || null,
    last24h,
    sources,
    activeBlocks: blocked,
    model: getModelMetadata(db, workspaceId),
    retentionDays: config.telemetryRetentionDays,
    maxEvents: config.telemetryMaxEvents,
  };
}

export function topAnomalies(db, workspaceId, { limit = 20, minScore = null } = {}) {
  const rows = db
    .prepare(
      `SELECT * FROM telemetry_events
       WHERE workspace_id = ? AND anomaly_score IS NOT NULL
         AND (? IS NULL OR anomaly_score >= ?)
       ORDER BY anomaly_score DESC, id DESC
       LIMIT ?`
    )
    .all(workspaceId, minScore, minScore, Math.min(100, Math.max(1, Number(limit) || 20)));
  return rows.map(serializeTelemetryRow);
}

export function pruneTelemetry(db, workspaceId, { force = false } = {}) {
  const last = lastPrune.get(workspaceId) || 0;
  if (!force && Date.now() - last < 5 * 60 * 1000) return 0;
  lastPrune.set(workspaceId, Date.now());
  const cutoff = new Date(
    Date.now() - config.telemetryRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const expired = db
    .prepare("DELETE FROM telemetry_events WHERE workspace_id = ? AND timestamp < ?")
    .run(workspaceId, cutoff);
  const overflow = db
    .prepare(
      `DELETE FROM telemetry_events
       WHERE workspace_id = ? AND id <= (
         SELECT id FROM telemetry_events
         WHERE workspace_id = ?
         ORDER BY id DESC
         LIMIT 1 OFFSET ?
       )`
    )
    .run(workspaceId, workspaceId, config.telemetryMaxEvents);
  return Number(expired.changes || 0) + Number(overflow.changes || 0);
}

function maybePrune(db, workspaceId) {
  try {
    pruneTelemetry(db, workspaceId);
  } catch (error) {
    console.error("[telemetry] Retention failed:", error.message);
  }
}

/* ------------------------------------------------------------------ */
/* Ingestion tokens                                                    */
/* ------------------------------------------------------------------ */

export function createTelemetryToken(db, { workspaceId, label, userId = null }) {
  const token = `dtcw_${randomBytes(24).toString("base64url")}`;
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO telemetry_tokens
       (id, workspace_id, label, prefix, token_hash, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, workspaceId, String(label || "Log shipper").slice(0, 80), token.slice(0, 12), hashToken(token), userId, createdAt);
  return {
    id,
    label: String(label || "Log shipper").slice(0, 80),
    prefix: token.slice(0, 12),
    token,
    createdAt,
  };
}

export function verifyTelemetryToken(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT id, workspace_id, label, prefix, last_used_at, revoked_at
       FROM telemetry_tokens WHERE token_hash = ?`
    )
    .get(hashToken(token));
  if (!row || row.revoked_at) return null;
  const lastUsed = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
  if (Date.now() - lastUsed > 60_000) {
    db.prepare("UPDATE telemetry_tokens SET last_used_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      row.id
    );
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    label: row.label,
    prefix: row.prefix,
  };
}

export function listTelemetryTokens(db, workspaceId) {
  return db
    .prepare(
      `SELECT id, label, prefix, created_by, created_at, last_used_at, revoked_at
       FROM telemetry_tokens WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(workspaceId);
}

export function revokeTelemetryToken(db, workspaceId, tokenId) {
  const result = db
    .prepare(
      `UPDATE telemetry_tokens SET revoked_at = ?
       WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL`
    )
    .run(new Date().toISOString(), tokenId, workspaceId);
  return Number(result.changes || 0) > 0;
}

/* ------------------------------------------------------------------ */
/* Server-Sent Events fan-out                                          */
/* ------------------------------------------------------------------ */

export function subscribeTelemetry(workspaceId, res, meta = {}) {
  if (!streams.has(workspaceId)) streams.set(workspaceId, new Set());
  const client = { res, ...meta };
  streams.get(workspaceId).add(client);
  return () => {
    streams.get(workspaceId)?.delete(client);
    if (streams.get(workspaceId)?.size === 0) streams.delete(workspaceId);
  };
}

export function publishTelemetry(workspaceId, events) {
  const listeners = streams.get(workspaceId);
  if (!listeners?.size) return 0;
  const payload = `event: telemetry\ndata: ${JSON.stringify({ events })}\n\n`;
  let delivered = 0;
  listeners.forEach((client) => {
    try {
      if (client.res.writableLength > 1_000_000) return;
      client.res.write(payload);
      delivered += 1;
    } catch {
      listeners.delete(client);
    }
  });
  return delivered;
}

export function telemetryStreamCount(workspaceId) {
  return streams.get(workspaceId)?.size || 0;
}
