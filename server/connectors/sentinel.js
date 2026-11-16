import { config } from "../config.js";
import { azureConfigured, azureToken } from "./azure.js";
import { connectorError, httpJson } from "./http.js";
import { normalizeVendorEvent } from "./normalize.js";

const settings = config.connectors.sentinel;
const SCOPE = "https://api.loganalytics.io/.default";

function configured() {
  return Boolean(azureConfigured(settings) && settings.workspaceId);
}

function kql(limit) {
  if (settings.query) return settings.query;
  return `SecurityEvent | where TimeGenerated > ago(15m) | sort by TimeGenerated asc | take ${limit}`;
}

function rowsToRecords(response) {
  const table = response?.tables?.[0];
  if (!table) return [];
  const columns = (table.columns || []).map((column) => column.name);
  return (table.rows || []).map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index]]))
  );
}

export default {
  id: "sentinel",
  label: "Microsoft Sentinel",
  kind: "siem",
  description: "Runs a KQL query against a Log Analytics workspace using an Azure app registration.",
  requiredEnv: [
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "SENTINEL_WORKSPACE_ID",
  ],
  configured,
  async test() {
    if (!configured()) {
      return {
        ok: false,
        unconfigured: true,
        detail: "Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and SENTINEL_WORKSPACE_ID.",
      };
    }
    const started = Date.now();
    try {
      const token = await azureToken({ ...settings, scope: SCOPE, source: "Sentinel" });
      await httpJson(
        `https://api.loganalytics.io/v1/workspaces/${encodeURIComponent(settings.workspaceId)}/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "print now()", timespan: "PT5M" }),
          source: "Sentinel",
        }
      );
      return { ok: true, latencyMs: Date.now() - started, detail: "Authenticated and queried the Log Analytics workspace." };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, detail: connectorError(error) };
    }
  },
  async pull({ limit = 200 } = {}) {
    if (!configured()) throw new Error("Sentinel connector is not configured.");
    const token = await azureToken({ ...settings, scope: SCOPE, source: "Sentinel" });
    const response = await httpJson(
      `https://api.loganalytics.io/v1/workspaces/${encodeURIComponent(settings.workspaceId)}/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: kql(limit), timespan: "PT15M" }),
        source: "Sentinel",
      }
    );
    return {
      events: rowsToRecords(response)
        .slice(0, limit)
        .map((record) => normalizeVendorEvent(record, { source: "sentinel", label: "Microsoft Sentinel" })),
    };
  },
};
