import { test, expect } from "@playwright/test";
import { signIn } from "./helpers.js";

test.describe("responsive and keyboard access", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile layout has no horizontal overflow and navigation opens", async ({ page }) => {
    await signIn(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.locator(".app-sidebar")).toHaveClass(/open/);
    await page.getByRole("link", { name: "Log Analysis" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Read the raw events/ })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(391);
  });

  test("skip link focuses the main landmark from the keyboard", async ({ page }) => {
    await signIn(page);
    // Reload so the browser's sequential focus navigation starts at the top of
    // the document, exactly as it would on a cold page load.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("#app-content")).toBeFocused();
  });
});
