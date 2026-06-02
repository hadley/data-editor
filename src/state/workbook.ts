// workbook.ts — the shared, framework-agnostic editing model both the grid and the
// card view bind to (FR-029). Holds rows, dirty state, and (later) validation + history.

import { toArrow } from "../schema/toArrow.ts";
import type { ArrowSchema, CellValue, DataDict, Row } from "../schema/types.ts";

export class Workbook {
  readonly dict: DataDict;
  /** Derived from the dictionary via toArrow — guarantees schema/UI/storage consistency. */
  readonly schema: ArrowSchema;
  rows: Row[];
  dirty = false;

  private listeners = new Set<() => void>();

  constructor(dict: DataDict, rows: Row[]) {
    this.dict = dict;
    this.schema = toArrow(dict.columns);
    this.rows = rows;
  }

  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(markDirty: boolean): void {
    if (markDirty) this.dirty = true;
    for (const fn of this.listeners) fn();
  }

  /** Edit a single cell (immutably replaces the row). */
  setCell(row: number, col: string, value: CellValue): void {
    if (row < 0 || row >= this.rows.length) return;
    this.rows = this.rows.map((r, i) => (i === row ? { ...r, [col]: value } : r));
    this.notify(true);
  }

  /** Append an empty row (all columns null). */
  addRow(): void {
    const blank: Row = {};
    for (const c of this.dict.columns) blank[c.name] = null;
    this.rows = [...this.rows, blank];
    this.notify(true);
  }

  /** Mark the workbook clean after a successful save. */
  markSaved(): void {
    this.dirty = false;
    this.notify(false);
  }
}
