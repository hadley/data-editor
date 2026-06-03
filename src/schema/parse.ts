// parse.ts — js-yaml → typed, normalized DataDict(s). Fails loudly with the offending
// column named (Constitution III). Supports two dictionary shapes:
//   • single-table: top-level `columns:` (with `subtype:`, boolean constraints, `range: {min,max}`)
//   • multi-table:  `tables: { name: { source, columns } }` with `type: number(id)`,
//     `constraints: [primary_key, required, unique, foreign_key]`, `range: [min,max]`,
//     `source: { parquet: path }`, and a top-level `relationships:` list.
// Both column syntaxes are accepted everywhere.

import yaml from "js-yaml";
import type {
  Column,
  DataDict,
  DictBaseType,
  EnumValue,
  ForeignKeyRef,
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

const BASE_TYPES: readonly DictBaseType[] = ["number", "string", "boolean", "date", "datetime", "enum"];
const SUBTYPES: readonly NumberSubtype[] = ["id", "ordinal", "quantity"];

type FkResolver = (columnName: string) => ForeignKeyRef | null;

/** Parse a single-table dictionary (top-level `columns:`). */
export function parse(yamlText: string): DataDict {
  const root = loadRoot(yamlText);
  if (!Array.isArray(root.columns)) {
    throw new DictParseError("missing or invalid `columns` list");
  }
  return buildTable(typeof root.name === "string" ? root.name : null, root, () => null);
}

/**
 * Parse a dictionary into one DataDict per table. A `tables:` map yields one entry per
 * table (with foreign-key targets resolved from `relationships:`); a single-table dict
 * yields a one-element array.
 */
export function parseTables(yamlText: string): DataDict[] {
  const root = loadRoot(yamlText);
  if (root.tables && typeof root.tables === "object" && !Array.isArray(root.tables)) {
    const fkByCol = parseRelationships(root.relationships);
    return Object.entries(root.tables as Record<string, unknown>).map(([name, raw]) => {
      if (raw === null || typeof raw !== "object") {
        throw new DictParseError(`table "${name}" must be a mapping`);
      }
      const t = raw as Record<string, unknown>;
      const resolve: FkResolver = (col) => fkByCol.get(`${name}.${col}`) ?? null;
      return buildTable(name, t, resolve);
    });
  }
  return [parse(yamlText)];
}

function loadRoot(yamlText: string): Record<string, unknown> {
  const doc = yaml.load(yamlText);
  if (doc === null || doc === undefined || typeof doc !== "object") {
    throw new DictParseError("dictionary must be a mapping");
  }
  return doc as Record<string, unknown>;
}

function buildTable(name: string | null, t: Record<string, unknown>, resolveFk: FkResolver): DataDict {
  if (!Array.isArray(t.columns)) {
    throw new DictParseError(`table${name ? ` "${name}"` : ""} has no \`columns\` list`);
  }
  const columns = t.columns.map((raw) => normalizeColumn(raw, resolveFk));
  return {
    name,
    description: typeof t.description === "string" ? t.description.trim() : null,
    source: normalizeSource(t.source),
    columns,
  };
}

/** Map "table.column" (the FK side) → the referenced { table, column }, from `relationships`. */
function parseRelationships(raw: unknown): Map<string, ForeignKeyRef> {
  const map = new Map<string, ForeignKeyRef>();
  if (!Array.isArray(raw)) return map;
  for (const rel of raw) {
    const join = (rel as Record<string, unknown>)?.join;
    if (typeof join !== "string") continue;
    const [left, right] = join.split("=").map((s) => s.trim());
    const l = splitRef(left);
    const r = splitRef(right);
    if (l && r) map.set(`${l.table}.${l.column}`, { table: r.table, column: r.column });
  }
  return map;
}

function splitRef(ref: string | undefined): { table: string; column: string } | null {
  if (!ref) return null;
  const dot = ref.indexOf(".");
  if (dot < 0) return null;
  return { table: ref.slice(0, dot), column: ref.slice(dot + 1) };
}

/** `source` may be a string, a list, or `{ parquet: string | list }`; normalize to string[]. */
function normalizeSource(raw: unknown): string[] {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  if (raw !== null && typeof raw === "object") {
    return normalizeSource((raw as Record<string, unknown>).parquet);
  }
  return [];
}

function normalizeColumn(raw: unknown, resolveFk: FkResolver): Column {
  if (raw === null || typeof raw !== "object") {
    throw new DictParseError("each column must be a mapping");
  }
  const c = raw as Record<string, unknown>;
  const name = c.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new DictParseError("missing `name`");
  }

  const { base, subtype } = parseType(c, name);
  const values = base === "enum" ? normalizeEnumValues(c.values, name) : null;
  const flags = parseConstraints(c);
  const isForeignKey = flags.foreign_key || normalizeInlineForeignKey(c.foreign_key) !== null;

  return {
    name,
    type: base,
    subtype,
    range: normalizeRange(c.range),
    values,
    examples: normalizeExamples(c.examples),
    required: flags.required || flags.primary_key,
    unique: flags.unique || flags.primary_key,
    primary_key: flags.primary_key,
    foreign_key: isForeignKey
      ? (normalizeInlineForeignKey(c.foreign_key) ?? resolveFk(name) ?? { table: "", column: "" })
      : null,
    description: typeof c.description === "string" ? c.description.trim() : null,
  };
}

