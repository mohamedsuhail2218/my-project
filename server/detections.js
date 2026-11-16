import { randomUUID } from "node:crypto";
import { config } from "./config.js";

/**
 * Stateful, rule-based attack detection.
 *
 * Every telemetry batch is followed by a rolling-window evaluation over stored
 * events. The rules below are deterministic and explainable: an analyst can
 * reproduce each detection from the event ids and entities attached to it.
 * Detections are deduplicated per rule/entity/hour, so a noisy event stream
 * updates one case instead of creating thousands of duplicate rows.
 */

const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
const HOUR_MS = 60 * 60 * 1000;

const AUTH_RE = /(auth|login|logon|signin|sign-in|password|credential|ssh|rdp|vpn|sudo)/i;
const FAIL_RE = /(fail|failure|invalid|incorrect|denied|lockout|unable to authenticate|not authorized)/i;
const SCAN_RE = /(port[\s_-]?scan|scan(ned|ning)?|syn probe|nmap|masscan|zmap|probe)/i;
const EGRESS_RE = /(egress|outbound|blocked|denied|firewall|exfil|beacon|command.and.control|c2)/i;
const AUTH_SOURCES = new Set(["vpn", "identity", "auth", "ssh", "rdp", "iam", "windows", "okta", "azure-ad"]);
const NETWORK_SOURCES = new Set(["network", "zeek", "suricata", "netflow", "sflow", "firewall", "ids", "ips"]);

const RULE_CATALOG = [
  {
    id: "brute_force",
    category: "brute_force",
    label: "Brute-force authentication",
    technique: "T1110",
    description: "Repeated failed authentication for one source IP or identity.",
    windowSeconds: 300,
    thresholdKey: "bruteForceThreshold",
  },
  {
    id: "port_scan",
    category: "port_scan",
    label: "Port scan",
    technique: "T1046",
    description: "One source contacting a high number of distinct destination ports.",
    windowSeconds: 120,
    thresholdKey: "portScanThreshold",
  },
  {
    id: "suspicious_beacon",
    category: "suspicious_connection",
    label: "Beaconing connection pattern",
    technique: "T1071.001",
    description: "Regular, repeated connections from one host to the same destination.",
    windowSeconds: 900,
    thresholdKey: "beaconThreshold",
  },
  {
    id: "suspicious_fanout",
    category: "suspicious_connection",
    label: "Fan-out connection pattern",
    technique: "T1071",
    description: "One host contacts an unusually broad set of destinations.",
    windowSeconds: 300,
    thresholdKey: "fanoutThreshold",
  },
  {
    id: "suspicious_known_bad",
    category: "suspicious_connection",
    label: "Known-bad destination",
    technique: "T1095",
    description: "A connection to an address with a malicious or suspicious intel verdict.",
    windowSeconds: 900,
    thresholdKey: null,
  },
  {
    id: "suspicious_egress",
    category: "suspicious_connection",
    label: "Repeated blocked egress",
    technique: "T1041",
    description: "A host repeatedly attempts outbound connections blocked by policy.",
    windowSeconds: 300,
    thresholdKey: "egressThreshold",
  },
];

export function detectionRuleCatalog() {
  return RULE_CATALOG.map((rule) => ({
    ...rule,
    threshold: rule.thresholdKey ? config.detections[rule.thresholdKey] : null,
    enabled: config.detections.enabled,
  }));
}

function hourBucket(value) {
  const date = value ? new Date(value) : new Date();
  const time = Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
  return new Date(Math.floor(time / HOUR_MS) * HOUR_MS).toISOString();
}

function severityFor(count, { medium = 2, high = 8, critical = 15 } = {}) {
  if (count >= critical) return "critical";
  if (count >= high) return "high";
  if (count >= medium) return "medium";
  return "low";
}

function maxSeverity(left, right) {
  return SEVERITY_RANK[right] > SEVERITY_RANK[left] ? right : left;
}

