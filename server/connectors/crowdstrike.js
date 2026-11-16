import { config } from "../config.js";
import { connectorError, formBody, httpJson } from "./http.js";
import { normalizeVendorEvent } from "./normalize.js";

const settings = config.connectors.crowdstrike;
let cachedToken = null;

function configured() {
  return Boolean(settings.baseUrl && settings.clientId && settings.clientSecret);
}

async function token() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const body = formBody({
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
  });
  const response = await httpJson(`${settings.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    source: "CrowdStrike identity",
  });
  if (!response?.access_token) throw new Error("CrowdStrike: identity endpoint returned no token.");
  cachedToken = {
    value: response.access_token,
    expiresAt: Date.now() + Math.max(60, Number(response.expires_in) || 1800) * 1000,
  };
  return cachedToken.value;
}

async function headers() {
  return { Authorization: `Bearer ${await token()}`, Accept: "application/json" };
}

export default {
  id: "crowdstrike",
  label: "CrowdStrike Falcon",
  kind: "edr",
  description: "Queries Falcon detections with an OAuth2 API client.",
  requiredEnv: ["CROWDSTRIKE_CLIENT_ID", "CROWDSTRIKE_CLIENT_SECRET"],
  configured,
  async test() {
    if (!configured()) {
      return { ok: false, unconfigured: true, detail: "Set CROWDSTRIKE_CLIENT_ID and CROWDSTRIKE_CLIENT_SECRET." };
    }
    const started = Date.now();
    try {
      await httpJson(`${settings.baseUrl}/api/detects/queries/detects/v1?limit=1`, {
        headers: await headers(),
        source: "CrowdStrike",
      });
      return { ok: true, latencyMs: Date.now() - started, detail: "Authenticated to the Falcon detections API." };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, detail: connectorError(error) };
    }
  },
  async pull({ limit = 200 } = {}) {
    if (!configured()) throw new Error("CrowdStrike connector is not configured.");
    const auth = await headers();
    const query = await httpJson(
      `${settings.baseUrl}/api/detects/queries/detects/v1?limit=${Math.min(limit, 500)}&sort=first_behavior%7Casc`,
      { headers: auth, source: "CrowdStrike" }
    );
    const ids = (query?.resources || []).slice(0, limit);
    if (!ids.length) return { events: [] };
    const summaries = await httpJson(`${settings.baseUrl}/api/detects/entities/summaries/GET/v1`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      source: "CrowdStrike",
    });
    return {
      events: (summaries?.resources || [])
        .slice(0, limit)
        .map((record) => normalizeVendorEvent(record, { source: "crowdstrike", label: "CrowdStrike Falcon" })),
    };
  },
};
