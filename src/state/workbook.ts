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

  private notify(markDirty: boolean): void {
    if (markDirty) this.dirty = true;
    for (const fn of this.listeners) fn();
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
    const index = this.rows.length;
    this.history.push({
      kind: "addRow",
      apply: () => {
        const blank: Row = {};
        for (const c of this.dict.columns) blank[c.name] = null;
        this.rows = [...this.rows, blank];
        for (const c of this.dict.columns) this.revalidateCell(index, c.name, null);
      },
      invert: () => {
        this.rows = this.rows.slice(0, index);
        for (const c of this.dict.columns) this.cellViolations.delete(cellKey(index, c.name));
      },
    });
    this.notify(true);
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
