import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const DICT = fileURLToPath(new URL("../examples/foodbank.yaml", import.meta.url));
const PARQUET = fileURLToPath(new URL("../examples/foodbank.parquet", import.meta.url));

test("invalid row paints the row-number marker red", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("dict-input").setInputFiles(DICT);
  await page.getByTestId("parquet-input").setInputFiles(PARQUET);
  await expect(page.getByText("foodbank_visits")).toBeVisible({ timeout: 10_000 });

  // Sample the marker pixel for row 0 before and after introducing a violation.
  const sampleMarker = () =>
    page.evaluate(() => {
      const cs = Array.from(document.querySelectorAll("canvas")) as HTMLCanvasElement[];
      const c = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
      const ctx = c.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      // Sample the marker background near the left edge (away from the number glyph),
      // row 0 center ≈ header(36) + 17.
      const x = Math.round(6 * dpr);
      const y = Math.round((36 + 17) * dpr);
      const p = ctx.getImageData(x, y, 1, 1).data;
      return [p[0], p[1], p[2]];
    });

  // Marker starts white (no violation).
  await expect.poll(async () => (await sampleMarker())[1]).toBeGreaterThan(240);

  await page.evaluate(() => {
    const wb = (window as unknown as { __wb?: { setCell: (r: number, c: string, v: unknown) => void } }).__wb;
    wb?.setCell(0, "name", null); // required → row 0 invalid
  });

  // Marker turns red: high red, clearly reduced green/blue.
  await expect.poll(async () => (await sampleMarker())[1]).toBeLessThan(210);
  const after = await sampleMarker();
  expect(after[0]).toBeGreaterThan(220); // strong red channel
  expect(after[0]).toBeGreaterThan(after[1] + 40);
  expect(after[0]).toBeGreaterThan(after[2] + 40);
});
