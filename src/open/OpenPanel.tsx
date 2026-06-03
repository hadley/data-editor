// OpenPanel.tsx — step-by-step opening. A data-dict.yaml may describe one table or many.
//   Desktop (Tauri): pick the dictionary; every table's source is read automatically.
//   Browser: pick the dictionary, then pick the data file (single table) or the data
//   folder (multiple tables) so sources can be resolved relative to the dictionary.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useRef, useState } from "react";
import { isTauri, openDictTauri, type SaveOrigin } from "../platform/files.ts";
import { parseTables } from "../schema/parse.ts";
import { loadTablesFromDir, loadTablesTauri, type LoadedTable } from "./load.ts";

interface Props {
  onLoaded: (tables: LoadedTable[]) => void;
  onError: (message: string) => void;
}

export function OpenPanel({ onLoaded, onError }: Props) {
  const tauri = isTauri();
  const [dictText, setDictText] = useState<string | null>(null);
  const [tableNames, setTableNames] = useState<string[]>([]);
  const dictInput = useRef<HTMLInputElement>(null);
  const dataInput = useRef<HTMLInputElement>(null);

  const fail = useCallback((e: unknown) => onError(e instanceof Error ? e.message : String(e)), [onError]);

  // --- Desktop: one click loads the dictionary and every table's data. ---
  const openTauri = useCallback(async () => {
    try {
      const { text, path } = await openDictTauri();
      onLoaded(await loadTablesTauri(text, path));
    } catch (e) {
      fail(e);
    }
  }, [onLoaded, fail]);

  // --- Browser: choose the dictionary first. ---
  const onDictFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const text = await file.text();
        const tables = parseTables(text);
        setDictText(text);
        setTableNames(tables.map((t) => t.name ?? "table"));
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  // Single-table: choose the one data file.
  const onDataFile = useCallback(
    async (file: File | undefined) => {
      if (!file || dictText === null) return;
      try {
        const [dict] = parseTables(dictText);
        const bytes = new Uint8Array(await file.arrayBuffer());
        onLoaded([{ dict, bytes, origin: { kind: "download", name: file.name } satisfies SaveOrigin }]);
      } catch (e) {
        fail(e);
      }
    },
    [dictText, onLoaded, fail],
  );

  // Multiple tables: choose the folder that contains the data files.
  const chooseFolder = useCallback(async () => {
    if (dictText === null) return;
    try {
      const picker = (window as any).showDirectoryPicker;
      if (typeof picker !== "function") {
        onError("This browser can't pick a folder — use the desktop app for multi-table dictionaries.");
        return;
      }
      const dir = await picker();
      onLoaded(await loadTablesFromDir(dictText, dir));
    } catch (e) {
      fail(e);
    }
  }, [dictText, onLoaded, onError, fail]);

  const multi = tableNames.length > 1;

  return (
    <div style={{ padding: 32, maxWidth: 480, margin: "0 auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <img src="/logo.png" alt="Herringbone" width={44} height={44} style={{ borderRadius: 8 }} />
        <div>
          <h2 style={{ margin: 0 }}>Herringbone</h2>
          <div style={{ color: "#888", fontSize: 13 }}>Open a dataset</div>
        </div>
      </div>

      {tauri ? (
        <>
          <p style={{ color: "#666" }}>Choose a <code>data-dict.yaml</code>. Every table's data is loaded automatically.</p>
          <button onClick={openTauri}>Open dictionary…</button>
        </>
      ) : (
        <>
          <Step n={1} label="Dictionary (.yaml)" done={dictText !== null} doneName={dictText ? `${tableNames.length} table${tableNames.length === 1 ? "" : "s"}` : null}>
            <button onClick={() => dictInput.current?.click()}>Choose dictionary…</button>
            <input
              ref={dictInput}
              data-testid="dict-input"
              type="file"
              accept=".yaml,.yml"
              style={{ display: "none" }}
              onChange={(e) => onDictFile(e.target.files?.[0])}
            />
          </Step>

          {dictText !== null && !multi && (
            <Step n={2} label="Data (.parquet)" done={false} doneName={null}>
              <button onClick={() => dataInput.current?.click()}>Choose data file…</button>
              <input
                ref={dataInput}
                data-testid="parquet-input"
                type="file"
                accept=".parquet"
                style={{ display: "none" }}
                onChange={(e) => onDataFile(e.target.files?.[0])}
              />
            </Step>
          )}

          {dictText !== null && multi && (
            <Step n={2} label={`Data folder for ${tableNames.length} tables`} done={false} doneName={tableNames.join(", ")}>
              <button onClick={chooseFolder}>Choose data folder…</button>
            </Step>
          )}
        </>
      )}
    </div>
  );
}

function Step({
  n,
  label,
  done,
  doneName,
  children,
}: {
  n: number;
  label: string;
  done: boolean;
  doneName: string | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: done ? "#16a34a" : "#e5e7eb",
          color: done ? "white" : "#666",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {done ? "✓" : n}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {doneName && <div style={{ color: "#16a34a", fontSize: 12 }}>{doneName}</div>}
      </div>
      {children}
    </div>
  );
}
