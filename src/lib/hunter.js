import { formatDate } from "./format";

/* ------------------------------------------------------------------ */
/* Log ingestion & query helpers                                       */
/* ------------------------------------------------------------------ */

const FIELD_ALIASES = {
  src: "ip",
  source_ip: "ip",
  hostname: "host",
  proc: "action",
  process: "action",
  name: "action",
  type: "action",
};

function unquote(value = "") {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function parseFields(tokens) {
  const fields = {};
  tokens.forEach((token) => {
    const index = token.indexOf("=");
    if (index <= 0) return;
    const key = token.slice(0, index).toLowerCase();
    const value = unquote(token.slice(index + 1));
    fields[key] = value;
  });
  return fields;
}

/**
 * Parse newline-delimited log samples into the same shape as the seeded logs.
 * Accepts the `ts source host event key=value ...` shape used by the demo.
 */
export function parseLogText(text, fallbackSource = "custom") {
  return String(text || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const tokens = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      if (!tokens.length) return null;

      const timestamp = /^\d{4}-\d{2}-\d{2}T/.test(tokens[0])
        ? tokens[0]
        : new Date(Date.now() + index).toISOString();
      const source = (tokens[1] || fallbackSource || "custom").toLowerCase();
      const host = tokens[2] || "unknown-host";
      const event = tokens[3] || "custom_event";
      const fields = parseFields(tokens.slice(4));

      const status = (fields.status || "allow").toLowerCase();
      return {
        timestamp,
        source,
        host,
        event,
        action: fields.proc || fields.name || fields.action || fields.type || event,
        status,
        ip: fields.src || fields.source_ip || fields.ip || "-",
        user: fields.user || "-",
        message:
          fields.msg ||
          tokens
            .filter((token) => !token.includes("="))
            .slice(4)
            .join(" ") ||
          trimmed,
        raw: trimmed,
      };
    })
    .filter(Boolean);
}

export function queryTokens(query = "") {
  return String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Supports free text plus `field:value` / `field=value` terms.
 */
export function recordMatches(record, query, extraFields = []) {
  const tokens = queryTokens(query);
  if (!tokens.length) return true;
  const haystack = Object.entries(record)
    .filter(([, value]) => ["string", "number"].includes(typeof value))
    .map(([, value]) => String(value))
    .concat(extraFields.map((value) => String(value ?? "")))
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => {
    const match = token.match(/^([a-z_]+)[:=](.+)$/);
    if (!match) return haystack.includes(token);
    const key = FIELD_ALIASES[match[1]] || match[1];
    const value = record[key];
    return value != null && String(value).toLowerCase().includes(match[2]);
  });
}

/* ------------------------------------------------------------------ */
/* Investigation helpers                                               */
/* ------------------------------------------------------------------ */

export function extractPivots(logs = [], limit = 12) {
  const found = new Set();
  logs.forEach((log) => {
    if (log.ip && log.ip !== "-") found.add(log.ip);
    if (log.host) found.add(log.host);
    if (log.user && log.user !== "-") found.add(log.user);
    const domains = String(log.message || "").match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b/gi) || [];
    domains.slice(0, 2).forEach((domain) => found.add(domain.toLowerCase()));
  });
  return [...found].slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Timeline helpers                                                    */
/* ------------------------------------------------------------------ */

export function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 10);
}

export function dayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return `Today · ${formatDate(date)}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday · ${formatDate(date)}`;
  return formatDate(date);
}

export function withinHours(value, hours) {
  if (!hours) return true;
  const date = new Date(value).getTime();
  return Number.isFinite(date) && Date.now() - date <= hours * 3600 * 1000;
}
