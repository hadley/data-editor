import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const DICT = fileURLToPath(new URL("../examples/foodbank.yaml", import.meta.url));
const PARQUET = fileURLToPath(new URL("../examples/foodbank.parquet", import.meta.url));

async function openFixture(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("dict-input").setInputFiles(DICT);
  await page.getByTestId("parquet-input").setInputFiles(PARQUET);
  // The file-name tab confirms a successful load + reconciliation.
  await expect(page.getByText("foodbank_visits")).toBeVisible({ timeout: 10_000 });
}

test("loads a matching pair and shows the grid", async ({ page }) => {
  await openFixture(page);
  // Glide renders the grid to a canvas.
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("a cell accepts typed input (edit registers and marks dirty)", async ({ page }) => {
  await openFixture(page);

  const save = page.getByRole("button", { name: /^Save/ });
  await expect(save).toHaveText(/^Save$/); // clean

  // Open the overlay editor (Glide renders it as a real DOM textarea) and edit.
  const canvas = page.getByTestId("data-grid-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.dblclick(box.x + 200, box.y + 53); // a text cell in the first row
  const editor = page.locator("textarea.gdg-input");
  await expect(editor).toBeVisible({ timeout: 3000 });
  await editor.fill("EditedValue");
  await page.keyboard.press("Enter");

  // The edit reaches the workbook and the Save button shows the dirty indicator.
  await expect(save).toHaveText(/Save ●/, { timeout: 5000 });
  const changed = await page.evaluate(() => {
    const wb = (window as unknown as { __wb?: { rows: Record<string, unknown>[] } }).__wb;
    return wb?.rows[0].name;
  });
  expect(changed).toBe("EditedValue");
});

test("the toolbar stays fixed while the data area scrolls", async ({ page }) => {
  await openFixture(page);
  const toolbar = page.locator("header");
  const before = await toolbar.boundingBox();
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, 500);
  const after = await toolbar.boundingBox();
  expect(after?.y).toBe(before?.y); // toolbar did not move
});
