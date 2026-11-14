import { randomBytes } from "node:crypto";
import ipaddr from "ipaddr.js";
import { isPublicAddress } from "./ml/anomaly.js";

/**
 * Approval-gated response playbooks.
 *
 * A playbook is proposed by an analyst (or automatically by a detection rule)
 * and only executes after an authorised approver records a decision. Execution
 * changes real server-side enforcement state: response_blocks affects how later
 * telemetry is tagged, and revoke-sessions deletes live session rows.
 */

export const PLAYBOOKS = [
  {
    id: "block-ip",
    label: "Block source IP",
    description:
      "Adds the address to the workspace blocklist. New telemetry from this address is tagged and raised to alert.",
    targetKind: "ip",
    impact: "high",
    reversible: true,
    defaultMinScore: 0.75,
  },
  {
    id: "isolate-host",
    label: "Isolate host",
    description:
      "Adds the host to the workspace isolation list. New telemetry from the host is tagged for containment review.",
    targetKind: "host",
    impact: "high",
    reversible: true,
    defaultMinScore: 0.75,
  },
  {
    id: "revoke-sessions",
    label: "Revoke identity sessions",
    description:
      "Deletes every live server session for the matching workspace user. Existing browser cookies stop working immediately.",
    targetKind: "identity",
    impact: "medium",
    reversible: false,
    defaultMinScore: 0.8,
  },
  {
    id: "disable-identity",
    label: "Disable identity",
    description:
      "Adds the identity to the blocklist and revokes its live sessions. Reverting removes the block; revoked sessions cannot be restored.",
    targetKind: "identity",
    impact: "critical",
    reversible: true,
    defaultMinScore: 0.85,
  },
];

const PLAYBOOK_BY_ID = new Map(PLAYBOOKS.map((playbook) => [playbook.id, playbook]));

function actionId() {
  return `RSP-${Date.now().toString(36).toUpperCase()}-${randomBytes(2)
    .toString("hex")
    .toUpperCase()}`;
}

function truncate(value, max) {
  return String(value ?? "").slice(0, max);
}

export function playbookCatalog() {
  return PLAYBOOKS.map((playbook) => ({ ...playbook }));
}

function normalizeTarget(playbook, rawTarget) {
  const raw = String(rawTarget || "").trim();
  if (!raw) {
    const error = new Error("A target is required for this playbook.");
    error.code = "invalid_target";
    throw error;
  }

  if (playbook.targetKind === "ip") {
    if (!ipaddr.isValid(raw)) {
      const error = new Error("The target must be a valid IP address.");
      error.code = "invalid_target";
      throw error;
    }
    let parsed = ipaddr.parse(raw);
    if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
    return parsed.toString();
  }

  if (playbook.targetKind === "host") {
    const host = raw.toLowerCase();
    if (!/^[a-z0-9][a-z0-9._:-]{0,119}$/.test(host)) {
      const error = new Error("The target must be a valid hostname or asset id.");
      error.code = "invalid_target";
      throw error;
    }
    return host;
  }

  const identity = raw.toLowerCase();
  if (!/^[^\s@]{1,120}@[^\s@]{1,120}\.[^\s@]{2,}$/.test(identity)) {
    const error = new Error("The target must be a workspace user email address.");
    error.code = "invalid_target";
    throw error;
  }
  return identity;
}

export function proposeResponseAction(
  db,
  workspaceId,
  { playbookId, target, rationale, incidentId = null, detectionId = null, eventId = null, requestedBy, requestedById, automated = false }
) {
  const playbook = PLAYBOOK_BY_ID.get(playbookId);
  if (!playbook) {
    const error = new Error("Unknown response playbook.");
    error.code = "invalid_playbook";
    throw error;
  }
  const normalizedTarget = normalizeTarget(playbook, target);

  const duplicate = db
    .prepare(
      `SELECT * FROM response_actions
       WHERE workspace_id = ? AND playbook_id = ? AND target = ? AND status = 'pending'
       ORDER BY requested_at DESC LIMIT 1`
    )
    .get(workspaceId, playbook.id, normalizedTarget);
  if (duplicate) {
    return { action: serializeAction(duplicate), duplicate: true };
  }

  const id = actionId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO response_actions
       (id, workspace_id, incident_id, detection_id, event_id, playbook_id, target, rationale, status,
        automated, requested_by, requested_by_id, requested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
  ).run(
    id,
    workspaceId,
    incidentId ? truncate(incidentId, 120) : null,
    detectionId ? truncate(detectionId, 120) : null,
    Number.isFinite(Number(eventId)) ? Number(eventId) : null,
    playbook.id,
    normalizedTarget,
    truncate(rationale || playbook.description, 1200),
    automated ? 1 : 0,
    truncate(requestedBy || "System", 120),
    requestedById ? truncate(requestedById, 120) : null,
    now
  );

  return {
    action: serializeAction(
      db.prepare("SELECT * FROM response_actions WHERE id = ?").get(id)
    ),
    duplicate: false,
  };
}

