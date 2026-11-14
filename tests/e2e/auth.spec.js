import { test, expect } from "@playwright/test";
import { signIn } from "./helpers.js";
import { signUp } from "./signup.js";

test.describe("authentication", () => {
  test("rejects invalid credentials with a visible error", async ({ page }) => {
    await page.goto("/#/signin");
    await page.locator("#signin-email").fill("alex@northwind.io");
    await page.locator("#signin-password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".auth-inline-error")).toContainText(/Email or password is incorrect|Sign-in failed/);
    await expect(page).not.toHaveURL(/#\/app/);
  });

  test("signs in, survives a reload and signs out", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { level: 1, name: /Your twin is ready/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: /Your twin is ready/ })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/#\/signin/);

    await page.goto("/#/app");
    await expect(page).toHaveURL(/#\/signin/);
  });

  test("creates an isolated workspace through self-service signup", async ({ page }) => {
    await signUp(page);
  });
});
