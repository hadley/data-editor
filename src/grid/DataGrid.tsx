// DataGrid.tsx — Glide Data Grid bound to the workbook.
// Numeric width/height (measured from the container — strings like "100%" break Glide's
// hit-testing/editing), resizable columns sized to their widest value, and a grey
// background below the data so short tables don't show empty rows.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DataEditor,
  type EditableGridCell,
  type EditListItem,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type Item,
  type Rectangle,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { type GridColumnDef } from "../schema/toColumns.ts";
import type { CellValue, Row, Violation } from "../schema/types.ts";
import { fromGridCell, toGridCell } from "./cellMapping.ts";
import { measureColumns } from "./columnWidth.ts";

export interface GridEdit {
  row: number;
  col: string;
  value: CellValue;
}

interface Props {
  columns: GridColumnDef[];
  rows: Row[];
  onEdit: (row: number, col: string, value: CellValue) => void;
  onEditCells?: (edits: GridEdit[]) => void;
  cellIssue?: (row: number, col: string) => Violation | null;
  onHover?: (message: string | null) => void;
  freezeColumns?: number;
}

const INVALID_BG = "#ffe5e5";
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 34;

export function DataGrid({
  columns,
  rows,
  onEdit,
  onEditCells,
  cellIssue,
  onHover,
  freezeColumns = 1,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Measure the container so the grid gets numeric dimensions.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Resizable column widths: seed from content, then let the user drag (issue: resizable + capped).
  const [widths, setWidths] = useState<Record<string, number>>({});
  const colKey = columns.map((c) => c.name).join("|");
  // Re-seed widths only when the column set changes, not on every edit
  // (so a user's manual resize survives edits). `rows` is read for initial sizing only.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  useEffect(() => {
    setWidths(measureColumns(columnsRef.current, rowsRef.current));
  }, [colKey]);

  const gridColumns: GridColumn[] = useMemo(
    () =>
      columns.map((c) => ({
        title: c.foreignKey ? `${c.title} → ${c.foreignKey.table}.${c.foreignKey.column}` : c.title,
        id: c.name,
        width: widths[c.name] ?? 160,
      })),
    [columns, widths],
  );

  const onColumnResize = useCallback((column: GridColumn, newSize: number) => {
    if (column.id) setWidths((w) => ({ ...w, [column.id as string]: newSize }));
  }, []);

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

  const getCellsForSelection = useCallback(
    (selection: Rectangle) => {
      const out: GridCell[][] = [];
      for (let r = selection.y; r < selection.y + selection.height; r++) {
        const rowCells: GridCell[] = [];
        for (let c = selection.x; c < selection.x + selection.width; c++) {
          rowCells.push(getCellContent([c, r]));
        }
        out.push(rowCells);
      }
      return out;
    },
    [getCellContent],
  );

  const onCellsEdited = useCallback(
    (newValues: readonly EditListItem[]) => {
      if (!onEditCells) return false;
      const edits: GridEdit[] = newValues.map(({ location, value }) => {
        const [colIdx, rowIdx] = location;
        const def = columns[colIdx];
        return { row: rowIdx, col: def.name, value: fromGridCell(def, value) };
      });
      onEditCells(edits);
      return true;
    },
    [columns, onEditCells],
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

  // Size the grid to its content, capped at the container — so short tables leave a
  // grey gap below instead of empty rows, and tall tables scroll inside the grid.
  const contentHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT + 2;
  const gridHeight = Math.max(HEADER_HEIGHT + ROW_HEIGHT, Math.min(contentHeight, size.height));

  return (
    <div ref={wrapperRef} style={{ width: "100%", height: "100%", background: "#f3f4f6" }}>
      {size.width > 0 && (
        <DataEditor
          columns={gridColumns}
          rows={rows.length}
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          onCellsEdited={onCellsEdited}
          onColumnResize={onColumnResize}
          getCellsForSelection={getCellsForSelection}
          onItemHovered={onItemHovered}
          fillHandle
          smoothScrollX
          smoothScrollY
          rowMarkers="number"
          freezeColumns={Math.min(freezeColumns, columns.length)}
          width={size.width}
          height={gridHeight}
        />
      )}
    </div>
  );
}
