import { test, expect } from "@playwright/test";
import { signIn } from "./helpers.js";

test("HUNTER dashboard streams live telemetry and shows rule detections", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/app/hunter");

  await expect(
    page.getByRole("heading", { level: 1, name: /HUNTER has read the evidence/i })
  ).toBeVisible();

  // The banner only says "connected" once the server telemetry store has been
  // read and the SSE stream is open; it is a real readiness signal, not a prop.
  await expect(page.getByText("Live telemetry stream connected.")).toBeVisible();
  await expect(page.getByText(/event\(s\) stored · \d+ rule detection\(s\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Run controlled attack" })).toBeVisible();
});

test("controlled attack produces visible detections end to end", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/app/hunter");
  await expect(page.getByText("Live telemetry stream connected.")).toBeVisible();
  const banner = page.getByText(/event\(s\) stored · \d+ rule detection\(s\)/).first();
  const initialCount = Number((await banner.textContent()).match(/(\d+) event/)[1]);

  const simulated = page.waitForResponse(
    (response) =>
      response.url().includes("/api/detections/simulate") &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Run controlled attack" }).click();

  const response = await simulated;
  expect(response.status()).toBe(202);
  const payload = await response.json();
  expect(payload.simulated).toBe(true);
  expect(payload.injected).toBeGreaterThan(20);
  expect(payload.note).toContain("No packet");
  expect(payload.detections.length).toBeGreaterThan(0);

  // The success toast proves the click completed; the optimistic merge from
  // the simulation response proves the server detection reached the React
  // surface without a second, instance-sensitive read.
  await expect(page.getByText("Controlled attack simulated")).toBeVisible();
  await expect(page.getByText(/Port scan from|Brute-force authentication from|beaconing from/i).first()).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "203.0.113.88", exact: true }).first()
  ).toBeVisible();

  // The injection response is applied optimistically and then the same events
  // arrive over SSE. The banner must count each event once, not twice.
  await expect
    .poll(async () => Number((await banner.textContent()).match(/(\d+) event/)[1]), {
      timeout: 10_000,
    })
    .toBe(initialCount + payload.injected);

  await page.getByRole("link", { name: /All detections/i }).click();
  await expect(page).toHaveURL(/#\/app\/hunter\/detections/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The log explorer reads the same server telemetry store, so simulated
  // events must be searchable there as well.
  await page.goto("/#/app/hunter/logs?q=203.0.113.88");
  await expect(page.getByText(/events? match the current query/i).first()).toBeVisible();
  await expect(page.getByText(/SYN probe from 203\.0\.113\.88/i).first()).toBeVisible();
});

test("dashboard recovers when its first reads land on a sessionless instance", async ({ page }) => {
  await signIn(page);

  let streamOpen = false;
  let blocked = 0;
  const panelPaths = new Set([
    "/api/telemetry",
    "/api/telemetry/stats",
    "/api/detections",
    "/api/connectors",
    "/api/network/status",
  ]);

  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/api/telemetry/stream" && response.status() === 200) streamOpen = true;
  });

  // Mirror Vercel's split-instance behaviour: every dashboard read fails with
  // a 401 until the SSE connection has proved which instance holds the session.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET" && panelPaths.has(path) && !streamOpen) {
      blocked += 1;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized." }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/#/app/hunter");
  await expect(page.getByText("Live telemetry stream connected.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/0\/8 SIEM\/EDR connectors configured/)).toBeVisible();
  await expect(page.getByText(/Live HUNTER data could not be loaded/)).toHaveCount(0);
  expect(blocked).toBeGreaterThanOrEqual(5);
});

test("detection API is reachable from the signed-in session and exposes rule health", async ({
  page,
}) => {
  await signIn(page);
  const response = await page.request.get("/api/detections?limit=10");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(Array.isArray(payload.detections)).toBe(true);
  expect(payload.stats.rules.length).toBeGreaterThanOrEqual(6);
  expect(payload.rules.map((rule) => rule.category)).toEqual(
    expect.arrayContaining(["brute_force", "port_scan", "suspicious_connection"])
  );

  const connectors = await page.request.get("/api/connectors");
  expect(connectors.status()).toBe(200);
  const connectorPayload = await connectors.json();
  expect(connectorPayload.mode).toBe("live");
  expect(connectorPayload.live.network.ingest).toBe("/api/network/flows");
  expect(connectorPayload.live.detections.rules).toBeGreaterThanOrEqual(6);
  for (const adapter of connectorPayload.adapters) {
    expect(["live", "unconfigured"]).toContain(adapter.mode);
  }
});
