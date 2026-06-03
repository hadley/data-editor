import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { toColumns, enumLabel } from "../../src/schema/toColumns.ts";

describe("toColumns", () => {
  it("assigns a cell kind per dictionary type", () => {
    const cols = toColumns(
      parse(
        [
          "columns:",
          "  - {name: id, type: number, subtype: id}",
          "  - {name: ord, type: number, subtype: ordinal}",
          "  - {name: s, type: string}",
          "  - {name: b, type: boolean}",
          "  - {name: d, type: date}",
          "  - {name: dt, type: datetime}",
          "  - {name: e, type: enum, values: [a, b]}",
        ].join("\n"),
      ).columns,
    );
    expect(Object.fromEntries(cols.map((c) => [c.name, c.kind]))).toEqual({
      id: "text", // id is opaque text (FR-009)
      ord: "text", // integers render as exact text, not a float control (FR-031)
      s: "text",
      b: "boolean",
      d: "date",
      dt: "datetime",
      e: "enum",
    });
  });

  it("labels each column with its dictionary type (FR-030)", () => {
    const cols = toColumns(
      parse(
        [
          "columns:",
          "  - {name: id, type: number, subtype: id}",
          "  - {name: ord, type: number, subtype: ordinal}",
          "  - {name: qty, type: number, subtype: quantity}",
          "  - {name: e, type: enum, values: [a]}",
        ].join("\n"),
      ).columns,
    );
    expect(Object.fromEntries(cols.map((c) => [c.name, c.typeLabel]))).toEqual({
      id: "id",
      ord: "integer",
      qty: "number",
      e: "enum",
    });
  });

  it("exposes enum options and resolves labels for display", () => {
    const [col] = toColumns(
      parse(`columns:\n  - {name: status, type: enum, values: {A: Active, I: Inactive}}`).columns,
    );
    expect(col.enumValues).toEqual([
      { value: "A", label: "Active" },
      { value: "I", label: "Inactive" },
    ]);
    expect(enumLabel(col, "A")).toBe("Active");
    expect(enumLabel(col, "X")).toBe("X"); // fallback
  });

  it("surfaces examples as a placeholder hint (FR-008)", () => {
    const [col] = toColumns(
      parse(`columns:\n  - {name: name, type: string, examples: [Jane Doe, John Smith]}`).columns,
    );
    expect(col.placeholder).toBe("Jane Doe, John Smith");
  });
});
