// OpenPanel.tsx — step-by-step file opening (one control per file).
// Browser: real <input type=file> elements (also what Playwright drives).
// Tauri: native dialog buttons (so we keep a path for in-place save).

import { useCallback, useRef, useState } from "react";
import { isTauri, openDictTauri, openParquetTauri, type SaveOrigin } from "../platform/files.ts";

export interface LoadedFiles {
  dictText: string;
  parquetBytes: Uint8Array;
  origin: SaveOrigin;
}

interface Props {
  onLoaded: (files: LoadedFiles) => void;
  onError: (message: string) => void;
}

export function OpenPanel({ onLoaded, onError }: Props) {
  const [dictText, setDictText] = useState<string | null>(null);
  const [dictName, setDictName] = useState<string | null>(null);
  const [parquet, setParquet] = useState<{ bytes: Uint8Array; origin: SaveOrigin } | null>(null);
  const [parquetName, setParquetName] = useState<string | null>(null);
  const tauri = isTauri();

  const tryOpen = useCallback(
    (d: string | null, p: { bytes: Uint8Array; origin: SaveOrigin } | null) => {
      if (d !== null && p !== null) onLoaded({ dictText: d, parquetBytes: p.bytes, origin: p.origin });
    },
    [onLoaded],
  );

  // --- Browser: file inputs ---
  const dictInput = useRef<HTMLInputElement>(null);
  const parquetInput = useRef<HTMLInputElement>(null);

  const onDictFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const text = await file.text();
      setDictText(text);
      setDictName(file.name);
      tryOpen(text, parquet);
    },
    [parquet, tryOpen],
  );

  const onParquetFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const next = { bytes, origin: { kind: "download" as const, name: file.name } };
      setParquet(next);
      setParquetName(file.name);
      tryOpen(dictText, next);
    },
    [dictText, tryOpen],
  );

  // --- Tauri: native dialogs ---
  const pickDictTauri = useCallback(async () => {
    try {
      const text = await openDictTauri();
      setDictText(text);
      setDictName("dictionary.yaml");
      tryOpen(text, parquet);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [parquet, tryOpen, onError]);

  const pickParquetTauri = useCallback(async () => {
    try {
      const { bytes, origin } = await openParquetTauri();
      const next = { bytes, origin };
      setParquet(next);
      setParquetName(origin.kind === "tauri" ? origin.path.split("/").pop() ?? "data.parquet" : "data.parquet");
      tryOpen(dictText, next);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [dictText, tryOpen, onError]);

  return (
    <div style={{ padding: 32, maxWidth: 460, margin: "0 auto", fontFamily: "system-ui" }}>
      <h2 style={{ marginTop: 0 }}>Open a dataset</h2>
      <p style={{ color: "#666" }}>Choose a dictionary and its Parquet data file.</p>

      <Step n={1} label="Dictionary (.yaml)" done={dictText !== null} doneName={dictName}>
        {tauri ? (
          <button onClick={pickDictTauri}>Choose dictionary…</button>
        ) : (
          <>
            <button onClick={() => dictInput.current?.click()}>Choose dictionary…</button>
            <input
              ref={dictInput}
              data-testid="dict-input"
              type="file"
              accept=".yaml,.yml"
              style={{ display: "none" }}
              onChange={(e) => onDictFile(e.target.files?.[0])}
            />
          </>
        )}
      </Step>

      <Step n={2} label="Data (.parquet)" done={parquet !== null} doneName={parquetName}>
        {tauri ? (
          <button onClick={pickParquetTauri}>Choose data file…</button>
        ) : (
          <>
            <button onClick={() => parquetInput.current?.click()}>Choose data file…</button>
            <input
              ref={parquetInput}
              data-testid="parquet-input"
              type="file"
              accept=".parquet"
              style={{ display: "none" }}
              onChange={(e) => onParquetFile(e.target.files?.[0])}
            />
          </>
        )}
      </Step>

      <p style={{ color: "#999", fontSize: 13 }}>The grid opens automatically once both files are chosen.</p>
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
        {done && doneName && <div style={{ color: "#16a34a", fontSize: 12 }}>{doneName}</div>}
      </div>
      {children}
    </div>
  );
}
