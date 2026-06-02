// toArrow.ts — Column[] → storage schema (the type table). Pure.
// Read by writeParquet (and reconcile, US2) so storage cannot drift from the dictionary.
//
// v1 physical mapping (see research R2 + probe results):
//   number(id)       → STRING   (opaque; avoids int64 precision loss, FR-009)
//   number(ordinal)  → INT64    (carrier: bigint, exact past 2^53, FR-021/R7)
//   number(quantity) → DOUBLE   (carrier: number)
//   string           → STRING
//   boolean          → BOOLEAN
//   date             → STRING   (ISO YYYY-MM-DD; lossless v1 choice)
//   datetime         → TIMESTAMP(millis) (carrier: Date; tz-aware instant, R6)
//   enum             → STRING   (stores the key; label is presentation-only, FR-011)

import type { ArrowSchema, BasicType, Column, ColumnSpec } from "./types.ts";

export function toArrow(columns: Column[]): ArrowSchema {
  return columns.map(toColumnSpec);
}

function toColumnSpec(c: Column): ColumnSpec {
  return {
    name: c.name,
    dictType: c.type,
    subtype: c.subtype,
    basicType: basicTypeFor(c),
    // Storage is always nullable: `required` is enforced by validation (US3), not by
    // the physical schema, because the tool permits saving flagged-invalid data
    // (with confirmation, FR-020). Forcing non-nullable storage would corrupt a file
    // that legitimately contains an in-progress null (e.g. a freshly added row).
    nullable: true,
  };
}

export function basicTypeFor(c: Column): BasicType {
  switch (c.type) {
    case "number":
      if (c.subtype === "id") return "STRING";
      if (c.subtype === "quantity") return "DOUBLE";
      return "INT64"; // ordinal
    case "string":
      return "STRING";
    case "boolean":
      return "BOOLEAN";
    case "date":
      return "STRING";
    case "datetime":
      return "TIMESTAMP";
    case "enum":
      return "STRING";
  }
}
