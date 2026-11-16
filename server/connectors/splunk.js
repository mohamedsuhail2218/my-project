import { config } from "../config.js";
import { basicAuth, bearer, connectorError, formBody, httpJson, httpRequest, parseJsonLines } from "./http.js";
import { normalizeVendorEvent } from "./normalize.js";

const settings = config.connectors.splunk;

function authHeaders() {
  if (settings.token) return { Authorization: bearer(settings.token) };
  return { Authorization: basicAuth(settings.username, settings.password) };
}

function configured() {
  return Boolean(settings.baseUrl && (settings.token || (settings.username && settings.password)));
}

function searchText(limit) {
  if (settings.query) {
    return settings.query.startsWith("search ") ? settings.query : `search ${settings.query}`;
  }
  return `search index=${settings.index} earliest=-15m | head ${limit}`;
}

export default {
  id: "splunk",
  label: "Splunk Enterprise / Cloud",
  kind: "siem",
  description: "Pulls events through the Splunk REST search export endpoint (token or basic auth).",
  requiredEnv: ["SPLUNK_BASE_URL", "SPLUNK_API_TOKEN or SPLUNK_USERNAME/SPLUNK_PASSWORD"],
  configured,
  async test() {
    if (!configured()) {
      return { ok: false, unconfigured: true, detail: "Set SPLUNK_BASE_URL and an API token or username/password." };
    }
    const started = Date.now();
    try {
      await httpJson(`${settings.baseUrl}/services/server/info?output_mode=json`, {
        headers: authHeaders(),
        source: "Splunk",
      });
      return {
        ok: true,
        latencyMs: Date.now() - started,
        detail: "Authenticated to the Splunk REST API.",
      };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, detail: connectorError(error) };
    }
  },
  async pull({ since, limit = 200 } = {}) {
    if (!configured()) throw new Error("Splunk connector is not configured.");
    const body = formBody({
      search: searchText(limit),
      output_mode: "json",
      earliest_time: since || "-15m",
      latest_time: "now",
      count: limit,
    });
    const response = await httpRequest(`${settings.baseUrl}/services/search/jobs/export`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      source: "Splunk",
    });
    const records = parseJsonLines(response.text)
      .map((item) => item.result || item)
      .filter((item) => item && typeof item === "object");
    return {
      events: records
        .slice(0, limit)
        .map((record) => normalizeVendorEvent(record, { source: "splunk", label: "Splunk" })),
    };
  },
};
