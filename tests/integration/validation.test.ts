// US3 integration: invalid values are flagged (not blocked), the count tracks them,
// and cross-row uniqueness is detected after recompute.

import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { Workbook } from "../../src/state/workbook.ts";
import type { Row } from "../../src/schema/types.ts";

const dict = parse(
  [
    "columns:",
    "  - {name: id, type: number, subtype: id, primary_key: true}",
    "  - {name: amount, type: number, subtype: quantity, range: {min: 0}}",
    "  - {name: status, type: enum, values: {A: Active, I: Inactive}}",
    "  - {name: note, type: string, required: true}",
  ].join("\n"),
);

const clean = (): Row[] => [
  { id: "1", amount: 10, status: "A", note: "ok" },
  { id: "2", amount: 5, status: "I", note: "fine" },
];

describe("US3 live validation", () => {
  it("starts clean for valid data", () => {
    const wb = new Workbook(dict, clean());
    expect(wb.violationCount()).toBe(0);
  });

  it("flags a bad enum but keeps the edit (flag, not block)", () => {
    const wb = new Workbook(dict, clean());
    wb.setCell(0, "status", "Z");
    expect(wb.rows[0].status).toBe("Z"); // edit accepted
    expect(wb.cellIssue(0, "status")?.rule).toBe("enum");
    expect(wb.violationCount()).toBe(1);
  });

  it("clears a violation when corrected", () => {
    const wb = new Workbook(dict, clean());
    wb.setCell(0, "note", null); // required → violation
    expect(wb.violationCount()).toBe(1);
    wb.setCell(0, "note", "filled");
    expect(wb.violationCount()).toBe(0);
  });

  it("flags an out-of-range number", () => {
    const wb = new Workbook(dict, clean());
    wb.setCell(1, "amount", -5);
    expect(wb.cellIssue(1, "amount")?.rule).toBe("range");
  });

  it("flags a freshly added row's required cells", () => {
    const wb = new Workbook(dict, clean());
    wb.addRow();
    // new row: id (pk→required) and note (required) are null → 2 violations
    expect(wb.cellIssue(2, "note")?.rule).toBe("required");
    expect(wb.violationCount()).toBeGreaterThanOrEqual(2);
  });

  it("detects duplicate primary keys after table recompute", () => {
    const wb = new Workbook(dict, clean());
    wb.setCell(1, "id", "1"); // now two rows share id "1"
    wb.recomputeTable();
    expect(wb.cellIssue(0, "id")?.rule).toBe("primary_key");
    expect(wb.cellIssue(1, "id")?.rule).toBe("primary_key");
  });

  it("reports invalid rows and the first violating cell (FR-036/FR-037)", () => {
    const wb = new Workbook(dict, clean());
    expect(wb.rowHasIssue(1)).toBe(false);
    wb.setCell(1, "status", "Z"); // invalid enum on row 1
    wb.setCell(0, "amount", -5); // invalid range on row 0
    expect(wb.rowHasIssue(0)).toBe(true);
    expect(wb.rowHasIssue(1)).toBe(true);
    // earliest by row order → row 0, column `amount`
    expect(wb.firstViolationCell()).toEqual({ row: 0, col: "amount" });
  });

  it("clears the invalid-row flag once the row is fixed", () => {
    const wb = new Workbook(dict, clean());
    wb.setCell(0, "note", null);
    expect(wb.rowHasIssue(0)).toBe(true);
    wb.setCell(0, "note", "ok");
    expect(wb.rowHasIssue(0)).toBe(false);
    expect(wb.firstViolationCell()).toBeNull();
  });

  it("inserts a row in the middle and re-indexes violations correctly", () => {
    const wb = new Workbook(dict, clean()); // rows: [id 1, id 2]
    wb.setCell(1, "status", "Z"); // row 1 invalid
    expect(wb.rowHasIssue(1)).toBe(true);
    wb.insertRow(1); // blank row now at index 1; old row 1 shifts to index 2
    expect(wb.rows.length).toBe(3);
    expect(wb.rowHasIssue(2)).toBe(true); // the invalid row followed the shift
    expect(wb.rowHasIssue(1)).toBe(true); // the new blank row is invalid (required note/id)
    wb.undo();
    expect(wb.rows.length).toBe(2);
    expect(wb.rowHasIssue(1)).toBe(true); // back to original indexing
  });

  it("deletes a row and clears its violations; undo restores it", () => {
    const wb = new Workbook(dict, clean());
    wb.setCell(0, "note", null); // row 0 invalid
    expect(wb.violationCount()).toBe(1);
    wb.deleteRow(0);
    expect(wb.rows.length).toBe(1);
    expect(wb.violationCount()).toBe(0); // the invalid row is gone
    wb.undo();
    expect(wb.rows.length).toBe(2);
    expect(wb.rowHasIssue(0)).toBe(true); // restored with its violation
  });
});
