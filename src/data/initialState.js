import {
  SEED_ACTIVITY,
  SEED_ASSETS,
  SEED_DETECTIONS,
  SEED_EDGES,
  SEED_EVIDENCE,
  SEED_FINGERPRINTS,
  SEED_INCIDENTS,
  SEED_INTEL,
  SEED_LOGS,
  SEED_RECOMMENDATIONS,
  SEED_REPORTS,
  SEED_RUNS,
  SEED_TEAM,
  SCENARIOS,
  minutesAgo,
} from "./mock.js";

export const STATE_SCHEMA_VERSION = 2;
export const LEGACY_STORAGE_KEY = "dtcw-workspace-v1";
export const STORAGE_KEY = "dtcw-workspace-cache-v2";

const ARRAY_KEYS = [
  "assets",
  "edges",
  "runs",
  "recommendations",
  "detections",
  "incidents",
  "fingerprints",
  "intel",
  "evidence",
  "reports",
  "logs",
  "team",
  "activity",
  "notifications",
];

export function seedNotifications() {
  return [
    {
      id: "n1",
      title: "Critical detection on ws-042",
      detail: "Encoded PowerShell spawned by an Office process. Confidence 97%.",
      at: minutesAgo(12),
      read: false,
      tone: "critical",
      to: "/app/hunter/detections",
    },
    {
      id: "n2",
      title: "Password spray against vpn-01",
      detail: "214 failed attempts across 38 accounts in the last 3 hours.",
      at: minutesAgo(48),
      read: false,
      tone: "high",
      to: "/app/hunter/detections",
    },
    {
      id: "n3",
      title: "Report RPT-2026-010 is ready",
      detail: "Technical findings for incident INC-2040 are available.",
      at: minutesAgo(95),
      read: true,
      tone: "info",
      to: "/app/reports",
    },
  ];
}

export function createInitialState(options = {}) {
  const {
    orgName = "Northwind Systems",
    domain = "northwind.io",
    plan = "Professional",
    trialEnds = null,
  } = options;

  return {
    // The authenticated user is always provided by the API session, never by
    // cached workspace data.
    user: null,
    schemaVersion: STATE_SCHEMA_VERSION,
    org: {
      name: orgName,
      domain,
      industry: "Financial technology",
      region: "EU West",
      plan,
      trialEnds,
      seats: 10,
    },
    assets: SEED_ASSETS,
    edges: SEED_EDGES,
    scenarios: SCENARIOS,
    runs: SEED_RUNS,
    recommendations: SEED_RECOMMENDATIONS,
    detections: SEED_DETECTIONS,
    incidents: SEED_INCIDENTS,
    fingerprints: SEED_FINGERPRINTS,
    intel: SEED_INTEL,
    evidence: SEED_EVIDENCE,
    reports: SEED_REPORTS,
    logs: SEED_LOGS,
    team: SEED_TEAM,
    activity: SEED_ACTIVITY,
    notifications: seedNotifications(),
    settings: {
      emailAlerts: true,
      criticalOnly: false,
      weeklyDigest: true,
      simulationAlerts: true,
      sessionTimeoutMinutes: 480,
      sessionTimeout: "8 hours",
      ipAllowlist: "",
      retentionDays: "90",
      telemetry: true,
    },
    toasts: [],
    lastSyncedAt: minutesAgo(2),
  };
}

/**
 * Normalise any persisted/server workspace into the current schema.
 *
 * Version history:
 *   1. localStorage-only workspace with no scenarios key and a trusted user
 *      object embedded in state.
 *   2. Server-backed workspace. Authentication is authoritative, the scenario
 *      library is code-owned, and all collection fields are validated.
 */
export function migrateState(input, options = {}) {
  const parsed = input && typeof input === "object" ? input : {};
  const storedVersion = Number(parsed.schemaVersion || 1);
  const base = createInitialState({
    ...options,
    orgName: parsed.org?.name || options.orgName,
    domain: parsed.org?.domain || options.domain,
    plan: parsed.org?.plan || options.plan,
    trialEnds: parsed.org?.trialEnds ?? options.trialEnds,
  });

  const migrated = {
    ...base,
    ...parsed,
    schemaVersion: STATE_SCHEMA_VERSION,
    // Auth is derived from the server session, never from a stored snapshot.
    user: null,
    org: { ...base.org, ...(parsed.org || {}) },
    settings: { ...base.settings, ...(parsed.settings || {}) },
    // The scenario library ships with the application and is not user data.
    scenarios: SCENARIOS,
    toasts: [],
  };

  ARRAY_KEYS.forEach((key) => {
    if (!Array.isArray(migrated[key])) migrated[key] = base[key];
  });

  // v1 stored completed runs without a plan for some seeded sessions. Keep the
  // record but make the missing plan explicit so the UI can fall back safely.
  if (storedVersion < 2) {
    migrated.runs = migrated.runs.map((run) => ({
      ...run,
      plan: Array.isArray(run.plan) ? run.plan : [],
      executed: Array.isArray(run.executed) ? run.executed : [],
    }));
  }

  return migrated;
}

export function readCachedState() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const read = (key) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const current = read(STORAGE_KEY);
  if (current) return migrateState(current);
  const legacy = read(LEGACY_STORAGE_KEY);
  return legacy ? migrateState(legacy) : null;
}

export function writeCachedState(state) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const { toasts, user, ...persisted } = state;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...persisted, schemaVersion: STATE_SCHEMA_VERSION })
    );
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Private browsing or quota errors should not break the workspace.
  }
}

export function clearCachedState() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
