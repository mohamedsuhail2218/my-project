import ipaddr from "ipaddr.js";
import { config } from "../config.js";

/**
 * Live threat intelligence.
 *
 * RDAP registration data is keyless and always queried live. AbuseIPDB adds IP
 * reputation when ABUSEIPDB_API_KEY is configured, and AlienVault OTX adds pulse
 * context when OTX_API_KEY is configured. Results are cached per workspace for a
 * bounded period; provider failures are surfaced instead of being replaced with
 * invented verdicts.
 */

const PROVIDERS = [
  {
    id: "abuseipdb",
    label: "AbuseIPDB",
    kinds: ["ip"],
    requiresKey: true,
    configured: () => Boolean(config.intel.abuseIpdbKey),
    home: "https://www.abuseipdb.com",
  },
  {
    id: "otx",
    label: "AlienVault OTX",
    kinds: ["ip", "domain", "url", "sha256"],
    requiresKey: true,
    configured: () => Boolean(config.intel.otxKey),
    home: "https://otx.alienvault.com",
  },
  {
    id: "rdap",
    label: "RDAP registration",
    kinds: ["ip", "domain"],
    requiresKey: false,
    configured: () => true,
    home: "https://rdap.org",
  },
];

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function normalizeIndicator(raw) {
  const value = String(raw || "").trim().replace(/^<|>$/g, "");
  if (!value || value.length > 2048) return null;

  if (SHA256_PATTERN.test(value)) {
    return { type: "sha256", value: value.toLowerCase() };
  }

  if (ipaddr.isValid(value)) {
    let parsed = ipaddr.parse(value);
    if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
      parsed = parsed.toIPv4Address();
    }
    return { type: "ip", value: parsed.toString() };
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
      return { type: "url", value: url.toString() };
    } catch {
      return null;
    }
  }

  if (DOMAIN_PATTERN.test(value) && !value.includes("..")) {
    return { type: "domain", value: value.toLowerCase() };
  }

  return null;
}

export function intelProviderStatus() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    kinds: provider.kinds,
    requiresKey: provider.requiresKey,
    configured: provider.configured(),
    home: provider.home,
  }));
}

async function fetchJson(fetchImpl, url, headers) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": config.intel.userAgent,
      ...headers,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(config.intel.timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      body?.errors?.[0]?.detail ||
      body?.message ||
      `Provider returned HTTP ${response.status}.`;
    throw new Error(String(message).slice(0, 200));
  }
  if (!body) throw new Error("Provider returned an empty response.");
  return body;
}

async function queryAbuseIpdb(indicator, fetchImpl) {
  if (!config.intel.abuseIpdbKey) {
    return { id: "abuseipdb", ok: false, skipped: true, error: "ABUSEIPDB_API_KEY is not configured." };
  }
  const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(
    indicator.value
  )}&maxAgeInDays=90`;
  try {
    const body = await fetchJson(fetchImpl, url, {
      Key: config.intel.abuseIpdbKey,
    });
    const data = body?.data || {};
    const score = Math.max(0, Math.min(100, Number(data.abuseConfidenceScore) || 0));
    const verdict = score >= 75 ? "malicious" : score >= 25 ? "suspicious" : "benign";
    return {
      id: "abuseipdb",
      label: "AbuseIPDB",
      ok: true,
      fetchedAt: new Date().toISOString(),
      verdict,
      confidence: score,
      summary:
        score > 0
          ? `${score}% abuse confidence across ${Number(data.totalReports) || 0} report(s).`
          : "No abuse reports within the provider window.",
      tags: [
        data.usageType,
        data.isTor ? "tor-exit" : null,
        data.countryCode,
      ].filter(Boolean),
      detail: {
        countryCode: data.countryCode || null,
        usageType: data.usageType || null,
        isp: data.isp || null,
        domain: data.domain || null,
        totalReports: Number(data.totalReports) || 0,
        distinctUsers: Number(data.numDistinctUsers) || 0,
        lastReportedAt: data.lastReportedAt || null,
        isTor: Boolean(data.isTor),
        isWhitelisted: data.isWhitelisted ?? null,
      },
    };
  } catch (error) {
    return { id: "abuseipdb", label: "AbuseIPDB", ok: false, error: error.message };
  }
}

async function queryOtx(indicator, fetchImpl) {
  if (!config.intel.otxKey) {
    return { id: "otx", ok: false, skipped: true, error: "OTX_API_KEY is not configured." };
  }
  const section =
    indicator.type === "ip"
      ? ipaddr.parse(indicator.value).kind() === "ipv6"
        ? "IPv6"
        : "IPv4"
      : indicator.type === "sha256"
        ? "file"
        : indicator.type;
  const url = `https://otx.alienvault.com/api/v1/indicators/${section}/${encodeURIComponent(
    indicator.value
  )}/general`;
  try {
    const body = await fetchJson(fetchImpl, url, {
      "X-OTX-API-KEY": config.intel.otxKey,
    });
    const pulses = Array.isArray(body?.pulse_info?.pulses) ? body.pulse_info.pulses : [];
    const count = Number(body?.pulse_info?.count ?? pulses.length) || 0;
    const verdict = count >= 3 ? "malicious" : count >= 1 ? "suspicious" : "benign";
    const confidence = count ? Math.min(95, 45 + count * 8) : 20;
    const tags = [
      ...new Set(
        pulses
          .flatMap((pulse) => (Array.isArray(pulse.tags) ? pulse.tags : []))
          .filter(Boolean)
          .slice(0, 12)
      ),
    ];
    return {
      id: "otx",
      label: "AlienVault OTX",
      ok: true,
      fetchedAt: new Date().toISOString(),
      verdict,
      confidence,
      summary: count
        ? `${count} community pulse(s) reference this indicator.`
        : "No community pulses reference this indicator.",
      tags,
      detail: {
        pulseCount: count,
        pulses: pulses.slice(0, 4).map((pulse) => ({
          name: String(pulse.name || "Unnamed pulse").slice(0, 200),
          modified: pulse.modified || null,
          adversary: pulse.adversary || null,
          tags: Array.isArray(pulse.tags) ? pulse.tags.slice(0, 6) : [],
        })),
      },
    };
  } catch (error) {
    return { id: "otx", label: "AlienVault OTX", ok: false, error: error.message };
  }
}

function rdapEventDate(events, action) {
  if (!Array.isArray(events)) return null;
  const match = events.find((event) => String(event?.eventAction || "").toLowerCase() === action);
  return match?.eventDate || null;
}

async function queryRdap(indicator, fetchImpl) {
  const url =
    indicator.type === "ip"
      ? `https://rdap.org/ip/${encodeURIComponent(indicator.value)}`
      : `https://rdap.org/domain/${encodeURIComponent(indicator.value)}`;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/rdap+json, application/json",
        "User-Agent": config.intel.userAgent,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(config.intel.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`RDAP returned HTTP ${response.status}.`);
    }
    const body = await response.json();
    return {
      id: "rdap",
      label: "RDAP registration",
      ok: true,
      fetchedAt: new Date().toISOString(),
      verdict: "unknown",
      confidence: 0,
      summary: indicator.type === "ip"
        ? `Registration block ${body.startAddress || "?"} – ${body.endAddress || "?"}.`
        : `Domain registration record for ${indicator.value}.`,
      tags: ["registration"],
      detail: {
        handle: body.handle || null,
        name: body.name || null,
        country: body.country || null,
        type: body.type || null,
        status: Array.isArray(body.status) ? body.status.slice(0, 8) : [],
        startAddress: body.startAddress || null,
        endAddress: body.endAddress || null,
        registered: rdapEventDate(body.events, "registration"),
        lastChanged: rdapEventDate(body.events, "last changed"),
        expires: rdapEventDate(body.events, "expiration"),
      },
    };
  } catch (error) {
    return { id: "rdap", label: "RDAP registration", ok: false, error: error.message };
  }
}

