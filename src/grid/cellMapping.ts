// cellMapping.ts — pure mapping between stored CellValues and Glide cells.
// No DataEditor/CSS import here, so it is unit-testable in a plain (non-DOM) env.

import { GridCellKind, type EditableGridCell, type GridCell } from "@glideapps/glide-data-grid";
import { enumLabel, type GridColumnDef } from "../schema/toColumns.ts";
import type { CellValue } from "../schema/types.ts";

/** Stored value → Glide cell. */
export function toGridCell(def: GridColumnDef, value: CellValue): GridCell {
  if (def.kind === "boolean") {
    return {
      kind: GridCellKind.Boolean,
      data: typeof value === "boolean" ? value : undefined,
      allowOverlay: false,
    };
  }
  if (def.kind === "number") {
    const num = value == null ? undefined : Number(value);
    return {
      kind: GridCellKind.Number,
      data: num,
      displayData: value == null ? "" : String(value),
      allowOverlay: true,
    };
  }
  return {
    kind: GridCellKind.Text,
    data: editableText(value),
    displayData: displayText(def, value),
    allowOverlay: true,
  };
}

/** Edited Glide cell → stored value. */
export function fromGridCell(def: GridColumnDef, cell: EditableGridCell): CellValue {
  if (cell.kind === GridCellKind.Boolean) {
    return typeof cell.data === "boolean" ? cell.data : null;
  }
  if (cell.kind === GridCellKind.Number) {
    if (cell.data == null || Number.isNaN(cell.data)) return null;
    return def.bigintStorage ? BigInt(Math.trunc(cell.data)) : cell.data;
  }
  if (cell.kind === GridCellKind.Text) {
    const s = cell.data.trim();
    if (s === "") return null;
    if (def.kind === "datetime") return new Date(s);
    return s; // date ISO string, enum key, text, id
  }
  return null;
}

function editableText(value: CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function displayText(def: GridColumnDef, value: CellValue): string {
  if (value == null) return "";
  if (def.kind === "enum" && typeof value === "string") return enumLabel(def, value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
