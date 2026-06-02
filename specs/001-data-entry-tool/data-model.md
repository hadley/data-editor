# Phase 1 Data Model: Data Entry Tool (v1)

Derived from the spec's Key Entities and Functional Requirements. The `DataDict`/`Column[]` model is the single source of truth; everything else (Arrow schema, validators, grid columns) is a pure derivation of it.

## Entity: DataDict

The parsed dictionary — the authoritative description of the table.

| Field | Type | Notes |
|---|---|---|
| `columns` | `Column[]` | Ordered; defines grid order regardless of Parquet order (FR-006) |
| `name` | `string?` | Optional table name from the dictionary |

- Produced by `parse(yamlText)` (FR-002).
- Order of `columns` is significant for presentation.

## Entity: Column

One column definition. The closed type vocabulary and constraints live here.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Must match a Parquet column name during reconciliation |
| `type` | `DictType` | One of the closed vocabulary (below) |
| `subtype` | `'id' \| 'ordinal' \| 'quantity' \| null` | For `number` only; `id` is opaque (FR-009) |
| `range` | `{ min?: number\|string; max?: number\|string } \| null` | Inclusive bounds; numbers for numeric, ISO dates for `date` (FR-010) |
| `values` | `EnumValue[] \| null` | For `enum`; normalized from list or map (FR-011) |
| `examples` | `string[] \| null` | Shown as placeholder/hint for `string` |
| `required` | `boolean` | No null/empty (FR-012) |
| `unique` | `boolean` | Distinct within column (FR-012) |
| `primary_key` | `boolean` | Implies required + unique; multi-column ⇒ tuple uniqueness (FR-012) |
| `foreign_key` | `ForeignKeyRef \| null` | v1: informational only, not enforced (FR-013) |

### `DictType` (closed vocabulary)

`number` · `string` · `boolean` · `date` · `datetime` · `enum`
(`number` is refined by `subtype`: `id` / `ordinal` / `quantity`.)

### Entity: EnumValue (normalized)

| Field | Type | Notes |
|---|---|---|
| `value` | `string` | The stored key (written to Parquet) |
| `label` | `string` | Shown to the user; equals `value` when the dictionary gave a plain list (FR-011) |

Normalization rule: `[M, F, U]` → `[{value:'M',label:'M'}, …]`; `{M: Male, F: Female}` → `[{value:'M',label:'Male'}, …]`.

### Entity: ForeignKeyRef

| Field | Type | Notes |
|---|---|---|
| `table` | `string` | Referenced table |
| `column` | `string` | Referenced column |

Surfaced in the UI as informational; **not validated** in v1 (single table loaded).

## Entity: Dataset (Workbook)

The in-memory editing state both presentations bind to (`state/workbook.ts`, FR-029).

| Field | Type | Notes |
|---|---|---|
| `dict` | `DataDict` | The reconciled dictionary |
| `rows` | `Row[]` | Editable records |
| `violations` | `Map<CellRef, Violation[]>` | Current validation state |
| `dirty` | `boolean` | Unsaved edits exist → drives unsaved-edit guard (FR-019a) |
| `history` | `CommandStack` | Undo/redo (FR-026) |

## Entity: Row / Cell

| Concept | Representation | Notes |
|---|---|---|
| `Row` | `Record<columnName, CellValue>` | One record |
| `CellValue` | `string \| number \| bigint \| boolean \| Date \| null` | Carrier type per column type; Int64 ⇒ `bigint` (R7); datetime ⇒ instant+zone (R6) |
| `CellRef` | `{ row: number; col: string }` | Addresses a cell |

## Entity: ReconcileResult

Output of the load-time gate (`reconcile`, FR-003–FR-007).

| Field | Type | Notes |
|---|---|---|
| `ok` | `boolean` | True ⇒ grid may open |
| `missingColumns` | `string[]` | In dict, absent from Parquet (FR-004) |
| `extraColumns` | `string[]` | In Parquet, absent from dict (FR-004) |
| `typeMismatch` | `{ column: string; expected: string; found: string } \| null` | First incompatible column (FR-005) |

`ok` is true iff `missingColumns`, `extraColumns` are empty and `typeMismatch` is null. Column order differences alone do **not** set `ok=false` (FR-006).

## Entity: Violation

| Field | Type | Notes |
|---|---|---|
| `cell` | `CellRef \| { col: string }` | Cell-level or column-level (unique/pk) |
| `rule` | `'type' \| 'range' \| 'required' \| 'enum' \| 'unique' \| 'primary_key'` | Which rule failed |
| `message` | `string` | Actionable, shown on focus/hover (FR-017) |

The outstanding-violations count (FR-018) = total `Violation`s across the workbook.

## Entity: Command (undo/redo)

| Field | Type | Notes |
|---|---|---|
| `apply()` | `fn` | Performs the mutation |
| `invert()` | `fn` | Reverses it |
| `kind` | `'setCell' \| 'addRow' \| 'paste' \| 'fillDown'` | Covers single and bulk edits (R9) |

## Derivation map (single source of truth)

```text
yamlText ──parse──▶ DataDict (Column[])
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼                ▼
   toArrow()      toValidators()    toColumns()
   Arrow schema   Zod + table       Glide column
   (read/write)   rules             defs + cell kinds
```

All three consume the same `Column[]`, which is what makes the Parquet schema, the validation, and the grid presentation provably consistent (Constitution I & III).

## Lifecycle / state transitions

```text
[No file] ──open(parquet, yaml)──▶ parse + readSchema ──reconcile──▶
   ├─ ok=false ─▶ [Error screen] (grid never opens; FR-007)
   └─ ok=true  ─▶ readData ─▶ [Editing] ⇄ edit/undo/redo (validation live)
                                   │
                                   └─ save ─▶ (violations? warn+confirm; FR-020)
                                              writeParquet ─▶ [Saved] (dirty=false)
```

Guard: leaving `[Editing]` with `dirty=true` triggers the unsaved-edit warning (FR-019a).
