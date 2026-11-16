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

  test("sign-in form stays readable and avoids mobile input zoom", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/signin");

    const inputSize = await page
      .locator("#signin-email")
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    const labelSize = await page
      .locator('label[for="signin-email"]')
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );

    expect(inputSize).toBeGreaterThanOrEqual(16);
    expect(labelSize).toBeGreaterThanOrEqual(12);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("sign-in and sign-up forms sit in a clearly visible card", async ({ page }) => {
    const headings = {
      signin: "Continue your investigation.",
      signup: "Build the twin. Run the attack.",
    };

    for (const route of ["signin", "signup"]) {
      await page.goto(`/#/${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(headings[route]);
      const card = page.locator(".auth-card");
      await expect(card).toBeVisible();

      const style = await card.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          borderWidth: computed.borderTopWidth,
          backgroundImage: computed.backgroundImage,
        };
      });

      expect(style.borderWidth).not.toBe("0px");
      expect(style.backgroundImage).toContain("gradient");
    }
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
