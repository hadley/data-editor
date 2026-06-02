# Implementation Plan: Data Entry Tool (v1)

**Branch**: `001-data-entry-tool` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-data-entry-tool/spec.md`

## Summary

A browser-based, spreadsheet-style editor for a single table of tabular data. The user opens a Parquet data file together with its `data-dict.yaml` dictionary; the dictionary is the single source of truth that drives the grid columns, per-cell validation, and the on-disk Parquet schema. The tool reconciles the two files at load time (hard error on mismatch), presents the data in a virtualized grid (or a single-record card view on phones), validates edits live, and writes the result back to Parquet losslessly.

The architectural keystone is a **single parsed `Column[]` model** fed into three **pure derivation functions** — `toArrow` (Parquet/Arrow schema), `toValidators` (per-cell + table-level validation), and `toColumns` (grid column definitions + cell kinds). Because all three read from one type table, the storage schema, validation, and UI cannot drift apart. The first milestone proves the riskiest data path (parse → reconcile → read → write → reread) with zero UI.

## Technical Context

**Language/Version**: TypeScript 5.x, ES2022 target

**Primary Dependencies**:
- React 18 + Vite (app shell, build/dev tooling)
- Glide Data Grid (canvas-rendered virtualized grid: keyboard nav, fill-down, Excel paste, frozen panes, per-column cell kinds)
- hyparquet (Parquet read) + hyparquet-writer (Parquet write), pure JS
- js-yaml (parse `data-dict.yaml`)
- Zod (per-column + table-level validators compiled from the type table)

**Storage**: Local files only — Parquet on disk (data) + `data-dict.yaml` (dictionary). No server, no database. Save overwrites the original file where the environment allows; otherwise re-exports the same file (see research.md R5).

**Testing**: Vitest (unit + integration for `schema/`, `io/`, validation, history); React Testing Library for component behavior; the Phase-0 round-trip harness doubles as the first integration test.

**Target Platform**: Modern evergreen browsers — desktop (primary) and tablet for the grid, phones for the card view. Forward-looking: a desktop wrapper (e.g., Electron) for reliable in-place overwrite and eventual per-row persistence.

**Project Type**: Single-page web application (frontend only).

**Performance Goals**: Responsive editing, scrolling, and live validation on datasets of ~10,000 rows (SC-006); grid scroll at ~60 fps via canvas virtualization; cross-row uniqueness checks debounced after typing pauses (FR-015).

**Constraints**: Lossless round-trip of column names, types, enum dictionaries, Int64 values (via BigInt — no precision loss past 2^53), and timezone-aware datetimes (FR-021). Reconciliation is a hard gate (FR-003–FR-006). Validation flags but never blocks edits (FR-016).

**Scale/Scope**: Single table, ~10k rows, 8 dictionary types, ~10 source modules across `schema/`, `grid/`, `cards/`, `io/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v0.1.0 — four principles:

| Principle | Assessment | Status |
|---|---|---|
| **I. Simplicity & YAGNI** | One parsed `Column[]` → three pure functions; no speculative abstraction. Every dependency maps to a concrete v1 requirement (grid → editing UX, hyparquet → Parquet IO, js-yaml → dictionary parse, Zod → validation). Multi-table, formulas, FK enforcement explicitly deferred. | ✅ PASS |
| **II. User Experience Consistency** | Grid and card view share one data + validation model (FR-029); standard spreadsheet keyboard/paste/fill semantics (FR-022–FR-026); validation messages are per-cell and actionable (FR-017); reconciliation errors name specifics (FR-004–FR-005). | ✅ PASS |
| **III. Data Integrity & Safety (NON-NEGOTIABLE)** | Reconciliation hard-gate before opening; lossless round-trip incl. BigInt + tz (FR-021); undo/redo (FR-026); warn+confirm on save-with-violations (FR-020); warn before discarding unsaved edits (FR-019a); validation flags, never silently mutates. | ✅ PASS |
| **IV. Quality Through Testing** | First milestone is a test-first round-trip proof before any UI; pure derivation functions are highly unit-testable; data-mutating logic (edits, undo/redo, write) covered by Vitest; round-trip fidelity is an automated test, not manual. | ✅ PASS |

No violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-data-entry-tool/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── dictionary-schema.md   # data-dict.yaml format + type mapping (input contract)
│   └── core-functions.md      # parse/toArrow/toValidators/toColumns/reconcile/IO signatures
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
src/
  schema/
    parse.ts          # js-yaml → typed DataDict (Column[]); normalizes enum list↔map
    toArrow.ts        # Column[] → Arrow/Parquet schema (the type table)
    toValidators.ts   # Column[] → Zod per-cell validators + table-level (unique, pk)
    toColumns.ts      # Column[] → Glide column defs + cell kinds
    reconcile.ts      # compare Parquet schema vs DataDict → ReconcileResult
    types.ts          # DataDict, Column, DictType, ReconcileError, Violation
  grid/
    DataGrid.tsx      # Glide Data Grid: virtualized, keyboard, paste, frozen panes
    cellValidation.ts # bind validators to cells; produce/aggregate violations
    history.ts        # undo/redo command stack
  cards/
    CardView.tsx      # phone single-record view over the shared model
  io/
    readParquet.ts    # file → { schema, rows }
    writeParquet.ts   # rows + Arrow schema → Parquet bytes (BigInt, tz-aware)
  state/
    workbook.ts       # shared data + validation model (grid & card consume this)
  App.tsx             # file load, reconciliation gate, save flow, responsive switch
  main.tsx

tests/
  schema/             # parse, toArrow, toValidators, toColumns, reconcile unit tests
  io/                 # round-trip fidelity (BigInt, enum dict, datetime/tz)
  integration/        # milestone round-trip; load→edit→save flows
  grid/               # history (undo/redo), cell validation

examples/
  foodbank.yaml       # sample dictionary
  foodbank.parquet    # sample data generated from it (round-trip fixture)
```

**Structure Decision**: Single frontend SPA. The `src/schema/` layer is framework-agnostic pure TypeScript (the consistency core) and is testable without React or a browser. `grid/`, `cards/`, and `io/` depend on it; `state/workbook.ts` is the one shared model both presentations bind to, satisfying FR-029. This mirrors the source spec's module layout, which the team has already vetted.

## Complexity Tracking

> No constitution violations. No entries required.
