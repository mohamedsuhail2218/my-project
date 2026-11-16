import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app.js";
import { createDatabase, DEMO_PASSWORD } from "../../server/db.js";

let db;
let app;
let adminAgent;
let viewerAgent;

beforeAll(async () => {
  db = createDatabase(":memory:");
  app = createApp({ db });

  adminAgent = request.agent(app);
  await adminAgent
    .post("/api/auth/login")
    .send({ email: "alex@northwind.io", password: DEMO_PASSWORD })
    .expect(200);

  viewerAgent = request.agent(app);
  await viewerAgent
    .post("/api/auth/login")
    .send({ email: "maya@northwind.io", password: DEMO_PASSWORD })
    .expect(200);
});

afterAll(() => {
  try {
    db.close();
  } catch {
    // Ignore close errors in test teardown.
  }
});

describe("API health and authentication", () => {
  it("exposes an unauthenticated health probe without version details", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.database).toBe("ok");
    expect(response.body.version).toBeUndefined();
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("rejects invalid credentials without leaking which field failed", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "alex@northwind.io", password: "wrong-password" })
      .expect(401);
    expect(response.body.message).toBe("Email or password is incorrect.");
  });

  it("rejects malformed login payloads with field-level validation", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "" })
      .expect(400);
    expect(response.body.details.some((detail) => detail.path === "email")).toBe(true);
  });

  it("creates a session cookie and returns role permissions", async () => {
    const agent = request.agent(app);
    const response = await agent
      .post("/api/auth/login")
      .send({ email: "priya@northwind.io", password: DEMO_PASSWORD })
      .expect(200);

    expect(response.body.user.roleKey).toBe("security_analyst");
    expect(response.body.user.permissions).toContain("workspace:write");
    expect(response.body.user.password_hash).toBeUndefined();
    expect(response.headers["set-cookie"][0]).toContain("dtcw_session=");

    const session = await agent.get("/api/auth/session").expect(200);
    expect(session.body.user.email).toBe("priya@northwind.io");
  });

  it("returns a null user for an unauthenticated session", async () => {
    const response = await request(app).get("/api/auth/session").expect(200);
    expect(response.body.user).toBeNull();
  });

  it("requires authentication for workspace and connectors", async () => {
    await request(app).get("/api/workspace").expect(401);
    await request(app).get("/api/connectors").expect(401);
    await request(app).get("/api/audit").expect(401);
  });

  it("destroys the session on logout", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "priya@northwind.io", password: DEMO_PASSWORD })
      .expect(200);
    await agent.post("/api/auth/logout").expect(200);
    const session = await agent.get("/api/auth/session").expect(200);
    expect(session.body.user).toBeNull();
  });

  it("serves the seeded workspace with schema version and adapter metadata", async () => {
    const response = await adminAgent.get("/api/workspace").expect(200);
    expect(response.body.workspace.assets.length).toBeGreaterThan(0);
    expect(response.body.schemaVersion).toBe(2);
    expect(response.body.user.roleKey).toBe("super_admin");
    expect(response.body.workspace.org.plan).toBe("Professional");
    expect(response.body.workspace.org.seats).toBe(10);

    const connectors = await adminAgent.get("/api/connectors").expect(200);
    expect(connectors.body.mode).toBe("live");
    expect(connectors.body.adapters.map((adapter) => adapter.id)).toEqual([
      "splunk",
      "elastic",
      "sentinel",
      "defender",
      "crowdstrike",
      "wazuh",
      "generic-siem",
      "generic-edr",
    ]);
    // Connectors report their real configuration state. In a test environment
    // without vendor credentials they are explicitly unconfigured, never mock.
    expect(
      connectors.body.adapters.every((adapter) =>
        ["live", "unconfigured"].includes(adapter.mode)
      )
    ).toBe(true);
    expect(connectors.body.live.telemetry.mode).toBe("live");
    expect(connectors.body.live.network.ingest).toBe("/api/network/flows");
    expect(connectors.body.live.detections.rules).toBeGreaterThanOrEqual(6);
    expect(connectors.body.live.anomaly.mode).toBe("live");
    expect(connectors.body.live.anomaly.algorithm).toBe("isolation-forest");
    expect(connectors.body.live.assistant.mode).toBe("unconfigured");
  });
});

