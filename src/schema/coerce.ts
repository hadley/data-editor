// coerce.ts — convert values read from a Parquet file into the dictionary's canonical
// carrier for each column, regardless of how the file physically encoded them.
//   id        → string        (INT32 1 → "1")
//   ordinal   → bigint
//   quantity  → number
//   string    → string
//   enum      → string (key)
//   boolean   → boolean
//   date      → ISO "YYYY-MM-DD" string   (Date or days-since-epoch → string)
//   datetime  → Date
// This keeps the in-memory model, validation, editing, and writing consistent even when
// the source file used a different physical type than the tool's canonical one.

import type { CellValue, Column, Row } from "./types.ts";

export function coerceRows(columns: Column[], rows: Row[]): Row[] {
  return rows.map((row) => {
    const out: Row = {};
    for (const c of columns) out[c.name] = coerceValue(c, row[c.name] ?? null);
    return out;
  });
}

function coerceValue(c: Column, v: CellValue): CellValue {
  if (v === null || v === undefined || v === "") return null;
  switch (c.type) {
    case "number":
      if (c.subtype === "id") return typeof v === "string" ? v : String(v);
      if (c.subtype === "ordinal") return typeof v === "bigint" ? v : toBigIntOrText(v);
      return Number(v); // quantity
    case "string":
    case "enum":
      return typeof v === "string" ? v : String(v);
    case "boolean":
      return typeof v === "boolean" ? v : Boolean(v);
    case "date":
      if (v instanceof Date) return isoDate(v);
      if (typeof v === "number") return isoDate(new Date(v * 86_400_000)); // days since epoch
      return String(v);
    case "datetime":
      return v instanceof Date ? v : new Date(typeof v === "bigint" ? Number(v) : (v as string | number));
  }
}

function toBigIntOrText(v: CellValue): bigint | string {
  try {
    return typeof v === "number" ? BigInt(Math.trunc(v)) : BigInt(String(v));
  } catch {
    return String(v); // keep unparseable text so validation flags it
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