/** Parse `type` — either "number(id)" / "enum" / … or a bare base type with separate `subtype:`. */
function parseType(c: Record<string, unknown>, name: string): { base: DictBaseType; subtype: NumberSubtype | null } {
  const type = c.type;
  if (typeof type !== "string") {
    throw new DictParseError(`unknown or missing type "${String(type)}"`, name);
  }
  const paren = type.match(/^(\w+)\(([^)]+)\)$/);
  const baseStr = (paren ? paren[1] : type).trim();
  if (!BASE_TYPES.includes(baseStr as DictBaseType)) {
    throw new DictParseError(`unknown or missing type "${type}"`, name);
  }
  const base = baseStr as DictBaseType;
  if (base !== "number") return { base, subtype: null };

  const subStr = paren ? paren[2].trim() : typeof c.subtype === "string" ? c.subtype : "";
  if (!SUBTYPES.includes(subStr as NumberSubtype)) {
    throw new DictParseError(`number requires a subtype one of ${SUBTYPES.join("/")}`, name);
  }
  return { base, subtype: subStr as NumberSubtype };
}

/** Constraints from a `constraints: [...]` list or from boolean fields. */
function parseConstraints(c: Record<string, unknown>): {
  required: boolean;
  unique: boolean;
  primary_key: boolean;
  foreign_key: boolean;
} {
  if (Array.isArray(c.constraints)) {
    const set = new Set(c.constraints.map((x) => String(x)));
    return {
      required: set.has("required"),
      unique: set.has("unique"),
      primary_key: set.has("primary_key"),
      foreign_key: set.has("foreign_key"),
    };
  }
  return {
    required: c.required === true,
    unique: c.unique === true,
    primary_key: c.primary_key === true,
    foreign_key: false,
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

/** `{min, max}` or `[min, max]` → Range. */
function normalizeRange(raw: unknown): Range | null {
  const ok = (v: unknown): v is number | string => typeof v === "number" || typeof v === "string";
  if (Array.isArray(raw)) {
    const range: Range = {};
    if (ok(raw[0])) range.min = raw[0];
    if (ok(raw[1])) range.max = raw[1];
    return Object.keys(range).length > 0 ? range : null;
  }
  if (raw !== null && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const range: Range = {};
    if (ok(r.min)) range.min = r.min;
    if (ok(r.max)) range.max = r.max;
    return Object.keys(range).length > 0 ? range : null;
  }
  return null;
}

function normalizeExamples(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((e) => String(e));
}

function normalizeInlineForeignKey(raw: unknown): ForeignKeyRef | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const fk = raw as Record<string, unknown>;
  if (typeof fk.table === "string" && typeof fk.column === "string") {
    return { table: fk.table, column: fk.column };
  }
  return null;
}
