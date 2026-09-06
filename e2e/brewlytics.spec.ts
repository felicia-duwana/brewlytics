import { expect, test } from "@playwright/test";
import path from "node:path";

const fixture = (name: string) => path.join(process.cwd(), "test-fixtures", name);

async function uploadFromChooser(page: import("@playwright/test").Page, file: string) {
  // The first development request compiles and hydrates the client bundle.
  await page.waitForTimeout(5_000);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose files" }).click();
  await (await chooser).setFiles(fixture(file));
}

test("single-outlet owner can clean data, review KPIs and ask the investigation agent", async ({ page }) => {
  await page.route("**lambda-url.us-east-1.on.aws/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        answer: {
          headline: "Sales were stable in the latest month",
          overview: "The mocked investigation reviewed the uploaded single-outlet aggregates.",
          metrics: [{ label: "Net sales", value: "S$30" }],
          findings: [{ title: "Known fixture result", text: "Six orders generated S$30 in net sales." }],
          conclusion: "Review the recorded product trend before changing prices.",
          limitations: "Automated browser tests use a mocked investigation response.",
          followUps: [],
        },
        trail: [{ step: 1, tool: "product_trend", title: "Checked product trend", summary: "Used deterministic fixture data." }],
      }),
    });
  });

  await page.goto("/");
  await uploadFromChooser(page, "valid-single-outlet-pos.csv");
  await page.getByRole("button", { name: "Clean and preview" }).click();
  await expect(page.getByRole("heading", { name: "Review your cleaned dataset" })).toBeVisible();
  await page.getByRole("button", { name: "Edit dataset" }).click();
  await page.getByRole("button", { name: "Finish editing" }).click();
  await page.getByRole("button", { name: "Accept → Analyse" }).click();

  await expect(page.getByRole("heading", { name: "Results for Aug 2026" })).toBeVisible();
  for (const label of ["Net Sales", "Total Orders", "Average Order Value", "Gross Profit"]) {
    await expect(page.locator(".metrics article").filter({ hasText: label })).toBeVisible();
  }
  await expect(page.locator(".metrics article").filter({ hasText: "Net Sales" })).toContainText("S$30");
  await expect(page.locator(".metrics article").filter({ hasText: "Total Orders" })).toContainText("6");
  await expect(page.locator(".metrics article").filter({ hasText: "Average Order Value" })).toContainText("S$5.00");

  await page.getByRole("button", { name: "ChatBot" }).click();
  await page.getByPlaceholder("Ask a question about your business…").fill("What changed in sales?");
  await page.getByRole("button", { name: "Send →" }).click();
  await expect(page.getByRole("heading", { name: "Sales were stable in the latest month" })).toBeVisible();
  await expect(page.getByText("Known fixture result")).toBeVisible();
});

test("invalid upload shows a clear error and never opens the dashboard", async ({ page }) => {
  await page.goto("/");
  await uploadFromChooser(page, "invalid-unrelated.csv");
  await page.getByRole("button", { name: "Clean and preview" }).click();
  await expect(page.getByText("No usable sales table was found", { exact: false })).toBeVisible();
  await expect(page.getByText("Performance overview", { exact: false })).toHaveCount(0);
});
