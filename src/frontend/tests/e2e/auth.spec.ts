import { expect, test } from "@playwright/test";

test("login and recovery are usable without exposing application data", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Sign in to Socratix" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.screenshot({ path: "../../.cache/ui/login.png", fullPage: true });
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("button", { name: "Send recovery link" }),
  ).toBeVisible();
});

test("review requires authentication", async ({ page }) => {
  await page.goto("/review");
  await expect(page).toHaveURL(/\/login/);
});

test("mobile registration layout keeps controls visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeVisible();
  await page.screenshot({
    path: "../../.cache/ui/register-mobile.png",
    fullPage: true,
  });
});

test("registration validates matching passwords without creating an account", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Synthetic browser test");
  await page.getByLabel("Email address").fill("synthetic@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password-one");
  await page.getByLabel("Confirm password", { exact: true }).fill("synthetic-password-two");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("The passwords do not match.")).toBeVisible();
});

test("missing confirmation code returns a safe expired-link message", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/login\?notice=expired-link/);
});