describe("RBAC and server-side validation", () => {
  it("allows a super admin to save a valid workspace", async () => {
    const current = await adminAgent.get("/api/workspace").expect(200);
    const { user: _user, ...workspace } = current.body.workspace;
    const response = await adminAgent.put("/api/workspace").send(workspace).expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.schemaVersion).toBe(2);
  });

  it("rejects an invalid workspace payload before it reaches SQLite", async () => {
    const response = await adminAgent
      .put("/api/workspace")
      .send({ org: { name: "" }, assets: [{ id: "x", name: "", criticality: "unknown" }] })
      .expect(400);
    expect(response.body.message).toBe("Workspace validation failed.");
    expect(response.body.details.length).toBeGreaterThan(0);
  });

  it("blocks a read-only role from writing, resetting and reading audit data", async () => {
    const current = await viewerAgent.get("/api/workspace").expect(200);
    const { user: _user, ...workspace } = current.body.workspace;

    const write = await viewerAgent.put("/api/workspace").send(workspace).expect(403);
    expect(write.body.details.required).toBe("workspace:write");

    await viewerAgent.post("/api/workspace/reset").send({}).expect(403);
    await viewerAgent.get("/api/audit").expect(403);
  });

  it("allows a super admin to reset and to read the audit log", async () => {
    const reset = await adminAgent.post("/api/workspace/reset").send({}).expect(200);
    expect(reset.body.workspace.assets.length).toBeGreaterThan(0);
    expect(reset.body.workspace.user).toBeNull();

    const audit = await adminAgent.get("/api/audit").expect(200);
    expect(audit.body.events.some((event) => event.action === "workspace.reset")).toBe(true);
    expect(audit.body.events[0].ip).toBeTruthy();
    expect(audit.body.verified).toBe(true);
  });

  it("validates and applies profile updates", async () => {
    await adminAgent.patch("/api/auth/profile").send({ name: "" }).expect(400);

    const response = await adminAgent
      .patch("/api/auth/profile")
      .send({ name: "Alex Mercer", title: "Security Engineering Lead" })
      .expect(200);
    expect(response.body.user.name).toBe("Alex Mercer");
    expect(response.body.user.title).toBe("Security Engineering Lead");
  });

  it("registers without a session and never reveals whether an email exists", async () => {
    const email = `test-${Date.now()}@example.com`;
    const password = "CorrectHorse!42";

    const weak = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test User", email, org: "Test Org", password: "short", terms: true })
      .expect(400);
    expect(weak.body.details.some((detail) => detail.path === "password")).toBe(true);

    const created = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test User", email, org: "Test Org", password, terms: true })
      .expect(202);
    expect(created.body.ok).toBe(true);
    expect(created.body.user).toBeUndefined();
    expect(created.headers["set-cookie"]).toBeUndefined();

    const signedOut = await request(app).get("/api/auth/session").expect(200);
    expect(signedOut.body.user).toBeNull();

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password })
      .expect(200);
    expect(login.body.user.roleKey).toBe("super_admin");
    expect(login.body.user.org).toBe("Test Org");
    expect(login.body.user.plan).toBe("Starter");

    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const audit = await request(app).get("/api/audit").set("Cookie", cookie).expect(200);
    const actions = audit.body.events.map((event) => event.action);
    expect(actions).toContain("auth.register");
    expect(actions).not.toContain("workspace.reset");

    // A duplicate registration returns the same generic response as a fresh one.
    const duplicate = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test User", email, org: "Test Org", password, terms: true })
      .expect(202);
    expect(duplicate.body.message).toBe(created.body.message);
  });
});

