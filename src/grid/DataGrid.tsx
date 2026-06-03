// DataGrid.tsx — Glide Data Grid bound to the workbook.
// Numeric width/height (measured from the container), resizable columns sized to their
// widest value, type icons in headers, enum dropdown cells, tab-to-append rows, red
// markers on invalid rows, and an imperative focusCell() for jump-to-problem.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CompactSelection,
  DataEditor,
  GridColumnIcon,
  type DataEditorRef,
  type EditableGridCell,
  type EditListItem,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type GridSelection,
  type Item,
  type Rectangle,
  type Theme,
} from "@glideapps/glide-data-grid";
import { allCells } from "@glideapps/glide-data-grid-cells";
import "@glideapps/glide-data-grid/dist/index.css";
import { type CellKind, type GridColumnDef } from "../schema/toColumns.ts";
import type { CellValue, Row, Violation } from "../schema/types.ts";
import { fromGridCell, toGridCell } from "./cellMapping.ts";
import { measureColumns } from "./columnWidth.ts";

export interface GridEdit {
  row: number;
  col: string;
  value: CellValue;
}

export interface DataGridHandle {
  /** Select and scroll to a cell (jump-to-problem, FR-036). */
  focusCell: (row: number, col: string) => void;
}

interface Props {
  columns: GridColumnDef[];
  rows: Row[];
  onEdit: (row: number, col: string, value: CellValue) => void;
  onEditCells?: (edits: GridEdit[]) => void;
  onAppendRow?: () => void;
  cellIssue?: (row: number, col: string) => Violation | null;
  rowHasIssue?: (row: number) => boolean;
  onHover?: (message: string | null) => void;
  freezeColumns?: number;
}

const INVALID_BG = "#ffe5e5";
const INVALID_ROW_HEADER = "#fecaca";
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 34;
const ICON_PX = 30;

function iconFor(kind: CellKind, typeLabel: string): GridColumnIcon {
  switch (kind) {
    case "number":
      return GridColumnIcon.HeaderNumber;
    case "boolean":
      return GridColumnIcon.HeaderBoolean;
    case "date":
      return GridColumnIcon.HeaderDate;
    case "datetime":
      return GridColumnIcon.HeaderTime;
    case "enum":
      return GridColumnIcon.HeaderLookup;
    default:
      return typeLabel === "id" ? GridColumnIcon.HeaderRowID : GridColumnIcon.HeaderString;
  }
}

export const DataGrid = forwardRef<DataGridHandle, Props>(function DataGrid(
  { columns, rows, onEdit, onEditCells, onAppendRow, cellIssue, rowHasIssue, onHover, freezeColumns = 1 },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<DataEditorRef>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [gridSelection, setGridSelectionState] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  // Mirror selection in a ref: React state lags during rapid key presses, but the
  // keyboard handler needs the *current* cell synchronously.
  const selectionRef = useRef(gridSelection);
  const setGridSelection = useCallback((s: GridSelection) => {
    selectionRef.current = s;
    setGridSelectionState(s);
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [widths, setWidths] = useState<Record<string, number>>({});
  const colKey = columns.map((c) => c.name).join("|");
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  useEffect(() => {
    setWidths(measureColumns(columnsRef.current, rowsRef.current, ICON_PX));
  }, [colKey]);

  // Test hook: expose the currently selected cell.
  useEffect(() => {
    (window as unknown as { __gridSel?: readonly [number, number] | null }).__gridSel =
      gridSelection.current?.cell ?? null;
  }, [gridSelection]);

  useImperativeHandle(ref, () => ({
    focusCell: (row: number, col: string) => {
      const colIdx = columnsRef.current.findIndex((c) => c.name === col);
      if (colIdx < 0) return;
      setGridSelection({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: { cell: [colIdx, row], range: { x: colIdx, y: row, width: 1, height: 1 }, rangeStack: [] },
      });
      editorRef.current?.scrollTo(colIdx, row);
      editorRef.current?.focus();
    },
  }));

  const gridColumns: GridColumn[] = useMemo(
    () =>
      columns.map((c) => ({
        title: c.foreignKey ? `${c.title} → ${c.foreignKey.table}.${c.foreignKey.column}` : c.title,
        id: c.name,
        width: widths[c.name] ?? 160,
        icon: iconFor(c.kind, c.typeLabel),
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
        return { ...base, themeOverride: { bgCell: INVALID_BG } } as GridCell;
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
    (sel: Rectangle) => {
      const out: GridCell[][] = [];
      for (let r = sel.y; r < sel.y + sel.height; r++) {
        const rowCells: GridCell[] = [];
        for (let c = sel.x; c < sel.x + sel.width; c++) rowCells.push(getCellContent([c, r]));
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

  const selectCell = useCallback((col: number, row: number) => {
    setGridSelection({
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: { cell: [col, row], range: { x: col, y: row, width: 1, height: 1 }, rangeStack: [] },
    });
    editorRef.current?.scrollTo(col, row);
  }, []);

  // Tab off the end of a row wraps to the first column of the next row; off the end of
  // the LAST row appends a new row and moves into it (FR-033). Handled in the capture
  // phase so we intercept before Glide's own Tab navigation.
  const onWrapperKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || e.shiftKey) return;
      const cur = selectionRef.current.current?.cell;
      if (!cur) return;
      const lastCol = columnsRef.current.length - 1;
      if (cur[0] !== lastCol) return; // not at the end of a row — let Glide move right
      const lastRow = rowsRef.current.length - 1;
      if (cur[1] === lastRow) {
        if (!onAppendRow) return; // nothing to append into
        e.preventDefault();
        e.stopPropagation();
        onAppendRow();
        selectCell(0, rowsRef.current.length); // the row being appended
      } else {
        e.preventDefault();
        e.stopPropagation();
        selectCell(0, cur[1] + 1); // wrap to next row, first column
      }
    },
    [onAppendRow, selectCell],
  );

  const getRowThemeOverride = useCallback(
    (row: number): Partial<Theme> | undefined =>
      rowHasIssue?.(row) ? { bgHeader: INVALID_ROW_HEADER, bgHeaderHasFocus: INVALID_ROW_HEADER } : undefined,
    [rowHasIssue],
  );

  const contentHeight = HEADER_HEIGHT + (rows.length + 1) * ROW_HEIGHT + 2; // +1 for trailing add-row
  const gridHeight = Math.max(HEADER_HEIGHT + ROW_HEIGHT, Math.min(contentHeight, size.height));

  return (
    <div
      ref={wrapperRef}
      style={{ width: "100%", height: "100%", background: "#f3f4f6" }}
      onKeyDownCapture={onWrapperKeyDownCapture}
    >
      {size.width > 0 && (
        <DataEditor
          ref={editorRef}
          columns={gridColumns}
          rows={rows.length}
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          onCellsEdited={onCellsEdited}
          onColumnResize={onColumnResize}
          getCellsForSelection={getCellsForSelection}
          getRowThemeOverride={getRowThemeOverride}
          onItemHovered={onItemHovered}
          customRenderers={allCells}
          gridSelection={gridSelection}
          onGridSelectionChange={setGridSelection}
          onRowAppended={onAppendRow ? () => void onAppendRow() : undefined}
          trailingRowOptions={onAppendRow ? { sticky: false, tint: true } : undefined}
          rowMarkers="number"
          fillHandle
          smoothScrollX
          smoothScrollY
          freezeColumns={Math.min(freezeColumns, columns.length)}
          width={size.width}
          height={gridHeight}
        />
      )}
    </div>
  );
});
