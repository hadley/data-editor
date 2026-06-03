// workbook.ts — the shared, framework-agnostic editing model both the grid and the
// card view bind to (FR-029). Holds rows, dirty state, and validation (FR-015-FR-018).

import { toArrow } from "../schema/toArrow.ts";
import { toValidators, type Validators } from "../schema/toValidators.ts";
import { cellKey, computeCellViolations, indexTableViolations } from "../grid/cellValidation.ts";
import { CommandStack } from "../grid/history.ts";
import type { ArrowSchema, CellValue, DataDict, Row, Violation } from "../schema/types.ts";

export interface CellEdit {
  row: number;
  col: string;
  value: CellValue;
}

export class Workbook {
  readonly dict: DataDict;
  /** Derived from the dictionary via toArrow — guarantees schema/UI/storage consistency. */
  readonly schema: ArrowSchema;
  rows: Row[];
  dirty = false;

  private readonly validators: Validators;
  /** Per-cell violations, keyed by `${row}:${col}` (immediate). */
  private cellViolations: Map<string, Violation>;
  /** Cross-row (unique/pk) violations — recomputed debounced (R8). */
  private tableViolations: Violation[];
  private tableIndex: Map<string, Violation>;
  private readonly history = new CommandStack();

  private listeners = new Set<() => void>();

  constructor(dict: DataDict, rows: Row[]) {
    this.dict = dict;
    this.schema = toArrow(dict.columns);
    this.rows = rows;
    this.validators = toValidators(dict.columns);
    this.cellViolations = computeCellViolations(dict, rows, this.validators);
    this.tableViolations = this.validators.validateTable(rows);
    this.tableIndex = indexTableViolations(this.tableViolations);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private invalidRowsCache: Set<number> | null = null;

  private notify(markDirty: boolean): void {
    if (markDirty) this.dirty = true;
    this.invalidRowsCache = null; // violations may have changed
    for (const fn of this.listeners) fn();
  }

  /** True if any cell in this row has a violation (cached per change). */
  rowHasIssue(row: number): boolean {
    if (!this.invalidRowsCache) {
      const s = new Set<number>();
      for (const v of this.cellViolations.values()) if ("row" in v.cell) s.add(v.cell.row);
      for (const v of this.tableViolations) if ("row" in v.cell) s.add(v.cell.row);
      this.invalidRowsCache = s;
    }
    return this.invalidRowsCache.has(row);
  }

  /** The earliest violating cell (by row, then column order), for jump-to-problem (FR-036). */
  firstViolationCell(): { row: number; col: string } | null {
    const order = new Map(this.dict.columns.map((c, i) => [c.name, i]));
    let best: { row: number; col: string } | null = null;
    const consider = (cell: { row: number; col: string } | { col: string }) => {
      if (!("row" in cell)) return;
      if (
        !best ||
        cell.row < best.row ||
        (cell.row === best.row && (order.get(cell.col) ?? 0) < (order.get(best.col) ?? 0))
      ) {
        best = { row: cell.row, col: cell.col };
      }
    };
    for (const v of this.cellViolations.values()) consider(v.cell);
    for (const v of this.tableViolations) consider(v.cell);
    return best;
  }

  /** Edit a single cell; revalidates that cell immediately (per-cell rules). Undoable. */
  setCell(row: number, col: string, value: CellValue): void {
    if (row < 0 || row >= this.rows.length) return;
    const prev = this.rows[row]?.[col] ?? null;
    this.history.push({
      kind: "setCell",
      apply: () => this.applyCellValue(row, col, value),
      invert: () => this.applyCellValue(row, col, prev),
    });
    this.notify(true);
  }

  /** Apply many edits as one undoable unit (paste / fill-down). */
  setCells(edits: CellEdit[]): void {
    const valid = edits.filter((e) => e.row >= 0 && e.row < this.rows.length);
    if (valid.length === 0) return;
    const prev = valid.map((e) => ({ ...e, value: this.rows[e.row]?.[e.col] ?? null }));
    this.history.push({
      kind: "paste",
      apply: () => valid.forEach((e) => this.applyCellValue(e.row, e.col, e.value)),
      invert: () => prev.forEach((e) => this.applyCellValue(e.row, e.col, e.value)),
    });
    this.notify(true);
  }

  addRow(): void {
    this.insertRow(this.rows.length);
  }

  /** Insert a blank row at `index` (0..length). Undoable. */
  insertRow(index: number): void {
    const at = Math.max(0, Math.min(index, this.rows.length));
    this.history.push({
      kind: "insertRow",
      apply: () => {
        this.rows = [...this.rows.slice(0, at), this.blankRow(), ...this.rows.slice(at)];
        this.rebuildValidation(); // row indices shifted
      },
      invert: () => {
        this.rows = [...this.rows.slice(0, at), ...this.rows.slice(at + 1)];
        this.rebuildValidation();
      },
    });
    this.notify(true);
  }

  /** Delete the row at `index`. Undoable. */
  deleteRow(index: number): void {
    if (index < 0 || index >= this.rows.length) return;
    const removed = this.rows[index];
    this.history.push({
      kind: "deleteRow",
      apply: () => {
        this.rows = [...this.rows.slice(0, index), ...this.rows.slice(index + 1)];
        this.rebuildValidation();
      },
      invert: () => {
        this.rows = [...this.rows.slice(0, index), removed, ...this.rows.slice(index)];
        this.rebuildValidation();
      },
    });
    this.notify(true);
  }

  private blankRow(): Row {
    const blank: Row = {};
    for (const c of this.dict.columns) blank[c.name] = null;
    return blank;
  }

  /** Recompute all validations from scratch — used after structural row changes. */
  private rebuildValidation(): void {
    this.cellViolations = computeCellViolations(this.dict, this.rows, this.validators);
    this.tableViolations = this.validators.validateTable(this.rows);
    this.tableIndex = indexTableViolations(this.tableViolations);
  }

  undo(): void {
    if (this.history.undo()) this.notify(true);
  }

  redo(): void {
    if (this.history.redo()) this.notify(true);
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  private applyCellValue(row: number, col: string, value: CellValue): void {
    this.rows = this.rows.map((r, i) => (i === row ? { ...r, [col]: value } : r));
    this.revalidateCell(row, col, value);
  }

  private revalidateCell(row: number, col: string, value: CellValue): void {
    const issue = this.validators.validateCell(col, value ?? null);
    const k = cellKey(row, col);
    if (issue) this.cellViolations.set(k, { cell: { row, col }, rule: issue.rule, message: issue.message });
    else this.cellViolations.delete(k);
  }

  /** Recompute cross-row rules. The UI calls this debounced after edits settle. */
  recomputeTable(): void {
    this.tableViolations = this.validators.validateTable(this.rows);
    this.tableIndex = indexTableViolations(this.tableViolations);
    this.notify(false);
  }

  /** Total outstanding violations (FR-018). */
  violationCount(): number {
    return this.cellViolations.size + this.tableViolations.length;
  }

  /** The violation for a cell, if any (per-cell takes priority over table). */
  cellIssue(row: number, col: string): Violation | null {
    const k = cellKey(row, col);
    return this.cellViolations.get(k) ?? this.tableIndex.get(k) ?? null;
  }

  markSaved(): void {
    this.dirty = false;
    this.notify(false);
  }
}
