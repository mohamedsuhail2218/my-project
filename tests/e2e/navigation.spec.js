import { test, expect } from "@playwright/test";
import { collectPageErrors, signIn } from "./helpers.js";

const ROUTES = [
  "/#/app",
  "/#/app/workspace",
  "/#/app/twin",
  "/#/app/twin/simulations",
  "/#/app/twin/attack-paths",
  "/#/app/hunter",
  "/#/app/hunter/detections",
  "/#/app/hunter/logs",
  "/#/app/hunter/incidents",
  "/#/app/hunter/intel",
  "/#/app/reports",
  "/#/app/settings",
];

test("every primary route renders without a page error", async ({ page }) => {
  const errors = collectPageErrors(page);
  await signIn(page);

  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.locator(".route-loading")).toHaveCount(0);
  }

  expect(errors).toEqual([]);
});

test("a read-only analyst cannot reach the Super Admin page", async ({ page }) => {
  await signIn(page, "maya@northwind.io");

  await expect(page.locator('.sidebar-nav a[href="#/app/admin"]')).toHaveCount(0);
  await page.goto("/#/app/admin");
  await expect(page).toHaveURL(/#\/app$/);
  await expect(page.getByRole("heading", { level: 1, name: /Your twin is ready/ })).toBeVisible();
});
