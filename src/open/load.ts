// load.ts — turn a data-dict.yaml into one loaded table per `tables:` entry, reading each
// table's `source` relative to the dictionary's directory.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { readFile as tauriReadFile } from "@tauri-apps/plugin-fs";
import { parseTables } from "../schema/parse.ts";
import { resolveSourcePath } from "../platform/paths.ts";
import type { SaveOrigin } from "../platform/files.ts";
import type { DataDict } from "../schema/types.ts";

export interface LoadedTable {
  dict: DataDict;
  bytes: Uint8Array;
  origin: SaveOrigin;
}

/** Desktop: resolve + read every table's source against the dictionary's path. */
export async function loadTablesTauri(dictText: string, dictPath: string): Promise<LoadedTable[]> {
  const out: LoadedTable[] = [];
  for (const dict of parseTables(dictText)) {
    const src = dict.source[0];
    if (!src) throw new Error(`Table "${dict.name ?? "?"}" has no source file in the dictionary.`);
    const path = resolveSourcePath(dictPath, src);
    out.push({ dict, bytes: await tauriReadFile(path), origin: { kind: "tauri", path } });
  }
  return out;
}

/** Browser: resolve each table's source within a chosen directory handle (File System Access). */
export async function loadTablesFromDir(dictText: string, dir: any): Promise<LoadedTable[]> {
  const out: LoadedTable[] = [];
  for (const dict of parseTables(dictText)) {
    const src = dict.source[0];
    if (!src) throw new Error(`Table "${dict.name ?? "?"}" has no source file in the dictionary.`);
    const file = await fileFromDir(dir, src);
    const bytes = new Uint8Array(await file.arrayBuffer());
    out.push({ dict, bytes, origin: { kind: "download", name: src.split("/").pop() ?? "data.parquet" } });
  }
  return out;
}

async function fileFromDir(dir: any, relPath: string): Promise<File> {
  const parts = relPath.split("/").filter((p) => p && p !== ".");
  let handle = dir;
  for (let i = 0; i < parts.length - 1; i++) handle = await handle.getDirectoryHandle(parts[i]);
  const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
  return fileHandle.getFile();
}
