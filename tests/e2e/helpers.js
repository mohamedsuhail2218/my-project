import { expect } from "@playwright/test";

export const DEMO_PASSWORD = "TwinDemo!2026";

export async function signIn(page, email = "alex@northwind.io") {
  await page.goto("/#/signin");
  await page.locator("#signin-email").fill(email);
  await page.locator("#signin-password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/#\/app(\/|$)/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
