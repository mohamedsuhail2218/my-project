import { test, expect } from "@playwright/test";
import { collectPageErrors, signIn } from "./helpers.js";

test("subscription shows the UPI payment number with manual verification", async ({ page }) => {
  const errors = collectPageErrors(page);
  await signIn(page);
  await page.goto("/#/app/subscription");

  await expect(
    page.getByRole("heading", { level: 1, name: /A plan that matches the way you test/ })
  ).toBeVisible();
  await expect(page.getByText("8939144690").first()).toBeVisible();

  await page.getByRole("button", { name: /Pay via UPI/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("8939144690").first()).toBeVisible();
  await expect(dialog.getByText(/Manual verification/)).toBeVisible();
  await expect(dialog.getByText(/Never share your UPI PIN/)).toBeVisible();

  await expect(page.getByText("4242")).toHaveCount(0);
  await expect(page.getByText(/Razorpay/)).toHaveCount(0);

  expect(errors).toEqual([]);
});
