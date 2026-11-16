import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app.js";
import { createDatabase, DEMO_PASSWORD } from "../../server/db.js";

let db;
let app;
let admin;
let viewer;

async function login(email) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .send({ email, password: DEMO_PASSWORD })
    .expect(200);
  return agent;
}

beforeAll(async () => {
  db = createDatabase(":memory:");
  app = createApp({
    db,
    limiterOverrides: {
      global: 100000,
      ingest: 100000,
      sensitive: 10000,
    },
  });
  admin = await login("alex@northwind.io");
  viewer = await login("maya@northwind.io");
});

afterAll(() => {
  try {
    db.close();
  } catch {
    // Ignore close errors in test teardown.
  }
});

describe("rule-based attack detection", () => {
  it("generates controlled attacks and records brute-force, scan and connection detections", async () => {
    const response = await admin
      .post("/api/detections/simulate")
      .send({ scenario: "all" })
      .expect(202);

    expect(response.body.simulated).toBe(true);
    expect(response.body.injected).toBeGreaterThan(20);
    expect(response.body.note).toContain("No packet");
    const categories = new Set(response.body.detections.map((detection) => detection.category));
    expect(categories.has("brute_force")).toBe(true);
    expect(categories.has("port_scan")).toBe(true);
    expect(categories.has("suspicious_connection")).toBe(true);

    const titles = response.body.detections.map((detection) => detection.title).join(" | ");
    expect(titles).toMatch(/Brute-force authentication/);
    expect(titles).toMatch(/Port scan from/);
    expect(titles).toMatch(/beaconing/i);

    // A denied inbound SYN probe must not also be classified as blocked egress.
    const egressEntities = response.body.detections
      .filter((detection) => detection.ruleId === "suspicious_egress")
      .map((detection) => detection.entity);
    expect(egressEntities).toContain("ws-sim-egress");
    expect(egressEntities).not.toContain("edge-fw-sim");

    const listed = await admin.get("/api/detections?status=open&limit=100").expect(200);
    expect(listed.body.detections.length).toBeGreaterThanOrEqual(4);
    expect(listed.body.stats.open).toBeGreaterThanOrEqual(4);
    expect(listed.body.stats.rules.length).toBeGreaterThanOrEqual(6);
    expect(listed.body.stats.byCategory.some((row) => row.category === "brute_force")).toBe(true);
    expect(listed.body.detections[0].evidence.eventIds.length).toBeGreaterThan(0);
  });

  it("normalises Zeek flows and detects a distinct-port scan", async () => {
    const sourceIp = `192.0.2.${20 + (Date.now() % 200)}`;
    const ts = Date.now() / 1000;
    const flows = Array.from({ length: 14 }, (_, index) => ({
      ts: ts - index * 0.2,
      uid: `C${Date.now()}${index}`,
      "id.orig_h": sourceIp,
      "id.orig_p": 40000 + index,
      "id.resp_h": "10.20.0.10",
      "id.resp_p": 3000 + index,
      proto: "tcp",
      duration: 0.08,
      orig_bytes: 60,
      resp_bytes: 0,
      conn_state: "S0",
    }));

    const response = await admin
      .post("/api/network/flows")
      .send({ format: "zeek", sensor: "unit-sensor", flows })
      .expect(202);

    expect(response.body.accepted).toBe(14);
    expect(response.body.formats).toContain("zeek");
    expect(response.body.events[0].dstPort).toBe(3000);
    expect(response.body.events[0].sensor).toBe("unit-sensor");
    expect(
      response.body.detections.some(
        (detection) => detection.category === "port_scan" && detection.entity === sourceIp
      )
    ).toBe(true);

    const stored = await admin.get(`/api/telemetry?q=${sourceIp}&limit=5`).expect(200);
    expect(stored.body.events.length).toBeGreaterThan(0);
    expect(stored.body.events[0].proto).toBe("tcp");
    expect(stored.body.events[0].dstIp).toBe("10.20.0.10");

    const status = await admin.get("/api/network/status").expect(200);
    expect(status.body.mode).toBe("live");
    expect(status.body.total).toBeGreaterThan(0);
    expect(status.body.latest).toBeTruthy();
  });

  it("detects repeated failed authentication sent through normal ingestion", async () => {
    const sourceIp = `198.51.100.${120 + (Date.now() % 100)}`;
    const events = Array.from({ length: 7 }, (_, index) => ({
      timestamp: new Date(Date.now() - (6 - index) * 1000).toISOString(),
      source: "vpn",
      host: "vpn-unit",
      event: "authentication_failed",
      action: "password_login",
      status: "deny",
      ip: sourceIp,
      user: "svc-test",
      message: `Failed password for svc-test from ${sourceIp} port ${51000 + index} ssh2`,
    }));

    const response = await admin
      .post("/api/telemetry/ingest")
      .send({ source: "vpn", events })
      .expect(202);

    expect(
      response.body.detections.some(
        (detection) => detection.category === "brute_force" && detection.entity === sourceIp
      )
    ).toBe(true);
  });

  it("lets an analyst triage a detection and audits the change", async () => {
    const listed = await admin.get("/api/detections?status=open&limit=1").expect(200);
    const detection = listed.body.detections[0];
    const updated = await admin
      .patch(`/api/detections/${detection.id}`)
      .send({ status: "triaged" })
      .expect(200);
    expect(updated.body.detection.status).toBe("triaged");

    const audit = await admin.get("/api/audit").expect(200);
    expect(audit.body.events.some((event) => event.action === "detection.status")).toBe(true);
  });

  it("blocks read-only users from simulating or changing detections", async () => {
    await viewer.post("/api/detections/simulate").send({ scenario: "all" }).expect(403);
    const listed = await viewer.get("/api/detections?limit=1").expect(200);
    await viewer
      .patch(`/api/detections/${listed.body.detections[0].id}`)
      .send({ status: "closed" })
      .expect(403);
    await request(app).post("/api/detections/simulate").send({ scenario: "all" }).expect(401);
  });
});

describe("real connector registry", () => {
  it("reports concrete SIEM/EDR connectors with their configuration state", async () => {
    const response = await admin.get("/api/connectors").expect(200);
    expect(response.body.mode).toBe("live");
    const ids = response.body.adapters.map((adapter) => adapter.id);
    expect(ids).toEqual([
      "splunk",
      "elastic",
      "sentinel",
      "defender",
      "crowdstrike",
      "wazuh",
      "generic-siem",
      "generic-edr",
    ]);
    for (const adapter of response.body.adapters) {
      expect(["live", "unconfigured"]).toContain(adapter.mode);
      expect(adapter.requiredEnv.length).toBeGreaterThan(0);
    }
    expect(response.body.live.detections.mode).toBe("live");
    expect(response.body.live.detections.rules).toBeGreaterThanOrEqual(6);
    expect(response.body.live.network.ingest).toBe("/api/network/flows");
    expect(response.body.live.telemetry.mode).toBe("live");
  });

  it("tests unconfigured connectors honestly and refuses an unconfigured pull", async () => {
    const tested = await admin.post("/api/connectors/splunk/test").send({}).expect(200);
    expect(tested.body.result.ok).toBe(false);
    expect(tested.body.result.unconfigured).toBe(true);
    expect(tested.body.result.detail).toMatch(/SPLUNK_BASE_URL/);

    const pulled = await admin.post("/api/connectors/splunk/pull").send({}).expect(409);
    expect(pulled.body.code).toBe("connector_not_configured");

    await admin.post("/api/connectors/not-real/test").send({}).expect(404);
    await viewer.post("/api/connectors/splunk/test").send({}).expect(403);
  });
});
