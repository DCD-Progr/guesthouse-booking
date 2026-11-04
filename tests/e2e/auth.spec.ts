import { test, expect, type Page } from "@playwright/test";
const id = "00000000-0000-4000-8000-000000000099";
const email = "fixture@example.invalid";
const user = {
  id,
  aud: "authenticated",
  role: "authenticated",
  email,
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
};
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(
    JSON.stringify({
      sub: id,
      aud: "authenticated",
      role: "authenticated",
      email,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url"),
  Buffer.from("fixture-only-not-a-real-signature").toString("base64url"),
].join(".");
async function mock(
  page: Page,
  { limited = false }: { limited?: boolean } = {},
) {
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown>;
  }[] = [];
  await page.route("https://auth.example.invalid/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    let body = {};
    try {
      body = request.postDataJSON() ?? {};
    } catch {}
    calls.push({ path, method, body });
    let response: unknown = {};
    let status = 200;
    if (path === "/auth/v1/user") response = user;
    else if (path === "/auth/v1/token")
      response = {
        access_token: token,
        refresh_token: "fixture-only-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user,
      };
    else if (path === "/auth/v1/logout") return route.fulfill({ status: 204 });
    else if (path === "/auth/v1/otp" || path === "/auth/v1/recover") {
      if (limited) {
        status = 429;
        response = {
          code: "over_email_send_rate_limit",
          msg: "email rate limit exceeded",
        };
      }
    } else if (path === "/rest/v1/profiles") {
      const profile = {
        id,
        email,
        full_name: "Fixture admin",
        role: "admin",
        active: true,
        department: "",
      };
      response = url.searchParams.has("id") ? profile : [profile];
    } else if (path === "/rest/v1/settings") response = { approver_id: null };
    else if (path.startsWith("/rest/v1/")) response = [];
    else throw new Error("Unexpected fixture route " + path);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return calls;
}
test("invitation requires password setup, then sign out and password sign in work", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto(
    "/#" +
      new URLSearchParams({
        access_token: token,
        refresh_token: "fixture-only-refresh",
        expires_in: "3600",
        token_type: "bearer",
        type: "invite",
      }),
  );
  await expect(
    page.getByRole("heading", { name: "Set your password", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("New password", { exact: true })
    .fill("fixture-password-123");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("fixture-password-123");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Room availability", exact: true }),
  ).toBeVisible();
  expect(
    calls.some((c) => c.path === "/auth/v1/user" && c.method === "PUT"),
  ).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Work email", { exact: true })
    .fill(" Fixture@Example.invalid ");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Room availability", exact: true }),
  ).toBeVisible();
  expect(calls.find((c) => c.path === "/auth/v1/token")?.body.email).toBe(
    email,
  );
});
test("recovery links open password setup and mismatch is rejected without changing credentials", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto(
    "/#" +
      new URLSearchParams({
        access_token: token,
        refresh_token: "fixture-only-refresh",
        expires_in: "3600",
        token_type: "bearer",
        type: "recovery",
      }),
  );
  await expect(
    page.getByRole("heading", { name: "Set your password", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("New password", { exact: true })
    .fill("fixture-password-123");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("fixture-password-456");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("do not match");
  expect(
    calls.filter((c) => c.path === "/auth/v1/user" && c.method === "PUT"),
  ).toHaveLength(0);
});
test("password reset needs an email but does not need the forgotten password", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("work email");
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText(
    "password-reset",
  );
  expect(calls.filter((c) => c.path === "/auth/v1/recover")).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Reset password", exact: true }),
  ).toBeDisabled();
});
test("rate-limited email attempts show the cause and leave password sign in enabled", async ({
  page,
}) => {
  const calls = await mock(page, { limited: true });
  await page.goto("/");
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Email me a sign-in link", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("sending limit");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link", exact: true }),
  ).toBeDisabled();
  expect(calls.filter((c) => c.path === "/auth/v1/otp")).toHaveLength(1);
});

test("late refresh results cannot reopen the workspace after sign-out", async ({
  page,
}) => {
  await mock(page);
  let held: any;
  let pause = false;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route(
    "https://auth.example.invalid/rest/v1/settings*",
    async (route) => {
      if (pause) {
        held = route;
        await gate;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ approver_id: null }),
      });
    },
  );
  await page.goto("/");
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Room availability", exact: true }),
  ).toBeVisible();
  pause = true;
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect.poll(() => Boolean(held)).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  release();
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Room availability", exact: true }),
  ).toHaveCount(0);
});
test("staff pagination loads beyond the first API page", async ({ page }) => {
  await mock(page);
  const offsets: number[] = [];
  await page.route(
    "https://auth.example.invalid/rest/v1/profiles*",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has("id")) {
        await route.fallback();
        return;
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      offsets.push(offset);
      const profiles = Array.from(
        { length: offset === 0 ? 500 : 1 },
        (_, i) => ({
          id: `fixture-${offset + i}`,
          full_name: `Staff ${offset + i}`,
          email: `staff${offset + i}@example.invalid`,
          role: "requester",
          active: true,
          department: "",
        }),
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(profiles),
      });
    },
  );
  await page.goto("/");
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Room availability", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Staff", exact: true })
    .click();
  await expect(
    page.getByRole("cell", {
      name: "Staff 500 staff500@example.invalid",
      exact: true,
    }),
  ).toBeVisible();
  expect(offsets).toContain(500);
});