function parseEvidence(value) {
  try {
    const parsed = value ? JSON.parse(value) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mergeIds(left = [], right = []) {
  return [...new Set([...left, ...right].map(Number).filter(Number.isFinite))].slice(-60);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isAuthFailure(row) {
  const text = `${row.event || ""} ${row.action || ""} ${row.message || ""}`;
  const authContext = AUTH_SOURCES.has(String(row.source || "").toLowerCase()) || AUTH_RE.test(text);
  if (!authContext) return false;
  return row.status === "deny" || FAIL_RE.test(text);
}

function isNetworkRow(row) {
  return Boolean(
    row.dst_port ||
      row.dst_ip ||
      NETWORK_SOURCES.has(String(row.source || "").toLowerCase())
  );
}

function isScanSignature(row) {
  return SCAN_RE.test(`${row.event || ""} ${row.action || ""} ${row.message || ""}`);
}

function detectionCandidate({
  ruleId,
  category,
  title,
  severity,
  confidence,
  entity,
  detail,
  technique,
  rows,
  extraEvidence = {},
  dedupeKey,
}) {
  const eventIds = rows.map((row) => row.id).filter(Boolean);
  const times = rows
    .map((row) => new Date(row.timestamp).getTime())
    .filter((time) => Number.isFinite(time));
  const firstSeen = times.length ? new Date(Math.min(...times)).toISOString() : new Date().toISOString();
  const lastSeen = times.length ? new Date(Math.max(...times)).toISOString() : firstSeen;
  return {
    ruleId,
    category,
    title,
    severity,
    confidence,
    entity,
    detail,
    technique,
    eventCount: eventIds.length,
    firstSeen,
    lastSeen,
    dedupeKey: `${dedupeKey}:${hourBucket(lastSeen)}`,
    evidence: {
      eventIds: unique(eventIds).slice(-60),
      hosts: unique(rows.map((row) => row.host)).slice(0, 12),
      users: unique(rows.map((row) => row.username)).slice(0, 12),
      ips: unique(rows.map((row) => row.ip)).slice(0, 12),
      ...extraEvidence,
    },
  };
}

function bruteForceCandidates(rows) {
  const groups = new Map();
  rows.filter(isAuthFailure).forEach((row) => {
    const entity = row.ip || row.username || row.host;
    if (!entity) return;
    if (!groups.has(entity)) groups.set(entity, []);
    groups.get(entity).push(row);
  });

  const candidates = [];
  groups.forEach((group, entity) => {
    const threshold = config.detections.bruteForceThreshold;
    if (group.length < threshold) return;
    const users = unique(group.map((row) => row.username)).slice(0, 5);
    const targets = unique(group.map((row) => row.host)).slice(0, 5);
    const severity = severityFor(group.length, { medium: threshold, high: Math.max(threshold * 2, 8), critical: Math.max(threshold * 3, 15) });
    candidates.push(
      detectionCandidate({
        ruleId: "brute_force",
        category: "brute_force",
        title: `Brute-force authentication from ${entity}`,
        severity,
        confidence: Math.min(0.99, 0.72 + group.length * 0.015),
        entity,
        detail: `${group.length} failed authentication attempts in the rolling window${
          users.length ? ` against ${users.join(", ")}` : ""
        }${targets.length ? ` on ${targets.join(", ")}` : ""}.`,
        technique: "T1110",
        rows: group,
        extraEvidence: { users, targets },
        dedupeKey: `brute_force:${entity}`,
      })
    );
  });
  return candidates;
}

function portScanCandidates(rows) {
  const groups = new Map();
  rows.filter((row) => isNetworkRow(row) && row.ip).forEach((row) => {
    if (!row.dst_port) return;
    if (!groups.has(row.ip)) groups.set(row.ip, []);
    groups.get(row.ip).push(row);
  });

  const candidates = [];
  groups.forEach((group, entity) => {
    const ports = unique(group.map((row) => Number(row.dst_port)).filter((port) => port > 0 && port <= 65535));
    const signature = group.filter(isScanSignature);
    const threshold = config.detections.portScanThreshold;
    if (ports.length < threshold && signature.length < Math.min(3, threshold)) return;

    const destinations = unique(group.map((row) => row.dst_ip)).slice(0, 8);
    const signatures = unique(signature.map((row) => row.message)).slice(0, 3);
    const severity = ports.length >= 25 || signature.length > 0 ? "high" : "medium";
    candidates.push(
      detectionCandidate({
        ruleId: "port_scan",
        category: "port_scan",
        title: `Port scan from ${entity}`,
        severity,
        confidence: signature.length ? 0.94 : 0.84,
        entity,
        detail: `${ports.length} distinct destination port(s)${
          destinations.length ? ` across ${destinations.join(", ")}` : ""
        }${signatures.length ? `; IDS signature: ${signatures.join("; ")}` : ""}. Ports observed: ${ports
          .slice(0, 18)
          .join(", ")}${ports.length > 18 ? "…" : ""}.`,
        technique: "T1046",
        rows: group,
        extraEvidence: { ports: ports.slice(0, 40), destinations, signatures },
        dedupeKey: `port_scan:${entity}`,
      })
    );
  });
  return candidates;
}

function groupByEntity(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const entity = row.host || row.ip;
    if (!entity) return;
    if (!groups.has(entity)) groups.set(entity, []);
    groups.get(entity).push(row);
  });
  return groups;
}

function beaconCandidates(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!row.dst_ip || !row.dst_port) return;
    const entity = row.host || row.ip;
    if (!entity) return;
    const key = `${entity}::${row.dst_ip}:${row.dst_port}`;
    if (!groups.has(key)) groups.set(key, { entity, destination: `${row.dst_ip}:${row.dst_port}`, rows: [] });
    groups.get(key).rows.push(row);
  });

  const candidates = [];
  groups.forEach(({ entity, destination, rows: group }) => {
    const threshold = config.detections.beaconThreshold;
    if (group.length < threshold) return;

    const times = [...new Set(group.map((row) => new Date(row.timestamp).getTime()))]
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (times.length < threshold) return;
    const intervals = times.slice(1).map((time, index) => time - times[index]);
    const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    if (mean < 1000 || mean > 15 * 60 * 1000) return;
    const variance =
      intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length;
    const coefficient = Math.sqrt(variance) / mean;
    if (coefficient > 0.35) return;

    candidates.push(
      detectionCandidate({
        ruleId: "suspicious_beacon",
        category: "suspicious_connection",
        title: `Possible command-and-control beaconing from ${entity}`,
        severity: group.length >= threshold * 3 ? "high" : "medium",
        confidence: 0.86,
        entity,
        detail: `${times.length} connections to ${destination} with an average interval of ${Math.round(
          mean / 1000
        )}s and ${Math.round(coefficient * 100)}% timing variance.`,
        technique: "T1071.001",
        rows: group,
        extraEvidence: {
          destination,
          averageIntervalSeconds: Math.round(mean / 1000),
          timingVariancePercent: Math.round(coefficient * 100),
        },
        dedupeKey: `suspicious_beacon:${entity}:${destination}`,
      })
    );
  });
  return candidates;
}

