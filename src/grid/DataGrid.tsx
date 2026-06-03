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
  onHeaderHover?: (detail: string | null) => void;
  onSelectCell?: (cell: { row: number; col: string } | null) => void;
  freezeColumns?: number;
}

const INVALID_CELL_BG = "#ffd5d5";
const INVALID_ROW_BG = "#fca5a5"; // reddens the row-number marker (row theme bgCell)
const NEUTRAL_BG = "#ffffff";
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 34;
const ICON_PX = 30;

function glyphFor(kind: CellKind, typeLabel: string): string {
  switch (kind) {
    case "number":
      return "#";
    case "boolean":
      return "☑";
    case "date":
      return "📅";
    case "datetime":
      return "🕒";
    case "enum":
      return "▾";
    default:
      return typeLabel === "id" ? "🔑" : typeLabel === "integer" ? "#" : "T";
  }
}

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
        title: c.title,
        id: c.name,
        width: widths[c.name] ?? 160,
      })),
    [columns, widths],
  );

  const glyphById = useMemo(
    () => new Map(columns.map((c) => [c.name, glyphFor(c.kind, c.typeLabel)])),
    [columns],
  );

  // Draw the header as "name  <type glyph>" — type icon AFTER the name (FR-030).
  const drawHeader = useCallback(
    (args: {
      ctx: CanvasRenderingContext2D;
      column: GridColumn;
      rect: { x: number; y: number; width: number; height: number };
      theme: Theme;
    }) => {
      const { ctx, column, rect, theme } = args;
      const padX = 8;
      const midY = rect.y + rect.height / 2;
      const headerFont =
        (theme as unknown as { headerFontFull?: string }).headerFontFull ??
        `${theme.headerFontStyle} ${theme.fontFamily}`;
      ctx.save();
      ctx.textBaseline = "middle";
      ctx.fillStyle = theme.textHeader;
      ctx.font = headerFont;
      const title = column.title;
      ctx.fillText(title, rect.x + padX, midY);
      const titleW = ctx.measureText(title).width;
      const glyph = column.id ? glyphById.get(column.id) : undefined;
      if (glyph) {
        ctx.fillStyle = theme.textLight;
        ctx.font = `13px ${theme.fontFamily}`;
        ctx.fillText(glyph, rect.x + padX + titleW + 6, midY);
      }
      ctx.restore();
      return true;
    },
    [glyphById],
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
        return { ...base, themeOverride: { bgCell: INVALID_CELL_BG } } as GridCell;
      }
      // In an invalid row the row theme reddens everything (incl. the marker); keep the
      // valid data cells normal so only the row number reads red.
      if (rowHasIssue?.(rowIdx)) {
        return { ...base, themeOverride: { bgCell: NEUTRAL_BG } } as GridCell;
      }
      return base;
    },
    [columns, rows, cellIssue, rowHasIssue],
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
  useEffect(() => {
    const cur = selectionRef.current.current?.cell;
    if (!cur) return;
    if (rows.length === 0) {
      const empty = { columns: CompactSelection.empty(), rows: CompactSelection.empty() };
      selectionRef.current = empty;
      setGridSelectionState(empty);
      onSelectCell?.(null);
    } else if (cur[1] >= rows.length) {
      selectCell(Math.min(cur[0], Math.max(columns.length - 1, 0)), rows.length - 1);
    }
  }, [rows.length, columns.length, selectCell, onSelectCell]);

  const getRowThemeOverride = useCallback(
    (row: number): Partial<Theme> | undefined =>
      rowHasIssue?.(row) ? { bgCell: INVALID_ROW_BG } : undefined,
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
          drawHeader={drawHeader}
          gridSelection={gridSelection}
          onGridSelectionChange={(s) => {
            setGridSelection(s);
            const cell = s.current?.cell;
            const def = cell ? columnsRef.current[cell[0]] : undefined;
            onSelectCell?.(def && cell ? { row: cell[1], col: def.name } : null);
          }}
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
