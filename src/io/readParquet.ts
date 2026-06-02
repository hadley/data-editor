// readParquet.ts — Parquet bytes → schema elements + typed rows.
// Int64 → bigint, TIMESTAMP → Date, UTF8 → string (per hyparquet behavior).

import { parquetMetadata, parquetReadObjects } from "hyparquet";
import type { Row } from "../schema/types.ts";

export interface SchemaElementInfo {
  name: string;
  type?: string;
  converted_type?: string;
  logical_type?: unknown;
}

export interface ReadResult {
  /** Physical schema (root element first), for reconciliation (US2). */
  schemaElements: SchemaElementInfo[];
  rows: Row[];
}

function toArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof Uint8Array) {
    return input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    ) as ArrayBuffer;
  }
  return input;
}

/** Read a Parquet file's schema and data. */
export async function readParquet(input: ArrayBuffer | Uint8Array): Promise<ReadResult> {
  const ab = toArrayBuffer(input);
  const meta = parquetMetadata(ab);
  const file = {
    byteLength: ab.byteLength,
    slice: (start: number, end?: number) => ab.slice(start, end),
  };
  const rows = (await parquetReadObjects({ file })) as Row[];
  const schemaElements: SchemaElementInfo[] = meta.schema.map((s) => ({
    name: s.name,
    type: s.type,
    converted_type: s.converted_type,
    logical_type: s.logical_type,
  }));
  return { schemaElements, rows };
}