function fanoutCandidates(rows) {
  const candidates = [];
  groupByEntity(rows).forEach((group, entity) => {
    const destinations = unique(group.map((row) => row.dst_ip));
    const threshold = config.detections.fanoutThreshold;
    if (destinations.length < threshold) return;
    const ports = unique(group.map((row) => Number(row.dst_port)).filter(Boolean)).slice(0, 12);
    candidates.push(
      detectionCandidate({
        ruleId: "suspicious_fanout",
        category: "suspicious_connection",
        title: `Fan-out connection pattern from ${entity}`,
        severity: destinations.length >= threshold * 2 ? "high" : "medium",
        confidence: 0.8,
        entity,
        detail: `${destinations.length} distinct destinations contacted in the rolling window${
          ports.length ? ` on port(s) ${ports.join(", ")}` : ""
        }. Destinations: ${destinations.slice(0, 10).join(", ")}${destinations.length > 10 ? "…" : ""}.`,
        technique: "T1071",
        rows: group,
        extraEvidence: { destinations: destinations.slice(0, 40), ports },
        dedupeKey: `suspicious_fanout:${entity}`,
      })
    );
  });
  return candidates;
}

function knownBadCandidates(db, workspaceId, rows, nowIso) {
  let cached = [];
  try {
    cached = db
      .prepare(
        `SELECT indicator, payload FROM intel_cache
         WHERE workspace_id = ? AND expires_at > ?`
      )
      .all(workspaceId, nowIso);
  } catch {
    return [];
  }

  const bad = new Map();
  cached.forEach((row) => {
    try {
      const payload = JSON.parse(row.payload);
      if (["malicious", "suspicious"].includes(payload.verdict)) {
        bad.set(String(row.indicator).toLowerCase(), payload.verdict);
      }
    } catch {
      // Ignore a malformed cache row rather than blocking detection.
    }
  });
  if (!bad.size) return [];

  const candidates = [];
  const groups = new Map();
  rows.forEach((row) => {
    const verdict = bad.get(String(row.dst_ip || "").toLowerCase());
    if (!verdict) return;
    const key = `${row.dst_ip}::${row.host || row.ip}`;
    if (!groups.has(key)) groups.set(key, { destination: row.dst_ip, verdict, rows: [] });
    groups.get(key).rows.push(row);
  });

  groups.forEach(({ destination, verdict, rows: group }, key) => {
    const entity = group[0].host || group[0].ip || "unknown-host";
    candidates.push(
      detectionCandidate({
        ruleId: "suspicious_known_bad",
        category: "suspicious_connection",
        title: `Connection to known-bad address ${destination}`,
        severity: verdict === "malicious" ? "high" : "medium",
        confidence: verdict === "malicious" ? 0.95 : 0.82,
        entity,
        detail: `${group.length} connection(s) to ${destination}; cached threat-intel verdict: ${verdict}.`,
        technique: "T1095",
        rows: group,
        extraEvidence: { destination, verdict },
        dedupeKey: `suspicious_known_bad:${key}`,
      })
    );
  });
  return candidates;
}

