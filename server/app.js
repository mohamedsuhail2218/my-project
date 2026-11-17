import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { config } from "./config.js";
import {
  createDatabase,
  createWorkspaceUser,
  getUserByEmail,
  getUserById,
  getWorkspaceRow,
  saveWorkspace,
  resetWorkspace,
  workspaceForClient,
  audit,
  setPlan,
  updateSecurityPolicy,
  verifyAuditChain,
} from "./db.js";
import {
  createSession,
  destroySession,
  getSession,
  requireAuth,
  requirePermission,
  requireRole,
  serializeUser,
  verifyCredentials,
  logAudit,
  hashPassword,
} from "./auth.js";
import {
  formatZodError,
  loginSchema,
  profileSchema,
  registerSchema,
  workspaceSchema,
  planSchema,
  securityPolicySchema,
  telemetryIngestSchema,
  telemetryTokenSchema,
  networkFlowSchema,
  detectionStatusSchema,
  detectionSimulationSchema,
  connectorPullSchema,
  assistantSchema,
  responseProposalSchema,
  responseDecisionSchema,
  responseRuleSchema,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
} from "./validation.js";
import { createRateLimiter, createLoginFailureGuard, sleep } from "./rateLimit.js";
import { isIpAllowed } from "./ip.js";
import {
  createTelemetryToken,
  ingestTelemetry,
  listTelemetryTokens,
  publishDetections,
  publishTelemetry,
  queryTelemetry,
  revokeTelemetryToken,
  subscribeTelemetry,
  telemetryStats,
  topAnomalies,
  verifyTelemetryToken,
} from "./telemetry.js";
import {
  detectionRuleCatalog,
  detectionStats,
  listDetections,
  updateDetectionStatus,
} from "./detections.js";
import { normalizeNetworkFlows } from "./network.js";
import { buildAttackSimulation } from "./simulation.js";
import {
  ConnectorError,
  connectorStatus,
  pullConnector,
  testConnector,
} from "./connectors/index.js";
import {
  anomalyFeatureCatalog,
  getModelMetadata,
  trainWorkspaceModel,
} from "./ml/anomaly.js";
import {
  assistantStatus,
  askHunter,
} from "./services/assistant.js";
import {
  intelProviderStatus,
  lookupIndicator,
} from "./services/threatIntel.js";
import { buildAssistantContext } from "./hunterContext.js";
import {
  applyAutomation,
  decideResponseAction,
  getResponseRules,
  listActiveBlocks,
  listResponseActions,
  playbookCatalog,
  proposeResponseAction,
  revertResponseAction,
  updateResponseRule,
} from "./response.js";

const isProduction = config.isProduction;
export const SESSION_COOKIE = isProduction ? "__Host-dtcw_session" : "dtcw_session";

// Each warm function instance gets a random identity for diagnostics. Callers
// can see when requests were served by different ephemeral databases instead of
// assuming a single, shared state store.
const INSTANCE_ID = randomUUID();

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  };
}

function requestOriginAllowed(req) {
  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;

  const origin = req.get("origin");
  if (!origin) return true;
  if (config.allowedOrigins.includes(origin)) return true;

  try {
    const parsed = new URL(origin);
    if (config.publicOrigin) {
      const allowed = new URL(config.publicOrigin);
      if (parsed.origin === allowed.origin) return true;
    }
    const host = req.get("host");
    return Boolean(host) && parsed.host === host;
  } catch {
    return false;
  }
}

function csrfGuard(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }
  if (!requestOriginAllowed(req)) {
    res.status(403).json({ message: "Cross-origin request rejected." });
    return;
  }
  next();
}

