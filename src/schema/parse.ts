// parse.ts — js-yaml → typed, normalized DataDict (FR-002).
// Fails loudly with the offending column named (Constitution III).

import yaml from "js-yaml";
import type {
  Column,
  DataDict,
  DictBaseType,
  EnumValue,
  NumberSubtype,
  Range,
} from "./types.ts";

export class DictParseError extends Error {
  column?: string;
  constructor(message: string, column?: string) {
    super(column ? `Column "${column}": ${message}` : message);
    this.name = "DictParseError";
    this.column = column;
  }
}

const BASE_TYPES: readonly DictBaseType[] = [
  "number",
  "string",
  "boolean",
  "date",
  "datetime",
  "enum",
];
const SUBTYPES: readonly NumberSubtype[] = ["id", "ordinal", "quantity"];

/** Parse raw `data-dict.yaml` text into a normalized DataDict. */
export function parse(yamlText: string): DataDict {
  const doc = yaml.load(yamlText);
  if (doc === null || doc === undefined || typeof doc !== "object") {
    throw new DictParseError("dictionary must be a mapping with a `columns` list");
  }
  const root = doc as Record<string, unknown>;
  if (!Array.isArray(root.columns)) {
    throw new DictParseError("missing or invalid `columns` list");
  }

  const columns = root.columns.map((raw) => normalizeColumn(raw));
  const name = typeof root.name === "string" ? root.name : null;
  return { name, columns };
}

function normalizeColumn(raw: unknown): Column {
  if (raw === null || typeof raw !== "object") {
    throw new DictParseError("each column must be a mapping");
  }
  const c = raw as Record<string, unknown>;
  const name = c.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new DictParseError("missing `name`");
  }
  const type = c.type;
  if (typeof type !== "string" || !BASE_TYPES.includes(type as DictBaseType)) {
    throw new DictParseError(`unknown or missing type "${String(type)}"`, name);
  }
  const dictType = type as DictBaseType;

  let subtype: NumberSubtype | null = null;
  if (dictType === "number") {
    const st = c.subtype;
    if (typeof st !== "string" || !SUBTYPES.includes(st as NumberSubtype)) {
      throw new DictParseError(
        `number requires subtype one of ${SUBTYPES.join("/")}`,
        name,
      );
    }
    subtype = st as NumberSubtype;
  }

  let values: EnumValue[] | null = null;
  if (dictType === "enum") {
    values = normalizeEnumValues(c.values, name);
  }

  const primary_key = c.primary_key === true;
  const required = c.required === true || primary_key; // pk ⇒ required
  const unique = c.unique === true || primary_key; // pk ⇒ unique

  return {
    name,
    type: dictType,
    subtype,
    range: normalizeRange(c.range),
    values,
    examples: normalizeExamples(c.examples),
    required,
    unique,
    primary_key,
    foreign_key: normalizeForeignKey(c.foreign_key),
  };
}

/** `[M, F]` or `{M: Male, F: Female}` → `{value, label}[]` (FR-011). */
function normalizeEnumValues(raw: unknown, column: string): EnumValue[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => ({ value: String(v), label: String(v) }));
  }
  if (raw !== null && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([value, label]) => ({
      value,
      label: String(label),
    }));
  }
  throw new DictParseError("enum requires a `values` list or map", column);
}

function normalizeRange(raw: unknown): Range | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const range: Range = {};
  if (typeof r.min === "number" || typeof r.min === "string") range.min = r.min;
  if (typeof r.max === "number" || typeof r.max === "string") range.max = r.max;
  return Object.keys(range).length > 0 ? range : null;
}

function normalizeExamples(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((e) => String(e));
}

function normalizeForeignKey(raw: unknown): { table: string; column: string } | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const fk = raw as Record<string, unknown>;
  if (typeof fk.table === "string" && typeof fk.column === "string") {
    return { table: fk.table, column: fk.column };
  }
  return null;
}
