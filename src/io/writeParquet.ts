// writeParquet.ts — rows + derived schema → Parquet bytes (FR-021).
// Lossless for column names, types, BigInt (Int64), datetime instants, and enum keys.

import { parquetWriteBuffer } from "hyparquet-writer";
import type { ArrowSchema, Row } from "../schema/types.ts";

/** Serialize rows to Parquet using the dictionary-derived schema. */
export function writeParquet(rows: Row[], schema: ArrowSchema): Uint8Array {
  const columnData = schema.map((spec) => ({
    name: spec.name,
    type: spec.basicType,
    nullable: spec.nullable,
    data: rows.map((r) => (r[spec.name] === undefined ? null : r[spec.name])),
  }));
  const buffer = parquetWriteBuffer({ columnData });
  return new Uint8Array(buffer);
}
