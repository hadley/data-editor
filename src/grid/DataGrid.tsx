// DataGrid.tsx — Glide Data Grid bound to the workbook (US1).
// Cell kinds derive from toColumns. Date/datetime/enum render as text in v1
// (full date pickers / dropdowns require the glide-data-grid-cells addon — later).

import { useCallback, useMemo } from "react";
import {
  DataEditor,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type Item,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { type GridColumnDef } from "../schema/toColumns.ts";
import type { CellValue, Row } from "../schema/types.ts";
import { fromGridCell, toGridCell } from "./cellMapping.ts";

interface Props {
  columns: GridColumnDef[];
  rows: Row[];
  onEdit: (row: number, col: string, value: CellValue) => void;
  /** Freeze the header (always) plus this many leading key columns. */
  freezeColumns?: number;
}

export function DataGrid({ columns, rows, onEdit, freezeColumns = 1 }: Props) {
  const gridColumns: GridColumn[] = useMemo(
    () => columns.map((c) => ({ title: c.title, id: c.name, width: 160 })),
    [columns],
  );

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [colIdx, rowIdx] = cell;
      const def = columns[colIdx];
      const value = rows[rowIdx]?.[def.name] ?? null;
      return toGridCell(def, value);
    },
    [columns, rows],
  );

  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      const [colIdx, rowIdx] = cell;
      const def = columns[colIdx];
      onEdit(rowIdx, def.name, fromGridCell(def, newValue));
    },
    [columns, onEdit],
  );

  return (
    <DataEditor
      columns={gridColumns}
      rows={rows.length}
      getCellContent={getCellContent}
      onCellEdited={onCellEdited}
      rowMarkers="number"
      freezeColumns={Math.min(freezeColumns, columns.length)}
      width="100%"
      height="100%"
    />
  );
}
