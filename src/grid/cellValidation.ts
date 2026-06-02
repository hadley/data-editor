// cellValidation.ts — bind validators to the data, producing a per-cell violation map
// the grid and card view can look up (FR-016, FR-017).

import type { DataDict, Row, Violation } from "../schema/types.ts";
import type { Validators } from "../schema/toValidators.ts";

export function cellKey(row: number, col: string): string {
  return `${row}:${col}`;
}

/** Validate every cell in every row (per-cell rules only). */
export function computeCellViolations(
  dict: DataDict,
  rows: Row[],
  validators: Validators,
): Map<string, Violation> {
  const map = new Map<string, Violation>();
  rows.forEach((row, i) => {
    for (const c of dict.columns) {
      const issue = validators.validateCell(c.name, row[c.name] ?? null);
      if (issue) {
        map.set(cellKey(i, c.name), { cell: { row: i, col: c.name }, rule: issue.rule, message: issue.message });
      }
    }
  });
  return map;
}

/** Index table-level violations (which carry a CellRef) by cell for quick lookup. */
export function indexTableViolations(violations: Violation[]): Map<string, Violation> {
  const map = new Map<string, Violation>();
  for (const v of violations) {
    if ("row" in v.cell) map.set(cellKey(v.cell.row, v.cell.col), v);
  }
  return map;
}
