import { test, expect } from "@playwright/test";
import { DICT, PARQUET } from "./fixtures.ts";

async function open(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("dict-input").setInputFiles(DICT);
  await page.getByTestId("parquet-input").setInputFiles(PARQUET);
  await expect(page.getByText("foodbank_visits")).toBeVisible({ timeout: 10_000 });
}

const rowCount = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __wb?: { rows: unknown[] } }).__wb?.rows.length ?? -1);

test("add row, then undo with keyboard, restores the count (full undo stack)", async ({ page }) => {
  await open(page);
  expect(await rowCount(page)).toBe(4);

  await page.getByRole("button", { name: /Row/ }).click();
  expect(await rowCount(page)).toBe(5);

  await page.keyboard.press("Meta+z");
  await expect.poll(() => rowCount(page)).toBe(4);

  await page.keyboard.press("Meta+Shift+z"); // redo
  await expect.poll(() => rowCount(page)).toBe(5);
});

test("Tab on the bottom-right cell appends a new row", async ({ page }) => {
  await open(page);
  expect(await rowCount(page)).toBe(4);

  // Click into a data cell, then walk to the bottom-right (3 rows down, 8 cols right
  // for the 4-row × 9-col fixture), and Tab to append.
  const canvas = page.getByTestId("data-grid-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 53); // row 0, first data column
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
  await expect.poll(() => selCell(page)).toEqual([8, 3]); // bottom-right settled
  await page.keyboard.press("Tab");

  await expect.poll(() => rowCount(page)).toBe(5);
});

const selCell = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __gridSel?: readonly [number, number] | null }).__gridSel);

test("Tab off the end of a row wraps to the first column of the next row", async ({ page }) => {
  await open(page);
  const canvas = page.getByTestId("data-grid-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 53); // row 0
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight"); // to last column, row 0
  await expect.poll(() => selCell(page)).toEqual([8, 0]);
  await page.keyboard.press("Tab"); // wrap, not append
  await expect.poll(() => selCell(page)).toEqual([0, 1]);
  expect(await rowCount(page)).toBe(4); // no row appended (not the last row)
});

test("Shift+Tab from the far-left cell wraps to the far-right of the previous row", async ({ page }) => {
  await open(page);
  const canvas = page.getByTestId("data-grid-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 53); // row 0, col 0
  await page.keyboard.press("ArrowDown"); // → [0,1]
  await expect.poll(() => selCell(page)).toEqual([0, 1]);
  await page.keyboard.press("Shift+Tab"); // wrap up-and-right
  await expect.poll(() => selCell(page)).toEqual([8, 0]);
});

test("selection clamps to an existing row after undoing an added row", async ({ page }) => {
  await open(page);
  const canvas = page.getByTestId("data-grid-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 53);
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
  await expect.poll(() => selCell(page)).toEqual([8, 3]);
  await page.keyboard.press("Tab"); // append row 4, selection → [0,4]
  await expect.poll(() => selCell(page)).toEqual([0, 4]);
  await page.keyboard.press("Meta+z"); // undo the add → row 4 no longer exists
  await expect.poll(() => rowCount(page)).toBe(4);
  // Selection must move back onto an existing row (not row index 4).
  await expect.poll(async () => (await selCell(page))?.[1]).toBeLessThanOrEqual(3);
});

test("right-click offers insert and delete row", async ({ page }) => {
  await open(page);
  expect(await rowCount(page)).toBe(4);
  const canvas = page.getByTestId("data-grid-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 53); // hover row 0
  await page.mouse.click(box.x + 100, box.y + 53, { button: "right" });
  await expect(page.getByTestId("row-menu")).toBeVisible();

  await page.getByRole("button", { name: "Insert row below" }).click();
  await expect.poll(() => rowCount(page)).toBe(5);

  // Delete via the menu.
  await page.mouse.move(box.x + 100, box.y + 53);
  await page.mouse.click(box.x + 100, box.y + 53, { button: "right" });
  await page.getByRole("button", { name: /Delete row/ }).click();
  await expect.poll(() => rowCount(page)).toBe(4);
});

test("status bar shows the exact validation error for the selected cell", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const wb = (window as unknown as { __wb?: { setCell: (r: number, c: string, v: unknown) => void } }).__wb;
    wb?.setCell(0, "client_id", null); // primary key → required
  });
  const canvas = page.getByTestId("data-grid-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 80, box.y + 53); // select row 0, first column (client_id)
  await expect(page.getByTestId("status-bar")).toContainText(/client_id.*required/i, { timeout: 3000 });
});

test("a validation problem surfaces a clickable badge that jumps to it", async ({ page }) => {
  await open(page);

  // Introduce a violation through the shared model (the grid edit path is covered
  // in grid.spec); this deterministically exercises the badge + jump UI.
  await page.evaluate(() => {
    const wb = (window as unknown as { __wb?: { setCell: (r: number, c: string, v: unknown) => void } }).__wb;
    wb?.setCell(0, "name", null); // name is required
  });

  const badge = page.getByRole("button", { name: /problem/ });
  await expect(badge).toBeVisible({ timeout: 3000 });
  await expect(badge).toHaveText(/1 problem/);
  await badge.click(); // jump-to-problem must not throw and keeps the grid up
  await expect(page.getByTestId("data-grid-canvas")).toBeVisible();
});