export function serializeAction(row) {
  const parse = (value) => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };
  return {
    id: row.id,
    incidentId: row.incident_id,
    detectionId: row.detection_id,
    eventId: row.event_id,
    playbookId: row.playbook_id,
    playbook: PLAYBOOK_BY_ID.get(row.playbook_id) || null,
    target: row.target,
    rationale: row.rationale,
    status: row.status,
    automated: Boolean(row.automated),
    requestedBy: row.requested_by,
    requestedById: row.requested_by_id,
    requestedAt: row.requested_at,
    decidedBy: row.decided_by,
    decidedById: row.decided_by_id,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    executedAt: row.executed_at,
    result: parse(row.result),
    previousState: parse(row.previous_state),
  };
}

export function listResponseActions(db, workspaceId, { status = null, incidentId = null, limit = 50 } = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (incidentId) {
    clauses.push("incident_id = ?");
    params.push(incidentId);
  }
  const rows = db
    .prepare(
      `SELECT * FROM response_actions
       WHERE ${clauses.join(" AND ")}
       ORDER BY requested_at DESC LIMIT ?`
    )
    .all(...params, Math.min(200, Math.max(1, Number(limit) || 50)));
  return rows.map(serializeAction);
}

function addBlock(db, workspaceId, { actionId: sourceAction, kind, value }) {
  const existing = db
    .prepare(
      `SELECT id FROM response_blocks
       WHERE workspace_id = ? AND kind = ? AND value = ? AND active = 1
       LIMIT 1`
    )
    .get(workspaceId, kind, String(value).toLowerCase());
  if (existing) return { created: false, blockId: existing.id, kind, value };
  const info = db
    .prepare(
      `INSERT INTO response_blocks (workspace_id, action_id, kind, value, created_at, active)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    .run(workspaceId, sourceAction, kind, String(value).toLowerCase(), new Date().toISOString());
  return { created: true, blockId: Number(info.lastInsertRowid), kind, value };
}

function revokeSessionsFor(db, workspaceId, email) {
  const result = db
    .prepare(
      `DELETE FROM sessions
       WHERE user_id IN (
         SELECT id FROM users WHERE workspace_id = ? AND lower(email) = lower(?)
       )`
    )
    .run(workspaceId, email);
  return Number(result.changes || 0);
}

function executePlaybook(db, action) {
  switch (action.playbookId) {
    case "block-ip": {
      const block = addBlock(db, action.workspaceId, {
        actionId: action.id,
        kind: "ip",
        value: action.target,
      });
      return {
        reversible: true,
        summary: `${action.target} is now blocked for the workspace.`,
        ...block,
      };
    }
    case "isolate-host": {
      const block = addBlock(db, action.workspaceId, {
        actionId: action.id,
        kind: "host",
        value: action.target,
      });
      return {
        reversible: true,
        summary: `${action.target} is now marked isolated.`,
        ...block,
      };
    }
    case "revoke-sessions": {
      const revoked = revokeSessionsFor(db, action.workspaceId, action.target);
      return {
        reversible: false,
        summary: `Revoked ${revoked} live session(s) for ${action.target}.`,
        revoked,
      };
    }
    case "disable-identity": {
      const block = addBlock(db, action.workspaceId, {
        actionId: action.id,
        kind: "identity",
        value: action.target,
      });
      const revoked = revokeSessionsFor(db, action.workspaceId, action.target);
      return {
        reversible: true,
        summary: `Identity ${action.target} is blocked and ${revoked} session(s) were revoked.`,
        revoked,
        ...block,
      };
    }
    default:
      throw new Error("Unknown response playbook.");
  }
}

export function decideResponseAction(
  db,
  workspaceId,
  actionIdValue,
  { decision, note = "", decidedBy, decidedById }
) {
  const row = db
    .prepare("SELECT * FROM response_actions WHERE id = ? AND workspace_id = ?")
    .get(actionIdValue, workspaceId);
  if (!row) {
    const error = new Error("Response action not found.");
    error.code = "action_not_found";
    throw error;
  }
  if (row.status !== "pending") {
    const error = new Error("This action has already been decided.");
    error.code = "action_not_pending";
    throw error;
  }

  const now = new Date().toISOString();
  if (decision === "reject") {
    db.prepare(
      `UPDATE response_actions
       SET status = 'rejected', decided_by = ?, decided_by_id = ?, decided_at = ?, decision_note = ?
       WHERE id = ?`
    ).run(truncate(decidedBy, 120), decidedById || null, now, truncate(note, 500), row.id);
    return { action: serializeAction(db.prepare("SELECT * FROM response_actions WHERE id = ?").get(row.id)), executed: false };
  }

  if (decision !== "approve") {
    const error = new Error("Decision must be approve or reject.");
    error.code = "invalid_decision";
    throw error;
  }

  let result;
  let status = "executed";
  try {
    result = executePlaybook(db, {
      ...row,
      workspaceId,
      playbookId: row.playbook_id,
    });
    result.selfApproved = Boolean(row.requested_by_id && row.requested_by_id === decidedById);
  } catch (error) {
    status = "failed";
    result = { reversible: false, summary: "Execution failed.", error: error.message };
  }

  db.prepare(
    `UPDATE response_actions
     SET status = ?, decided_by = ?, decided_by_id = ?, decided_at = ?, decision_note = ?,
         executed_at = ?, result = ?
     WHERE id = ?`
  ).run(
    status,
    truncate(decidedBy, 120),
    decidedById || null,
    now,
    truncate(note, 500),
    status === "executed" ? now : null,
    JSON.stringify(result),
    row.id
  );

  return {
    action: serializeAction(db.prepare("SELECT * FROM response_actions WHERE id = ?").get(row.id)),
    executed: status === "executed",
  };
}

export function revertResponseAction(db, workspaceId, actionIdValue, { revertedBy, revertedById }) {
  const row = db
    .prepare("SELECT * FROM response_actions WHERE id = ? AND workspace_id = ?")
    .get(actionIdValue, workspaceId);
  if (!row) {
    const error = new Error("Response action not found.");
    error.code = "action_not_found";
    throw error;
  }
  if (row.status !== "executed") {
    const error = new Error("Only an executed action can be reverted.");
    error.code = "action_not_revertible";
    throw error;
  }
  const playbook = PLAYBOOK_BY_ID.get(row.playbook_id);
  if (!playbook?.reversible) {
    const error = new Error("This playbook has irreversible effects and cannot be reverted.");
    error.code = "action_not_revertible";
    throw error;
  }

  const result = db
    .prepare("UPDATE response_blocks SET active = 0 WHERE workspace_id = ? AND action_id = ?")
    .run(workspaceId, row.id);
  const now = new Date().toISOString();
  const previous = (() => {
    try {
      return JSON.parse(row.result || "{}");
    } catch {
      return {};
    }
  })();
  db.prepare(
    `UPDATE response_actions
     SET status = 'reverted', result = ?, decision_note = COALESCE(decision_note, '') || ?
     WHERE id = ?`
  ).run(
    JSON.stringify({
      ...previous,
      reverted: true,
      revertedBy,
      revertedById,
      revertedAt: now,
      blocksDeactivated: Number(result.changes || 0),
    }),
    ` | reverted by ${revertedBy}`,
    row.id
  );

  return serializeAction(db.prepare("SELECT * FROM response_actions WHERE id = ?").get(row.id));
}

export function listActiveBlocks(db, workspaceId) {
  return db
    .prepare(
      `SELECT id, action_id, kind, value, created_at
       FROM response_blocks WHERE workspace_id = ? AND active = 1
       ORDER BY created_at DESC LIMIT 200`
    )
    .all(workspaceId)
    .map((row) => ({
      id: row.id,
      actionId: row.action_id,
      kind: row.kind,
      value: row.value,
      createdAt: row.created_at,
    }));
}

/* ------------------------------------------------------------------ */
/* Automation rules                                                    */
/* ------------------------------------------------------------------ */

export function getResponseRules(db, workspaceId) {
  const rows = db
    .prepare("SELECT * FROM response_rules WHERE workspace_id = ?")
    .all(workspaceId);
  const byId = new Map(rows.map((row) => [row.playbook_id, row]));
  return PLAYBOOKS.map((playbook) => {
    const row = byId.get(playbook.id);
    return {
      playbookId: playbook.id,
      label: playbook.label,
      description: playbook.description,
      enabled: row ? Boolean(row.enabled) : false,
      minScore: row ? Number(row.min_score) : playbook.defaultMinScore,
      updatedAt: row?.updated_at || null,
    };
  });
}

export function updateResponseRule(db, workspaceId, { playbookId, enabled, minScore, updatedBy }) {
  if (!PLAYBOOK_BY_ID.has(playbookId)) {
    const error = new Error("Unknown response playbook.");
    error.code = "invalid_playbook";
    throw error;
  }
  const score = Number(minScore);
  if (!Number.isFinite(score) || score < 0.5 || score > 0.99) {
    const error = new Error("minScore must be between 0.5 and 0.99.");
    error.code = "invalid_rule";
    throw error;
  }
  db.prepare(
    `INSERT INTO response_rules (workspace_id, playbook_id, enabled, min_score, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, playbook_id) DO UPDATE SET
       enabled = excluded.enabled,
       min_score = excluded.min_score,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`
  ).run(workspaceId, playbookId, enabled ? 1 : 0, score, truncate(updatedBy, 120), new Date().toISOString());
  return getResponseRules(db, workspaceId).find((rule) => rule.playbookId === playbookId);
}

function recentAutoProposal(db, workspaceId, playbookId, target) {
  return db
    .prepare(
      `SELECT id FROM response_actions
       WHERE workspace_id = ? AND playbook_id = ? AND target = ?
         AND requested_at >= ? AND status <> 'rejected'
       LIMIT 1`
    )
    .get(
      workspaceId,
      playbookId,
      String(target).toLowerCase(),
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    );
}

/**
 * Turn high-scoring telemetry into pending response proposals. Automation never
 * executes a playbook; it only queues work for a human approver.
 */
export function applyAutomation(db, workspaceId, events, { requestedBy = "HUNT_HUNTER automation" } = {}) {
  const rules = getResponseRules(db, workspaceId).filter((rule) => rule.enabled);
  if (!rules.length) return [];
  const proposals = [];

  for (const event of events) {
    if (!event.anomaly || event.anomaly.score === null) continue;
    if (!['high', 'critical'].includes(event.anomaly.severity)) continue;

    for (const rule of rules) {
      if (event.anomaly.score < rule.minScore) continue;
      let target = null;
      if (rule.playbookId === "block-ip" && isPublicAddress(event.ip)) target = event.ip;
      if (rule.playbookId === "isolate-host" && event.host && event.host !== "unknown-host") {
        target = event.host;
      }
      if (
        (rule.playbookId === "revoke-sessions" || rule.playbookId === "disable-identity") &&
        /@/.test(event.user)
      ) {
        target = event.user;
      }
      if (!target) continue;
      if (recentAutoProposal(db, workspaceId, rule.playbookId, target)) continue;
      if (proposals.length >= 12) return proposals;

      try {
        const result = proposeResponseAction(db, workspaceId, {
          playbookId: rule.playbookId,
          target,
          rationale: `Automated proposal from anomaly ${event.anomaly.score.toFixed(
            3
          )} on ${event.host} (${event.event}). ${event.anomaly.explanation.summary}`,
          detectionId: null,
          eventId: event.id,
          requestedBy,
          requestedById: null,
          automated: true,
        });
        if (!result.duplicate) proposals.push(result.action);
      } catch {
        // A malformed target (for example a hostname outside the playbook
        // grammar) must not stop the rest of the batch.
      }
    }
  }
  return proposals;
}
