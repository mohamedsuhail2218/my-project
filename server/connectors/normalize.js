/**
 * Vendor-neutral event normalisation for SIEM/EDR pull connectors.
 *
 * Each vendor has a different envelope, but the analyst only needs the same
 * telemetry contract used by push ingestion. Unknown fields are preserved in
 * `raw`, so nothing is silently discarded.
 */

function getPath(object, path) {
  return String(path)
    .split(".")
    .reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), object);
}

function first(object, paths) {
  for (const path of paths) {
    const value = getPath(object, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function text(value, max = 8000) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value).slice(0, max);
  return String(value).slice(0, max);
}

function timestampOf(object) {
  const value = first(object, [
    "@timestamp",
    "timestamp",
    "_time",
    "TimeGenerated",
    "createdDateTime",
    "first_behavior",
    "last_behavior",
    "event_time",
    "data.timestamp",
    "event.created",
    "ts",
  ]);
  if (typeof value === "number" || (typeof value === "string" && /^\d+(\.\d+)?$/.test(value))) {
    const number = Number(value);
    const date = new Date(number < 1e12 ? number * 1000 : number);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function statusOf(object) {
  const explicit = String(first(object, ["status", "event.outcome", "outcome"]) || "").toLowerCase();
  if (["deny", "denied", "blocked", "prevented", "failure", "failed"].includes(explicit)) return "deny";
  if (["alert", "detected", "quarantined", "malicious", "high", "critical"].includes(explicit)) return "alert";
  const severity = String(
    first(object, [
      "severity",
      "severityLabel",
      "max_severity_displayname",
      "alert.severity",
      "event.severity",
      "rule.level",
      "data.severity",
    ]) || ""
  ).toLowerCase();
  if (["critical", "high", "medium", "malicious", "alert"].includes(severity)) return "alert";
  const eventType = String(first(object, ["event_type", "event.kind", "type"]) || "").toLowerCase();
  if (["alert", "detection", "intrusion"].includes(eventType)) return "alert";
  return "allow";
}

export function normalizeVendorEvent(raw, defaults = {}) {
  const object = raw && typeof raw === "object" ? raw : { message: String(raw || "") };
  const host = text(
    first(object, [
      "host",
      "hostname",
      "host.name",
      "Computer",
      "DeviceName",
      "device.hostname",
      "device.name",
      "agent.name",
      "observer.hostname",
      "data.host",
      "data.srcip",
    ]),
    120
  );
  const ip = text(
    first(object, [
      "src_ip",
      "srcIp",
      "source_ip",
      "source.ip",
      "ip",
      "ipAddress",
      "RemoteIP",
      "DeviceIp",
      "device.local_ip",
      "device.external_ip",
      "data.srcip",
    ]),
    64
  );
  const dstIp = text(
    first(object, [
      "dst_ip",
      "dstIp",
      "dest_ip",
      "destination_ip",
      "destination.ip",
      "data.dstip",
      "device.external_ip",
    ]),
    64
  );
  const port = Number(first(object, ["dst_port", "dest_port", "destination.port", "data.dstport"]));
  const user = text(
    first(object, [
      "user",
      "username",
      "user.name",
      "Account",
      "AccountName",
      "UserName",
      "data.srcuser",
      "identity.user",
    ]),
    120
  );
  const event = text(
    first(object, [
      "event",
      "event_type",
      "event.action",
      "event.code",
      "EventID",
      "action",
      "signature",
      "rule.description",
      "alert.signature",
      "category",
      "type",
    ]),
    120
  );
  const action = text(
    first(object, ["action", "event.action", "event_type", "operation", "behavior", "command"]),
    120
  );
  const message = text(
    first(object, [
      "message",
      "description",
      "rule.description",
      "alert.signature",
      "Signature",
      "title",
      "summary",
      "data.alert",
      "event.original",
      "name",
    ]),
    8000
  );
  const direction = text(first(object, ["direction", "network.direction"]), 20).toLowerCase();
  const bytes = Number(first(object, ["bytes", "network.bytes", "flow.bytes", "data.bytes"]));
  const duration = Number(first(object, ["duration", "event.duration", "data.duration"]));
  const ruleId = text(
    first(object, ["rule.id", "rule_id", "signature_id", "detection_id", "alert.id", "id"]),
    120
  );

  return {
    timestamp: timestampOf(object),
    source: defaults.source || "connector",
    host: host || defaults.host || "unknown-host",
    event: event || defaults.event || "vendor_event",
    action: action || defaults.action || "observed",
    status: statusOf(object),
    ip,
    user,
    message: message || `Event ${ruleId || "received"} from ${defaults.label || defaults.source || "connector"}.`,
    raw: JSON.stringify(object).slice(0, 16000),
    dstIp,
    dstPort: Number.isInteger(port) && port > 0 && port <= 65535 ? port : null,
    proto: text(first(object, ["proto", "protocol", "network.transport"]), 20).toLowerCase(),
    bytes: Number.isFinite(bytes) && bytes >= 0 ? Math.trunc(bytes) : null,
    durationMs: Number.isFinite(duration) && duration >= 0 ? Math.trunc(duration * 1000) : null,
    direction,
    sensor: text(first(object, ["observer.hostname", "agent.name", "sensor"]), 120),
    eventId: ruleId ? `${defaults.source || "connector"}:${ruleId}` : undefined,
  };
}

export function pickArray(payload, paths = []) {
  if (Array.isArray(payload)) return payload;
  for (const path of paths) {
    const value = getPath(payload, path);
    if (Array.isArray(value)) return value;
  }
  return [];
}