export function createApp({ db = createDatabase(), limiterOverrides = {} } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.set("query parser", "simple");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", "data:"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "no-referrer" },
      hsts: isProduction ? undefined : false,
    })
  );
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    res.setHeader("X-DTCW-Instance", INSTANCE_ID);
    next();
  });

  // The limiter runs before any body parser so an unauthenticated client cannot
  // force JSON allocation ahead of the rate-limit check.
  const globalLimiter = createRateLimiter({
    windowMs: config.globalRateWindowMs,
    max: limiterOverrides.global ?? config.globalRateLimit,
    message: "Too many requests. Slow down and try again.",
  });
  app.use("/api", globalLimiter);
  app.use("/api", csrfGuard);

  const authJson = express.json({ limit: config.authJsonLimit, type: "application/json" });
  const workspaceJson = express.json({ limit: config.workspaceJsonLimit, type: "application/json" });
  const telemetryJson = express.json({ limit: config.telemetryJsonLimit, type: "application/json" });
  const featureJson = express.json({ limit: "64kb", type: "application/json" });
  app.use("/api/auth", authJson);
  app.use("/api/workspace", workspaceJson);
  app.use("/api/telemetry", telemetryJson);
  app.use("/api/network", telemetryJson);
  app.use("/api/detections", featureJson);
  app.use("/api/hunter", featureJson);
  app.use("/api/intel", featureJson);
  app.use("/api/ml", featureJson);
  app.use("/api/response", featureJson);

  app.use(cookieParser());
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Vary", "Cookie");

    const token = req.cookies?.[SESSION_COOKIE];
    req.auth = token ? getSession(db, token) : null;
    if (req.auth && !isIpAllowed(req.ip, req.auth.ipAllowlist)) {
      req.auth = null;
      req.authBlockedByIp = true;
    }
    next();
  });

  const loginLimiter = createRateLimiter({
    windowMs: config.authRateWindowMs,
    max: limiterOverrides.login ?? config.loginRateLimit,
  });
  const registerLimiter = createRateLimiter({
    windowMs: config.authRateWindowMs,
    max: limiterOverrides.register ?? config.registerRateLimit,
  });
  const sensitiveLimiter = createRateLimiter({
    windowMs: config.authRateWindowMs,
    max: limiterOverrides.sensitive ?? config.sensitiveRateLimit,
    keyGenerator: (req) => req.auth?.user?.id || req.ip || "unknown",
  });
  const ingestLimiter = createRateLimiter({
    windowMs: config.ingestRateWindowMs,
    max: limiterOverrides.ingest ?? config.ingestRateLimit,
    keyGenerator: (req) =>
      req.telemetryToken?.id || req.auth?.user?.id || req.ip || "unknown",
  });
  const assistantLimiter = createRateLimiter({
    windowMs: config.authRateWindowMs,
    max: limiterOverrides.assistant ?? config.assistant.rateLimit,
    keyGenerator: (req) => req.auth?.user?.id || req.ip || "unknown",
    message: "The assistant is rate limited. Wait before asking another question.",
  });
  const intelLimiter = createRateLimiter({
    windowMs: config.authRateWindowMs,
    max: limiterOverrides.intel ?? 120,
    keyGenerator: (req) => req.auth?.user?.id || req.ip || "unknown",
  });
  const loginGuard = createLoginFailureGuard();

  // Ingestion accepts a workspace-scoped bearer token for log shippers, or a
  // normal authenticated session with write permission. Tokens are hashed at
  // rest and never expose another workspace's data.
  function requireTelemetryAuth(req, res, next) {
    const authorization = req.get("authorization") || "";
    const bearer = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    const token = req.get("x-ingest-token") || bearer;
    if (token) {
      const record = verifyTelemetryToken(db, token);
      if (!record) {
        res.status(401).json({ message: "Invalid or revoked ingestion token." });
        return;
      }
      req.telemetryToken = record;
      next();
      return;
    }
    requireAuth(req, res, () => requirePermission("hunter:write")(req, res, next));
  }

  function safeAudit(event) {
    try {
      audit(db, event);
    } catch (error) {
      console.error("[audit]", error.message);
    }
  }

  function publishIngest(workspaceId, result) {
    publishTelemetry(workspaceId, result.events);
    if (result.detections?.length) {
      publishDetections(workspaceId, {
        detections: result.detections,
        stats: detectionStats(db, workspaceId),
      });
    }
  }

  function applyAutomationSafe(workspaceId, events) {
    try {
      return applyAutomation(db, workspaceId, events);
    } catch (error) {
      console.error("[response] Automation failed:", error.message);
      return [];
    }
  }

  app.get("/api/health", (_req, res) => {
    try {
      db.prepare("SELECT 1 AS ok").get();
      res.json({ ok: true, database: "ok" });
    } catch {
      res.status(503).json({ ok: false, database: "unavailable" });
    }
  });

  app.get("/api/auth/config", (_req, res) => {
    res.json({
      selfSignup: config.allowSelfSignup,
      inviteRequired: Boolean(config.signupInviteCode),
      passwordMinLength: MIN_PASSWORD_LENGTH,
      maxPasswordBytes: MAX_PASSWORD_BYTES,
    });
  });

  app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Check your email and password.",
          details: formatZodError(parsed.error),
        });
        return;
      }

      const email = parsed.data.email.trim().toLowerCase();
      const { password, remember } = parsed.data;
      const row = getUserByEmail(db, email);

      // Capped delay for repeated failures against the same address. This does
      // not reveal whether the account exists and cannot be used as a hard lock.
      const delayMs = loginGuard.delayFor(email);
      if (delayMs > 0) await sleep(delayMs);

      const valid = await verifyCredentials(row, password);
      if (!valid) {
        loginGuard.recordFailure(email);
        safeAudit({
          workspaceId: row?.workspace_id || null,
          userId: row?.id || null,
          action: "auth.login_failed",
          detail: email,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
        res.status(401).json({ message: "Email or password is incorrect." });
        return;
      }

      if (!isIpAllowed(req.ip, row.ip_allowlist)) {
        safeAudit({
          workspaceId: row.workspace_id,
          userId: row.id,
          action: "auth.ip_blocked",
          detail: email,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
        res.status(403).json({
          message: "This workspace restricts sign-in to approved network ranges.",
        });
        return;
      }

      loginGuard.recordSuccess(email);
      const { token, expiresAt, maxAgeMs } = createSession(db, row.id, {
        remember,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.cookie(SESSION_COOKIE, token, {
        ...cookieOptions(),
        ...(remember ? { maxAge: maxAgeMs } : {}),
      });
      safeAudit({
        workspaceId: row.workspace_id,
        userId: row.id,
        action: "auth.login",
        detail: row.email,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.json({ user: serializeUser(row), expiresAt });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/register", registerLimiter, async (req, res, next) => {
    try {
      if (!config.allowSelfSignup) {
        res.status(403).json({ message: "Self-service signup is disabled for this deployment." });
        return;
      }

      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Check the signup form.",
          details: formatZodError(parsed.error),
        });
        return;
      }

      if (config.signupInviteCode) {
        const supplied = Buffer.from(String(parsed.data.inviteCode || ""));
        const expected = Buffer.from(config.signupInviteCode);
        const matches = supplied.length === expected.length && supplied.equals(expected);
        if (!matches) {
          res.status(403).json({ message: "A valid invite code is required." });
          return;
        }
      }

      const email = parsed.data.email.trim().toLowerCase();
      const existing = getUserByEmail(db, email);

      // Every request performs one bcrypt hash, whether or not the address is
      // already registered, so the response does not disclose account presence.
      if (existing) {
        await hashPassword(parsed.data.password);
      } else {
        const row = await createWorkspaceUser(db, {
          name: parsed.data.name,
          email,
          org: parsed.data.org,
          password: parsed.data.password,
          plan: "Starter",
          trialDays: 14,
        });
        safeAudit({
          workspaceId: row.workspace_id,
          userId: row.id,
          action: "auth.register",
          detail: row.email,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
      }

      res.status(202).json({
        ok: true,
        message:
          "If this address can be registered, the workspace is ready. Sign in with the password you chose.",
      });
    } catch (error) {
      if (String(error?.message || "").includes("UNIQUE")) {
        // A concurrent registration won the race. Return the same generic answer.
        res.status(202).json({
          ok: true,
          message:
            "If this address can be registered, the workspace is ready. Sign in with the password you chose.",
        });
        return;
      }
      next(error);
    }
  });

  app.get("/api/auth/session", (req, res) => {
    // A missing session is a normal signed-out state. The IP hint lets the client
    // explain an allowlist rejection without inventing an authenticated session.
    res.json({
      user: req.auth?.user || null,
      ...(req.authBlockedByIp ? { reason: "ip_not_allowed" } : {}),
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) destroySession(db, token);
    if (req.auth) logAudit(db, req, "auth.logout", req.auth.user.email);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.json({ ok: true });
  });

  app.patch("/api/auth/profile", requireAuth, (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Check the profile fields.",
        details: formatZodError(parsed.error),
      });
      return;
    }
    db.prepare("UPDATE users SET name = ?, title = ? WHERE id = ?").run(
      parsed.data.name,
      parsed.data.title,
      req.auth.user.id
    );
    const row = getUserById(db, req.auth.user.id);
    logAudit(db, req, "auth.profile_update", parsed.data.name);
    res.json({ user: serializeUser(row) });
  });

  app.get("/api/workspace", requireAuth, (req, res) => {
    const row = getWorkspaceRow(db, req.auth.workspaceId);
    if (!row) {
      res.status(404).json({ message: "Workspace not found." });
      return;
    }
    res.json({
      workspace: workspaceForClient(row),
      schemaVersion: row.schema_version,
      updatedAt: row.updated_at,
      roleKey: req.auth.roleKey,
      user: req.auth.user,
    });
  });

  app.put("/api/workspace", requireAuth, requirePermission("workspace:write"), (req, res, next) => {
    try {
      const parsed = workspaceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Workspace validation failed.",
          details: formatZodError(parsed.error),
        });
        return;
      }
      const updatedAt = saveWorkspace(db, req.auth.workspaceId, parsed.data);
      logAudit(db, req, "workspace.save", `schema v${parsed.data.schemaVersion || "unknown"}`);
      res.json({ ok: true, updatedAt, schemaVersion: parsed.data.schemaVersion || 2 });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspace/reset", requireAuth, requireRole("super_admin"), (req, res) => {
    const workspace = resetWorkspace(db, req.auth.workspaceId);
    logAudit(db, req, "workspace.reset", null);
    res.json({ workspace, user: req.auth.user });
  });

  app.patch(
    "/api/workspace/plan",
    sensitiveLimiter,
    requireAuth,
    requireRole("super_admin"),
    (req, res) => {
      const parsed = planSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Choose a valid plan.",
          details: formatZodError(parsed.error),
        });
        return;
      }
      const previous = req.auth.user.plan;
      const result = setPlan(db, req.auth.workspaceId, parsed.data.plan);
      const row = getUserById(db, req.auth.user.id);
      logAudit(db, req, "workspace.plan_change", `${previous} -> ${result.plan}`);
      res.json({ ...result, user: serializeUser(row) });
    }
  );

  app.patch(
    "/api/workspace/security",
    sensitiveLimiter,
    requireAuth,
    requireRole("super_admin"),
    (req, res) => {
      const parsed = securityPolicySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Check the security policy.",
          details: formatZodError(parsed.error),
        });
        return;
      }
      const policy = updateSecurityPolicy(db, req.auth.workspaceId, parsed.data);
      const entries = parsed.data.ipAllowlist
        .split(/\r?\n/)
        .map((line) => line.replace(/#.*$/, "").trim())
        .filter(Boolean).length;
      logAudit(
        db,
        req,
        "workspace.security_policy",
        `idle=${parsed.data.sessionTimeoutMinutes}m allowlist=${entries}`
      );
      res.json({ security: policy });
    }
  );

  /* ---------------------------------------------------------------- */
  /* Live telemetry ingestion and stream                               */
  /* ---------------------------------------------------------------- */

  app.get("/api/telemetry", requireAuth, (req, res) => {
    const events = queryTelemetry(db, req.auth.workspaceId, {
      limit: req.query.limit,
      before: req.query.before,
      q: req.query.q,
      status: req.query.status,
      host: req.query.host,
      source: req.query.source,
      minScore: req.query.minScore === undefined ? null : Number(req.query.minScore),
      since: req.query.since,
    });
    res.json({
      events,
      nextCursor: events.length ? events[events.length - 1].id : null,
      model: getModelMetadata(db, req.auth.workspaceId),
    });
  });

  app.get("/api/telemetry/stats", requireAuth, (req, res) => {
    res.json(telemetryStats(db, req.auth.workspaceId));
  });

  app.post(
    "/api/telemetry/ingest",
    requireTelemetryAuth,
    ingestLimiter,
    (req, res, next) => {
      try {
        const body = Array.isArray(req.body) ? { events: req.body } : req.body;
        const parsed = telemetryIngestSchema.safeParse(body);
        if (!parsed.success) {
          res.status(400).json({
            message: "Telemetry batch validation failed.",
            details: formatZodError(parsed.error),
          });
          return;
        }

        const workspaceId = req.telemetryToken?.workspaceId || req.auth.workspaceId;
        const result = ingestTelemetry(db, workspaceId, parsed.data.events, {
          defaultSource: parsed.data.source,
          actor: req.auth?.user?.email || null,
          token: req.telemetryToken || null,
        });

        const proposals = applyAutomationSafe(workspaceId, result.events);
        publishIngest(workspaceId, result);

        if (req.telemetryToken) {
          safeAudit({
            workspaceId,
            userId: null,
            action: "telemetry.ingest_token",
            detail: `${result.events.length} event(s) via ${req.telemetryToken.prefix}`,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          });
        } else {
          logAudit(
            db,
            req,
            "telemetry.ingest",
            `${result.events.length} event(s) from ${parsed.data.source || "mixed sources"}`
          );
        }

        res.status(202).json({
          ok: true,
          accepted: result.events.length,
          blocked: result.blocked,
          events: result.events,
          detections: result.detections,
          model: result.model,
          automation: proposals,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/telemetry/stream", requireAuth, (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write("retry: 5000\n\n");
    res.write(
      `event: ready\ndata: ${JSON.stringify({
        workspaceId: req.auth.workspaceId,
        connectedAt: new Date().toISOString(),
      })}\n\n`
    );

    const unsubscribe = subscribeTelemetry(req.auth.workspaceId, res, {
      userId: req.auth.user.id,
    });
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);
    heartbeat.unref?.();

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
  });

  app.get(
    "/api/telemetry/tokens",
    requireAuth,
    requireRole("super_admin"),
    (req, res) => {
      res.json({ tokens: listTelemetryTokens(db, req.auth.workspaceId) });
    }
  );

  app.post(
    "/api/telemetry/tokens",
    sensitiveLimiter,
    requireAuth,
    requireRole("super_admin"),
    (req, res) => {
      const parsed = telemetryTokenSchema.safeParse(req.body || {});
      if (!parsed.success) {
        res.status(400).json({
          message: "Check the token label.",
          details: formatZodError(parsed.error),
        });
        return;
      }
      const created = createTelemetryToken(db, {
        workspaceId: req.auth.workspaceId,
        label: parsed.data.label,
        userId: req.auth.user.id,
      });
      logAudit(db, req, "telemetry.token_create", `${created.prefix} · ${created.label}`);
      res.status(201).json({ token: created });
    }
  );

  app.delete(
    "/api/telemetry/tokens/:id",
    sensitiveLimiter,
    requireAuth,
    requireRole("super_admin"),
    (req, res) => {
      const revoked = revokeTelemetryToken(db, req.auth.workspaceId, req.params.id);
      if (!revoked) {
        res.status(404).json({ message: "Token not found or already revoked." });
        return;
      }
      logAudit(db, req, "telemetry.token_revoke", req.params.id);
      res.json({ ok: true });
    }
  );

  /* ---------------------------------------------------------------- */
  /* Rule-based detection                                               */
  /* ---------------------------------------------------------------- */

  app.get("/api/detections", requireAuth, (req, res) => {
    const detections = listDetections(db, req.auth.workspaceId, {
      status: req.query.status,
      severity: req.query.severity,
      category: req.query.category,
      q: req.query.q,
      limit: req.query.limit,
    });
    res.json({
      detections,
      stats: detectionStats(db, req.auth.workspaceId),
      rules: detectionRuleCatalog(),
    });
  });

  app.get("/api/detections/rules", requireAuth, (_req, res) => {
    res.json({ rules: detectionRuleCatalog(), enabled: config.detections.enabled });
  });

  app.patch(
    "/api/detections/:id",
    sensitiveLimiter,
    requireAuth,
    requirePermission("hunter:write"),
    (req, res) => {
      const parsed = detectionStatusSchema.safeParse(req.body || {});
      if (!parsed.success) {
        res.status(400).json({
          message: "Choose a valid detection status.",
          details: formatZodError(parsed.error),
        });
        return;
      }
      const detection = updateDetectionStatus(
        db,
        req.auth.workspaceId,
        req.params.id,
        parsed.data.status
      );
      if (!detection) {
        res.status(404).json({ message: "Detection not found." });
        return;
      }
      logAudit(db, req, "detection.status", `${detection.id} → ${parsed.data.status}`);
      res.json({ detection });
    }
  );

  app.post(
    "/api/detections/simulate",
    sensitiveLimiter,
    requireAuth,
    requirePermission("hunter:write"),
    (req, res, next) => {
      try {
        const parsed = detectionSimulationSchema.safeParse(req.body || {});
        if (!parsed.success) {
          res.status(400).json({
            message: "Choose a valid simulation scenario.",
            details: formatZodError(parsed.error),
          });
          return;
        }
        const runId = `sim-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const { events, scenarios } = buildAttackSimulation(parsed.data.scenario, { runId });
        const result = ingestTelemetry(db, req.auth.workspaceId, events, {
          defaultSource: "attack-simulation",
          actor: req.auth.user.email,
        });
        const proposals = applyAutomationSafe(req.auth.workspaceId, result.events);
        publishIngest(req.auth.workspaceId, result);
        logAudit(
          db,
          req,
          "detection.simulate",
          `${scenarios.join(",")} · ${result.events.length} synthetic event(s) · ${result.detections.length} detection update(s)`
        );
        res.status(202).json({
          ok: true,
          simulated: true,
          runId,
          scenarios,
          injected: result.events.length,
          events: result.events,
          detections: result.detections,
          stats: detectionStats(db, req.auth.workspaceId),
          telemetryStats: telemetryStats(db, req.auth.workspaceId),
          automation: proposals,
          note: "Synthetic telemetry only. No packet was sent to any target.",
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* Authorised network-flow monitoring                                 */
  /* ---------------------------------------------------------------- */

  app.post(
    "/api/network/flows",
    requireTelemetryAuth,
    ingestLimiter,
    (req, res, next) => {
      try {
        const body = Array.isArray(req.body) ? { flows: req.body } : req.body;
        const parsed = networkFlowSchema.safeParse(body);
        if (!parsed.success) {
          res.status(400).json({
            message: "Network flow batch validation failed.",
            details: formatZodError(parsed.error),
          });
          return;
        }
        const { events, formats } = normalizeNetworkFlows(parsed.data, {
          sensor: parsed.data.sensor || config.network.sourceLabel,
        });
        if (!events.length) {
          res.status(400).json({
            message: "No usable flow records were found. Send Zeek, Suricata or NetFlow JSON objects.",
          });
          return;
        }

        const workspaceId = req.telemetryToken?.workspaceId || req.auth.workspaceId;
        const result = ingestTelemetry(db, workspaceId, events, {
          defaultSource: parsed.data.source || "network",
          actor: req.auth?.user?.email || null,
          token: req.telemetryToken || null,
        });
        const proposals = applyAutomationSafe(workspaceId, result.events);
        publishIngest(workspaceId, result);

        if (req.telemetryToken) {
          safeAudit({
            workspaceId,
            userId: null,
            action: "network.ingest_token",
            detail: `${result.events.length} flow(s) via ${req.telemetryToken.prefix} · ${formats.join(",")}`,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          });
        } else {
          logAudit(
            db,
            req,
            "network.ingest",
            `${result.events.length} flow(s) · ${formats.join(",")}`
          );
        }

        res.status(202).json({
          ok: true,
          accepted: result.events.length,
          formats,
          sensor: parsed.data.sensor || config.network.sourceLabel,
          events: result.events,
          detections: result.detections,
          automation: proposals,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/network/status", requireAuth, (req, res) => {
    const summary = db
      .prepare(
        `SELECT COUNT(*) AS total, MAX(timestamp) AS latest, COUNT(DISTINCT ip) AS sources
         FROM telemetry_events
         WHERE workspace_id = ?
           AND (dst_ip <> '' OR lower(source) IN ('network','zeek','suricata','netflow','sflow','firewall'))`
      )
      .get(req.auth.workspaceId);
    res.json({
      mode: "live",
      ingest: "/api/network/flows",
      stream: "/api/telemetry/stream",
      sensor: config.network.sourceLabel,
      total: summary.total || 0,
      sources: summary.sources || 0,
      latest: summary.latest || null,
      formats: ["zeek", "suricata", "netflow", "generic"],
      note: "Bring your own authorised sensor. Raw packet capture is not performed by the serverless application.",
    });
  });

  /* ---------------------------------------------------------------- */
  /* Anomaly model                                                     */
  /* ---------------------------------------------------------------- */

  app.get("/api/ml/model", requireAuth, (req, res) => {
    res.json({
      model: getModelMetadata(db, req.auth.workspaceId),
      catalog: anomalyFeatureCatalog(),
    });
  });

  app.post(
    "/api/ml/train",
    sensitiveLimiter,
    requireAuth,
    requirePermission("hunter:write"),
    (req, res) => {
      const result = trainWorkspaceModel(db, req.auth.workspaceId, { reason: "manual" });
      logAudit(
        db,
        req,
        "ml.train",
        `${result.status} · ${result.samples || 0} samples · threshold ${result.threshold ?? "n/a"}`
      );
      if (result.status === "insufficient_data") {
        res.status(409).json({
          message: `The model needs at least ${result.minSamples} events before it can learn a baseline. Ingest more telemetry first.`,
          model: result,
        });
        return;
      }
      res.json({ model: result });
    }
  );

  app.get("/api/ml/anomalies", requireAuth, (req, res) => {
    const minScore =
      req.query.minScore === undefined || req.query.minScore === ""
        ? null
        : Number(req.query.minScore);
    const events = topAnomalies(db, req.auth.workspaceId, {
      limit: req.query.limit,
      minScore: Number.isFinite(minScore) ? minScore : null,
    });
    res.json({ events, model: getModelMetadata(db, req.auth.workspaceId) });
  });

  /* ---------------------------------------------------------------- */
  /* Live threat intelligence                                          */
  /* ---------------------------------------------------------------- */

  app.get("/api/intel/providers", requireAuth, (_req, res) => {
    res.json({ providers: intelProviderStatus() });
  });

  app.get(
    "/api/intel/lookup",
    intelLimiter,
    requireAuth,
    async (req, res, next) => {
      try {
        const indicator = String(req.query.indicator || "").trim();
        if (!indicator) {
          res.status(400).json({ message: "Provide an indicator to look up." });
          return;
        }
        const refresh = ["1", "true"].includes(String(req.query.refresh || "").toLowerCase());
        const result = await lookupIndicator(db, req.auth.workspaceId, indicator, { refresh });
        logAudit(
          db,
          req,
          "intel.lookup",
          `${result.type} · ${result.indicator.slice(0, 160)} · ${
            result.providers.filter((provider) => provider.ok).length
          } provider(s)`
        );
        res.json(result);
      } catch (error) {
        if (error.code === "invalid_indicator") {
          res.status(400).json({ message: error.message, code: error.code });
          return;
        }
        next(error);
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* Natural-language assistant                                        */
  /* ---------------------------------------------------------------- */

  app.get("/api/hunter/assistant/status", requireAuth, (_req, res) => {
    res.json({ assistant: assistantStatus() });
  });

  app.post(
    "/api/hunter/assistant",
    assistantLimiter,
    requireAuth,
    requirePermission("hunter:write"),
    async (req, res, next) => {
      try {
        const parsed = assistantSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            message: "Ask a question between 3 and 2000 characters.",
            details: formatZodError(parsed.error),
          });
          return;
        }

        const context = buildAssistantContext(db, req.auth.workspaceId, {
          question: parsed.data.question,
          incidentId: parsed.data.incidentId || null,
          detectionId: parsed.data.detectionId || null,
        });

        const result = await askHunter({
          question: parsed.data.question,
          context: context.promptContext,
        });

        logAudit(
          db,
          req,
          "hunter.assistant",
          `${context.sources.length} sources · ${parsed.data.question.slice(0, 120)}`
        );

        res.json({
          ...result,
          sources: context.sources,
          counts: context.counts,
          contextGeneratedAt: context.context.generatedAt,
        });
      } catch (error) {
        if (error.code === "assistant_not_configured") {
          res.status(503).json({ message: error.message, code: error.code });
          return;
        }
        if (
          ["assistant_upstream_error", "assistant_empty_response", "assistant_unavailable"].includes(
            error.code
          )
        ) {
          res.status(502).json({ message: error.message, code: error.code });
          return;
        }
        next(error);
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* Approval-gated response                                           */
  /* ---------------------------------------------------------------- */

  app.get("/api/response/playbooks", requireAuth, (_req, res) => {
    res.json({ playbooks: playbookCatalog() });
  });

  app.get("/api/response/actions", requireAuth, (req, res) => {
    res.json({
      actions: listResponseActions(db, req.auth.workspaceId, {
        status: req.query.status,
        incidentId: req.query.incidentId,
        limit: req.query.limit,
      }),
      blocks: listActiveBlocks(db, req.auth.workspaceId),
    });
  });

  app.post(
    "/api/response/actions",
    sensitiveLimiter,
    requireAuth,
    requirePermission("hunter:write"),
    (req, res) => {
      const parsed = responseProposalSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Check the response proposal.",
          details: formatZodError(parsed.error),
        });
        return;
      }
      try {
        const result = proposeResponseAction(db, req.auth.workspaceId, {
          ...parsed.data,
          requestedBy: req.auth.user.name,
          requestedById: req.auth.user.id,
          automated: false,
        });
        logAudit(
          db,
          req,
          "response.propose",
          `${parsed.data.playbookId} · ${parsed.data.target} · ${parsed.data.incidentId || "no incident"}`
        );
        res.status(result.duplicate ? 200 : 201).json(result);
      } catch (error) {
        if (error.code === "invalid_target" || error.code === "invalid_playbook") {
          res.status(400).json({ message: error.message, code: error.code });
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/api/response/actions/:id/decision",
    sensitiveLimiter,
    requireAuth,
    requireRole("super_admin"),
    (req, res) => {
      const parsed = responseDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Check the approval decision.",
          details: formatZodError(parsed.error),
        });
        return;
      }
      try {
        const result = decideResponseAction(db, req.auth.workspaceId, req.params.id, {
          ...parsed.data,
          decidedBy: req.auth.user.name,
          decidedById: req.auth.user.id,
        });
        logAudit(
          db,
          req,
          `response.${parsed.data.decision}`,
          `${req.params.id} · ${result.action.playbookId} · ${result.action.target}`
        );
        res.json(result);
      } catch (error) {
        if (error.code === "action_not_found") {
          res.status(404).json({ message: error.message });
          return;
        }
        if (error.code === "action_not_pending") {
          res.status(409).json({ message: error.message });
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/api/response/actions/:id/revert",
    sensitiveLimiter,
    requireAuth,
    requireRole("super_admin"),
    (req, res) => {
      try {
        const action = revertResponseAction(db, req.auth.workspaceId, req.params.id, {
          revertedBy: req.auth.user.name,
          revertedById: req.auth.user.id,
        });
        logAudit(db, req, "response.revert", `${action.id} · ${action.playbookId} · ${action.target}`);
        res.json({ action });
      } catch (error) {
        if (error.code === "action_not_found") {
          res.status(404).json({ message: error.message });
          return;
        }
        if (error.code === "action_not_revertible") {
          res.status(409).json({ message: error.message });
          return;
        }
        throw error;
      }
    }
  );

  app.get("/api/response/rules", requireAuth, (req, res) => {
    res.json({ rules: getResponseRules(db, req.auth.workspaceId) });
  });

  app.put(
    "/api/response/rules",
    sensitiveLimiter,
    requireAuth,
    requireRole("super_admin"),
    (req, res) => {
      const parsed = responseRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Check the automation rule.",
          details: formatZodError(parsed.error),
        });
        return;
      }
      try {
        const rule = updateResponseRule(db, req.auth.workspaceId, {
          ...parsed.data,
          updatedBy: req.auth.user.name,
        });
        logAudit(
          db,
          req,
          "response.rule_update",
          `${rule.playbookId} enabled=${rule.enabled} minScore=${rule.minScore}`
        );
        res.json({ rule });
      } catch (error) {
        if (error.code === "invalid_playbook" || error.code === "invalid_rule") {
          res.status(400).json({ message: error.message, code: error.code });
          return;
        }
        throw error;
      }
    }
  );

  app.get("/api/connectors", requireAuth, (req, res) => {
    const model = getModelMetadata(db, req.auth.workspaceId);
    const stats = telemetryStats(db, req.auth.workspaceId);
    const intel = intelProviderStatus();
    const assistant = assistantStatus();
    const adapters = connectorStatus(db, req.auth.workspaceId);
    const network = db
      .prepare(
        `SELECT COUNT(*) AS total, MAX(timestamp) AS latest
         FROM telemetry_events
         WHERE workspace_id = ?
           AND (dst_ip <> '' OR lower(source) IN ('network','zeek','suricata','netflow','sflow','firewall'))`
      )
      .get(req.auth.workspaceId);
    const detections = detectionStats(db, req.auth.workspaceId);

    res.json({
      mode: "live",
      adapters,
      connectors: adapters,
      live: {
        telemetry: {
          mode: "live",
          ingest: "/api/telemetry/ingest",
          stream: "/api/telemetry/stream",
          total: stats.total,
          last24h: stats.last24h,
        },
        network: {
          mode: "live",
          ingest: "/api/network/flows",
          sensor: config.network.sourceLabel,
          total: network.total || 0,
          latest: network.latest || null,
        },
        detections: {
          mode: config.detections.enabled ? "live" : "disabled",
          total: detections.total,
          open: detections.open,
          rules: detectionRuleCatalog().length,
          streamEvent: "detection",
        },
        anomaly: { mode: "live", ...model },
        intel: {
          mode: intel.some((provider) => provider.configured && provider.id !== "rdap")
            ? "live"
            : "rdap-only",
          providers: intel,
        },
        assistant,
      },
      note:
        "Pull connectors perform real authenticated HTTP requests to the configured vendor API. Unconfigured connectors are reported honestly and never substituted with fixtures. Push ingestion, network-flow monitoring, detection rules, the anomaly model and live intel are server-side and real.",
    });
  });

  app.post(
    "/api/connectors/:id/test",
    sensitiveLimiter,
    requireAuth,
    requirePermission("hunter:write"),
    async (req, res, next) => {
      try {
        const result = await testConnector(db, req.auth.workspaceId, req.params.id);
        logAudit(
          db,
          req,
          "connector.test",
          `${result.connector.id} · ${result.result.ok ? "ok" : result.result.unconfigured ? "unconfigured" : "failed"}`
        );
        res.json(result);
      } catch (error) {
        if (error instanceof ConnectorError && error.code === "connector_unknown") {
          res.status(404).json({ message: error.message, code: error.code });
          return;
        }
        next(error);
      }
    }
  );

  app.post(
    "/api/connectors/:id/pull",
    sensitiveLimiter,
    requireAuth,
    requirePermission("hunter:write"),
    async (req, res, next) => {
      try {
        const parsed = connectorPullSchema.safeParse(req.body || {});
        if (!parsed.success) {
          res.status(400).json({
            message: "Check the connector pull request.",
            details: formatZodError(parsed.error),
          });
          return;
        }
        const pulled = await pullConnector(db, req.auth.workspaceId, req.params.id, parsed.data);
        const result = ingestTelemetry(db, req.auth.workspaceId, pulled.events, {
          defaultSource: pulled.connector.id,
          actor: req.auth.user.email,
        });
        const proposals = applyAutomationSafe(req.auth.workspaceId, result.events);
        publishIngest(req.auth.workspaceId, result);
        logAudit(
          db,
          req,
          "connector.pull",
          `${pulled.connector.id} · ${pulled.events.length} event(s)`
        );
        res.json({
          ok: true,
          connector: pulled.connector,
          pulled: pulled.events.length,
          accepted: result.events.length,
          durationMs: pulled.durationMs,
          pulledAt: pulled.pulledAt,
          events: result.events.slice(0, 100),
          detections: result.detections,
          model: result.model,
          automation: proposals,
        });
      } catch (error) {
        if (error instanceof ConnectorError) {
          const status = error.code === "connector_unknown" ? 404 : 409;
          res.status(status).json({ message: error.message, code: error.code });
          return;
        }
        next(error);
      }
    }
  );

  app.get("/api/audit", requireAuth, requireRole("super_admin"), (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const before = Math.max(0, Number(req.query.before) || 0);
    const rows = db
      .prepare(
        `SELECT id, action, detail, ip, user_agent, created_at, prev_hash, entry_hash
         FROM audit_log
         WHERE workspace_id = ? AND (? = 0 OR id < ?)
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(req.auth.workspaceId, before, before, limit);
    const verification = verifyAuditChain(db, req.auth.workspaceId);
    res.json({
      events: rows,
      verified: verification.ok,
      checked: verification.checked,
      brokenAt: verification.brokenAt,
      truncated: verification.truncated,
      nextCursor: rows.length === limit ? rows[rows.length - 1].id : null,
    });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API route not found." });
  });

  const dist = path.resolve("dist");
  if (fs.existsSync(path.join(dist, "index.html"))) {
    app.use(
      express.static(dist, {
        index: false,
        etag: true,
        maxAge: isProduction ? "1y" : 0,
        immutable: isProduction,
        setHeaders(res, filePath) {
          if (path.basename(filePath) === "index.html") {
            res.setHeader("Cache-Control", "no-cache");
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else {
            res.setHeader("Cache-Control", "public, max-age=3600");
          }
        },
      })
    );
    // Express 5 uses path-to-regexp v8, where "*" is no longer a valid route.
    app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ message: "Request body is not valid JSON." });
      return;
    }
    if (error?.type === "entity.too.large" || error?.status === 413) {
      res.status(413).json({ message: "Request body is too large." });
      return;
    }
    if (error?.code === "workspace_too_large") {
      res.status(413).json({ message: error.message });
      return;
    }
    if (error?.code === "storage_quota") {
      res.status(507).json({ message: "Workspace storage capacity has been reached." });
      return;
    }
    if (error?.code === "workspace_quota") {
      res.status(503).json({ message: "Signups are temporarily unavailable." });
      return;
    }
    if (error?.code === "invalid_plan") {
      res.status(400).json({ message: "Choose a valid plan." });
      return;
    }
    console.error("[api]", error);
    res.status(500).json({ message: "Unexpected server error." });
  });

  return app;
}
