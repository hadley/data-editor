// files.ts — the single runtime seam (research R5/R12). Everything else is runtime-agnostic.
//   Desktop (Tauri): overwrite the original file in place via the Tauri fs plugin.
//   Browser (dev):   File System Access handle where available, else re-export via download.
//
// The Tauri packages are loaded lazily through a variable specifier so the web build
// compiles without them installed; `npx tauri init` + the @tauri-apps/* plugins enable
// the desktop path.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { open as tauriOpenDialog } from "@tauri-apps/plugin-dialog";
import { readFile as tauriReadFile, readTextFile as tauriReadTextFile, writeFile as tauriWriteFile } from "@tauri-apps/plugin-fs";

export type SaveOrigin =
  | { kind: "tauri"; path: string }
  | { kind: "fsaccess"; handle: any }
  | { kind: "download"; name: string };

export interface OpenedFiles {
  parquet: Uint8Array;
  dict: string;
  /** Where a subsequent save should write back. */
  origin: SaveOrigin;
}

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** Prompt the user for a Parquet file and its dictionary, returning their bytes/text. */
export async function openFiles(): Promise<OpenedFiles> {
  if (isTauri()) {
    const parquetPath = await tauriOpenDialog({
      multiple: false,
      filters: [{ name: "Parquet", extensions: ["parquet"] }],
    });
    const dictPath = await tauriOpenDialog({
      multiple: false,
      filters: [{ name: "Dictionary", extensions: ["yaml", "yml"] }],
    });
    if (typeof parquetPath !== "string" || typeof dictPath !== "string") {
      throw new Error("File selection cancelled");
    }
    const parquet = await tauriReadFile(parquetPath);
    const dict = await tauriReadTextFile(dictPath);
    return { parquet, dict, origin: { kind: "tauri", path: parquetPath } };
  }

  // Browser fallback.
  const w = window as any;
  if (typeof w.showOpenFilePicker === "function") {
    const [parquetHandle] = await w.showOpenFilePicker({
      types: [{ description: "Parquet", accept: { "application/octet-stream": [".parquet"] } }],
    });
    const [dictHandle] = await w.showOpenFilePicker({
      types: [{ description: "Dictionary", accept: { "text/yaml": [".yaml", ".yml"] } }],
    });
    const parquetFile: File = await parquetHandle.getFile();
    const dictFile: File = await dictHandle.getFile();
    return {
      parquet: new Uint8Array(await parquetFile.arrayBuffer()),
      dict: await dictFile.text(),
      origin: { kind: "fsaccess", handle: parquetHandle },
    };
  }

  // Last resort: classic <input type=file> pickers.
  const parquetFile = await pickFile(".parquet");
  const dictFile = await pickFile(".yaml,.yml");
  return {
    parquet: new Uint8Array(await parquetFile.arrayBuffer()),
    dict: await dictFile.text(),
    origin: { kind: "download", name: parquetFile.name },
  };
}

/** Save bytes back to the original file in place (or re-export in the browser). */
export async function saveBytes(bytes: Uint8Array, origin: SaveOrigin): Promise<void> {
  switch (origin.kind) {
    case "tauri": {
      await tauriWriteFile(origin.path, bytes);
      return;
    }
    case "fsaccess": {
      const writable = await origin.handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return;
    }
    case "download": {
      downloadBytes(bytes, origin.name);
      return;
    }
  }
}

function pickFile(accept: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) resolve(file);
      else reject(new Error("No file selected"));
    };
    input.click();
  });
}

function downloadBytes(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
