import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { toColumns } from "../../src/schema/toColumns.ts";
import { MAX_WIDTH, MIN_WIDTH, displayString, measureColumnWidth } from "../../src/grid/columnWidth.ts";
import type { Row } from "../../src/schema/types.ts";

const cols = toColumns(
  parse(
    [
      "columns:",
      "  - {name: short, type: string}",
      "  - {name: e, type: enum, values: {A: A Very Long Active Label, I: Inactive}}",
    ].join("\n"),
  ).columns,
);
const col = (n: string) => cols.find((c) => c.name === n)!;

describe("measureColumnWidth", () => {
  it("fits the widest value but is never below the minimum", () => {
    const rows: Row[] = [{ short: "x" }, { short: "yy" }];
    const w = measureColumnWidth(col("short"), rows);
    expect(w).toBeGreaterThanOrEqual(MIN_WIDTH);
    // header "short" (5 chars) dominates here
    expect(w).toBeLessThan(MAX_WIDTH);
  });

  it("grows with longer content but never exceeds the max cap", () => {
    const narrow = measureColumnWidth(col("short"), [{ short: "ab" }]);
    const wide = measureColumnWidth(col("short"), [{ short: "a".repeat(200) }]);
    expect(wide).toBeGreaterThan(narrow);
    expect(wide).toBe(MAX_WIDTH);
  });

  it("measures enum columns by their displayed label, not the key", () => {
    const w = measureColumnWidth(col("e"), [{ e: "A" }]);
    // label "A Very Long Active Label" (24) is wider than the header "e"
    expect(w).toBeGreaterThan(measureColumnWidth(col("e"), []));
  });

  it("displayString shows enum labels and ISO dates", () => {
    expect(displayString(col("e"), "A")).toBe("A Very Long Active Label");
    expect(displayString(col("short"), null)).toBe("");
  });
});
