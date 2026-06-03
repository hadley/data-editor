// Shared types — the single source of truth for the data model (data-model.md).

/** Closed dictionary type vocabulary. */
export type DictBaseType = "number" | "string" | "boolean" | "date" | "datetime" | "enum";

/** Refines `number`. */
export type NumberSubtype = "id" | "ordinal" | "quantity";

/** Normalized enum option: dropdown shows `label`, storage keeps `value`. */
export interface EnumValue {
  value: string;
  label: string;
}

export interface ForeignKeyRef {
  table: string;
  column: string;
}

export interface Range {
  min?: number | string;
  max?: number | string;
}

/** One column definition, normalized from the dictionary. */
export interface Column {
  name: string;
  type: DictBaseType;
  subtype: NumberSubtype | null;
  range: Range | null;
  values: EnumValue[] | null;
  examples: string[] | null;
  required: boolean;
  unique: boolean;
  primary_key: boolean;
  foreign_key: ForeignKeyRef | null;
}

/** Parsed dictionary — authoritative description of the table. */
export interface DataDict {
  name: string | null;
  /** Data file(s) this dictionary describes, if declared (FR-038). */
  source: string[];
  columns: Column[];
}

/** Carrier types for cell values. Int64 → bigint; datetime → Date; date → ISO string (v1). */
export type CellValue = string | number | bigint | boolean | Date | null;

export type Row = Record<string, CellValue>;

export interface CellRef {
  row: number;
  col: string;
}

/**
 * Physical storage type (subset of hyparquet-writer BasicType) the v1 type table
 * maps each dictionary type onto.
 */
export type BasicType = "STRING" | "INT64" | "DOUBLE" | "BOOLEAN" | "TIMESTAMP";

/** One column's storage spec — output of `toArrow`. */
export interface ColumnSpec {
  name: string;
  dictType: DictBaseType;
  subtype: NumberSubtype | null;
  basicType: BasicType;
  nullable: boolean;
}

/** The derived storage schema (Parquet/Arrow). */
export type ArrowSchema = ColumnSpec[];

/** Result of the load-time reconciliation gate. */
export interface ReconcileResult {
  ok: boolean;
  missingColumns: string[];
  extraColumns: string[];
  typeMismatch: { column: string; expected: string; found: string } | null;
}

export type ViolationRule = "type" | "range" | "required" | "enum" | "unique" | "primary_key";

export interface Violation {
  cell: CellRef | { col: string };
  rule: ViolationRule;
  message: string;
}
