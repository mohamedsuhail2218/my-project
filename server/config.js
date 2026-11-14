import path from "node:path";

export const DEFAULT_DEMO_PASSWORD = "TwinDemo!2026";
export const DEFAULT_DEMO_EMAIL = "alex@northwind.io";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

function envString(name, fallback = "") {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.trim();
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return !["false", "0", "no", "off"].includes(raw.trim().toLowerCase());
}

function envInt(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`[config] ${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function parseTrustProxy(raw) {
  if (raw === undefined || raw.trim() === "") return false;
  const value = raw.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  // Express accepts a comma-separated list of trusted subnets or a named range.
  return raw.trim();
}

const originErrors = [];
const featureErrors = [];

// Browsers send the serialized origin (scheme://host[:port]) in the Origin
// header, so configured values are normalized to the same shape. A malformed or
// path-bearing URL is rejected rather than silently compared as a string.
function normalizeOrigin(value, source) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    originErrors.push(`${source} contains an invalid URL: ${raw}`);
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    originErrors.push(`${source} must use http or https: ${raw}`);
    return null;
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    originErrors.push(`${source} must be a bare origin without a path, credentials, query or fragment: ${raw}`);
    return null;
  }
  return parsed.origin;
}

function parseOrigins(raw, source) {
  return String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizeOrigin(value, source))
    .filter(Boolean);
}

const demoPassword = envString("DEMO_PASSWORD", isProduction ? "" : DEFAULT_DEMO_PASSWORD);
const publicOrigin = normalizeOrigin(envString("PUBLIC_ORIGIN"), "PUBLIC_ORIGIN");
const explicitOrigins = parseOrigins(process.env.APP_ORIGINS, "APP_ORIGINS");
const devOrigins = isProduction
  ? []
  : [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:8787",
      "http://127.0.0.1:8787",
    ];
const allowedOrigins = [...new Set([...explicitOrigins, ...(publicOrigin ? [publicOrigin] : []), ...devOrigins])];

function parseFeatureUrl(value, source) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      featureErrors.push(`${source} must use http or https.`);
      return "";
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    featureErrors.push(`${source} contains an invalid URL.`);
    return "";
  }
}

const legacyAuthRateLimit = process.env.AUTH_RATE_LIMIT
  ? envInt("AUTH_RATE_LIMIT", 10, { min: 1, max: 100000 })
  : null;

export const config = Object.freeze({
  isProduction,
  isTest,
  port: envInt("PORT", 8787, { min: 0, max: 65535 }),
  host: envString("HOST", "127.0.0.1"),
  dbPath: envString("DTCW_DB_PATH", "server/data/dtcw.sqlite"),

  // Proxy / origin handling. Trusting every proxy by default turns X-Forwarded-For
  // into an attacker-controlled header, which defeats rate limiting and audit IPs.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  publicOrigin,
  allowedOrigins,

  // Account bootstrap. Demo accounts are never seeded in production unless the
  // operator explicitly opts in with a non-default password.
  demoEmail: envString("DEMO_EMAIL", DEFAULT_DEMO_EMAIL).toLowerCase(),
  demoPassword,
  seedDemoUsers: envBool("SEED_DEMO_USERS", !isProduction),
  allowSelfSignup: envBool("ALLOW_SELF_SIGNUP", !isProduction),
  signupInviteCode: envString("SIGNUP_INVITE_CODE"),
  bootstrapAdmin: {
    email: envString("BOOTSTRAP_ADMIN_EMAIL").toLowerCase(),
    password: envString("BOOTSTRAP_ADMIN_PASSWORD"),
    name: envString("BOOTSTRAP_ADMIN_NAME", "Workspace Owner"),
    org: envString("BOOTSTRAP_ADMIN_ORG", "Workspace"),
  },

  bcryptCost: envInt("BCRYPT_COST", isProduction ? 12 : 10, { min: 10, max: 15 }),

  // Rate limits. The legacy AUTH_RATE_LIMIT value still applies to both auth
  // endpoints when set, which keeps existing test/CI configuration working.
  globalRateLimit: envInt("GLOBAL_RATE_LIMIT", isProduction ? 1200 : 10000, { min: 1, max: 1000000 }),
  globalRateWindowMs: envInt("GLOBAL_RATE_WINDOW_MS", 5 * 60 * 1000, { min: 1000 }),
  loginRateLimit: envInt("LOGIN_RATE_LIMIT", legacyAuthRateLimit ?? (isProduction ? 10 : 100), {
    min: 1,
    max: 100000,
  }),
  registerRateLimit: envInt("REGISTER_RATE_LIMIT", legacyAuthRateLimit ?? (isProduction ? 5 : 100), {
    min: 1,
    max: 100000,
  }),
  authRateWindowMs: envInt("AUTH_RATE_WINDOW_MS", 15 * 60 * 1000, { min: 1000 }),
  sensitiveRateLimit: envInt("SENSITIVE_RATE_LIMIT", 60, { min: 1, max: 100000 }),

  sessionIdleMinutes: envInt("SESSION_IDLE_MINUTES", 480, { min: 15, max: 1440 }),
  sessionMaxHours: envInt("SESSION_MAX_HOURS", 8, { min: 1, max: 168 }),
  rememberDays: envInt("REMEMBER_DAYS", 7, { min: 1, max: 30 }),
  maxSessionsPerUser: envInt("MAX_SESSIONS_PER_USER", 20, { min: 1, max: 100 }),

  authJsonLimit: envString("AUTH_JSON_LIMIT", "16kb"),
  workspaceJsonLimit: envString("WORKSPACE_JSON_LIMIT", "5mb"),
  maxWorkspaceBytes: envInt("MAX_WORKSPACE_BYTES", 4_500_000, { min: 100_000, max: 50_000_000 }),
  maxDbBytes: envInt("MAX_DB_BYTES", 512 * 1024 * 1024, { min: 1024 * 1024 }),
  maxWorkspaces: envInt("MAX_WORKSPACES", 1000, { min: 1, max: 1_000_000 }),

  auditRetentionDays: envInt("AUDIT_RETENTION_DAYS", 365, { min: 1, max: 3650 }),
  auditVerifyLimit: envInt("AUDIT_VERIFY_LIMIT", 5000, { min: 100, max: 100000 }),
  auditHmacKey: envString("AUDIT_HMAC_KEY"),

  requestTimeoutMs: envInt("REQUEST_TIMEOUT_MS", 30_000, { min: 1000 }),
  headersTimeoutMs: envInt("HEADERS_TIMEOUT_MS", 35_000, { min: 1000 }),
  keepAliveTimeoutMs: envInt("KEEP_ALIVE_TIMEOUT_MS", 5000, { min: 1000 }),

  // Live telemetry ingestion. Events are stored server-side, scored on arrival
  // and capped per workspace so a noisy shipper cannot fill the database.
  telemetryJsonLimit: envString("TELEMETRY_JSON_LIMIT", "2mb"),
  telemetryMaxBatch: envInt("TELEMETRY_MAX_BATCH", 500, { min: 1, max: 5000 }),
  telemetryMaxEvents: envInt("TELEMETRY_MAX_EVENTS", 50_000, { min: 100, max: 5_000_000 }),
  telemetryRetentionDays: envInt("TELEMETRY_RETENTION_DAYS", 90, { min: 1, max: 3650 }),
  telemetryTrainMax: envInt("TELEMETRY_TRAIN_MAX", 5000, { min: 50, max: 50_000 }),
  ingestRateLimit: envInt("INGEST_RATE_LIMIT", 240, { min: 1, max: 1_000_000 }),
  ingestRateWindowMs: envInt("INGEST_RATE_WINDOW_MS", 60_000, { min: 1000 }),

  // LLM assistant. The server supports any OpenAI-compatible chat completion
  // endpoint (OpenAI, Azure-compatible gateways, vLLM, Ollama). An API key is
  // optional so a local model can be used without a cloud account.
  assistant: {
    baseUrl: parseFeatureUrl(envString("HUNTER_LLM_BASE_URL"), "HUNTER_LLM_BASE_URL"),
    apiKey: envString("HUNTER_LLM_API_KEY"),
    model: envString("HUNTER_LLM_MODEL", "gpt-4o-mini"),
    timeoutMs: envInt("HUNTER_LLM_TIMEOUT_MS", 45_000, { min: 1000, max: 120_000 }),
    maxTokens: envInt("HUNTER_LLM_MAX_TOKENS", 900, { min: 100, max: 4000 }),
    rateLimit: envInt("HUNTER_ASSISTANT_RATE_LIMIT", 20, { min: 1, max: 10_000 }),
  },

  // Live threat intelligence. RDAP requires no key; AbuseIPDB and AlienVault
  // OTX are enabled when their API keys are present.
  intel: {
    abuseIpdbKey: envString("ABUSEIPDB_API_KEY"),
    otxKey: envString("OTX_API_KEY"),
    timeoutMs: envInt("INTEL_TIMEOUT_MS", 10_000, { min: 1000, max: 60_000 }),
    cacheMinutes: envInt("INTEL_CACHE_MINUTES", 60, { min: 1, max: 10_080 }),
    userAgent: envString("INTEL_USER_AGENT", "DTCW-HUNTER/1.0 (defensive threat intelligence)"),
  },
});

export function validateRuntimeConfig() {
  const errors = [...originErrors, ...featureErrors];
  const warnings = [];

  if (config.assistant.baseUrl && !config.assistant.model) {
    errors.push("HUNTER_LLM_BASE_URL is set but HUNTER_LLM_MODEL is empty.");
  }
  if (!config.assistant.baseUrl) {
    warnings.push(
      "HUNTER_LLM_BASE_URL is not set. The natural-language assistant reports itself unavailable instead of returning canned answers."
    );
  }
  if (!config.intel.abuseIpdbKey && !config.intel.otxKey) {
    warnings.push(
      "ABUSEIPDB_API_KEY and OTX_API_KEY are not set. Live intelligence is limited to keyless RDAP registration lookups."
    );
  }

  if (isProduction) {
    if (config.seedDemoUsers) {
      if (!process.env.DEMO_PASSWORD) {
        errors.push("SEED_DEMO_USERS=true requires an explicit DEMO_PASSWORD in production.");
      } else if (config.demoPassword === DEFAULT_DEMO_PASSWORD) {
        errors.push("DEMO_PASSWORD must not be the published demo default in production.");
      }
      if (config.demoPassword.length < 12) {
        errors.push("DEMO_PASSWORD must be at least 12 characters in production.");
      }
    } else if (!config.bootstrapAdmin.email || !config.bootstrapAdmin.password) {
      errors.push(
        "Production requires SEED_DEMO_USERS=true with DEMO_PASSWORD, or BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD."
      );
    }

    if (config.bootstrapAdmin.email && !config.bootstrapAdmin.password) {
      errors.push("BOOTSTRAP_ADMIN_EMAIL also requires BOOTSTRAP_ADMIN_PASSWORD.");
    }
    if (config.allowSelfSignup && !config.signupInviteCode) {
      errors.push("ALLOW_SELF_SIGNUP=true in production requires SIGNUP_INVITE_CODE.");
    }
    if (!config.publicOrigin) {
      warnings.push(
        "PUBLIC_ORIGIN is not set. Cross-origin requests are only accepted when they match the request Host header."
      );
    }
    if (!config.auditHmacKey) {
      warnings.push("AUDIT_HMAC_KEY is not set; the audit hash chain uses unkeyed SHA-256.");
    }
    if (config.trustProxy === true) {
      warnings.push(
        "TRUST_PROXY=true trusts any client-supplied X-Forwarded-For value. Set a hop count or trusted subnet instead."
      );
    }
  } else {
    warnings.push(
      `NODE_ENV=${process.env.NODE_ENV || "undefined"}. Secure cookies and HSTS are disabled outside production.`
    );
  }

  if (config.dbPath !== ":memory:" && /onedrive|dropbox|google drive|icloud/i.test(path.resolve(config.dbPath))) {
    warnings.push(
      `The SQLite file (${config.dbPath}) is inside a cloud-sync folder. Move it to an access-controlled local directory.`
    );
  }

  return { errors, warnings };
}
