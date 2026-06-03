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
import { DataGrid } from "./grid/DataGrid.tsx";
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
  const [cardIndex, setCardIndex] = useState(0);
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" && window.innerWidth < PHONE_MAX_WIDTH,
  );
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const unsubscribe = useRef<(() => void) | null>(null);
  const tableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const scheduleTable = useCallback(() => {
    if (tableTimer.current) clearTimeout(tableTimer.current);
    tableTimer.current = setTimeout(() => workbook?.recomputeTable(), 300);
  }, [workbook]);

  const handleEdit = useCallback(
    (row: number, col: string, value: CellValue) => {
      workbook?.setCell(row, col, value);
      scheduleTable();
    },
    [workbook, scheduleTable],
  );

  const handleEditCells = useCallback(
    (edits: { row: number; col: string; value: CellValue }[]) => {
      workbook?.setCells(edits);
      scheduleTable();
    },
    [workbook, scheduleTable],
  );

  const handleUndo = useCallback(() => {
    workbook?.undo();
    scheduleTable();
  }, [workbook, scheduleTable]);

  const handleRedo = useCallback(() => {
    workbook?.redo();
    scheduleTable();
  }, [workbook, scheduleTable]);

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

  return (
    <div style={shell}>
      <Toolbar
        hasWorkbook={!!workbook}
        dirty={workbook?.dirty ?? false}
        canUndo={workbook?.canUndo() ?? false}
        canRedo={workbook?.canRedo() ?? false}
        violationCount={violationCount}
        hoverMsg={hoverMsg}
        error={error}
        onAddRow={() => workbook?.addRow()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        onClose={() => {
          setWorkbook(null);
          setOrigin(null);
          setReconcileError(null);
        }}
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
              columns={columns}
              rows={workbook.rows}
              onEdit={handleEdit}
              onEditCells={handleEditCells}
              cellIssue={(r, c) => workbook.cellIssue(r, c)}
              onHover={setHoverMsg}
            />
          )
        ) : reconcileError ? (
          <ReconcileError result={reconcileError} onDismiss={() => setReconcileError(null)} />
        ) : (
          <OpenPanel onLoaded={handleLoaded} onError={setError} />
        )}
      </main>
    </div>
  );
}

function Toolbar(props: {
  hasWorkbook: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  violationCount: number;
  hoverMsg: string | null;
  error: string | null;
  onAddRow: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <header style={toolbar}>
      <strong style={{ marginRight: 8 }}>Data Entry Tool</strong>
      {props.hasWorkbook && (
        <>
          <button onClick={props.onAddRow}>+ Row</button>
          <span style={sep} />
          <button onClick={props.onUndo} disabled={!props.canUndo} title="Undo (⌘Z)">
            ↶ Undo
          </button>
          <button onClick={props.onRedo} disabled={!props.canRedo} title="Redo (⇧⌘Z)">
            ↷ Redo
          </button>
          <span style={sep} />
          <button onClick={props.onSave} style={props.dirty ? primaryBtn : undefined}>
            Save{props.dirty ? " ●" : ""}
          </button>
          <button onClick={props.onClose}>Close</button>
          <span style={{ flex: 1 }} />
          {props.violationCount > 0 && (
            <span style={badge}>
              {props.violationCount} problem{props.violationCount === 1 ? "" : "s"}
            </span>
          )}
          {props.hoverMsg && <span style={{ color: "#c00", fontSize: 13 }}>{props.hoverMsg}</span>}
        </>
      )}
      {props.error && <span style={{ color: "#c00", fontSize: 13 }}>⚠ {props.error}</span>}
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
const sep: React.CSSProperties = { width: 1, height: 20, background: "#ddd", margin: "0 4px" };
const badge: React.CSSProperties = {
  background: "#fee2e2",
  color: "#c00",
  borderRadius: 10,
  padding: "2px 8px",
  fontSize: 12,
};
const primaryBtn: React.CSSProperties = { background: "#4f46e5", color: "white", border: "1px solid #4f46e5" };
