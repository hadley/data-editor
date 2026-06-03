// columnWidth.ts — pure column-width estimation so the grid sizes each column to its
// widest value (never wider) but stays within sane bounds. Unit-testable without a canvas.

import type { GridColumnDef } from "../schema/toColumns.ts";
import { enumLabel } from "../schema/toColumns.ts";
import type { CellValue, Row } from "../schema/types.ts";

const CHAR_PX = 8; // ~8px per character at the default grid font
const PADDING = 24; // cell horizontal padding
export const MIN_WIDTH = 48;
export const MAX_WIDTH = 400;

/** Render a value as the string the grid would display (mirrors cellMapping). */
export function displayString(def: GridColumnDef, value: CellValue): string {
  if (value == null) return "";
  if (def.kind === "enum" && typeof value === "string") return enumLabel(def, value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Width that fits the header (name on line 1, type on line 2) and the widest value. */
export function measureColumnWidth(def: GridColumnDef, rows: Row[], sample = 200): number {
  let valueLongest = 0;
  const n = Math.min(rows.length, sample);
  for (let i = 0; i < n; i++) {
    const len = displayString(def, rows[i]?.[def.name] ?? null).length;
    if (len > valueLongest) valueLongest = len;
  }
  // Type label is rendered ~0.85x; weight its chars a little lighter.
  const headerChars = Math.max(def.title.length, def.typeLabel.length * 0.85);
  const headerPx = headerChars * CHAR_PX + PADDING;
  const valuePx = valueLongest * CHAR_PX + PADDING;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.max(headerPx, valuePx)));
}

/** Initial widths for every column, keyed by column name. */
export function measureColumns(defs: GridColumnDef[], rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of defs) out[def.name] = measureColumnWidth(def, rows);
  return out;
}
