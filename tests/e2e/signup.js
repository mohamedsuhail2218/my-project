import { expect } from "@playwright/test";
import { DEMO_PASSWORD } from "./helpers.js";

export async function signUp(page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.com`;
  const password = "CorrectHorse!42";
  await page.goto("/#/signup");
  await page.locator("#signup-name").fill("E2E Operator");
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-org").fill("E2E Security");
  await page.locator("#signup-password").fill(password);
  await page.getByLabel(/I confirm I will only upload logs/).check();
  await page.getByRole("button", { name: /Create workspace/ }).click();

  // Registration returns a generic 202 and never creates a session.
  await expect(page).toHaveURL(/#\/signin/);
  await page.locator("#signin-email").fill(email);
  await page.locator("#signin-password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/#\/app(\/|$)/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return { email, password };
}

export { DEMO_PASSWORD };
