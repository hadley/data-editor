import { test, expect } from "@playwright/test";
import { MULTI_DICT } from "./fixtures.ts";

test("a multi-table dictionary routes to the data-folder step", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("dict-input").setInputFiles(MULTI_DICT);

  // The panel detects 2 tables and asks for the data folder (not a single file).
  await expect(page.getByText("Data folder for 2 tables")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("account, district")).toBeVisible();
  await expect(page.getByTestId("parquet-input")).toHaveCount(0); // no single-file step
});
