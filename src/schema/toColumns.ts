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
  /** Short human label for the dictionary type, shown in the header/card (FR-030). */
  typeLabel: string;
  /** Full one-line description for the header hover (type + constraints + range). */
  detail: string;
  kind: CellKind;
  /** For enum columns: the allowed options (label shown, value stored). */
  enumValues: EnumValue[] | null;
  /** Placeholder/hint for string columns, from `examples` (FR-008). */
  placeholder: string | null;
  /** True for integer (ordinal) columns stored as Int64 (carrier: bigint). */
  bigintStorage: boolean;
  /** Informational only in v1 (FR-013). */
  foreignKey: { table: string; column: string } | null;
}

export function toColumns(columns: Column[]): GridColumnDef[] {
  return columns.map((c) => ({
    name: c.name,
    title: c.name,
    typeLabel: typeLabelFor(c),
    detail: detailFor(c),
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
      // id and ordinal render as exact text (no float coercion, FR-009/FR-031);
      // quantity is a floating-point numeric cell.
      return c.subtype === "quantity" ? "number" : "text";
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

function typeLabelFor(c: Column): string {
  switch (c.type) {
    case "number":
      if (c.subtype === "id") return "id";
      if (c.subtype === "ordinal") return "integer";
      return "number";
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

function detailFor(c: Column): string {
  const parts: string[] = [typeLabelFor(c)];
  if (c.primary_key) parts.push("primary key");
  else {
    if (c.required) parts.push("required");
    if (c.unique) parts.push("unique");
  }
  if (c.range) {
    const { min, max } = c.range;
    if (min !== undefined && max !== undefined) parts.push(`${min}–${max}`);
    else if (min !== undefined) parts.push(`≥ ${min}`);
    else if (max !== undefined) parts.push(`≤ ${max}`);
  }
  if (c.type === "enum" && c.values) parts.push(`one of: ${c.values.map((v) => v.label).join(", ")}`);
  if (c.foreign_key) parts.push(`→ ${c.foreign_key.table}.${c.foreign_key.column}`);
  return `${c.name} · ${parts.join(" · ")}`;
}

/** Look up an enum label for display; falls back to the raw value. */
export function enumLabel(def: GridColumnDef, value: string): string {
  const found = def.enumValues?.find((e) => e.value === value);
  return found ? found.label : value;
}
