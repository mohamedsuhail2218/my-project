import { config } from "../config.js";

/**
 * Small HTTP client shared by the vendor connectors.
 *
 * The URL is always operator-supplied environment configuration, never request
 * input. We still reject cloud metadata endpoints and non-HTTP schemes so a
 * misconfigured value cannot turn the server into a credential-stealing proxy.
 */

const BLOCKED_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.google.com",
  "169.254.169.254",
  "100.100.100.200",
  "fd00:ec2::254",
]);

function validateUrl(raw, source) {
  let parsed;
  try {
    parsed = new URL(String(raw || ""));
  } catch {
    throw new Error(`${source}: the configured endpoint is not a valid URL.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${source}: only http and https endpoints are supported.`);
  }
  if (BLOCKED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`${source}: cloud metadata endpoints are not allowed.`);
  }
  return parsed;
}

function truncate(value, length = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export async function httpRequest(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = config.connectors.timeoutMs,
    source = "connector",
  } = options;
  const parsed = validateUrl(url, source);

  let response;
  try {
    response = await fetch(parsed, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
  } catch (error) {
    const reason =
      error?.name === "TimeoutError"
        ? `timed out after ${timeoutMs}ms`
        : error?.cause?.code || error?.message || "network error";
    throw new Error(`${source}: request failed (${reason}).`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${source}: HTTP ${response.status} ${response.statusText} · ${truncate(text)}`
    );
  }
  return { status: response.status, headers: response.headers, text };
}

export async function httpJson(url, options = {}) {
  const result = await httpRequest(url, options);
  if (!result.text) return null;
  try {
    return JSON.parse(result.text);
  } catch {
    throw new Error(`${options.source || "connector"}: expected JSON but received a different content type.`);
  }
}

export function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function bearer(token) {
  return `Bearer ${token}`;
}

export function formBody(values) {
  const params = new URLSearchParams();
  Object.entries(values || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  });
  return params;
}

export function parseJsonLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function connectorError(error) {
  return truncate(error?.message || "Connector request failed.", 400);
}
