// DataGrid.tsx — Glide Data Grid bound to the workbook (US1).
// Cell kinds derive from toColumns. Date/datetime/enum render as text in v1
// (full date pickers / dropdowns require the glide-data-grid-cells addon — later).

import { useCallback, useMemo } from "react";
import {
  DataEditor,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type Item,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { type GridColumnDef } from "../schema/toColumns.ts";
import type { CellValue, Row, Violation } from "../schema/types.ts";
import { fromGridCell, toGridCell } from "./cellMapping.ts";

interface Props {
  columns: GridColumnDef[];
  rows: Row[];
  onEdit: (row: number, col: string, value: CellValue) => void;
  /** Look up a validation issue for a cell (US3); invalid cells are highlighted. */
  cellIssue?: (row: number, col: string) => Violation | null;
  /** Notified with a cell's validation message on hover (FR-017). */
  onHover?: (message: string | null) => void;
  /** Freeze the header (always) plus this many leading key columns. */
  freezeColumns?: number;
}

const INVALID_BG = "#ffe5e5";

export function DataGrid({ columns, rows, onEdit, cellIssue, onHover, freezeColumns = 1 }: Props) {
  const gridColumns: GridColumn[] = useMemo(
    () => columns.map((c) => ({ title: c.title, id: c.name, width: 160 })),
    [columns],
  );

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [colIdx, rowIdx] = cell;
      const def = columns[colIdx];
      const value = rows[rowIdx]?.[def.name] ?? null;
      const base = toGridCell(def, value);
      if (cellIssue?.(rowIdx, def.name)) {
        return { ...base, themeOverride: { bgCell: INVALID_BG } };
      }
      return base;
    },
    [columns, rows, cellIssue],
  );

  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      const [colIdx, rowIdx] = cell;
      const def = columns[colIdx];
      onEdit(rowIdx, def.name, fromGridCell(def, newValue));
    },
    [columns, onEdit],
  );

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (!onHover) return;
      if (args.kind !== "cell") {
        onHover(null);
        return;
      }
      const [colIdx, rowIdx] = args.location;
      const def = columns[colIdx];
      const issue = def ? cellIssue?.(rowIdx, def.name) : null;
      onHover(issue ? issue.message : null);
    },
    [columns, cellIssue, onHover],
  );

  return (
    <DataEditor
      columns={gridColumns}
      rows={rows.length}
      getCellContent={getCellContent}
      onCellEdited={onCellEdited}
      onItemHovered={onItemHovered}
      rowMarkers="number"
      freezeColumns={Math.min(freezeColumns, columns.length)}
      width="100%"
      height="100%"
    />
  );
}
