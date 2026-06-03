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

// Compatibility is generous: a dictionary type accepts every Parquet physical encoding
// it can be read from (real files store ids/dates/quantities as INT32, etc.); values are
// coerced to the dictionary's canonical carrier on load.
function isCompatible(col: Column, found: Physical): boolean {
  const conv = found.converted ?? "";
  const t = found.type;
  const isTimestamp = conv.startsWith("TIMESTAMP");
  const isDate = conv === "DATE";
  const isInt = t === "INT32" || t === "INT64" || t === "INT96";
  const isFloat = t === "FLOAT" || t === "DOUBLE";
  const isText = t === "BYTE_ARRAY" || t === "FIXED_LEN_BYTE_ARRAY";
  switch (col.type) {
    case "string":
      return isText;
    case "enum":
      return isText || isInt; // text keys, or dictionary-encoded integer keys
    case "boolean":
      return t === "BOOLEAN";
    case "date":
      return (t === "INT32" && isDate) || isText; // DATE-encoded int, or ISO string
    case "datetime":
      return (isInt && isTimestamp) || t === "INT96" || isText;
    case "number":
      if (col.subtype === "id") return isInt || isText;
      if (col.subtype === "quantity") return isFloat || isInt;
      return isInt && !isTimestamp && !isDate; // ordinal: a plain integer
  }
}

function expectedLabel(col: Column): string {
  switch (col.type) {
    case "string":
      return "text";
    case "enum":
      return "category (text or integer key)";
    case "boolean":
      return "boolean";
    case "date":
      return "date (DATE int or text)";
    case "datetime":
      return "timestamp";
    case "number":
      if (col.subtype === "id") return "integer or text id";
      if (col.subtype === "quantity") return "number";
      return "integer";
  }
}

function foundLabel(found: Physical): string {
  return found.converted ? `${found.type} (${found.converted})` : found.type;
}
