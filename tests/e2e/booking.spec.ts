import { test, expect } from "@playwright/test";
async function nav(page: any, label: string) {
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: label, exact: true })
    .click();
}
test("requester checks availability, submits, approver assigns, requester sees room", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Room availability" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check availability", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3 rooms available" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Request accommodation", exact: true })
    .click();
  await page.getByLabel("Purpose", { exact: true }).fill("Field visit");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Request submitted");
  await nav(page, "My requests");
  await expect(
    page.getByRole("cell", { name: "pending", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Awaiting assignment" }),
  ).toBeVisible();
  await page.getByLabel("Sample role").selectOption("approver");
  await nav(page, "Approvals");
  await page.getByRole("button", { name: "View request" }).click();
  await page
    .getByLabel("Available room for the entire stay")
    .selectOption("j0");
  await page.getByRole("button", { name: "Approve and confirm" }).click();
  await expect(page.getByRole("status")).toContainText("Booking confirmed");
  await page.getByLabel("Sample role").selectOption("requester");
  await nav(page, "My requests");
  await expect(
    page.getByRole("cell", { name: "confirmed", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Room 1", exact: true }),
  ).toBeVisible();
  await nav(page, "Availability");
  await page
    .getByRole("button", { name: "Check availability", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 rooms available" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("Break bypasses room selection and requester can cancel pending request", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample workspace" }).click();
  await page
    .getByRole("button", { name: "Request Break", exact: true })
    .click();
  await page.getByLabel("Purpose", { exact: true }).fill("Rest period");
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await nav(page, "My requests");
  await page.getByRole("button", { name: "View request" }).click();
  await page.getByLabel("Cancellation reason").fill("Plans changed");
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "cancelled", exact: true }),
  ).toBeVisible();
});
test("admin creates guesthouse, room and maintenance closure and reviews calendar", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample workspace" }).click();
  await page.getByLabel("Sample role").selectOption("admin");
  await nav(page, "Inventory");
  await page.getByRole("button", { name: "Guesthouses", exact: true }).click();
  await page
    .getByRole("button", { name: "Add guesthouse", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Test Guesthouse");
  await page.getByLabel("Unique code").fill("TST");
  await page.getByLabel("Destination", { exact: true }).fill("Test city");
  await page
    .getByRole("button", { name: "Save guesthouse", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Test Guesthouse TST" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rooms", exact: true }).click();
  await page.getByRole("button", { name: "Add room", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test Room");
  await page.getByLabel("Unique code").fill("TST-01");
  await page
    .getByLabel("Guesthouse", { exact: true })
    .selectOption({ label: "Test Guesthouse" });
  await page.getByRole("button", { name: "Save room", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Test Room TST-01" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Closures", exact: true }).click();
  await page.getByRole("button", { name: "Add closure", exact: true }).click();
  await page
    .getByLabel("Room", { exact: true })
    .selectOption({ label: "TST-01 · Test Room" });
  await page.getByLabel("Reason", { exact: true }).fill("Repairs");
  await page.getByRole("button", { name: "Save closure", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Repairs" })).toBeVisible();
  await nav(page, "Calendar");
  await page
    .getByLabel("Guesthouse", { exact: true })
    .selectOption({ label: "Test Guesthouse" });
  await expect(
    page.getByRole("cell", { name: "Closed", exact: true }),
  ).toBeVisible();
});
test("search changes invalidate old results and mobile has no document overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample workspace" }).click();
  await page
    .getByRole("button", { name: "Check availability", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3 rooms available" }),
  ).toBeVisible();
  await page.getByLabel("Guesthouse", { exact: true }).selectOption("bor");
  await expect(
    page.getByRole("button", { name: "Request accommodation", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Check availability", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 room available" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("designated approver can submit and approve their own accommodation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample workspace" }).click();
  await page.getByLabel("Sample role").selectOption("approver");
  await page
    .getByRole("button", { name: "Check availability", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Request accommodation", exact: true })
    .click();
  await page
    .getByLabel("Purpose", { exact: true })
    .fill("Approver field visit");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Request submitted");
  await nav(page, "Approvals");
  await page.getByRole("button", { name: "View request" }).click();
  await page
    .getByLabel("Available room for the entire stay")
    .selectOption("j0");
  await expect(
    page.getByRole("button", { name: "Reject request", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Approve and confirm" }).click();
  await expect(page.getByRole("status")).toContainText("Booking confirmed");
  await nav(page, "My requests");
  await page.getByLabel("Status", { exact: true }).selectOption("confirmed");
  await expect(
    page.getByRole("cell", { name: "confirmed", exact: true }),
  ).toBeVisible();
});

test("operational dashboard filters staff, guesthouses and dates without exposing it to requesters", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample workspace" }).click();
  await page.getByLabel("Sample role").selectOption("admin");
  await nav(page, "Overview");
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Room status", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Select staff", { exact: true })
    .selectOption("requester");
  await expect(page.getByRole("table").first()).toContainText(
    "Sample traveler",
  );
  await page.getByLabel("Guesthouse", { exact: true }).selectOption("juba");
  await page.getByLabel("Dashboard date").fill("2090-01-01");
  await expect(
    page.getByRole("heading", { name: "Staff whereabouts" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Sample role").selectOption("requester");
  await nav(page, "Overview");
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Select staff", { exact: true })).toHaveCount(0);
});
test("calendar displays traveler names and requests navigation resets the status filter", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample workspace" }).click();
  await page
    .getByRole("button", { name: "Check availability", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Request accommodation", exact: true })
    .click();
  await page.getByLabel("Purpose", { exact: true }).fill("Calendar name check");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await page.getByLabel("Sample role").selectOption("approver");
  await nav(page, "Approvals");
  await page.getByRole("button", { name: "View request" }).click();
  await page
    .getByLabel("Available room for the entire stay")
    .selectOption("j0");
  await page.getByRole("button", { name: "Approve and confirm" }).click();
  await nav(page, "My requests");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("all");
  await nav(page, "Calendar");
  await expect(page.locator(".reserved-cell").first()).toContainText(
    "Sample traveler",
  );
});
