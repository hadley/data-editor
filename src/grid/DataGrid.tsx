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
import { type GridColumnDef } from "../schema/toColumns.ts";
import type { CellValue, Row, Violation } from "../schema/types.ts";
import { fromGridCell, toGridCell } from "./cellMapping.ts";
import { columnDecimalsMap, measureColumns } from "./columnWidth.ts";

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
  onHeaderHover?: (detail: string | null) => void;
  onSelectCell?: (cell: { row: number; col: string } | null) => void;
  /** Right-click on a row → show an insert/delete menu at screen (x, y). */
  onRowContextMenu?: (row: number, x: number, y: number) => void;
  freezeColumns?: number;
}

const INVALID_CELL_BG = "#ffd5d5";
const INVALID_ROW_BG = "#fca5a5"; // reddens the row-number marker (row theme bgCell)
const MISSING_BG = "#fff1de"; // subtle orange tint for missing (null) values
const ZEBRA_BG = "#f7f7f8"; // subtle striping on alternating rows
const NEUTRAL_BG = "#ffffff";
const HEADER_HEIGHT = 48; // two lines: name + type
const ROW_HEIGHT = 34;

export const DataGrid = forwardRef<DataGridHandle, Props>(function DataGrid(
  {
    columns,
    rows,
    onEdit,
    onEditCells,
    onAppendRow,
    cellIssue,
    rowHasIssue,
    onHover,
    onHeaderHover,
    onSelectCell,
    onRowContextMenu,
    freezeColumns = 1,
  },
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
  const lastCellRef = useRef<readonly [number, number] | null>(null);
  const setGridSelection = useCallback((s: GridSelection) => {
    selectionRef.current = s;
    if (s.current?.cell) lastCellRef.current = s.current.cell;
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
    setWidths(measureColumns(columnsRef.current, rowsRef.current));
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
        title: c.title,
        id: c.name,
        width: widths[c.name] ?? 160,
      })),
    [columns, widths],
  );

  const typeLabelById = useMemo(
    () => new Map(columns.map((c) => [c.name, c.typeLabel])),
    [columns],
  );

  // Two-line header: column name on top, dictionary type in smaller grey below (FR-030/FR-043).
  const drawHeader = useCallback(
    (args: {
      ctx: CanvasRenderingContext2D;
      column: GridColumn;
      rect: { x: number; y: number; width: number; height: number };
      theme: Theme;
    }) => {
      const { ctx, column, rect, theme } = args;
      const padX = 8;
      const headerFont =
        (theme as unknown as { headerFontFull?: string }).headerFontFull ??
        `${theme.headerFontStyle} ${theme.fontFamily}`;
      ctx.save();
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = theme.textHeader;
      ctx.font = headerFont;
      ctx.fillText(column.title, rect.x + padX, rect.y + rect.height / 2 - 1);
      const typeLabel = column.id ? typeLabelById.get(column.id) : undefined;
      if (typeLabel) {
        ctx.fillStyle = theme.textLight;
        ctx.font = `11px ${theme.fontFamily}`;
        ctx.fillText(typeLabel, rect.x + padX, rect.y + rect.height / 2 + 14);
      }
      ctx.restore();
      return true;
    },
    [typeLabelById],
  );

  const onColumnResize = useCallback((column: GridColumn, newSize: number) => {
    if (column.id) setWidths((w) => ({ ...w, [column.id as string]: newSize }));
  }, []);

  // Decimal places per numeric column, so values decimal-align (recomputed as data changes).
  const decimalsByCol = useMemo(() => columnDecimalsMap(columns, rows), [columns, rows]);

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [colIdx, rowIdx] = cell;
      const def = columns[colIdx];
      const value = rows[rowIdx]?.[def.name] ?? null;
      const base = toGridCell(def, value, decimalsByCol[def.name]);
      if (cellIssue?.(rowIdx, def.name)) {
        return { ...base, themeOverride: { bgCell: INVALID_CELL_BG } } as GridCell;
      }
      // Missing (null/empty) but valid → subtle orange.
      if (value === null || value === undefined || value === "") {
        return { ...base, themeOverride: { bgCell: MISSING_BG } } as GridCell;
      }
      // In an invalid row the row theme reddens everything (incl. the marker); keep the
      // valid data cells normal so only the row number reads red.
      if (rowHasIssue?.(rowIdx)) {
        return { ...base, themeOverride: { bgCell: NEUTRAL_BG } } as GridCell;
      }
      return base;
    },
    [columns, rows, cellIssue, rowHasIssue, decimalsByCol],
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

  const hoveredCell = useRef<readonly [number, number] | null>(null);

  // Delete/Backspace clears the selected cell(s) to a missing value (null), undoable.
  const onDelete = useCallback(
    (sel: GridSelection): boolean => {
      if (!onEditCells) return true; // let Glide handle if we can't batch
      const cols = columnsRef.current;
      const nRows = rowsRef.current.length;
      const seen = new Set<string>();
      const edits: GridEdit[] = [];
      const add = (r: number, c: number) => {
        if (r < 0 || r >= nRows || c < 0 || c >= cols.length) return;
        const k = `${r}:${c}`;
        if (seen.has(k)) return;
        seen.add(k);
        edits.push({ row: r, col: cols[c].name, value: null });
      };
      const range = sel.current?.range;
      if (range) {
        for (let r = range.y; r < range.y + range.height; r++)
          for (let c = range.x; c < range.x + range.width; c++) add(r, c);
      }
      for (const r of sel.rows) for (let c = 0; c < cols.length; c++) add(r, c);
      for (const c of sel.columns) for (let r = 0; r < nRows; r++) add(r, c);
      if (edits.length > 0) onEditCells(edits);
      return false; // handled
    },
    [onEditCells],
  );

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      hoveredCell.current = args.kind === "cell" ? args.location : null;
      if (args.kind === "header") {
        const def = columns[args.location[0]];
        onHeaderHover?.(def?.detail ?? null);
        onHover?.(null);
        return;
      }
      onHeaderHover?.(null);
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
    [columns, cellIssue, onHover, onHeaderHover],
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
      if (e.key !== "Tab") return;
      // If a cell editor (e.g. an enum dropdown) is open, let it commit and move first
      // (FR: complete active dropdowns before moving).
      const portal = document.getElementById("portal");
      if (portal && portal.childElementCount > 0) return;

      const cur = selectionRef.current.current?.cell;
      if (!cur) return;
      const lastCol = columnsRef.current.length - 1;

      if (e.shiftKey) {
        // Shift+Tab off the far-left wraps to the far-right of the previous row (zigzag).
        if (cur[0] !== 0) return; // not at far-left — let Glide move left
        if (cur[1] === 0) {
          e.preventDefault();
          e.stopPropagation();
          return; // top-left: nowhere to go
        }
        e.preventDefault();
        e.stopPropagation();
        selectCell(lastCol, cur[1] - 1);
        return;
      }

      // Forward Tab off the far-right wraps to the next row (appends on the last row).
      if (cur[0] !== lastCol) return; // let Glide move right
      const lastRow = rowsRef.current.length - 1;
      if (cur[1] === lastRow) {
        if (!onAppendRow) return;
        e.preventDefault();
        e.stopPropagation();
        onAppendRow();
        selectCell(0, rowsRef.current.length);
      } else {
        e.preventDefault();
        e.stopPropagation();
        selectCell(0, cur[1] + 1);
      }
    },
    [onAppendRow, selectCell],
  );

  // Keep the selection on an existing row after rows shrink (e.g. undo of add-row).
  // Glide may itself clear an out-of-range selection, so fall back to the last cell.
  useEffect(() => {
    if (rows.length === 0) return;
    const cur = selectionRef.current.current?.cell ?? lastCellRef.current;
    if (cur && cur[1] >= rows.length) {
      selectCell(Math.min(cur[0], Math.max(columns.length - 1, 0)), rows.length - 1);
    }
  }, [rows.length, columns.length, selectCell]);

  const getRowThemeOverride = useCallback(
    (row: number): Partial<Theme> | undefined => {
      if (rowHasIssue?.(row)) return { bgCell: INVALID_ROW_BG }; // reddens the marker
      if (row % 2 === 1) return { bgCell: ZEBRA_BG }; // subtle zebra striping
      return undefined;
    },
    [rowHasIssue],
  );

  const contentHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT + 2;
  const gridHeight = Math.max(HEADER_HEIGHT + ROW_HEIGHT, Math.min(contentHeight, size.height));

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const cell = hoveredCell.current;
      if (!onRowContextMenu || !cell) return;
      e.preventDefault();
      onRowContextMenu(cell[1], e.clientX, e.clientY);
    },
    [onRowContextMenu],
  );

  return (
    <div
      ref={wrapperRef}
      style={{ width: "100%", height: "100%", background: "#f3f4f6" }}
      onKeyDownCapture={onWrapperKeyDownCapture}
      onContextMenu={onContextMenu}
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
          onDelete={onDelete}
          onColumnResize={onColumnResize}
          getCellsForSelection={getCellsForSelection}
          getRowThemeOverride={getRowThemeOverride}
          onItemHovered={onItemHovered}
          customRenderers={allCells}
          drawHeader={drawHeader}
          gridSelection={gridSelection}
          onGridSelectionChange={(s) => {
            setGridSelection(s);
            const cell = s.current?.cell;
            const def = cell ? columnsRef.current[cell[0]] : undefined;
            onSelectCell?.(def && cell ? { row: cell[1], col: def.name } : null);
          }}
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
