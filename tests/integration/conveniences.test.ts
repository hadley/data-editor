// US4 integration: batch edits (paste / fill-down) and undo/redo at the workbook level.
// (Glide canvas interactions are wired in DataGrid but not exercised here.)

import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { Workbook } from "../../src/state/workbook.ts";
import type { Row } from "../../src/schema/types.ts";

const dict = parse(
  [
    "columns:",
    "  - {name: a, type: string}",
    "  - {name: b, type: number, subtype: quantity}",
  ].join("\n"),
);

const seed = (): Row[] => [
  { a: "x", b: 1 },
  { a: "y", b: 2 },
  { a: "z", b: 3 },
];

describe("US4 conveniences (logic)", () => {
  it("applies a batch (paste) as a single undoable unit", () => {
    const wb = new Workbook(dict, seed());
    wb.setCells([
      { row: 0, col: "a", value: "P" },
      { row: 1, col: "a", value: "Q" },
    ]);
    expect(wb.rows[0].a).toBe("P");
    expect(wb.rows[1].a).toBe("Q");

    wb.undo(); // one undo reverts the whole batch
    expect(wb.rows[0].a).toBe("x");
    expect(wb.rows[1].a).toBe("y");

    wb.redo();
    expect(wb.rows[0].a).toBe("P");
    expect(wb.rows[1].a).toBe("Q");
  });

  it("fill-down (modeled as a batch) sets a value across a selection", () => {
    const wb = new Workbook(dict, seed());
    wb.setCells([
      { row: 0, col: "b", value: 9 },
      { row: 1, col: "b", value: 9 },
      { row: 2, col: "b", value: 9 },
    ]);
    expect(wb.rows.map((r) => r.b)).toEqual([9, 9, 9]);
  });

  it("undoes and redoes single edits in order", () => {
    const wb = new Workbook(dict, seed());
    wb.setCell(0, "a", "1");
    wb.setCell(0, "a", "2");
    expect(wb.rows[0].a).toBe("2");
    wb.undo();
    expect(wb.rows[0].a).toBe("1");
    wb.undo();
    expect(wb.rows[0].a).toBe("x");
    expect(wb.canUndo()).toBe(false);
    wb.redo();
    expect(wb.rows[0].a).toBe("1");
  });

  it("undoes an added row", () => {
    const wb = new Workbook(dict, seed());
    wb.addRow();
    expect(wb.rows.length).toBe(4);
    wb.undo();
    expect(wb.rows.length).toBe(3);
  });
});
