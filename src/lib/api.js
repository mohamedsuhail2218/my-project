const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request(path, options = {}) {
  const { method = "GET", body, signal } = options;
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new ApiError(
      "The API server is unreachable. Start it with `npm run dev` (not `npm run dev:web`).",
      0,
      error?.message
    );
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.message || `Request failed with status ${response.status}.`,
      response.status,
      payload?.details
    );
  }

  return payload;
}

export const api = {
  health: () => request("/health"),
  authConfig: () => request("/auth/config"),
  session: () => request("/auth/session"),
  login: ({ email, password, remember = true }) =>
    request("/auth/login", { method: "POST", body: { email, password, remember } }),
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  logout: () => request("/auth/logout", { method: "POST", body: {} }),
  updateProfile: (payload) => request("/auth/profile", { method: "PATCH", body: payload }),
  getWorkspace: () => request("/workspace"),
  saveWorkspace: (workspace) => request("/workspace", { method: "PUT", body: workspace }),
  resetWorkspace: () => request("/workspace/reset", { method: "POST", body: {} }),
  setPlan: (plan) => request("/workspace/plan", { method: "PATCH", body: { plan } }),
  updateSecurityPolicy: (payload) =>
    request("/workspace/security", { method: "PATCH", body: payload }),
  connectors: () => request("/connectors"),
  audit: ({ limit = 50, before } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before) query.set("before", String(before));
    return request(`/audit?${query.toString()}`);
  },

  /* Live telemetry */
  telemetry: ({ limit = 100, before, q, status, host, source, minScore, since } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before) query.set("before", String(before));
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (host) query.set("host", host);
    if (source) query.set("source", source);
    if (minScore !== undefined && minScore !== null && minScore !== "") {
      query.set("minScore", String(minScore));
    }
    if (since) query.set("since", since);
    return request(`/telemetry?${query.toString()}`);
  },
  telemetryStats: () => request("/telemetry/stats"),
  ingestTelemetry: (payload) => request("/telemetry/ingest", { method: "POST", body: payload }),
  telemetryTokens: () => request("/telemetry/tokens"),
  createTelemetryToken: (label) =>
    request("/telemetry/tokens", { method: "POST", body: { label } }),
  revokeTelemetryToken: (tokenId) =>
    request(`/telemetry/tokens/${encodeURIComponent(tokenId)}`, { method: "DELETE" }),
  streamUrl: (path) => `${API_BASE}${path}`,

  /* Anomaly model */
  mlModel: () => request("/ml/model"),
  trainModel: () => request("/ml/train", { method: "POST", body: {} }),
  anomalies: ({ limit = 20, minScore } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (minScore !== undefined && minScore !== null) query.set("minScore", String(minScore));
    return request(`/ml/anomalies?${query.toString()}`);
  },

  /* Live threat intelligence */
  intelProviders: () => request("/intel/providers"),
  intelLookup: (indicator, { refresh = false } = {}) => {
    const query = new URLSearchParams({ indicator, refresh: refresh ? "1" : "0" });
    return request(`/intel/lookup?${query.toString()}`);
  },

  /* Natural-language assistant */
  assistantStatus: () => request("/hunter/assistant/status"),
  askHunter: (payload) => request("/hunter/assistant", { method: "POST", body: payload }),

  /* Approval-gated response */
  responsePlaybooks: () => request("/response/playbooks"),
  responseActions: ({ status, incidentId, limit = 50 } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (status) query.set("status", status);
    if (incidentId) query.set("incidentId", incidentId);
    return request(`/response/actions?${query.toString()}`);
  },
  proposeResponseAction: (payload) =>
    request("/response/actions", { method: "POST", body: payload }),
  decideResponseAction: (actionId, decision, note = "") =>
    request(`/response/actions/${encodeURIComponent(actionId)}/decision`, {
      method: "POST",
      body: { decision, note },
    }),
  revertResponseAction: (actionId) =>
    request(`/response/actions/${encodeURIComponent(actionId)}/revert`, {
      method: "POST",
      body: {},
    }),
  responseRules: () => request("/response/rules"),
  updateResponseRule: (payload) =>
    request("/response/rules", { method: "PUT", body: payload }),
};
