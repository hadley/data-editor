// files.ts — the single runtime seam (research R5/R12).
//   Desktop (Tauri): native dialogs + in-place overwrite via the fs plugin.
//   Browser (dev):   handled in OpenPanel via <input type=file>; save re-exports (download).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { open as tauriOpenDialog } from "@tauri-apps/plugin-dialog";
import { readFile as tauriReadFile, readTextFile as tauriReadTextFile, writeFile as tauriWriteFile } from "@tauri-apps/plugin-fs";

export type SaveOrigin =
  | { kind: "tauri"; path: string }
  | { kind: "download"; name: string };

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** Tauri: pick a Parquet file, returning its bytes and a path to overwrite later. */
export async function openParquetTauri(): Promise<{ bytes: Uint8Array; origin: SaveOrigin }> {
  const path = await tauriOpenDialog({
    multiple: false,
    filters: [{ name: "Parquet", extensions: ["parquet"] }],
  });
  if (typeof path !== "string") throw new Error("File selection cancelled");
  const bytes = await tauriReadFile(path);
  return { bytes, origin: { kind: "tauri", path } };
}

/** Tauri: pick a dictionary file, returning its text. */
export async function openDictTauri(): Promise<string> {
  const path = await tauriOpenDialog({
    multiple: false,
    filters: [{ name: "Dictionary", extensions: ["yaml", "yml"] }],
  });
  if (typeof path !== "string") throw new Error("File selection cancelled");
  return tauriReadTextFile(path);
}

/** Save bytes back to the original file in place (Tauri) or re-export (browser). */
export async function saveBytes(bytes: Uint8Array, origin: SaveOrigin): Promise<void> {
  if (origin.kind === "tauri") {
    await tauriWriteFile(origin.path, bytes);
    return;
  }
  downloadBytes(bytes, origin.name);
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
