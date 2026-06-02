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
import type { ReconcileResult } from "./schema/types.ts";

export function App() {
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [origin, setOrigin] = useState<SaveOrigin | null>(null);
  const [reconcileError, setReconcileError] = useState<ReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const unsubscribe = useRef<(() => void) | null>(null);

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

  const handleSave = useCallback(async () => {
    if (!workbook || !origin) return;
    setError(null);
    try {
      const bytes = writeParquet(workbook.rows, workbook.schema);
      await saveBytes(bytes, origin);
      workbook.markSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [workbook, origin]);

  const columns = workbook ? toColumns(workbook.dict.columns) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #ddd" }}>
        <strong>Data Entry Tool</strong>
        <button onClick={handleOpen}>Open…</button>
        <button onClick={() => workbook?.addRow()} disabled={!workbook}>
          Add row
        </button>
        <button onClick={handleSave} disabled={!workbook}>
          Save{workbook?.dirty ? " *" : ""}
        </button>
        {workbook && (
          <span style={{ color: "#666" }}>
            {workbook.dict.name ?? "table"} · {workbook.rows.length} rows
          </span>
        )}
        {error && <span style={{ color: "#c00" }}>⚠ {error}</span>}
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>
        {workbook ? (
          <DataGrid columns={columns} rows={workbook.rows} onEdit={(r, c, v) => workbook.setCell(r, c, v)} />
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
