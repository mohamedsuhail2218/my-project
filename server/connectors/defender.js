import { config } from "../config.js";
import { azureConfigured, azureToken } from "./azure.js";
import { connectorError, httpJson } from "./http.js";
import { normalizeVendorEvent } from "./normalize.js";

const settings = config.connectors.defender;
const SCOPE = "https://api.security.microsoft.com/.default";
const BASE = "https://api.security.microsoft.com";

function configured() {
  return azureConfigured(settings);
}

export default {
  id: "defender",
  label: "Microsoft Defender for Endpoint",
  kind: "edr",
  description: "Pulls security alerts from the Microsoft Graph security API using an app registration.",
  requiredEnv: [
    "DEFENDER_TENANT_ID (or AZURE_TENANT_ID)",
    "DEFENDER_CLIENT_ID (or AZURE_CLIENT_ID)",
    "DEFENDER_CLIENT_SECRET (or AZURE_CLIENT_SECRET)",
  ],
  configured,
  async test() {
    if (!configured()) {
      return {
        ok: false,
        unconfigured: true,
        detail: "Set an Azure tenant/client/secret pair for the Defender connector.",
      };
    }
    const started = Date.now();
    try {
      const token = await azureToken({ ...settings, scope: SCOPE, source: "Defender" });
      await httpJson(`${BASE}/api/alerts?$top=1`, {
        headers: { Authorization: `Bearer ${token}` },
        source: "Defender",
      });
      return { ok: true, latencyMs: Date.now() - started, detail: "Authenticated to the Defender alerts API." };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, detail: connectorError(error) };
    }
  },
  async pull({ limit = 200 } = {}) {
    if (!configured()) throw new Error("Defender connector is not configured.");
    const token = await azureToken({ ...settings, scope: SCOPE, source: "Defender" });
    const response = await httpJson(
      `${BASE}/api/alerts?$top=${Math.min(limit, 1000)}&$orderby=createdDateTime desc`,
      {
        headers: { Authorization: `Bearer ${token}` },
        source: "Defender",
      }
    );
    const alerts = response?.value || [];
    return {
      events: alerts
        .slice(0, limit)
        .map((record) => normalizeVendorEvent(record, { source: "defender", label: "Microsoft Defender" })),
    };
  },
};
