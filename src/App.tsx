// App.tsx — load (happy path), edit, add rows, and save (US1).
// Reconciliation gate (US2), live validation (US3), and conveniences (US4) come later.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { parse } from "./schema/parse.ts";
import { toColumns } from "./schema/toColumns.ts";
import { reconcile } from "./schema/reconcile.ts";
import { readParquet } from "./io/readParquet.ts";
import { writeParquet } from "./io/writeParquet.ts";
import { openFiles, saveBytes, type SaveOrigin } from "./platform/files.ts";
import { Workbook } from "./state/workbook.ts";
import { DataGrid } from "./grid/DataGrid.tsx";
import { ReconcileError } from "./grid/ReconcileError.tsx";
import type { CellValue, ReconcileResult } from "./schema/types.ts";

export function App() {
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [origin, setOrigin] = useState<SaveOrigin | null>(null);
  const [reconcileError, setReconcileError] = useState<ReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverMsg, setHoverMsg] = useState<string | null>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const unsubscribe = useRef<(() => void) | null>(null);
  const tableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-render whenever the workbook notifies (edits, add row, save).
  useEffect(() => {
    unsubscribe.current?.();
    unsubscribe.current = workbook?.subscribe(forceRender) ?? null;
    return () => unsubscribe.current?.();
  }, [workbook]);

  // Unsaved-edit guard (FR-019a): warn before leaving with pending changes.
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

  const handleOpen = useCallback(async () => {
    setError(null);
    setReconcileError(null);
    try {
      const files = await openFiles();
      const dict = parse(files.dict);
      const { schemaElements, rows } = await readParquet(files.parquet);
      // Reconciliation gate (US2): block opening on any mismatch (FR-003–FR-007).
      const result = reconcile(schemaElements, dict);
      if (!result.ok) {
        setWorkbook(null);
        setReconcileError(result);
        return;
      }
      setWorkbook(new Workbook(dict, rows));
      setOrigin(files.origin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Debounced cross-row (unique/pk) revalidation after edits settle (FR-015, R8).
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

  // Keyboard undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z or Ctrl+Y).
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
    // Warn + require confirmation when violations remain (FR-020).
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #ddd" }}>
        <strong>Data Entry Tool</strong>
        <button onClick={handleOpen}>Open…</button>
        <button onClick={() => workbook?.addRow()} disabled={!workbook}>
          Add row
        </button>
        <button onClick={handleUndo} disabled={!workbook?.canUndo()}>
          Undo
        </button>
        <button onClick={handleRedo} disabled={!workbook?.canRedo()}>
          Redo
        </button>
        <button onClick={handleSave} disabled={!workbook}>
          Save{workbook?.dirty ? " *" : ""}
        </button>
        {workbook && (
          <span style={{ color: "#666" }}>
            {workbook.dict.name ?? "table"} · {workbook.rows.length} rows
          </span>
        )}
        {violationCount > 0 && (
          <span style={{ color: "#c00" }}>
            {violationCount} validation problem{violationCount === 1 ? "" : "s"}
          </span>
        )}
        {hoverMsg && <span style={{ color: "#c00" }}>· {hoverMsg}</span>}
        {error && <span style={{ color: "#c00" }}>⚠ {error}</span>}
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>
        {workbook ? (
          <DataGrid
            columns={columns}
            rows={workbook.rows}
            onEdit={handleEdit}
            onEditCells={handleEditCells}
            cellIssue={(r, c) => workbook.cellIssue(r, c)}
            onHover={setHoverMsg}
          />
        ) : reconcileError ? (
          <ReconcileError result={reconcileError} onDismiss={() => setReconcileError(null)} />
        ) : (
          <p style={{ padding: 16, color: "#666" }}>
            Open a Parquet file and its <code>data-dict.yaml</code> to begin.
          </p>
        )}
      </main>
    </div>
  );
}
