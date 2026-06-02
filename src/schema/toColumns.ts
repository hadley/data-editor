// toColumns.ts — Column[] → framework-agnostic grid column defs + cell kinds. Pure.
// Consumed by grid/DataGrid.tsx (and cards/CardView.tsx). No Glide import here so the
// schema layer stays framework-free.

import type { Column, EnumValue } from "./types.ts";

export type CellKind = "text" | "number" | "boolean" | "date" | "datetime" | "enum";

export interface GridColumnDef {
  /** Column name (matches the dictionary + storage). */
  name: string;
  /** Header label. */
  title: string;
  kind: CellKind;
  /** For enum columns: the allowed options (label shown, value stored). */
  enumValues: EnumValue[] | null;
  /** Placeholder/hint for string columns, from `examples` (FR-008). */
  placeholder: string | null;
  /** True for ordinal numbers stored as Int64 (carrier: bigint) — preserves precision. */
  bigintStorage: boolean;
  /** Informational only in v1 (FR-013). */
  foreignKey: { table: string; column: string } | null;
}

export function toColumns(columns: Column[]): GridColumnDef[] {
  return columns.map((c) => ({
    name: c.name,
    title: c.name,
    kind: cellKindFor(c),
    enumValues: c.values,
    placeholder: c.examples && c.examples.length > 0 ? c.examples.join(", ") : null,
    bigintStorage: c.type === "number" && c.subtype === "ordinal",
    foreignKey: c.foreign_key,
  }));
}

function cellKindFor(c: Column): CellKind {
  switch (c.type) {
    case "number":
      // id is opaque text (no aggregation, FR-009); ordinal/quantity are numeric.
      return c.subtype === "id" ? "text" : "number";
    case "string":
      return "text";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "enum":
      return "enum";
  }
}

/** Look up an enum label for display; falls back to the raw value. */
export function enumLabel(def: GridColumnDef, value: string): string {
  const found = def.enumValues?.find((e) => e.value === value);
  return found ? found.label : value;
}
