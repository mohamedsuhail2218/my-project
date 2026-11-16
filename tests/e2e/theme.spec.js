import { test, expect } from "@playwright/test";
import { signIn } from "./helpers.js";

test.describe("red neon theme", () => {
  test("landing poster uses the red accent palette", async ({ page }) => {
    await page.goto("/#/");

    const palette = await page.locator(".nx-page").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        accent: style.getPropertyValue("--nx-accent").trim(),
        bright: style.getPropertyValue("--nx-accent-bright").trim(),
        deep: style.getPropertyValue("--nx-accent-deep").trim(),
      };
    });

    expect(palette).toEqual({
      accent: "#ff3355",
      bright: "#ff6b7f",
      deep: "#b3122a",
    });
  });

  test("workspace keeps the red accent and wraps long timeline payloads on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);

    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--cyan").trim()
    );
    expect(accent).toBe("#ff3b52");

    await page.goto("/#/app/hunter/timeline");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".timeline-event").first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
