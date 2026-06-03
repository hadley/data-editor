// App.tsx — workspace of one or more tables (tabs), each its own editable grid.
// Toolbar + tab bar stay fixed; only the data area scrolls.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toColumns } from "./schema/toColumns.ts";
import { parseTables } from "./schema/parse.ts";
import { reconcile } from "./schema/reconcile.ts";
import { coerceRows } from "./schema/coerce.ts";
import { readParquet } from "./io/readParquet.ts";
import { writeParquet } from "./io/writeParquet.ts";
import { saveBytes, type SaveOrigin } from "./platform/files.ts";
import { Workbook } from "./state/workbook.ts";
import { DataGrid, type DataGridHandle } from "./grid/DataGrid.tsx";
import { ReconcileError } from "./grid/ReconcileError.tsx";
import { CardView } from "./cards/CardView.tsx";
import { OpenPanel } from "./open/OpenPanel.tsx";
import type { LoadedTable } from "./open/load.ts";
import type { CellValue, ReconcileResult } from "./schema/types.ts";

const PHONE_MAX_WIDTH = 600;

interface Tab {
  name: string;
  workbook: Workbook | null; // null when reconciliation failed
  reconcileError: ReconcileResult | null;
  origin: SaveOrigin | null;
}

export function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState(0);
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
  // Per-tab scroll position (first visible row), so each table keeps its own scroll.
  const scrollRows = useRef<Record<number, number>>({});
  const activeRef = useRef(active);
  const suppressScrollSave = useRef(false);

  const current = tabs[active] as Tab | undefined;
  const workbook = current?.workbook ?? null;
  const origin = current?.origin ?? null;
  const reconcileError = current?.reconcileError ?? null;
  const canAutosave = origin?.kind === "tauri";

  // Subscribe to the active workbook so edits re-render.
  useEffect(() => {
    unsubscribe.current?.();
    unsubscribe.current = workbook?.subscribe(forceRender) ?? null;
    (window as unknown as { __wb?: Workbook | null }).__wb = workbook;
    return () => unsubscribe.current?.();
  }, [workbook]);

  // On tab switch: reset transient UI and restore this tab's saved scroll position.
  useEffect(() => {
    activeRef.current = active;
    setActiveCell(null);
    setMenu(null);
    setCardIndex(0);
    suppressScrollSave.current = true; // ignore scroll events fired during the switch
    const target = scrollRows.current[active] ?? 0;
    const raf = requestAnimationFrame(() => {
      dataGridRef.current?.scrollToRow(target);
      suppressScrollSave.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const onVisibleRowChange = useCallback((firstRow: number) => {
    (window as unknown as { __visibleRow?: number }).__visibleRow = firstRow;
    if (suppressScrollSave.current) return;
    scrollRows.current[activeRef.current] = firstRow;
  }, []);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < PHONE_MAX_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);


  const anyDirty = tabs.some((t) => t.workbook?.dirty);
  const totalViolations = tabs.reduce((n, t) => n + (t.workbook?.violationCount() ?? 0), 0);

  // Unsaved-edit guard (FR-019a) — across all tabs.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (anyDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const handleLoaded = useCallback(async (loaded: LoadedTable[]) => {
    setError(null);
    scrollRows.current = {}; // fresh scroll state per dataset
    const built: Tab[] = [];
    for (const { dict, bytes, origin: o } of loaded) {
      const name = dict.name ?? "table";
      try {
        const { schemaElements, rows } = await readParquet(bytes);
        const result = reconcile(schemaElements, dict);
        if (!result.ok) {
          built.push({ name, workbook: null, reconcileError: result, origin: null });
        } else {
          // Coerce file values to the dictionary's canonical carriers (e.g. INT32 id → text).
          const wb = new Workbook(dict, coerceRows(dict.columns, rows));
          built.push({ name, workbook: wb, reconcileError: null, origin: o });
        }
      } catch (err) {
        setError(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        built.push({ name, workbook: null, reconcileError: null, origin: null });
      }
    }
    setTabs(built);
    setActive(0);
  }, []);

  // Test hook: load tables from raw dict text + Parquet bytes (no file pickers).
  useEffect(() => {
    (window as unknown as { __loadForTest?: (items: { dictText: string; bytes: number[] }[]) => void }).__loadForTest = (
      items,
    ) => {
      void handleLoaded(
        items.map((it) => ({
          dict: parseTables(it.dictText)[0],
          bytes: new Uint8Array(it.bytes),
          origin: { kind: "download", name: "test.parquet" } as SaveOrigin,
        })),
      );
    };
  }, [handleLoaded]);

  const silentSave = useCallback(async () => {
    if (!workbook || !origin || origin.kind !== "tauri") return;
    try {
      await saveBytes(writeParquet(workbook.rows, workbook.schema), origin);
      workbook.markSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [workbook, origin]);

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
    requestAnimationFrame(() => dataGridRef.current?.scrollToBottom()); // reveal the new row
  }, [workbook, afterMutate]);

  const handleUndo = useCallback(() => {
    workbook?.undo();
    afterMutate();
  }, [workbook, afterMutate]);

  const handleRedo = useCallback(() => {
    workbook?.redo();
    afterMutate();
  }, [workbook, afterMutate]);

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
    if (anyDirty || totalViolations > 0) {
      const msg =
        totalViolations > 0
          ? `This workspace has ${totalViolations} validation problem${totalViolations === 1 ? "" : "s"} and may not be fully saved. Close and discard changes?`
          : "Discard unsaved changes and close?";
      if (!window.confirm(msg)) return;
    }
    setTabs([]);
    setActive(0);
    setActiveCell(null);
    setMenu(null);
    scrollRows.current = {};
  }, [anyDirty, totalViolations]);

  const handleSave = useCallback(async () => {
    if (!workbook || !origin) return;
    setError(null);
    const count = workbook.violationCount();
    if (count > 0) {
      const ok = window.confirm(
        `There ${count === 1 ? "is" : "are"} ${count} outstanding validation problem${count === 1 ? "" : "s"}. Save anyway?`,
      );
      if (!ok) return;
    }
    try {
      await saveBytes(writeParquet(workbook.rows, workbook.schema), origin);
      workbook.markSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [workbook, origin]);

  const jumpToFirstProblem = useCallback(() => {
    const cell = workbook?.firstViolationCell();
    if (!cell) return;
    if (isNarrow) setCardIndex(cell.row);
    else dataGridRef.current?.focusCell(cell.row, cell.col);
  }, [workbook, isNarrow]);

  const columns = workbook ? toColumns(workbook.dict.columns) : [];
  const violationCount = workbook?.violationCount() ?? 0;

  const activeIssue = activeCell ? (workbook?.cellIssue(activeCell.row, activeCell.col) ?? null) : null;
  const statusText = activeIssue
    ? `⚠ ${activeCell!.col} (row ${activeCell!.row + 1}): ${activeIssue.message}`
    : (headerDetail ?? hoverMsg ?? "");
  const statusIsError = !!activeIssue;

  const hasWorkspace = tabs.length > 0;

  return (
    <div style={shell}>
      <Toolbar
        hasWorkbook={!!workbook}
        hasWorkspace={hasWorkspace}
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

      {hasWorkspace && (
        <div style={tabBar}>
          {tabs.map((t, i) => (
            <button
              key={`${t.name}-${i}`}
              style={i === active ? { ...tab, ...tabActive } : tab}
              onClick={() => setActive(i)}
              title={t.name}
            >
              {t.name}
              {t.workbook?.dirty ? " ●" : ""}
              {t.reconcileError ? " ⚠" : t.workbook && t.workbook.violationCount() > 0 ? " •" : ""}
            </button>
          ))}
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
              onVisibleRowChange={onVisibleRowChange}
            />
          )
        ) : reconcileError ? (
          <ReconcileError result={reconcileError} onDismiss={handleClose} />
        ) : hasWorkspace ? (
          <p style={{ padding: 16, color: "#666" }}>This table could not be loaded.</p>
        ) : (
          <OpenPanel onLoaded={(t) => void handleLoaded(t)} onError={setError} />
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
            <button style={menuItem} onClick={() => insertAt(menu.row)}>Insert row above</button>
            <button style={menuItem} onClick={() => insertAt(menu.row + 1)}>Insert row below</button>
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
  hasWorkspace: boolean;
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
  const brand = <img src="/logo.png" alt="Herringbone" width={22} height={22} style={{ borderRadius: 5, flexShrink: 0 }} />;
  if (!props.hasWorkspace) {
    return (
      <header style={toolbar}>
        {brand}
        {props.error && <span style={{ color: "#c00", fontSize: 13, marginLeft: 8 }}>⚠ {props.error}</span>}
      </header>
    );
  }
  return (
    <header style={toolbar}>
      {brand}
      <span style={sep} />
      <button className="tb-btn" onClick={props.onAddRow} disabled={!props.hasWorkbook} title="Append a row">
        ＋ Row
      </button>
      <span style={sep} />
      <button className="tb-btn" onClick={props.onUndo} disabled={!props.canUndo} title="Undo (⌘Z)">↶</button>
      <button className="tb-btn" onClick={props.onRedo} disabled={!props.canRedo} title="Redo (⇧⌘Z)">↷</button>
      <span style={sep} />
      <button
        className={props.dirty ? "tb-btn tb-btn--primary" : "tb-btn"}
        onClick={props.onSave}
        disabled={!props.hasWorkbook}
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
      <button className="tb-btn" onClick={props.onClose} title="Close this workspace">✕ Close</button>
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
  overflowX: "auto",
};
const tab: React.CSSProperties = {
  padding: "6px 14px",
  background: "#e9eaee",
  border: "1px solid #ddd",
  borderBottom: "none",
  borderRadius: "6px 6px 0 0",
  marginTop: 4,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
  color: "#444",
};
const tabActive: React.CSSProperties = { background: "white", fontWeight: 600, color: "#111" };
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