function combine(indicator, providers) {
  const usable = providers.filter((provider) => provider.ok);
  const verdicts = usable.map((provider) => provider.verdict);
  const verdict = verdicts.includes("malicious")
    ? "malicious"
    : verdicts.includes("suspicious")
      ? "suspicious"
      : verdicts.includes("benign")
        ? "benign"
        : "unknown";
  const confidence = usable.reduce(
    (max, provider) => Math.max(max, Number(provider.confidence) || 0),
    0
  );
  const tags = [...new Set(usable.flatMap((provider) => provider.tags || []))].slice(0, 12);
  return {
    indicator: indicator.value,
    type: indicator.type,
    checkedAt: new Date().toISOString(),
    available: usable.length > 0,
    verdict,
    confidence,
    tags,
    providers,
  };
}

function readCache(db, workspaceId, indicator) {
  const row = db
    .prepare(
      `SELECT payload, fetched_at, expires_at FROM intel_cache
       WHERE workspace_id = ? AND indicator = ?`
    )
    .get(workspaceId, indicator);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM intel_cache WHERE workspace_id = ? AND indicator = ?").run(
      workspaceId,
      indicator
    );
    return null;
  }
  try {
    return { ...JSON.parse(row.payload), cached: true, cachedAt: row.fetched_at };
  } catch {
    return null;
  }
}

function writeCache(db, workspaceId, indicator, payload) {
  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + config.intel.cacheMinutes * 60 * 1000
  ).toISOString();
  db.prepare(
    `INSERT INTO intel_cache (workspace_id, indicator, payload, fetched_at, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, indicator) DO UPDATE SET
       payload = excluded.payload,
       fetched_at = excluded.fetched_at,
       expires_at = excluded.expires_at`
  ).run(workspaceId, indicator, JSON.stringify(payload), fetchedAt, expiresAt);
}

export async function lookupIndicator(
  db,
  workspaceId,
  rawIndicator,
  { refresh = false, fetchImpl = globalThis.fetch } = {}
) {
  const indicator = normalizeIndicator(rawIndicator);
  if (!indicator) {
    const error = new Error("Enter a valid IPv4/IPv6 address, domain, URL or SHA-256 hash.");
    error.code = "invalid_indicator";
    throw error;
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available for live intelligence.");
  }

  if (!refresh) {
    const cached = readCache(db, workspaceId, indicator.value);
    if (cached) return cached;
  }

  const enabled = PROVIDERS.filter(
    (provider) => provider.kinds.includes(indicator.type) && provider.configured()
  );

  if (enabled.length === 0) {
    return {
      indicator: indicator.value,
      type: indicator.type,
      checkedAt: new Date().toISOString(),
      available: false,
      verdict: "unknown",
      confidence: 0,
      tags: [],
      providers: [],
      note: `No live provider is configured for ${indicator.type} indicators. Add ABUSEIPDB_API_KEY or OTX_API_KEY.`,
    };
  }

  const tasks = enabled.map((provider) => {
    if (provider.id === "abuseipdb") return queryAbuseIpdb(indicator, fetchImpl);
    if (provider.id === "otx") return queryOtx(indicator, fetchImpl);
    return queryRdap(indicator, fetchImpl);
  });

  // Providers are independent. One timeout must not blank the other results.
  // Each query function already converts its own failure into an error record.
  const providers = await Promise.all(tasks);
  const payload = combine(indicator, providers);
  if (payload.available) writeCache(db, workspaceId, indicator.value, payload);
  return payload;
}