describe("security regressions", () => {
  it("ignores X-Forwarded-For for rate limiting", async () => {
    const limited = createApp({ db, limiterOverrides: { login: 2, register: 100, global: 10000 } });
    const statuses = [];
    for (let index = 0; index < 4; index += 1) {
      const response = await request(limited)
        .post("/api/auth/login")
        .set("X-Forwarded-For", `198.51.100.${index + 1}`)
        .send({ email: "alex@northwind.io", password: "definitely-wrong" });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 2)).toEqual([401, 401]);
    expect(statuses[2]).toBe(429);
  });

  it("records the socket address rather than a spoofed X-Forwarded-For in the audit log", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .set("X-Forwarded-For", "10.9.8.7")
      .send({ email: "alex@northwind.io", password: DEMO_PASSWORD })
      .expect(200);
    const audit = await agent.get("/api/audit").expect(200);
    const event = audit.body.events.find((row) => row.action === "auth.login");
    expect(event).toBeTruthy();
    expect(event.ip).not.toBe("10.9.8.7");
    expect(["127.0.0.1", "::ffff:127.0.0.1", "::1"]).toContain(event.ip);
  });

  it("keeps plan and seat entitlements server-owned", async () => {
    const analyst = request.agent(app);
    await analyst
      .post("/api/auth/login")
      .send({ email: "priya@northwind.io", password: DEMO_PASSWORD })
      .expect(200);

    const current = await analyst.get("/api/workspace").expect(200);
    const { user: _user, ...workspace } = current.body.workspace;
    workspace.org.plan = "Enterprise";
    workspace.org.seats = 9999;
    await analyst.put("/api/workspace").send(workspace).expect(200);

    const session = await analyst.get("/api/auth/session").expect(200);
    expect(session.body.user.plan).toBe("Professional");
    const after = await analyst.get("/api/workspace").expect(200);
    expect(after.body.workspace.org.seats).toBe(10);

    await analyst
      .patch("/api/workspace/plan")
      .send({ plan: "Enterprise" })
      .expect(403);

    const upgraded = await adminAgent
      .patch("/api/workspace/plan")
      .send({ plan: "Enterprise" })
      .expect(200);
    expect(upgraded.body.plan).toBe("Enterprise");
    expect(upgraded.body.seats).toBe(9999);
    expect(upgraded.body.user.plan).toBe("Enterprise");

    await adminAgent.patch("/api/workspace/plan").send({ plan: "Professional" }).expect(200);
  });

  it("does not parse the workspace document while resolving a session", async () => {
    const stored = db.prepare("SELECT state FROM workspaces WHERE id = 'northwind'").get();
    db.prepare("UPDATE workspaces SET state = ? WHERE id = 'northwind'").run("{ definitely-not-json");
    const session = await adminAgent.get("/api/auth/session").expect(200);
    expect(session.body.user.email).toBe("alex@northwind.io");
    db.prepare("UPDATE workspaces SET state = ? WHERE id = 'northwind'").run(stored.state);
  });

  it("rejects passwords that exceed bcrypt's 72-byte boundary or are common", async () => {
    const long = `Aa1!${"a".repeat(70)}`;
    expect(Buffer.byteLength(long, "utf8")).toBeGreaterThan(72);

    const longResponse = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Long Password",
        email: `long-${Date.now()}@example.com`,
        org: "Long Org",
        password: long,
        terms: true,
      })
      .expect(400);
    expect(longResponse.body.details.some((detail) => detail.path === "password")).toBe(true);

    const common = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Common Password",
        email: `common-${Date.now()}@example.com`,
        org: "Common Org",
        password: "TwinDemo!2026",
        terms: true,
      })
      .expect(400);
    expect(common.body.details.some((detail) => detail.path === "password")).toBe(true);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "alex@northwind.io", password: long })
      .expect(400);
  });

  it("detects tampering in the hash-chained audit log", async () => {
    const row = db
      .prepare("SELECT id, detail FROM audit_log WHERE workspace_id = 'northwind' ORDER BY id DESC LIMIT 1")
      .get();
    db.prepare("UPDATE audit_log SET detail = 'tampered' WHERE id = ?").run(row.id);
    const broken = await adminAgent.get("/api/audit").expect(200);
    expect(broken.body.verified).toBe(false);
    expect(broken.body.brokenAt).toBe(row.id);

    db.prepare("UPDATE audit_log SET detail = ? WHERE id = ?").run(row.detail, row.id);
    const restored = await adminAgent.get("/api/audit").expect(200);
    expect(restored.body.verified).toBe(true);
  });

  it("ignores interrupted audit inserts instead of failing the whole chain", async () => {
    const last = db
      .prepare(
        `SELECT entry_hash FROM audit_log
         WHERE workspace_id = 'northwind' AND entry_hash IS NOT NULL AND entry_hash <> ''
         ORDER BY id DESC LIMIT 1`
      )
      .get();
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO audit_log (workspace_id, action, created_at, prev_hash, entry_hash)
       VALUES ('northwind', ?, ?, ?, ?)`
    );
    const nullRow = insert.run("test.crash_null", now, last.entry_hash, null);
    const emptyRow = insert.run("test.crash_empty", now, last.entry_hash, "");

    const audit = await adminAgent.get("/api/audit").expect(200);
    expect(audit.body.verified).toBe(true);

    db.prepare("DELETE FROM audit_log WHERE id IN (?, ?)").run(
      nullRow.lastInsertRowid,
      emptyRow.lastInsertRowid
    );
  });

  it("rejects cross-origin state-changing requests", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://evil.example")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ email: "alex@northwind.io", password: DEMO_PASSWORD });
    expect(response.status).toBe(403);
  });

  it("enforces the workspace session idle timeout and IP allowlist", async () => {
    await adminAgent
      .patch("/api/workspace/security")
      .send({ sessionTimeoutMinutes: 15, ipAllowlist: "127.0.0.0/8" })
      .expect(200);

    await adminAgent.get("/api/auth/session").expect(200).expect((response) => {
      expect(response.body.user.email).toBe("alex@northwind.io");
    });

    const invalid = await adminAgent
      .patch("/api/workspace/security")
      .send({ sessionTimeoutMinutes: 15, ipAllowlist: "not-a-network" })
      .expect(400);
    expect(invalid.body.details.some((detail) => detail.path === "ipAllowlist")).toBe(true);

    db.prepare(
      `UPDATE sessions SET last_seen_at = ?
       WHERE user_id = (SELECT id FROM users WHERE email = 'alex@northwind.io')`
    ).run(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    const expired = await adminAgent.get("/api/auth/session").expect(200);
    expect(expired.body.user).toBeNull();

    // Sign in again, then lock the workspace to a range that excludes the test client.
    await adminAgent
      .post("/api/auth/login")
      .send({ email: "alex@northwind.io", password: DEMO_PASSWORD })
      .expect(200);
    await adminAgent
      .patch("/api/workspace/security")
      .send({ sessionTimeoutMinutes: 15, ipAllowlist: "192.0.2.0/24" })
      .expect(200);

    const blocked = await adminAgent.get("/api/auth/session").expect(200);
    expect(blocked.body.user).toBeNull();
    expect(blocked.body.reason).toBe("ip_not_allowed");

    db.prepare("UPDATE workspaces SET ip_allowlist = '', session_timeout_minutes = 480 WHERE id = 'northwind'").run();
    const restored = await adminAgent.get("/api/auth/session").expect(200);
    expect(restored.body.user.email).toBe("alex@northwind.io");
  });
});
