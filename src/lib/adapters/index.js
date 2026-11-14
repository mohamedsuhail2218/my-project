/**
 * Integration adapter contract.
 *
 * Every telemetry and intelligence source is represented by an adapter with the
 * same shape. The shipped implementations are explicitly marked `mode: "mock"`.
 * A production adapter should implement the same contract and be selected via
 * environment configuration on the server; the UI never talks to a vendor API
 * directly.
 *
 * Adapter interface (see README for a worked example):
 *   id, label, kind, mode, status
 *   testConnection(): Promise<{ ok, checkedAt, detail }>
 *   pullEvents({ since, limit }): Promise<NormalisedEvent[]>
 *
 * NormalisedEvent:
 *   source, host, user, event, action, status, ip, message, timestamp, raw
 */
export const ADAPTERS = [
  {
    id: "siem",
    label: "SIEM / log pipeline",
    kind: "log",
    mode: "mock",
    status: "connected",
    description: "Normalises VPN, identity, firewall, proxy, DNS and application events.",
    requiredEnv: ["SIEM_BASE_URL", "SIEM_API_TOKEN"],
  },
  {
    id: "edr",
    label: "EDR / XDR",
    kind: "endpoint",
    mode: "mock",
    status: "connected",
    description: "Process, parent-chain and endpoint telemetry from managed workstations.",
    requiredEnv: ["EDR_BASE_URL", "EDR_CLIENT_ID", "EDR_CLIENT_SECRET"],
  },
  {
    id: "cloud",
    label: "Cloud audit logs",
    kind: "cloud",
    mode: "mock",
    status: "connected",
    description: "Control-plane and storage events from the modelled cloud account.",
    requiredEnv: ["CLOUD_AUDIT_QUEUE_URL", "CLOUD_AUDIT_ROLE_ARN"],
  },
  {
    id: "intel",
    label: "Threat intelligence",
    kind: "intel",
    mode: "mock",
    status: "connected",
    description: "Indicator reputation, confidence and first/last seen metadata.",
    requiredEnv: ["INTEL_PROVIDER_URL", "INTEL_API_KEY"],
  },
];

export const LIVE_FEED = [
  {
    adapter: "edr",
    source: "edr",
    host: "ws-042",
    event: "process_spawn",
    action: "process_create",
    user: "j.weber",
    ip: "10.20.4.42",
    status: "alert",
    message: "Encoded PowerShell spawned by WINWORD.EXE with parent chain anomaly",
  },
  {
    adapter: "siem",
    source: "vpn",
    host: "vpn-01",
    event: "authentication_failed",
    action: "password_login",
    user: "m.suhail",
    ip: "185.220.101.42",
    status: "deny",
    message: "Failed password for m.suhail from 185.220.101.42 port 51062 ssh2",
  },
  {
    adapter: "siem",
    source: "firewall",
    host: "edge-fw-01",
    event: "egress_blocked",
    action: "deny",
    user: "svc-app01",
    ip: "10.20.2.11",
    status: "deny",
    message: "Outbound TLS to 45.148.10.83:443 denied by egress-filter policy",
  },
  {
    adapter: "siem",
    source: "identity",
    host: "dc-01",
    event: "privilege_escalation",
    action: "group_add",
    user: "a.tan",
    ip: "10.20.5.19",
    status: "alert",
    message: "User added to Domain Admins outside approved change window",
  },
  {
    adapter: "siem",
    source: "dns",
    host: "ws-042",
    event: "dns_query",
    action: "resolve",
    user: "j.weber",
    ip: "10.20.4.42",
    status: "alert",
    message: "High-entropy TXT query for a7f3c9e2.exfil-c2.example (142 bytes)",
  },
  {
    adapter: "cloud",
    source: "cloudtrail",
    host: "s3-archive",
    event: "bucket_policy_change",
    action: "put_bucket_policy",
    user: "ci-deployer",
    ip: "203.0.113.24",
    status: "alert",
    message: "Public read policy applied to northwind-archive-exports",
  },
  {
    adapter: "siem",
    source: "proxy",
    host: "web-01",
    event: "http_request",
    action: "post",
    user: "anonymous",
    ip: "198.51.100.77",
    status: "allow",
    message: "POST /portal/api/query 200 · 4.2 kB response · UA sqlmap/1.8",
  },
  {
    adapter: "siem",
    source: "app",
    host: "app-01",
    event: "db_query",
    action: "select",
    user: "svc-portal",
    ip: "10.20.3.11",
    status: "allow",
    message: "SELECT customer_records LIMIT 5000 executed in 0.82s",
  },
];

const adapterById = new Map(ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function getAdapter(id) {
  return adapterById.get(id) || null;
}

export function adapterStatus() {
  return ADAPTERS.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    kind: adapter.kind,
    mode: adapter.mode,
    status: adapter.status,
    description: adapter.description,
    requiredEnv: adapter.requiredEnv,
  }));
}

export function createMockTelemetryEvent(cursor = 0) {
  const base = LIVE_FEED[Math.abs(cursor) % LIVE_FEED.length];
  const timestamp = new Date().toISOString();
  return {
    ...base,
    timestamp,
    raw: JSON.stringify({
      ts: timestamp,
      adapter: base.adapter,
      source: base.source,
      host: base.host,
      user: base.user,
      event: base.event,
      action: base.action,
      status: base.status,
      src_ip: base.ip,
      message: base.message,
      tenant: "northwind",
      parser: "hunter-normaliser-v3",
    }),
  };
}

/**
 * Mock implementation of the shared adapter pull contract. Replace this with a
 * vendor-specific implementation while keeping the returned event shape.
 */
export async function pullMockEvents({ adapter = null, limit = 1 } = {}) {
  const pool = adapter ? LIVE_FEED.filter((event) => event.adapter === adapter) : LIVE_FEED;
  return Array.from({ length: Math.min(limit, pool.length) }, (_, index) => ({
    ...pool[index],
    timestamp: new Date().toISOString(),
  }));
}
