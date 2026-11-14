import { test, expect } from "@playwright/test";
import { signIn } from "./helpers.js";

async function eventCount(page) {
  const text = await page.getByText(/events match the current query/).first().textContent();
  return Number(text.match(/(\d+)\s+events?\s+match the current query/)?.[1] || 0);
}

const eventCell = (page, host) => page.getByRole("cell", { name: host, exact: true });

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const hostA = `e2e-live-a-${runId}`;
const hostB = `e2e-live-b-${runId}`;
const hostC = `e2e-live-c-${runId}`;

function event(host, message) {
  return {
    timestamp: new Date().toISOString(),
    source: "e2e",
    host,
    event: "e2e_probe",
    action: "observe",
    status: "allow",
    ip: "198.51.100.44",
    user: "e2e.runner",
    message,
  };
}

test("HUNTER streams server telemetry and pauses cleanly", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/app/hunter/logs?live=1");
  await expect(page.getByRole("heading", { level: 1, name: /Read the raw events/ })).toBeVisible();
  await expect(page.getByText("live", { exact: true }).first()).toBeVisible();

  const first = await page.request.post("/api/telemetry/ingest", {
    data: { source: "e2e", events: [event(hostA, "first streamed event")] },
  });
  expect(first.status()).toBe(202);

  await expect(eventCell(page, hostA)).toBeVisible();
  const streamed = await eventCount(page);
  expect(streamed).toBeGreaterThan(0);

  await page.getByRole("button", { name: /Pause live tail/ }).click();
  await expect(page.getByRole("button", { name: /^Live tail$/ })).toBeVisible();

  const paused = await eventCount(page);
  const second = await page.request.post("/api/telemetry/ingest", {
    data: { source: "e2e", events: [event(hostB, "event sent while paused")] },
  });
  expect(second.status()).toBe(202);

  await page.waitForTimeout(2800);
  expect(await eventCount(page)).toBe(paused);
  await expect(eventCell(page, hostB)).toHaveCount(0);

  await page.getByRole("button", { name: /^Live tail$/ }).click();
  await expect(page.getByText("live", { exact: true }).first()).toBeVisible();

  const third = await page.request.post("/api/telemetry/ingest", {
    data: { source: "e2e", events: [event(hostC, "event after resuming")] },
  });
  expect(third.status()).toBe(202);

  await expect(eventCell(page, hostC)).toBeVisible();
});
