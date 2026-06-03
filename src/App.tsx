// App.tsx — toolbar + file tab + (grid | card view | open panel). Only the data area
// scrolls; the toolbar and tab stay fixed.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { parse } from "./schema/parse.ts";
import { toColumns } from "./schema/toColumns.ts";
import { reconcile } from "./schema/reconcile.ts";
import { readParquet } from "./io/readParquet.ts";
import { writeParquet } from "./io/writeParquet.ts";
import { saveBytes, type SaveOrigin } from "./platform/files.ts";
import { Workbook } from "./state/workbook.ts";
import { DataGrid, type DataGridHandle } from "./grid/DataGrid.tsx";
import { ReconcileError } from "./grid/ReconcileError.tsx";
import { CardView } from "./cards/CardView.tsx";
import { OpenPanel, type LoadedFiles } from "./open/OpenPanel.tsx";
import type { CellValue, ReconcileResult } from "./schema/types.ts";

const PHONE_MAX_WIDTH = 600;

export function App() {
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [origin, setOrigin] = useState<SaveOrigin | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [reconcileError, setReconcileError] = useState<ReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverMsg, setHoverMsg] = useState<string | null>(null);
  const [headerDetail, setHeaderDetail] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; col: string } | null>(null);
  const [menu, setMenu] = useState<{ row: number; x: number; y: number } | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [autosaveOn, setAutosaveOn] = useState(true);
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" && window.innerWidth < PHONE_MAX_WIDTH,
  );
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const unsubscribe = useRef<(() => void) | null>(null);
  const tableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataGridRef = useRef<DataGridHandle>(null);

  // Autosave only where we can overwrite in place (never repeatedly download).
  const canAutosave = origin?.kind === "tauri";

  useEffect(() => {
    unsubscribe.current?.();
    unsubscribe.current = workbook?.subscribe(forceRender) ?? null;
    // Test hook: lets e2e read live workbook state.
    (window as unknown as { __wb?: Workbook | null }).__wb = workbook;
    return () => unsubscribe.current?.();
  }, [workbook]);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < PHONE_MAX_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Unsaved-edit guard (FR-019a).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (workbook?.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [workbook]);

  const handleLoaded = useCallback((files: LoadedFiles) => {
    setError(null);
    setReconcileError(null);
    try {
      const dict = parse(files.dictText);
      void readParquet(files.parquetBytes).then(({ schemaElements, rows }) => {
        const result = reconcile(schemaElements, dict);
        if (!result.ok) {
          setWorkbook(null);
          setReconcileError(result);
          return;
        }
        setWorkbook(new Workbook(dict, rows));
        setOrigin(files.origin);
        setFileName(dict.name ?? (files.origin.kind === "download" ? files.origin.name : "data"));
        setCardIndex(0);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const silentSave = useCallback(async () => {
    if (!workbook || !origin || origin.kind !== "tauri") return;
    try {
      await saveBytes(writeParquet(workbook.rows, workbook.schema), origin);
      workbook.markSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [workbook, origin]);

  // Debounced cross-row revalidation + (optional) autosave after edits settle.
  const afterMutate = useCallback(() => {
    if (tableTimer.current) clearTimeout(tableTimer.current);
    tableTimer.current = setTimeout(() => workbook?.recomputeTable(), 300);
    if (autosaveOn && canAutosave) {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => void silentSave(), 1200);
    }
  }, [workbook, autosaveOn, canAutosave, silentSave]);

  const handleEdit = useCallback(
    (row: number, col: string, value: CellValue) => {
      workbook?.setCell(row, col, value);
      afterMutate();
    },
    [workbook, afterMutate],
  );

  const handleEditCells = useCallback(
    (edits: { row: number; col: string; value: CellValue }[]) => {
      workbook?.setCells(edits);
      afterMutate();
    },
    [workbook, afterMutate],
  );

  const handleAddRow = useCallback(() => {
    workbook?.addRow();
    afterMutate();
  }, [workbook, afterMutate]);

  const handleUndo = useCallback(() => {
    workbook?.undo();
    afterMutate();
  }, [workbook, afterMutate]);

  const handleRedo = useCallback(() => {
    workbook?.redo();
    afterMutate();
  }, [workbook, afterMutate]);

  const insertAt = useCallback(
    (at: number) => {
      workbook?.insertRow(at);
      afterMutate();
      setMenu(null);
    },
    [workbook, afterMutate],
  );

  const deleteAt = useCallback(
    (row: number) => {
      workbook?.deleteRow(row);
      afterMutate();
      setMenu(null);
    },
    [workbook, afterMutate],
  );

  const handleClose = useCallback(() => {
    if (workbook && (workbook.dirty || workbook.violationCount() > 0)) {
      const msg =
        workbook.violationCount() > 0
          ? `This dataset has ${workbook.violationCount()} validation problem${
              workbook.violationCount() === 1 ? "" : "s"
            } and may not be fully saved. Close and discard changes?`
          : "Discard unsaved changes and close?";
      if (!window.confirm(msg)) return;
    }
    setWorkbook(null);
    setOrigin(null);
    setReconcileError(null);
    setActiveCell(null);
    setMenu(null);
  }, [workbook]);

  const jumpToFirstProblem = useCallback(() => {
    const cell = workbook?.firstViolationCell();
    if (!cell) return;
    if (isNarrow) setCardIndex(cell.row);
    else dataGridRef.current?.focusCell(cell.row, cell.col);
  }, [workbook, isNarrow]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!workbook) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [workbook, handleUndo, handleRedo]);

  const handleSave = useCallback(async () => {
    if (!workbook || !origin) return;
    setError(null);
    const count = workbook.violationCount();
    if (count > 0) {
      const ok = window.confirm(
        `There ${count === 1 ? "is" : "are"} ${count} outstanding validation problem${
          count === 1 ? "" : "s"
        }. Save anyway?`,
      );
      if (!ok) return;
    }
    try {
      const bytes = writeParquet(workbook.rows, workbook.schema);
      await saveBytes(bytes, origin);
      workbook.markSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [workbook, origin]);

  const columns = workbook ? toColumns(workbook.dict.columns) : [];
  const violationCount = workbook?.violationCount() ?? 0;

  // Status bar: the active cell's validation error takes priority, then header-hover
  // type details, then a cell-hover message.
  const activeIssue = activeCell ? (workbook?.cellIssue(activeCell.row, activeCell.col) ?? null) : null;
  const statusText = activeIssue
    ? `⚠ ${activeCell!.col} (row ${activeCell!.row + 1}): ${activeIssue.message}`
    : (headerDetail ?? hoverMsg ?? "");
  const statusIsError = !!activeIssue;

  return (
    <div style={shell}>
      <Toolbar
        hasWorkbook={!!workbook}
        dirty={workbook?.dirty ?? false}
        canUndo={workbook?.canUndo() ?? false}
        canRedo={workbook?.canRedo() ?? false}
        violationCount={violationCount}
        error={error}
        autosaveOn={autosaveOn}
        canAutosave={canAutosave}
        onToggleAutosave={() => setAutosaveOn((v) => !v)}
        onAddRow={handleAddRow}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        onJumpToProblem={jumpToFirstProblem}
        onClose={handleClose}
      />

      {workbook && (
        <div style={tabBar}>
          <div style={tab}>{fileName || "table"}</div>
        </div>
      )}

      <main style={dataArea}>
        {workbook ? (
          isNarrow ? (
            <CardView
              columns={columns}
              rows={workbook.rows}
              index={cardIndex}
              onIndexChange={setCardIndex}
              onEdit={handleEdit}
              cellIssue={(r, c) => workbook.cellIssue(r, c)}
            />
          ) : (
            <DataGrid
              ref={dataGridRef}
              columns={columns}
              rows={workbook.rows}
              onEdit={handleEdit}
              onEditCells={handleEditCells}
              onAppendRow={handleAddRow}
              cellIssue={(r, c) => workbook.cellIssue(r, c)}
              rowHasIssue={(r) => workbook.rowHasIssue(r)}
              onHover={setHoverMsg}
              onHeaderHover={setHeaderDetail}
              onSelectCell={setActiveCell}
              onRowContextMenu={(row, x, y) => setMenu({ row, x, y })}
            />
          )
        ) : reconcileError ? (
          <ReconcileError result={reconcileError} onDismiss={() => setReconcileError(null)} />
        ) : (
          <OpenPanel onLoaded={handleLoaded} onError={setError} />
        )}
      </main>

      {workbook && (
        <footer style={{ ...statusBar, color: statusIsError ? "#c00" : "#555" }} data-testid="status-bar">
          {statusText || <span style={{ color: "#aaa" }}>Ready</span>}
        </footer>
      )}

      {menu && workbook && (
        <>
          <div style={menuOverlay} onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div style={{ ...menuBox, left: menu.x, top: menu.y }} role="menu" data-testid="row-menu">
            <button style={menuItem} onClick={() => insertAt(menu.row)}>
              Insert row above
            </button>
            <button style={menuItem} onClick={() => insertAt(menu.row + 1)}>
              Insert row below
            </button>
            <div style={{ height: 1, background: "#eee", margin: "4px 0" }} />
            <button style={{ ...menuItem, color: "#c00" }} onClick={() => deleteAt(menu.row)}>
              Delete row {menu.row + 1}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Toolbar(props: {
  hasWorkbook: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  violationCount: number;
  error: string | null;
  autosaveOn: boolean;
  canAutosave: boolean;
  onToggleAutosave: () => void;
  onAddRow: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onJumpToProblem: () => void;
  onClose: () => void;
}) {
  if (!props.hasWorkbook) {
    return (
      <header style={toolbar}>
        {props.error && <span style={{ color: "#c00", fontSize: 13 }}>⚠ {props.error}</span>}
      </header>
    );
  }
  return (
    <header style={toolbar}>
      <button className="tb-btn" onClick={props.onAddRow} title="Append a row">
        ＋ Row
      </button>
      <span style={sep} />
      <button className="tb-btn" onClick={props.onUndo} disabled={!props.canUndo} title="Undo (⌘Z)">
        ↶
      </button>
      <button className="tb-btn" onClick={props.onRedo} disabled={!props.canRedo} title="Redo (⇧⌘Z)">
        ↷
      </button>
      <span style={sep} />
      <button
        className={props.dirty ? "tb-btn tb-btn--primary" : "tb-btn"}
        onClick={props.onSave}
        title="Save"
      >
        Save{props.dirty ? " ●" : ""}
      </button>
      <label
        className="tb-btn"
        style={{ cursor: props.canAutosave ? "pointer" : "default" }}
        title={props.canAutosave ? "Autosave to the original file" : "Autosave needs in-place save (desktop)"}
      >
        <input type="checkbox" checked={props.autosaveOn} disabled={!props.canAutosave} onChange={props.onToggleAutosave} />
        Autosave
      </label>
      <span style={{ flex: 1 }} />
      {props.violationCount > 0 && (
        <button style={badgeBtn} onClick={props.onJumpToProblem} title="Jump to the first problem">
          {props.violationCount} problem{props.violationCount === 1 ? "" : "s"} →
        </button>
      )}
      {props.error && <span style={{ color: "#c00", fontSize: 13 }}>⚠ {props.error}</span>}
      <span style={sep} />
      <button className="tb-btn" onClick={props.onClose} title="Close this dataset">
        ✕ Close
      </button>
    </header>
  );
}

const shell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  overflow: "hidden",
  fontFamily: "system-ui, sans-serif",
};
const toolbar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderBottom: "1px solid #ddd",
  background: "#fafafa",
  flexShrink: 0,
};
const tabBar: React.CSSProperties = {
  display: "flex",
  gap: 2,
  padding: "0 8px",
  borderBottom: "1px solid #ddd",
  background: "#f3f4f6",
  flexShrink: 0,
};
const tab: React.CSSProperties = {
  padding: "6px 14px",
  background: "white",
  border: "1px solid #ddd",
  borderBottom: "none",
  borderRadius: "6px 6px 0 0",
  marginTop: 4,
  fontSize: 13,
  fontWeight: 600,
};
const dataArea: React.CSSProperties = { flex: 1, minHeight: 0, overflow: "hidden", position: "relative" };
const statusBar: React.CSSProperties = {
  flexShrink: 0,
  borderTop: "1px solid #ddd",
  background: "#fafafa",
  padding: "4px 12px",
  fontSize: 12,
  fontFamily: "system-ui, sans-serif",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const sep: React.CSSProperties = { width: 1, height: 20, background: "#ddd", margin: "0 4px" };
const menuOverlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000 };
const menuBox: React.CSSProperties = {
  position: "fixed",
  zIndex: 1001,
  background: "white",
  border: "1px solid #ccc",
  borderRadius: 6,
  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
  padding: 4,
  minWidth: 160,
  fontSize: 13,
};
const menuItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "6px 10px",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};
const badgeBtn: React.CSSProperties = {
  background: "#fee2e2",
  color: "#c00",
  border: "1px solid #fca5a5",
  borderRadius: 10,
  padding: "2px 10px",
  fontSize: 12,
  cursor: "pointer",
};
