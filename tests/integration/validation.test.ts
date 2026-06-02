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
});