function egressCandidates(rows) {
  const candidates = [];
  groupByEntity(rows.filter((row) => row.status === "deny" && EGRESS_RE.test(`${row.event} ${row.message}`))).forEach(
    (group, entity) => {
      const threshold = config.detections.egressThreshold;
      if (group.length < threshold) return;
      const destinations = unique(group.map((row) => row.dst_ip || row.ip)).slice(0, 8);
      candidates.push(
        detectionCandidate({
          ruleId: "suspicious_egress",
          category: "suspicious_connection",
          title: `Repeated blocked egress from ${entity}`,
          severity: group.length >= threshold * 2 ? "high" : "medium",
          confidence: 0.79,
          entity,
          detail: `${group.length} outbound connection attempts were denied by policy${
            destinations.length ? ` toward ${destinations.join(", ")}` : ""
          }.`,
          technique: "T1041",
          rows: group,
          extraEvidence: { destinations },
          dedupeKey: `suspicious_egress:${entity}`,
        })
      );
    }
  );
  return candidates;
}

function upsertDetection(db, workspaceId, candidate) {
  const existing = db
    .prepare("SELECT * FROM detections WHERE workspace_id = ? AND dedupe_key = ?")
    .get(workspaceId, candidate.dedupeKey);
  const now = new Date().toISOString();

  if (existing) {
    const merged = mergeIds(parseEvidence(existing.evidence).eventIds, candidate.evidence.eventIds);
    const severity = maxSeverity(existing.severity, candidate.severity);
    const lastSeen =
      new Date(candidate.lastSeen).getTime() > new Date(existing.last_seen).getTime()
        ? candidate.lastSeen
        : existing.last_seen;
    db.prepare(
      `UPDATE detections
       SET severity = ?, confidence = ?, detail = ?, technique = ?,
           event_count = ?, last_seen = ?, evidence = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`
    ).run(
      severity,
      Math.max(Number(existing.confidence) || 0, candidate.confidence),
      candidate.detail,
      candidate.technique,
      Math.max(Number(existing.event_count) || 0, candidate.eventCount),
      lastSeen,
      JSON.stringify({ ...parseEvidence(existing.evidence), ...candidate.evidence, eventIds: merged }),
      now,
      existing.id,
      workspaceId
    );
    return serializeDetection(
      db.prepare("SELECT * FROM detections WHERE id = ?").get(existing.id)
    );
  }

  const id = `DET-${randomUUID()}`;
  db.prepare(
    `INSERT INTO detections
       (id, workspace_id, rule_id, category, title, severity, confidence, status, entity,
        detail, technique, event_count, first_seen, last_seen, dedupe_key, evidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workspaceId,
    candidate.ruleId,
    candidate.category,
    candidate.title,
    candidate.severity,
    candidate.confidence,
    candidate.entity,
    candidate.detail,
    candidate.technique,
    candidate.eventCount,
    candidate.firstSeen,
    candidate.lastSeen,
    candidate.dedupeKey,
    JSON.stringify(candidate.evidence),
    now,
    now
  );
  return serializeDetection(db.prepare("SELECT * FROM detections WHERE id = ?").get(id));
}

export function evaluateDetections(db, workspaceId, { now = new Date() } = {}) {
  if (!config.detections.enabled) return [];
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = Number.isNaN(nowDate.getTime()) ? new Date().toISOString() : nowDate.toISOString();
  const since = new Date(
    nowDate.getTime() - Math.max(config.detections.windowSeconds, 900) * 1000
  ).toISOString();

  const rows = db
    .prepare(
      `SELECT id, timestamp, source, host, event, action, status, ip, username, message,
              dst_ip, dst_port, proto, bytes, duration_ms, direction, sensor
       FROM telemetry_events
       WHERE workspace_id = ? AND timestamp >= ?
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(workspaceId, since, config.detections.maxEvents);

  if (!rows.length) return [];

  const candidates = [
    ...bruteForceCandidates(rows),
    ...portScanCandidates(rows),
    ...beaconCandidates(rows),
    ...fanoutCandidates(rows),
    ...knownBadCandidates(db, workspaceId, rows, nowIso),
    ...egressCandidates(rows),
  ].slice(0, 50);

  return candidates.map((candidate) => upsertDetection(db, workspaceId, candidate));
}

export function serializeDetection(row) {
  if (!row) return null;
  return {
    id: row.id,
    ruleId: row.rule_id,
    category: row.category,
    title: row.title,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status,
    entity: row.entity,
    detail: row.detail,
    technique: row.technique,
    eventCount: row.event_count,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    evidence: parseEvidence(row.evidence),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listDetections(
  db,
  workspaceId,
  { status = "", severity = "", category = "", q = "", limit = 50 } = {}
) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (["open", "triaged", "closed"].includes(status)) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (["critical", "high", "medium", "low"].includes(severity)) {
    clauses.push("severity = ?");
    params.push(severity);
  }
  if (category) {
    clauses.push("category = ?");
    params.push(category);
  }
  const tokens = String(q || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  tokens.forEach((token) => {
    const like = `%${token.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    clauses.push(
      `(lower(title) LIKE ? ESCAPE '\\' OR lower(detail) LIKE ? ESCAPE '\\'
        OR lower(entity) LIKE ? ESCAPE '\\' OR lower(technique) LIKE ? ESCAPE '\\')`
    );
    params.push(like, like, like, like);
  });

  const rows = db
    .prepare(
      `SELECT * FROM detections
       WHERE ${clauses.join(" AND ")}
       ORDER BY CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
                last_seen DESC
       LIMIT ?`
    )
    .all(...params, Math.min(200, Math.max(1, Number(limit) || 50)));
  return rows.map(serializeDetection);
}

export function detectionStats(db, workspaceId) {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
              SUM(CASE WHEN status = 'triaged' THEN 1 ELSE 0 END) AS triaged,
              SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
              MAX(last_seen) AS latest
       FROM detections WHERE workspace_id = ?`
    )
    .get(workspaceId);
  const bySeverity = db
    .prepare(
      `SELECT severity,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open
       FROM detections WHERE workspace_id = ? GROUP BY severity`
    )
    .all(workspaceId);
  const byCategory = db
    .prepare(
      `SELECT category, COUNT(*) AS total,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open
       FROM detections WHERE workspace_id = ? GROUP BY category ORDER BY total DESC`
    )
    .all(workspaceId);
  const last24h = db
    .prepare(
      `SELECT COUNT(*) AS count FROM detections
       WHERE workspace_id = ? AND last_seen >= ?`
    )
    .get(workspaceId, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).count;
  const trendRows = db
    .prepare(
      `SELECT substr(last_seen, 1, 13) AS bucket, COUNT(*) AS count
       FROM detections WHERE workspace_id = ? AND last_seen >= ?
       GROUP BY bucket ORDER BY bucket ASC`
    )
    .all(workspaceId, new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString());
  const trendMap = new Map(trendRows.map((row) => [row.bucket, row.count]));
  const trend = Array.from({ length: 12 }, (_, index) => {
    const bucket = new Date(Date.now() - (11 - index) * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 13);
    return { hour: `${bucket}:00Z`, count: trendMap.get(bucket) || 0 };
  });

  return {
    total: totals.total || 0,
    open: totals.open || 0,
    triaged: totals.triaged || 0,
    closed: totals.closed || 0,
    latest: totals.latest || null,
    last24h,
    bySeverity,
    byCategory,
    trend,
    rules: detectionRuleCatalog(),
  };
}

export function updateDetectionStatus(db, workspaceId, detectionId, status) {
  const current = db
    .prepare("SELECT * FROM detections WHERE id = ? AND workspace_id = ?")
    .get(detectionId, workspaceId);
  if (!current) return null;
  db.prepare(
    "UPDATE detections SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?"
  ).run(status, new Date().toISOString(), detectionId, workspaceId);
  return serializeDetection(
    db.prepare("SELECT * FROM detections WHERE id = ?").get(detectionId)
  );
}

export function pruneDetections(db, workspaceId, { retentionDays = 180 } = {}) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  return Number(
    db
      .prepare(
        "DELETE FROM detections WHERE workspace_id = ? AND status = 'closed' AND last_seen < ?"
      )
      .run(workspaceId, cutoff).changes || 0
  );
}
