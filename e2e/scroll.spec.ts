import { test, expect } from "@playwright/test";
import { TALL_BYTES_A, TALL_BYTES_B, TWO_TABLE_DICTS } from "./fixtures.ts";

const visibleRow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __visibleRow?: number }).__visibleRow ?? 0);

async function loadTwoTables(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(
    ({ dicts, a, b }) => {
      (window as unknown as { __loadForTest: (i: unknown) => void }).__loadForTest([
        { dictText: dicts[0].text, bytes: a },
        { dictText: dicts[1].text, bytes: b },
      ]);
    },
    { dicts: TWO_TABLE_DICTS, a: TALL_BYTES_A, b: TALL_BYTES_B },
  );
  await expect(page.getByText("alpha")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("data-grid-canvas")).toBeVisible();
}

test("each tab keeps its own scroll position", async ({ page }) => {
  await loadTwoTables(page);

  // Scroll tab A (alpha) down with the wheel over the grid.
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => visibleRow(page)).toBeGreaterThan(10);
  const aRow = await visibleRow(page);

  // Switch to tab B (beta) — should start at the top.
  await page.getByRole("button", { name: /^beta/ }).click();
  await expect.poll(() => visibleRow(page)).toBeLessThanOrEqual(1);

  // Back to A — should restore roughly where we left off.
  await page.getByRole("button", { name: /^alpha/ }).click();
  await expect.poll(() => visibleRow(page)).toBeGreaterThan(aRow - 3);
});

test("adding a row scrolls to the bottom", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(
    ({ text, bytes }) => {
      (window as unknown as { __loadForTest: (i: unknown) => void }).__loadForTest([{ dictText: text, bytes }]);
    },
    { text: TWO_TABLE_DICTS[0].text, bytes: TALL_BYTES_A },
  );
  await expect(page.getByTestId("data-grid-canvas")).toBeVisible({ timeout: 10_000 });
  expect(await visibleRow(page)).toBeLessThanOrEqual(1); // starts at top

  await page.getByRole("button", { name: /Row/ }).click(); // append
  // The new last row (index 80) becomes visible → first visible row is well down the list.
  await expect.poll(() => visibleRow(page)).toBeGreaterThan(40);
});
