import { test, expect } from "@playwright/test";
import { collectPageErrors } from "./helpers.js";

test.describe("public landing page", () => {
  test("renders the standalone neon landing with its own header", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/#/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/DEFEND\s*BEYOND\s*LIMITS/);
    await expect(page.locator(".nx-header")).toBeVisible();
    await expect(page.locator(".public-nav")).toHaveCount(0);
    await expect(page.locator(".public-footer")).toHaveCount(0);

    await page.locator(".nx-nav").getByRole("link", { name: "PLATFORM", exact: true }).click();
    await expect(page).toHaveURL(/#\/product$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goto("/#/");
    await page.getByRole("link", { name: "START TRIAL" }).first().click();
    await expect(page).toHaveURL(/#\/signup$/);

    expect(errors).toEqual([]);
  });

  test("mobile menu opens, links and scrolls without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Toggle navigation" }).click();
    const menu = page.locator("#nx-mobile-menu");
    await expect(menu).toBeVisible();

    await menu.getByRole("link", { name: "PRICING" }).click();
    await expect(page).toHaveURL(/#\/pricing$/);
    await expect(page.locator(".public-nav")).toBeVisible();
  });
});
