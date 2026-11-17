const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const { method = "GET", body, signal, retryAuth = true, attempt = 0 } = options;
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
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

  // A 401 can mean the browser was routed to a second instance whose ephemeral
  // database has no matching session. Two short retries cover a cold-start
  // race; genuine auth failures still surface after the final attempt.
  if (response.status === 401 && retryAuth && attempt < 2 && !signal?.aborted) {
    await sleep(attempt === 0 ? 200 : 600);
    return request(path, { ...options, attempt: attempt + 1 });
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

/**
 * Fetch-based Server-Sent Events.
 *
 * The browser parser reconnects when a serverless function reaches its maximum
 * duration or the network drops. Unlike EventSource it can also read the HTTP
 * status, so an expired session produces a deliberate retry delay instead of a
 * tight reconnect loop.
 */
export async function streamEvents(path, { signal, onEvent, onStateChange }) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("The live telemetry stream is unreachable.", 0, error?.message);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(
      text || `Live stream failed with status ${response.status}.`,
      response.status
    );
  }
  if (!response.body) {
    throw new ApiError("This browser cannot read a streaming response.", 0);
  }

  onStateChange?.("open");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines = [];
  let lastEventId = "";
  let retryMs = 5000;

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }
    onEvent?.({ event: eventName || "message", data: dataLines.join("\n"), id: lastEventId });
    eventName = "message";
    dataLines = [];
    lastEventId = "";
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line === "") {
          dispatch();
          continue;
        }
        if (line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") eventName = value;
        else if (field === "data") dataLines.push(value);
        else if (field === "id") lastEventId = value;
        else if (field === "retry") {
          const parsed = Number(value);
          if (Number.isFinite(parsed) && parsed > 0) retryMs = parsed;
        }
      }
    }
    dispatch();
  } finally {
    reader.releaseLock?.();
  }

  return { retryMs };
}


export const api = {
  health: () => request("/health"),
  authConfig: () => request("/auth/config"),
  session: () => request("/auth/session"),
  login: ({ email, password, remember = true }) =>
    request("/auth/login", {
      method: "POST",
      body: { email, password, remember },
      retryAuth: false,
    }),
  register: (payload) =>
    request("/auth/register", { method: "POST", body: payload, retryAuth: false }),
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

  /* Rule-based detection */
  detections: ({ status, severity, category, q, limit = 50 } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (status) query.set("status", status);
    if (severity) query.set("severity", severity);
    if (category) query.set("category", category);
    if (q) query.set("q", q);
    return request(`/detections?${query.toString()}`);
  },
  detectionRules: () => request("/detections/rules"),
  updateDetection: (detectionId, status) =>
    request(`/detections/${encodeURIComponent(detectionId)}`, {
      method: "PATCH",
      body: { status },
    }),
  simulateAttack: (scenario = "all") =>
    request("/detections/simulate", { method: "POST", body: { scenario } }),

  /* Authorised network-flow monitoring */
  ingestNetworkFlows: (payload) => request("/network/flows", { method: "POST", body: payload }),
  networkStatus: () => request("/network/status"),

  /* Real SIEM / EDR pull connectors */
  connectorTest: (connectorId) =>
    request(`/connectors/${encodeURIComponent(connectorId)}/test`, {
      method: "POST",
      body: {},
    }),
  connectorPull: (connectorId, { since, limit = 200 } = {}) =>
    request(`/connectors/${encodeURIComponent(connectorId)}/pull`, {
      method: "POST",
      body: { since, limit },
    }),

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
