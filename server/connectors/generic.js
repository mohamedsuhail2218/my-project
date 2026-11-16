import { config } from "../config.js";
import { connectorError, httpJson } from "./http.js";
import { normalizeVendorEvent, pickArray } from "./normalize.js";

/**
 * Connect any SIEM or EDR that exposes an HTTP JSON endpoint. The endpoint is
 * polled with `since` and `limit` query parameters and may return an array, a
 * `{ events: [...] }` envelope, or an Elasticsearch-style `hits.hits` payload.
 */
function createGenericConnector({ id, kind, label, envName, settings }) {
  function configured() {
    return Boolean(settings.url);
  }

  function endpoint(since, limit) {
    const url = new URL(settings.url);
    url.searchParams.set("limit", String(limit));
    if (since) url.searchParams.set("since", since);
    return url.toString();
  }

  function headers() {
    return settings.token ? { Authorization: `Bearer ${settings.token}` } : {};
  }

  return {
    id,
    label: settings.label || label,
    kind,
    description:
      "Polls an operator-supplied HTTP JSON endpoint and normalises common SIEM/EDR field names.",
    requiredEnv: [envName],
    configured,
    async test() {
      if (!configured()) {
        return { ok: false, unconfigured: true, detail: `Set ${envName}.` };
      }
      const started = Date.now();
      try {
        await httpJson(endpoint(undefined, 1), { headers: headers(), source: label });
        return { ok: true, latencyMs: Date.now() - started, detail: `Connected to ${settings.url}.` };
      } catch (error) {
        return { ok: false, latencyMs: Date.now() - started, detail: connectorError(error) };
      }
    },
    async pull({ since, limit = 200 } = {}) {
      if (!configured()) throw new Error(`${label} is not configured.`);
      const response = await httpJson(endpoint(since, limit), {
        headers: headers(),
        source: label,
      });
      const records = pickArray(response, ["events", "results", "data", "hits.hits", "items"]);
      return {
        events: records
          .map((record) => record?._source || record)
          .slice(0, limit)
          .map((record) =>
            normalizeVendorEvent(record, { source: id === "generic-siem" ? "siem" : "edr", label })
          ),
      };
    },
  };
}

export const genericSiem = createGenericConnector({
  id: "generic-siem",
  kind: "siem",
  label: "Generic SIEM",
  envName: "GENERIC_SIEM_URL",
  settings: config.connectors.genericSiem,
});

export const genericEdr = createGenericConnector({
  id: "generic-edr",
  kind: "edr",
  label: "Generic EDR",
  envName: "GENERIC_EDR_URL",
  settings: config.connectors.genericEdr,
});
