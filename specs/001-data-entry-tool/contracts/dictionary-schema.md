# Contract: `data-dict.yaml` Dictionary Format (input)

This is the external input contract: the shape of the dictionary file the tool consumes. The dictionary is the single source of truth (FR-002). The tool reads it but does not define it (it follows the upstream `data-dict.yaml` convention); this document pins the subset v1 supports.

## Top-level shape

```yaml
name: foodbank            # optional table name
columns:                  # ordered list — drives grid order (FR-006)
  - name: client_id
    type: number
    subtype: id
    primary_key: true
  - name: visit_date
    type: date
    required: true
    range: { min: 2020-01-01, max: 2030-12-31 }
  - name: meals
    type: number
    subtype: quantity
    range: { min: 0 }
  - name: status
    type: enum
    values: { A: Active, I: Inactive }   # map form
  - name: region
    type: enum
    values: [north, south, east, west]   # list form
  - name: registered_at
    type: datetime
    # timezone-aware (R6)
```

## Per-column fields

| Field | Required? | Applies to | Meaning |
|---|---|---|---|
| `name` | yes | all | Column name; must reconcile with Parquet (FR-003) |
| `type` | yes | all | `number` \| `string` \| `boolean` \| `date` \| `datetime` \| `enum` |
| `subtype` | for `number` | `number` | `id` \| `ordinal` \| `quantity` |
| `range` | no | `number`, `date` | `{ min?, max? }`, inclusive (FR-010) |
| `values` | for `enum` | `enum` | list `[…]` or map `{key: label}` (FR-011) |
| `examples` | no | `string` | placeholder hints |
| `required` | no (default false) | all | non-null/non-empty (FR-012) |
| `unique` | no (default false) | all | distinct within column (FR-012) |
| `primary_key` | no (default false) | all | ⇒ required + unique; multi-col ⇒ tuple unique (FR-012) |
| `foreign_key` | no | all | `{ table, column }`; informational only in v1 (FR-013) |

## Type mapping (authoritative)

The single table read by `toArrow`, `toValidators`, and `toColumns`.

| Dictionary type | Arrow/Parquet physical | Carrier (JS) | Grid cell kind | Validation |
|---|---|---|---|---|
| `number` + `id` | Utf8 (default) / Int64 | `string` / `bigint` | Text/Number | opaque; no aggregation (FR-009) |
| `number` + `ordinal` | Int64 / Float64 | `bigint` / `number` | Number | inclusive `range` |
| `number` + `quantity` | Float64 | `number` | Number | inclusive `range` |
| `string` | Utf8 | `string` | Text | free text; `examples` as hint |
| `boolean` | Bool | `boolean` | Checkbox | true/false/null |
| `date` | Date32 | `Date` (date-only) | Date picker | `range` as date bounds |
| `datetime` | Timestamp(µs, tz) | instant + zone | Date-time picker | tz-aware (R6) |
| `enum` | Dictionary(Int32, Utf8) | `string` (key) | Dropdown | value ∈ `values`; show label, store key |

## Normalization rules (applied at parse time)

- **enum list ↔ map** → always `{value, label}[]`. List `[a,b]` ⇒ label=value. Map `{k: v}` ⇒ `{value:k, label:v}`. Dropdown displays `label`, stores `value` (FR-011).
- **`primary_key: true`** ⇒ treat as `required: true` and `unique: true` (FR-012).
- **`number(id)`** ⇒ default Utf8 storage unless declared/known fits under 2^53 (R7, FR-009).

## Error behavior

- Unknown `type`, missing `name`, or `enum` without `values` ⇒ parse error with the offending column named (fails loudly; Constitution III). The grid does not open on a parse error.
