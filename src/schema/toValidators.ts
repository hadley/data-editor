// toValidators.ts — Column[] → per-cell + table-level validators (FR-012, FR-015). Pure.
// Per-cell rules (type/range/required/enum) use Zod schemas built from the type table;
// table-level rules (unique, primary-key tuple) are a separate pass run debounced (R8).

import { z } from "zod";
import type { Column, CellValue, Row, Violation, ViolationRule } from "./types.ts";

export interface CellIssue {
  rule: ViolationRule;
  message: string;
}

export interface Validators {
  /** Validate one value against its column's per-cell rules. */
  validateCell(col: string, value: CellValue): CellIssue | null;
  /** Validate cross-row rules (unique, primary-key tuple). */
  validateTable(rows: Row[]): Violation[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toValidators(columns: Column[]): Validators {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const schemas = new Map(columns.map((c) => [c.name, buildSchema(c)]));
  const pkCols = columns.filter((c) => c.primary_key);
  const uniqueCols = columns.filter((c) => c.unique && !c.primary_key);

  function validateCell(col: string, value: CellValue): CellIssue | null {
    const c = byName.get(col);
    if (!c) return null;
    const empty = value === null || value === undefined || value === "";
    if (empty) {
      return c.required ? { rule: "required", message: `${col} is required` } : null;
    }
    const res = schemas.get(col)!.safeParse(value);
    if (res.success) return null;
    const issue = res.error.issues[0];
    return { rule: ruleOf(issue), message: issue.message };
  }

  function validateTable(rows: Row[]): Violation[] {
    const out: Violation[] = [];

    // Per-column uniqueness (non-pk columns flagged unique).
    for (const c of uniqueCols) {
      flagDuplicates(rows, [c.name], "unique", `${c.name} must be unique`, out);
    }

    // Primary key: single or composite tuple uniqueness.
    if (pkCols.length > 0) {
      const names = pkCols.map((c) => c.name);
      const label =
        names.length === 1
          ? `${names[0]} must be unique (primary key)`
          : `(${names.join(", ")}) must be a unique combination (primary key)`;
      flagDuplicates(rows, names, "primary_key", label, out);
    }

    return out;
  }

  return { validateCell, validateTable };
}

/** Flag every row whose value(s) for `cols` duplicate another row's. */
function flagDuplicates(
  rows: Row[],
  cols: string[],
  rule: ViolationRule,
  message: string,
  out: Violation[],
): void {
  const seen = new Map<string, number[]>();
  rows.forEach((row, i) => {
    // Skip tuples with any null part — incompleteness is a `required` concern, not uniqueness.
    if (cols.some((c) => row[c] === null || row[c] === undefined || row[c] === "")) return;
    const key = cols.map((c) => stableKey(row[c])).join("");
    const list = seen.get(key);
    if (list) list.push(i);
    else seen.set(key, [i]);
  });
  for (const indices of seen.values()) {
    if (indices.length > 1) {
      for (const i of indices) {
        for (const c of cols) out.push({ cell: { row: i, col: c }, rule, message });
      }
    }
  }
}

function stableKey(v: CellValue): string {
  if (typeof v === "bigint") return "b:" + v.toString();
  if (v instanceof Date) return "d:" + v.getTime();
  return "v:" + String(v);
}

function buildSchema(c: Column): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (c.type) {
    case "number":
      if (c.subtype === "ordinal") base = z.bigint({ message: "must be a whole number" });
      else if (c.subtype === "quantity")
        base = z.number({ message: "must be a number" }).refine(Number.isFinite, "must be a number");
      else base = z.string({ message: "must be text" }); // id
      break;
    case "string":
      base = z.string({ message: "must be text" });
      break;
    case "boolean":
      base = z.boolean({ message: "must be true or false" });
      break;
    case "date":
      base = z
        .string({ message: "must be a date" })
        .refine((v) => ISO_DATE.test(v), { params: { rule: "type" }, message: "must be YYYY-MM-DD" });
      break;
    case "datetime":
      base = z.date({ message: "must be a date-time" });
      break;
    case "enum": {
      const allowed = new Set((c.values ?? []).map((e) => e.value));
      const labels = (c.values ?? []).map((e) => e.value).join(", ");
      base = z
        .string({ message: "must be text" })
        .refine((v) => allowed.has(v), { params: { rule: "enum" }, message: `must be one of: ${labels}` });
      break;
    }
  }

  if (c.range && (c.type === "number" || c.type === "date")) {
    const { min, max } = c.range;
    base = base.refine((v) => inRange(v as CellValue, min, max), {
      params: { rule: "range" },
      message: rangeMessage(min, max),
    });
  }
  return base;
}

function inRange(v: CellValue, min: unknown, max: unknown): boolean {
  if (typeof v === "bigint") {
    if (min !== undefined && v < BigInt(Math.trunc(Number(min)))) return false;
    if (max !== undefined && v > BigInt(Math.trunc(Number(max)))) return false;
    return true;
  }
  if (typeof v === "number") {
    if (min !== undefined && v < Number(min)) return false;
    if (max !== undefined && v > Number(max)) return false;
    return true;
  }
  if (typeof v === "string") {
    // ISO dates compare lexicographically.
    if (min !== undefined && v < String(min)) return false;
    if (max !== undefined && v > String(max)) return false;
    return true;
  }
  return true;
}

function rangeMessage(min: unknown, max: unknown): string {
  if (min !== undefined && max !== undefined) return `must be between ${min} and ${max}`;
  if (min !== undefined) return `must be at least ${min}`;
  return `must be at most ${max}`;
}

function ruleOf(issue: z.ZodIssue): ViolationRule {
  const params = (issue as { params?: { rule?: ViolationRule } }).params;
  if (params?.rule) return params.rule;
  if (issue.code === "too_small" || issue.code === "too_big") return "range";
  return "type";
}
