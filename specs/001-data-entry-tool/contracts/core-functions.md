# Contract: Core Functions (internal module interfaces)

These are the internal contracts that guarantee schema/validation/UI consistency. The three derivation functions are **pure** over the same `Column[]`. Signatures are TypeScript-flavored intent, not final code.

## `schema/parse.ts`

```ts
parse(yamlText: string): DataDict
```

- **Input**: raw `data-dict.yaml` text.
- **Output**: typed `DataDict` with normalized `Column[]` (enum list↔map, primary_key⇒required+unique).
- **Throws**: `DictParseError { column?, message }` on unknown type, missing name, enum without values.
- **Pure**: yes (no I/O).

## `schema/toArrow.ts`

```ts
toArrow(columns: Column[]): ArrowSchema
```

- Maps each column to its Arrow/Parquet physical type per the type table.
- `number(id)` → Utf8 by default; `Int64` carriers flagged for BigInt handling; `datetime` → `Timestamp(µs, tz)`; `enum` → `Dictionary(Int32, Utf8)`.
- **Pure**: yes. Used by both reconciliation (expected types) and writing.

## `schema/toValidators.ts`

```ts
toValidators(columns: Column[]): {
  cell: Record<columnName, ZodSchema>          // per-cell: type, range, required, enum
  table: (rows: Row[]) => Violation[]          // cross-row: unique, primary_key tuple
}
```

- Per-cell validators run immediately on edit; `table` validator runs debounced (R8).
- **Pure**: yes (validators are data; running them has no side effects).

## `schema/toColumns.ts`

```ts
toColumns(columns: Column[]): GridColumn[]   // Glide column defs + cell kinds
```

- Assigns each column a cell kind per the type table (Text/Number/Checkbox/Date/Dropdown).
- enum dropdown options = `EnumValue[]` (display label, store value).
- **Pure**: yes.

## `schema/reconcile.ts`

```ts
reconcile(parquetSchema: ArrowSchema, dict: DataDict): ReconcileResult
```

- Compares column **set** (missing/extra by name) and **types** (first incompatible: expected vs found) using the same type table as `toArrow`.
- **Order-insensitive** (FR-006). `ok=true` iff no missing, no extra, no type mismatch.
- **Pure**: yes. Gate: grid opens only when `ok=true` (FR-007).

## `io/readParquet.ts`

```ts
readParquet(file: File | ArrayBuffer): Promise<{ schema: ArrowSchema; rows: Row[] }>
```

- Reads schema (for reconciliation) and data.
- Int64 → `bigint`; Timestamp → instant+zone; Dictionary → key strings (R6, R7).

## `io/writeParquet.ts`

```ts
writeParquet(rows: Row[], schema: ArrowSchema): Uint8Array
```

- Writes using the dictionary-derived schema, preserving column names, types, enum dictionaries, BigInt values, and datetime+tz (FR-021, SC-001).
- Round-trip invariant: `readParquet(writeParquet(rows, toArrow(cols)))` returns rows equal to input (the milestone test).

## `platform/files.ts` save boundary

```ts
openFiles(): Promise<{ parquet: ArrayBuffer; dict: string; origin: FileRef }>
save(bytes: Uint8Array, origin: FileRef): Promise<SaveResult>
```

- **Desktop (Tauri, primary)**: `save` overwrites `origin` in place via the Tauri filesystem API (R5, R12, FR-019).
- **Browser (dev fallback)**: File System Access handle where available, else re-export the same file.
- The single seam that differs by runtime; the core (`schema/`, `grid/`, `cards/`, `state/`) is runtime-agnostic and never imports Tauri directly.

## `grid/history.ts`

```ts
type Command = { apply(): void; invert(): void; kind: 'setCell'|'addRow'|'paste'|'fillDown' }
class CommandStack { push(c: Command): void; undo(): void; redo(): void }
```

- Every data mutation goes through a `Command` (Constitution III reversibility; FR-026).

## Consistency invariant (the contract that ties it together)

For any `columns: Column[]`:
`reconcile(toArrow(columns), dict).ok === true` for a freshly written file, AND
the cell kinds in `toColumns(columns)` accept exactly the values the `toValidators(columns).cell` schemas consider valid for each type.

Violating this invariant is a contract breach, caught by the `tests/schema/` suite.
