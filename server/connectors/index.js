import splunk from "./splunk.js";
import elastic from "./elastic.js";
import sentinel from "./sentinel.js";
import defender from "./defender.js";
import crowdstrike from "./crowdstrike.js";
import wazuh from "./wazuh.js";
import { genericEdr, genericSiem } from "./generic.js";

/**
 * Registry of real pull connectors.
 *
 * A connector is `live` only when every credential it needs is present in the
 * server environment. `test` performs an authenticated request and `pull`
 * fetches normalised events; neither endpoint is reachable without a signed-in
 * session and `hunter:write`.
 */
export const CONNECTORS = [splunk, elastic, sentinel, defender, crowdstrike, wazuh, genericSiem, genericEdr];

const byId = new Map(CONNECTORS.map((connector) => [connector.id, connector]));

export class ConnectorError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
  }
}

export function getConnector(id) {
  return byId.get(String(id || "")) || null;
}

function stateRows(db, workspaceId) {
  try {
    return db
      .prepare("SELECT * FROM connector_state WHERE workspace_id = ?")
      .all(workspaceId);
  } catch {
    return [];
  }
}

export function connectorStatus(db, workspaceId) {
  const states = new Map(stateRows(db, workspaceId).map((row) => [row.connector_id, row]));
  return CONNECTORS.map((connector) => {
    const configured = connector.configured();
    const state = states.get(connector.id) || null;
    return {
      id: connector.id,
      label: connector.label,
      kind: connector.kind,
      mode: configured ? "live" : "unconfigured",
      status: configured ? "ready" : "needs_configuration",
      description: connector.description,
      requiredEnv: connector.requiredEnv,
      lastTest: state?.last_test_at
        ? {
            at: state.last_test_at,
            ok: Boolean(state.last_test_ok),
            detail: state.last_test_detail || "",
          }
        : null,
      lastPull: state?.last_pull_at
        ? { at: state.last_pull_at, count: state.last_pull_count || 0 }
        : null,
    };
  });
}

export function connectorCatalog() {
  return CONNECTORS.map((connector) => ({
    id: connector.id,
    label: connector.label,
    kind: connector.kind,
    configured: connector.configured(),
    requiredEnv: connector.requiredEnv,
  }));
}

function persistState(db, workspaceId, connectorId, patch) {
  const current = db
    .prepare("SELECT * FROM connector_state WHERE workspace_id = ? AND connector_id = ?")
    .get(workspaceId, connectorId);
  if (!current) {
    db.prepare(
      `INSERT INTO connector_state
         (workspace_id, connector_id, last_test_at, last_test_ok, last_test_detail, last_pull_at, last_pull_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      workspaceId,
      connectorId,
      patch.lastTestAt ?? null,
      patch.lastTestOk === undefined ? null : patch.lastTestOk ? 1 : 0,
      patch.lastTestDetail ?? null,
      patch.lastPullAt ?? null,
      patch.lastPullCount ?? 0
    );
    return;
  }
  db.prepare(
    `UPDATE connector_state
     SET last_test_at = COALESCE(?, last_test_at),
         last_test_ok = COALESCE(?, last_test_ok),
         last_test_detail = COALESCE(?, last_test_detail),
         last_pull_at = COALESCE(?, last_pull_at),
         last_pull_count = COALESCE(?, last_pull_count)
     WHERE workspace_id = ? AND connector_id = ?`
  ).run(
    patch.lastTestAt ?? null,
    patch.lastTestOk === undefined ? null : patch.lastTestOk ? 1 : 0,
    patch.lastTestDetail ?? null,
    patch.lastPullAt ?? null,
    patch.lastPullCount ?? null,
    workspaceId,
    connectorId
  );
}

export async function testConnector(db, workspaceId, id) {
  const connector = getConnector(id);
  if (!connector) throw new ConnectorError("Connector not found.", "connector_unknown");
  if (!connector.configured()) {
    return {
      connector: { id: connector.id, label: connector.label, mode: "unconfigured" },
      result: {
        ok: false,
        unconfigured: true,
        checkedAt: new Date().toISOString(),
        detail: `Credentials are not configured. Required: ${connector.requiredEnv.join(", ")}.`,
      },
    };
  }

  let result;
  try {
    result = await connector.test();
  } catch (error) {
    result = {
      ok: false,
      checkedAt: new Date().toISOString(),
      detail: error?.message || "Connector test failed.",
    };
  }
  const checkedAt = result.checkedAt || new Date().toISOString();
  persistState(db, workspaceId, connector.id, {
    lastTestAt: checkedAt,
    lastTestOk: result.ok,
    lastTestDetail: String(result.detail || "").slice(0, 500),
  });
  return {
    connector: { id: connector.id, label: connector.label, mode: "live" },
    result: { ...result, checkedAt },
  };
}

export async function pullConnector(db, workspaceId, id, { since, limit } = {}) {
  const connector = getConnector(id);
  if (!connector) throw new ConnectorError("Connector not found.", "connector_unknown");
  if (!connector.configured()) {
    throw new ConnectorError(
      `${connector.label} is not configured. Set ${connector.requiredEnv.join(", ")}.`,
      "connector_not_configured"
    );
  }

  const started = Date.now();
  const result = await connector.pull({
    since,
    limit: Math.min(Math.max(Number(limit) || 200, 1), 1000),
  });
  const pulledAt = new Date().toISOString();
  persistState(db, workspaceId, connector.id, {
    lastPullAt: pulledAt,
    lastPullCount: result.events.length,
  });
  return {
    connector: { id: connector.id, label: connector.label, kind: connector.kind },
    events: result.events,
    durationMs: Date.now() - started,
    pulledAt,
  };
}
