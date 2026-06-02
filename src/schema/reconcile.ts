// reconcile.ts — load-time gate (FR-003–FR-007). Pure.
// Compares the Parquet physical schema against the dictionary's expected storage,
// using the same type table as toArrow so reconciliation and writing agree.
// Order-insensitive: column order alone is never a mismatch (FR-006).

import type { SchemaElementInfo } from "../io/readParquet.ts";
import type { Column, DataDict, ReconcileResult } from "./types.ts";

interface Physical {
  type: string;
  converted?: string;
}

export function reconcile(schemaElements: SchemaElementInfo[], dict: DataDict): ReconcileResult {
  const physical = new Map<string, Physical>();
  for (const e of schemaElements) {
    // The root element has no `type`; data columns do.
    if (e.type) physical.set(e.name, { type: e.type, converted: e.converted_type });
  }

  const dictNames = dict.columns.map((c) => c.name);
  const dictNameSet = new Set(dictNames);
  const fileNames = [...physical.keys()];

  const missingColumns = dictNames.filter((n) => !physical.has(n));
  const extraColumns = fileNames.filter((n) => !dictNameSet.has(n));

  let typeMismatch: ReconcileResult["typeMismatch"] = null;
  if (missingColumns.length === 0 && extraColumns.length === 0) {
    for (const col of dict.columns) {
      const found = physical.get(col.name)!;
      if (!isCompatible(col, found)) {
        typeMismatch = {
          column: col.name,
          expected: expectedLabel(col),
          found: foundLabel(found),
        };
        break;
      }
    }
  }

  const ok = missingColumns.length === 0 && extraColumns.length === 0 && typeMismatch === null;
  return { ok, missingColumns, extraColumns, typeMismatch };
}

function isCompatible(col: Column, found: Physical): boolean {
  const isTimestamp = (found.converted ?? "").startsWith("TIMESTAMP");
  switch (col.type) {
    case "string":
    case "date":
    case "enum":
      return found.type === "BYTE_ARRAY";
    case "number":
      if (col.subtype === "id") return found.type === "BYTE_ARRAY" || found.type === "INT64";
      if (col.subtype === "quantity") return found.type === "DOUBLE" || found.type === "FLOAT";
      // ordinal: a plain integer, not a timestamp masquerading as INT64
      return (found.type === "INT64" || found.type === "INT32") && !isTimestamp;
    case "boolean":
      return found.type === "BOOLEAN";
    case "datetime":
      return found.type === "INT64" && isTimestamp;
  }
}

function expectedLabel(col: Column): string {
  switch (col.type) {
    case "string":
    case "date":
    case "enum":
      return "string (BYTE_ARRAY/UTF8)";
    case "number":
      if (col.subtype === "id") return "string or integer";
      if (col.subtype === "quantity") return "number (DOUBLE)";
      return "integer (INT64)";
    case "boolean":
      return "boolean (BOOLEAN)";
    case "datetime":
      return "timestamp (INT64/TIMESTAMP)";
  }
}

function foundLabel(found: Physical): string {
  return found.converted ? `${found.type} (${found.converted})` : found.type;
}
