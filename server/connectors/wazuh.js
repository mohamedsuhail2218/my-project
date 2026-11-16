import { config } from "../config.js";
import { basicAuth, connectorError, httpJson } from "./http.js";
import { normalizeVendorEvent } from "./normalize.js";

const settings = config.connectors.wazuh;
let cachedToken = null;

function configured() {
  return Boolean(settings.baseUrl && settings.username && settings.password);
}

async function token() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await httpJson(`${settings.baseUrl}/security/user/authenticate`, {
    method: "POST",
    headers: { Authorization: basicAuth(settings.username, settings.password) },
    source: "Wazuh identity",
  });
  const value = response?.data?.token || response?.token;
  if (!value) throw new Error("Wazuh: authentication returned no token.");
  cachedToken = { value, expiresAt: Date.now() + 10 * 60 * 1000 };
  return value;
}

export default {
  id: "wazuh",
  label: "Wazuh",
  kind: "siem",
  description: "Pulls alerts from the Wazuh Manager REST API.",
  requiredEnv: ["WAZUH_BASE_URL", "WAZUH_USERNAME", "WAZUH_PASSWORD"],
  configured,
  async test() {
    if (!configured()) {
      return { ok: false, unconfigured: true, detail: "Set WAZUH_BASE_URL, WAZUH_USERNAME and WAZUH_PASSWORD." };
    }
    const started = Date.now();
    try {
      const value = await token();
      await httpJson(`${settings.baseUrl}/manager/status`, {
        headers: { Authorization: `Bearer ${value}` },
        source: "Wazuh",
      });
      return { ok: true, latencyMs: Date.now() - started, detail: "Authenticated to the Wazuh Manager API." };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, detail: connectorError(error) };
    }
  },
  async pull({ limit = 200 } = {}) {
    if (!configured()) throw new Error("Wazuh connector is not configured.");
    const value = await token();
    const response = await httpJson(
      `${settings.baseUrl}/alerts?limit=${Math.min(limit, 500)}&sort=-timestamp`,
      {
        headers: { Authorization: `Bearer ${value}` },
        source: "Wazuh",
      }
    );
    const items = response?.data?.affected_items || [];
    return {
      events: items
        .slice(0, limit)
        .map((record) => normalizeVendorEvent(record, { source: "wazuh", label: "Wazuh" })),
    };
  },
};
