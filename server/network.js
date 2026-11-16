import { isIP } from "node:net";

/**
 * Normalise authorised network-flow records into the telemetry contract.
 *
 * The API accepts JSON produced by Zeek (`conn.log`), Suricata (`eve.json`) and
 * NetFlow v5/v9 exporters. Packet capture itself happens on the sensor the
 * operator controls; this process only receives records the sensor already
 * decided to export.
 */

export const FLOW_FORMATS = ["auto", "zeek", "suricata", "netflow", "generic"];

const PRIVATE_RE =
  /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|::1$|fc|fd|fe80)/i;

function get(record, ...keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null && record?.[key] !== "") {
      return record[key];
    }
  }
  return undefined;
}

function toPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function toBytes(...values) {
  let total = 0;
  let seen = false;
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) {
      total += number;
      seen = true;
    }
  }
  return seen ? Math.trunc(total) : null;
}

function toDurationMs(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) {
      // Zeek reports seconds; NetFlow first/last are milliseconds when both are
      // present. Callers pass already-normalised values where possible.
      return Math.trunc(number * 1000);
    }
  }
  return null;
}

function toTimestamp(record, format) {
  const now = Date.now();
  let value;
  if (format === "zeek") value = record.ts;
  else if (format === "suricata") value = record.timestamp;
  else value = get(record, "timestamp", "ts", "time", "first", "Last", "start");
  if (typeof value === "number" || (typeof value === "string" && /^\d+(\.\d+)?$/.test(value))) {
    const number = Number(value);
    // Epoch seconds and epoch milliseconds are both common. Values below 10^12
    // are seconds; larger values are already milliseconds.
    const ms = number < 1e12 ? number * 1000 : number;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = value ? new Date(value) : new Date(now);
  return Number.isNaN(date.getTime()) ? new Date(now).toISOString() : date.toISOString();
}

function directionFor(srcIp, dstIp) {
  const srcPrivate = PRIVATE_RE.test(String(srcIp || ""));
  const dstPrivate = PRIVATE_RE.test(String(dstIp || ""));
  if (!srcIp || !dstIp) return "";
  if (!srcPrivate && dstPrivate) return "inbound";
  if (srcPrivate && !dstPrivate) return "outbound";
  if (srcPrivate && dstPrivate) return "internal";
  return "external";
}

function detectFormat(record, requested) {
  if (requested && requested !== "auto") return requested;
  if (record?.event_type) return "suricata";
  if (record?.["id.orig_h"] || (record?.uid && record?.conn_state)) return "zeek";
  if (record?.srcaddr || record?.dOctets || record?.srcport) return "netflow";
  return "generic";
}

function normalizeZeek(record, sensor) {
  const srcIp = String(record["id.orig_h"] || "");
  const dstIp = String(record["id.resp_h"] || "");
  const dstPort = toPort(record["id.resp_p"]);
  const proto = String(record.proto || "").toLowerCase();
  const service = String(record.service || "");
  const bytes = toBytes(record.orig_bytes, record.resp_bytes);
  const state = String(record.conn_state || "");
  const uid = String(record.uid || "");
  const message = `${proto || "flow"} ${srcIp}:${record["id.orig_p"] || "?"} → ${dstIp}:${
    dstPort || "?"
  }${service ? ` (${service})` : ""}${state ? ` state=${state}` : ""}${
    bytes !== null ? ` ${bytes} B` : ""
  }`;
  return {
    timestamp: toTimestamp(record, "zeek"),
    source: "zeek",
    host: sensor || String(record.host || "zeek-sensor"),
    event: "network_flow",
    action: service ? `service_${service}` : "flow",
    status: "allow",
    ip: srcIp,
    user: "",
    message,
    raw: JSON.stringify(record).slice(0, 16000),
    dstIp,
    dstPort,
    proto,
    bytes,
    durationMs: toDurationMs(record.duration),
    direction: directionFor(srcIp, dstIp),
    sensor: sensor || "zeek",
    eventId: uid ? `zeek:${uid}` : undefined,
  };
}

function suricataStatus(record) {
  const eventType = String(record.event_type || "").toLowerCase();
  if (eventType === "alert" || record.alert) return "alert";
  if (eventType === "drop" || eventType === "blocked") return "deny";
  return "allow";
}

function normalizeSuricata(record, sensor) {
  const srcIp = String(record.src_ip || "");
  const dstIp = String(record.dest_ip || "");
  const dstPort = toPort(record.dest_port);
  const proto = String(record.proto || "").toLowerCase();
  const alert = record.alert || {};
  const bytes = toBytes(record.flow?.bytes_toserver, record.flow?.bytes_toclient);
  const signature = String(alert.signature || "");
  const message = signature
    ? `${alert.signature_id || "IDS"} ${signature}${
        alert.category ? ` (${alert.category})` : ""
      } · ${srcIp}:${record.src_port || "?"} → ${dstIp}:${dstPort || "?"}`
    : `${String(record.event_type || "flow")} ${proto} ${srcIp}:${record.src_port || "?"} → ${dstIp}:${
        dstPort || "?"
      }${bytes !== null ? ` ${bytes} B` : ""}`;
  return {
    timestamp: toTimestamp(record, "suricata"),
    source: "suricata",
    host: sensor || String(record.host || "suricata-sensor"),
    event: signature ? "ids_alert" : "network_flow",
    action: String(record.event_type || "flow"),
    status: suricataStatus(record),
    ip: srcIp,
    user: "",
    message,
    raw: JSON.stringify(record).slice(0, 16000),
    dstIp,
    dstPort,
    proto,
    bytes,
    durationMs: toDurationMs(record.flow?.age),
    direction: directionFor(srcIp, dstIp),
    sensor: sensor || "suricata",
    eventId: record.flow_id ? `suricata:${record.flow_id}` : undefined,
  };
}

function normalizeNetflow(record, sensor) {
  const srcIp = String(get(record, "srcaddr", "src_ip", "source_ip", "ipv4_src_addr") || "");
  const dstIp = String(get(record, "dstaddr", "dst_ip", "destination_ip", "ipv4_dst_addr") || "");
  const dstPort = toPort(get(record, "dstport", "dst_port", "destination_port", "L4_DST_PORT"));
  const proto = String(get(record, "prot", "proto", "protocol", "PROTOCOL") || "").toLowerCase();
  const bytes = toBytes(get(record, "dOctets", "bytes", "octetDeltaCount", "in_bytes", "out_bytes"));
  const packets = toBytes(get(record, "dPkts", "packets", "packetDeltaCount"));
  const first = Number(get(record, "first", "First"));
  const last = Number(get(record, "last", "Last"));
  const durationMs =
    Number.isFinite(first) && Number.isFinite(last) && last >= first ? last - first : null;
  const message = `${proto || "flow"} ${srcIp}:${get(record, "srcport", "src_port") || "?"} → ${dstIp}:${
    dstPort || "?"
  }${bytes !== null ? ` ${bytes} B` : ""}${packets !== null ? ` ${packets} packets` : ""}`;
  return {
    timestamp: toTimestamp(record, "netflow"),
    source: "netflow",
    host: sensor || String(record.host || record.exporter || "netflow-exporter"),
    event: "network_flow",
    action: "flow",
    status: "allow",
    ip: srcIp,
    user: "",
    message,
    raw: JSON.stringify(record).slice(0, 16000),
    dstIp,
    dstPort,
    proto,
    bytes,
    durationMs,
    direction: directionFor(srcIp, dstIp),
    sensor: sensor || "netflow",
  };
}

function normalizeGeneric(record, sensor) {
  const srcIp = String(get(record, "src_ip", "srcIp", "source_ip", "ip", "srcaddr") || "");
  const dstIp = String(get(record, "dst_ip", "dstIp", "dest_ip", "destination_ip", "dstaddr") || "");
  const dstPort = toPort(get(record, "dst_port", "dstPort", "dest_port", "dport", "dstport"));
  const proto = String(get(record, "proto", "protocol") || "").toLowerCase();
  const status = ["allow", "deny", "alert"].includes(record.status) ? record.status : "allow";
  const message =
    record.message ||
    `${proto || "flow"} ${srcIp}:${get(record, "src_port", "srcPort", "sport") || "?"} → ${dstIp}:${
      dstPort || "?"
    }`;
  return {
    timestamp: toTimestamp(record, "generic"),
    source: String(record.source || "network").slice(0, 60),
    host: sensor || String(record.host || record.sensor || "network-sensor"),
    event: String(record.event || "network_flow").slice(0, 120),
    action: String(record.action || "flow").slice(0, 120),
    status,
    ip: srcIp,
    user: String(record.user || "").slice(0, 120),
    message,
    raw: String(record.raw || JSON.stringify(record)).slice(0, 16000),
    dstIp,
    dstPort,
    proto,
    bytes: toBytes(get(record, "bytes", "orig_bytes", "dOctets")),
    durationMs: toDurationMs(get(record, "durationMs", "duration_ms", "duration")),
    direction: String(record.direction || directionFor(srcIp, dstIp)).slice(0, 20),
    sensor: sensor || String(record.sensor || "network"),
    eventId: record.eventId || record.id,
  };
}

const NORMALIZERS = {
  zeek: normalizeZeek,
  suricata: normalizeSuricata,
  netflow: normalizeNetflow,
  generic: normalizeGeneric,
};

export function normalizeNetworkFlows(payload, { sensor = "" } = {}) {
  const records = Array.isArray(payload) ? payload : payload?.flows || [];
  const requested = String(payload?.format || "auto").toLowerCase();
  const defaultSensor = String(sensor || payload?.sensor || "").trim();
  const formats = new Set();
  const events = [];

  records.forEach((record) => {
    if (!record || typeof record !== "object") return;
    const format = detectFormat(record, requested);
    const normalizer = NORMALIZERS[format] || normalizeGeneric;
    formats.add(format);
    const event = normalizer(record, defaultSensor);
    if (!event.ip && !event.dstIp) return;
    if (event.ip && !isIP(event.ip.replace(/^\[|\]$/g, ""))) {
      // Keep a hostname in the message but never treat it as an address.
      event.message = `${event.message} · original source ${event.ip}`;
      event.ip = "";
    }
    events.push(event);
  });

  return { events, formats: [...formats] };
}
