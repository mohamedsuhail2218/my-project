import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { audit, hashPassword, newToken } from "./db.js";
import { isIpAllowed } from "./ip.js";

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  security_analyst: "Security Analyst",
  read_only: "Read Only",
};

export const ROLE_PERMISSIONS = {
  super_admin: ["*"],
  security_analyst: ["workspace:write", "hunter:write", "reports:write"],
  read_only: [],
};

// Comparing against a real hash for unknown emails keeps the response time in
// the same order of magnitude as a wrong password for a known account.
const DUMMY_HASH = bcrypt.hashSync("dtcw-dummy-password-not-used", config.bcryptCost);

export function permissionsFor(roleKey) {
  return ROLE_PERMISSIONS[roleKey] || [];
}

export function hasPermission(roleKey, permission) {
  const permissions = permissionsFor(roleKey);
  return permissions.includes("*") || permissions.includes(permission);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    title: row.title,
    role: ROLE_LABELS[row.role_key] || row.role_key,
    roleKey: row.role_key,
    permissions: permissionsFor(row.role_key),
    org: row.workspace_name,
    plan: row.plan || "Professional",
    trialEnds: row.trial_ends || null,
  };
}

export async function verifyCredentials(row, password) {
  const candidate = String(password || "");
  const hash = row?.password_hash || DUMMY_HASH;
  if (Buffer.byteLength(candidate, "utf8") > 72) {
    // Compare anyway so the timing profile matches, then reject.
    await bcrypt.compare(candidate.slice(0, 72), hash);
    return false;
  }
  const matches = await bcrypt.compare(candidate, hash);
  return Boolean(row?.password_hash) && matches;
}

export function createSession(db, userId, { remember = true, ip = null, userAgent = null } = {}) {
  const token = newToken();
  const now = new Date();
  const durationMs = remember
    ? config.rememberDays * 24 * 60 * 60 * 1000
    : config.sessionMaxHours * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + durationMs).toISOString();

  // Bound the number of live sessions per user. Logging in repeatedly should not
  // grow the sessions table forever.
  const existing = db
    .prepare("SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId);
  for (const row of existing.slice(Math.max(0, config.maxSessionsPerUser - 1))) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(row.token_hash);
  }

  db.prepare(
    `INSERT INTO sessions
       (token_hash, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    hashToken(token),
    userId,
    now.toISOString(),
    expiresAt,
    now.toISOString(),
    ip,
    userAgent ? String(userAgent).slice(0, 300) : null
  );
  return { token, expiresAt, maxAgeMs: durationMs };
}

export function destroySession(db, token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function destroyUserSessions(db, userId, { exceptToken = null } = {}) {
  if (exceptToken) {
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(
      userId,
      hashToken(exceptToken)
    );
  } else {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }
}

export function getSession(db, token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.expires_at, s.last_seen_at,
              u.id, u.workspace_id, u.email, u.name, u.title, u.role_key, u.created_at,
              w.name AS workspace_name, w.plan, w.trial_ends,
              w.session_timeout_minutes, w.ip_allowlist
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN workspaces w ON w.id = u.workspace_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash);
  if (!row) return null;

  const now = Date.now();
  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  const idleMs =
    (Number(row.session_timeout_minutes) || config.sessionIdleMinutes) * 60 * 1000;
  const lastSeen = new Date(row.last_seen_at || row.created_at).getTime();
  if (!Number.isFinite(lastSeen) || now - lastSeen > idleMs) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  // Sliding expiry: avoid a write on every request.
  if (now - lastSeen > 60_000) {
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(
      new Date(now).toISOString(),
      tokenHash
    );
  }

  return {
    user: serializeUser(row),
    roleKey: row.role_key,
    workspaceId: row.workspace_id,
    ipAllowlist: row.ip_allowlist || "",
    sessionTimeoutMinutes: Number(row.session_timeout_minutes) || config.sessionIdleMinutes,
  };
}

export function requireAuth(req, res, next) {
  if (!req.auth) {
    res.status(401).json({ message: "Sign in to access this workspace." });
    return;
  }
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ message: "Sign in to access this workspace." });
      return;
    }
    if (!hasPermission(req.auth.roleKey, permission)) {
      res.status(403).json({
        message: "Your role does not allow this action.",
        details: { required: permission, role: req.auth.user.role },
      });
      return;
    }
    next();
  };
}

export function requireRole(roleKey) {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ message: "Sign in to access this workspace." });
      return;
    }
    if (req.auth.roleKey !== roleKey) {
      res.status(403).json({ message: "Your role does not allow this action." });
      return;
    }
    next();
  };
}

export function logAudit(db, req, action, detail) {
  audit(db, {
    workspaceId: req.auth?.workspaceId || null,
    userId: req.auth?.user?.id || null,
    action,
    detail,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
}

export { hashPassword };
