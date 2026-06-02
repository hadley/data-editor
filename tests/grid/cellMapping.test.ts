import { GridCellKind, type EditableGridCell } from "@glideapps/glide-data-grid";
import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { toColumns } from "../../src/schema/toColumns.ts";
import { fromGridCell, toGridCell } from "../../src/grid/cellMapping.ts";

const defs = toColumns(
  parse(
    [
      "columns:",
      "  - {name: id, type: number, subtype: id}",
      "  - {name: ord, type: number, subtype: ordinal}",
      "  - {name: qty, type: number, subtype: quantity}",
      "  - {name: b, type: boolean}",
      "  - {name: dt, type: datetime}",
      "  - {name: e, type: enum, values: {A: Active, I: Inactive}}",
    ].join("\n"),
  ).columns,
);
const def = (name: string) => defs.find((d) => d.name === name)!;

describe("toGridCell", () => {
  it("shows enum labels but the cell stays keyed", () => {
    const cell = toGridCell(def("e"), "A");
    expect(cell.kind).toBe(GridCellKind.Text);
    if (cell.kind === GridCellKind.Text) {
      expect(cell.displayData).toBe("Active");
      expect(cell.data).toBe("A");
    }
  });

  it("renders datetime as an ISO string", () => {
    const cell = toGridCell(def("dt"), new Date("2024-03-01T12:00:00Z"));
    if (cell.kind === GridCellKind.Text) expect(cell.displayData).toBe("2024-03-01T12:00:00.000Z");
  });

  it("renders bigint ordinals without precision loss in displayData", () => {
    const cell = toGridCell(def("ord"), 9007199254740993n);
    if (cell.kind === GridCellKind.Number) expect(cell.displayData).toBe("9007199254740993");
  });

  it("renders null as empty", () => {
    const cell = toGridCell(def("qty"), null);
    if (cell.kind === GridCellKind.Number) expect(cell.data).toBeUndefined();
  });
});

describe("fromGridCell", () => {
  const numCell = (data: number | undefined): EditableGridCell => ({
    kind: GridCellKind.Number,
    data,
    displayData: String(data ?? ""),
    allowOverlay: true,
  });
  const textCell = (data: string): EditableGridCell => ({
    kind: GridCellKind.Text,
    data,
    displayData: data,
    allowOverlay: true,
  });

  it("stores ordinal edits as bigint", () => {
    expect(fromGridCell(def("ord"), numCell(42))).toBe(42n);
  });

  it("stores quantity edits as number", () => {
    expect(fromGridCell(def("qty"), numCell(3.5))).toBe(3.5);
  });

  it("parses datetime text into a Date", () => {
    const v = fromGridCell(def("dt"), textCell("2024-06-15T08:30:00Z"));
    expect(v).toBeInstanceOf(Date);
    expect((v as Date).toISOString()).toBe("2024-06-15T08:30:00.000Z");
  });

  it("maps empty text to null", () => {
    expect(fromGridCell(def("id"), textCell(""))).toBeNull();
  });
});
