import { test, expect } from "@playwright/test";
import { signUp } from "./signup.js";

test("profile changes are saved by the API and rehydrated after reload", async ({ page }) => {
  await signUp(page);
  await page.goto("/#/app/settings");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const titleInput = page.getByPlaceholder("Security Engineering Lead");
  await titleInput.fill("E2E Persistence Lead");
  await page.getByRole("button", { name: /Save profile/ }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  await page.reload();
  await expect(page.getByPlaceholder("Security Engineering Lead")).toHaveValue(
    "E2E Persistence Lead"
  );
});
