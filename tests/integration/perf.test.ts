// T055 — data-layer performance sanity at the ~10k-row target (SC-006).
// Covers build + full validation + round-trip. Grid scroll/render perf is Glide's
// virtualization (verified interactively, not here).

import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { writeParquet } from "../../src/io/writeParquet.ts";
import { readParquet } from "../../src/io/readParquet.ts";
import { Workbook } from "../../src/state/workbook.ts";
import type { Row } from "../../src/schema/types.ts";

const dict = parse(
  [
    "columns:",
    "  - {name: id, type: number, subtype: id, primary_key: true}",
    "  - {name: n, type: number, subtype: ordinal, range: {min: 0, max: 100000}}",
    "  - {name: q, type: number, subtype: quantity}",
    "  - {name: s, type: string, required: true}",
    "  - {name: e, type: enum, values: [a, b, c]}",
  ].join("\n"),
);

const N = 10_000;
function makeRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < N; i++) {
    rows.push({ id: `ID-${i}`, n: BigInt(i % 1000), q: i * 1.5, s: `row ${i}`, e: ["a", "b", "c"][i % 3] });
  }
  return rows;
}

describe("performance at ~10k rows", () => {
  it("builds a workbook with full validation quickly", () => {
    const start = performance.now();
    const wb = new Workbook(dict, makeRows());
    const ms = performance.now() - start;
    expect(wb.rows.length).toBe(N);
    expect(wb.violationCount()).toBe(0);
    expect(ms).toBeLessThan(2000); // generous CI headroom
  });

  it("recomputes cross-row validation quickly", () => {
    const wb = new Workbook(dict, makeRows());
    const start = performance.now();
    wb.recomputeTable();
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(1000);
  });

  it("round-trips 10k rows through Parquet", async () => {
    const rows = makeRows();
    const start = performance.now();
    const bytes = writeParquet(rows, new Workbook(dict, rows).schema);
    const { rows: read } = await readParquet(bytes);
    const ms = performance.now() - start;
    expect(read).toHaveLength(N);
    expect(read[9999].id).toBe("ID-9999");
    expect(ms).toBeLessThan(3000);
  });
});
