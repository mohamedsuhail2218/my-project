import { config } from "../config.js";
import { basicAuth, bearer, connectorError, httpJson } from "./http.js";
import { normalizeVendorEvent } from "./normalize.js";

const settings = config.connectors.elastic;

function configured() {
  return Boolean(settings.baseUrl && (settings.apiKey || (settings.username && settings.password)));
}

function authHeaders() {
  if (settings.apiKey) {
    // Elastic accepts both `ApiKey <base64>` and `ApiKey id:key`. The operator
    // supplies the exact value from Kibana; we do not re-encode it.
    return { Authorization: `ApiKey ${settings.apiKey}` };
  }
  return { Authorization: basicAuth(settings.username, settings.password) };
}

function searchBody(since, limit) {
  if (settings.query) {
    try {
      const parsed = JSON.parse(settings.query);
      return { size: limit, sort: [{ "@timestamp": "asc" }], ...parsed };
    } catch {
      // A non-JSON query is treated as a Kibana query string.
      return {
        size: limit,
        sort: [{ "@timestamp": "asc" }],
        query: { query_string: { query: settings.query } },
      };
    }
  }
  return {
    size: limit,
    sort: [{ "@timestamp": "asc" }],
    query: { range: { "@timestamp": { gte: since || "now-15m" } } },
  };
}

export default {
  id: "elastic",
  label: "Elastic Security / Elasticsearch",
  kind: "siem",
  description: "Queries an Elasticsearch index or data view with API-key or basic authentication.",
  requiredEnv: ["ELASTIC_BASE_URL", "ELASTIC_API_KEY or ELASTIC_USERNAME/ELASTIC_PASSWORD", "ELASTIC_INDEX"],
  configured,
  async test() {
    if (!configured()) {
      return { ok: false, unconfigured: true, detail: "Set ELASTIC_BASE_URL and an API key or username/password." };
    }
    const started = Date.now();
    try {
      await httpJson(`${settings.baseUrl}/_cluster/health`, {
        headers: authHeaders(),
        source: "Elastic",
      });
      return { ok: true, latencyMs: Date.now() - started, detail: "Connected to the Elasticsearch cluster." };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, detail: connectorError(error) };
    }
  },
  async pull({ since, limit = 200 } = {}) {
    if (!configured()) throw new Error("Elastic connector is not configured.");
    const response = await httpJson(
      `${settings.baseUrl}/${encodeURIComponent(settings.index)}/_search`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(searchBody(since, limit)),
        source: "Elastic",
      }
    );
    const hits = response?.hits?.hits || [];
    return {
      events: hits
        .map((hit) => hit._source || hit.fields || {})
        .slice(0, limit)
        .map((record) => normalizeVendorEvent(record, { source: "elastic", label: "Elastic" })),
    };
  },
};
