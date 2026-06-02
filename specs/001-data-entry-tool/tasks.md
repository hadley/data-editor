---
description: "Task list for Data Entry Tool (v1) implementation"
---

# Tasks: Data Entry Tool (v1)

**Input**: Design documents from `specs/001-data-entry-tool/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED. The constitution (IV. Quality Through Testing) and the spec's Milestone-0 mandate test-first coverage for the schema/IO consistency core and all data-mutating logic.

**Organization**: Tasks are grouped by user story (P1–P5) so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 (user story phases only)
- Exact file paths are included in each task.

## Path Conventions

Tauri desktop app with a web frontend (per plan.md): frontend in `src/`, Rust shell in `src-tauri/`, tests in `tests/`, fixtures in `examples/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and toolchain

- [x] T001 Scaffold Vite + React + TypeScript app and create the directory tree (`src/schema/`, `src/grid/`, `src/cards/`, `src/io/`, `src/state/`, `src/platform/`, `tests/`, `examples/`) per plan.md
- [x] T002 Install runtime dependencies (`@glideapps/glide-data-grid`, `hyparquet`, `hyparquet-writer`, `js-yaml`, `zod`) and dev dependencies (`vitest`, `@testing-library/react`, `@testing-library/user-event`) in `package.json`
- [x] T003 [P] Configure ESLint + Prettier and a Vitest config in `vitest.config.ts` / `.eslintrc`
- [x] T004 [P] Initialize the Tauri shell: `src-tauri/` with `tauri.conf.json` (window, `.parquet` file association) and add the `fs`, `dialog`, and `clipboard-manager` plugins in `src-tauri/Cargo.toml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The framework-agnostic consistency core (the single `Column[]` model, its Arrow derivation, lossless Parquet IO, the platform save seam, and shared state) that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 [P] Define shared types (`DataDict`, `Column`, `DictType`, `EnumValue`, `ForeignKeyRef`, `Row`, `CellValue`, `CellRef`, `ReconcileResult`, `Violation`, `Command`) in `src/schema/types.ts` per data-model.md
- [x] T006 [P] Create the round-trip fixture: `examples/foodbank.yaml` (covering all 8 dictionary types incl. enum list+map, datetime, Int64 id) and generate `examples/foodbank.parquet` from it
- [x] T007 [P] Write failing unit tests for `parse` (enum list↔map normalization, `primary_key`⇒required+unique, error on unknown type / missing values) in `tests/schema/parse.test.ts`
- [x] T008 Implement `parse(yamlText): DataDict` in `src/schema/parse.ts` (js-yaml → normalized `Column[]`) — make T007 pass
- [x] T009 [P] Write failing unit tests for `toArrow` (type-table mapping incl. id→Utf8 default, Int64, Timestamp(µs,tz), Dictionary enum) in `tests/schema/toArrow.test.ts`
- [x] T010 Implement `toArrow(columns): ArrowSchema` in `src/schema/toArrow.ts` — make T009 pass
- [x] T011 [P] Write the failing Milestone-0 round-trip integration test (parse → toArrow → write → read → deep-equal; assert BigInt/Int64, enum dictionary keys, datetime+tz survive) in `tests/integration/roundtrip.test.ts`
- [x] T012 Implement `readParquet(file): { schema, rows }` in `src/io/readParquet.ts` (Int64→bigint, Timestamp→instant+zone, Dictionary→key) per contracts/core-functions.md
- [x] T013 Implement `writeParquet(rows, schema): Uint8Array` in `src/io/writeParquet.ts` (lossless per FR-021) — make T011 pass; if a type can't be expressed, escalate to parquet-wasm per research R2
- [x] T014 Implement the save/open boundary `openFiles()` / `save(bytes, origin)` in `src/platform/files.ts` with Tauri filesystem (desktop) + File-System-Access/re-export fallback (browser) per research R5/R12
- [x] T015 [P] Implement the shared workbook model (`rows`, `dirty`, `violations`, `history` refs) in `src/state/workbook.ts` per data-model.md
- [x] T016 Implement the app shell + entrypoint (`src/App.tsx`, `src/main.tsx`) with file-open wiring and the grid/card responsive switch stub

**Checkpoint**: Consistency core proven by the round-trip test — user stories can now begin.

---

## Phase 3: User Story 1 - Edit a dataset and save it back (Priority: P1) 🎯 MVP

**Goal**: Open a matching Parquet + dictionary pair, edit typed cells and add rows in the grid, and save back to a losslessly re-openable Parquet file.

**Independent Test**: Open `examples/foodbank.*`, change cells across types, add a row, save, reopen → edits present and every column name/type/value survives.

### Tests for User Story 1

- [x] T017 [P] [US1] Write failing unit tests for `toColumns` (cell kind per type; enum dropdown options show label / store value) in `tests/schema/toColumns.test.ts`
- [x] T018 [P] [US1] Write failing integration test for the load→edit→add-row→save→reopen lossless cycle in `tests/integration/edit-save.test.ts`

### Implementation for User Story 1

- [x] T019 [US1] Implement `toColumns(columns): GridColumn[]` (Text/Number/Checkbox/Date/Date-time/Dropdown cell kinds; `string` columns surface `examples` as a placeholder/hint, FR-008) in `src/schema/toColumns.ts` — make T017 pass
- [x] T020 [US1] Implement the grid component (Glide Data Grid: virtualized, click-to-edit, add-row) bound to the workbook, with touch-friendly hit targets for tablet (FR-027), in `src/grid/DataGrid.tsx`
- [x] T021 [US1] Implement happy-path load (read Parquet + parse dict → workbook → grid, columns in dictionary order; a valid empty dataset opens as an editable grid with the correct columns) in `src/App.tsx` / `src/state/workbook.ts`
- [x] T022 [US1] Implement enum cell behavior (dropdown shows label, stores key) and id-as-opaque (no aggregation) in `src/grid/DataGrid.tsx` + `src/schema/toColumns.ts`
- [x] T023 [US1] Implement BigInt (Int64) and timezone-aware datetime cell editing/rendering fidelity in `src/grid/DataGrid.tsx`
- [x] T024 [US1] Implement save flow (workbook → `writeParquet` → `platform/files.save` in-place; clears `dirty`) in `src/App.tsx`
- [x] T025 [US1] Implement the unsaved-edit guard (warn before close/reload/open-new when `dirty`, FR-019a) in `src/App.tsx` / `src/platform/files.ts`
- [x] T026 [US1] Verify T018 passes end-to-end (load→edit→add→save→reopen lossless)

**Checkpoint**: MVP — a matching pair can be opened, edited, and saved with lossless round-trip.

---

## Phase 4: User Story 2 - Reject mismatched file pairs at load time (Priority: P2)

**Goal**: Reconcile data file vs dictionary before opening; on mismatch, keep the grid closed and report specifics.

**Independent Test**: Open a pair with a renamed/extra column or wrong type → grid stays closed; message names missing/extra columns and the first type mismatch (expected vs found).

### Tests for User Story 2

- [x] T027 [P] [US2] Write failing unit tests for `reconcile` (missing/extra by name; first type mismatch expected+found; order-insensitive ⇒ ok) in `tests/schema/reconcile.test.ts`
- [x] T028 [P] [US2] Write failing integration test that mismatched pairs do not open and matching-but-reordered pairs do in `tests/integration/reconcile.test.ts`

### Implementation for User Story 2

- [x] T029 [US2] Implement `reconcile(parquetSchema, dict): ReconcileResult` in `src/schema/reconcile.ts` — make T027 pass
- [x] T030 [US2] Gate the load flow on `reconcile` before rendering the grid (block on `!ok`) in `src/App.tsx`
- [x] T031 [US2] Implement the reconciliation error screen (lists missing/extra columns and the first type mismatch) in `src/grid/` (e.g. `src/grid/ReconcileError.tsx`) — make T028 pass

**Checkpoint**: US1 + US2 both work independently; mismatches are blocked with clear messages.

---

## Phase 5: User Story 3 - See validation problems live without being blocked (Priority: P3)

**Goal**: Validate edits live against the dictionary, flag (not block) invalid cells, show per-cell messages and a running violation count, and warn+confirm on save with violations.

**Independent Test**: Enter a bad enum / blank required / duplicate unique → cell flagged, message on focus, count updates, edit still accepted; saving warns.

### Tests for User Story 3

- [ ] T032 [P] [US3] Write failing unit tests for `toValidators` (per-cell: type/range/required/enum membership; table-level: unique + primary-key tuple uniqueness) in `tests/schema/toValidators.test.ts`
- [ ] T033 [P] [US3] Write failing integration test that invalid values are flagged-not-blocked and the count updates in `tests/integration/validation.test.ts`

### Implementation for User Story 3

- [ ] T034 [US3] Implement `toValidators(columns)` (Zod per-cell + table-level fn) in `src/schema/toValidators.ts` — make T032 pass
- [ ] T035 [US3] Implement cell validation binding (immediate per-cell; produce/aggregate `Violation`s into the workbook) in `src/grid/cellValidation.ts`
- [ ] T036 [US3] Implement debounced cross-row uniqueness / primary-key pass in `src/state/workbook.ts` (research R8)
- [ ] T037 [US3] Implement invalid-cell highlight + per-cell message on focus/hover in `src/grid/DataGrid.tsx`
- [ ] T038 [US3] Implement the outstanding-violations summary count UI in `src/App.tsx`
- [ ] T039 [US3] Implement save warn + explicit confirm when violations remain (FR-020) in `src/App.tsx`
- [ ] T040 [US3] Verify T033 passes end-to-end

**Checkpoint**: US1–US3 work independently; live validation guides without blocking.

---

## Phase 6: User Story 4 - Work efficiently with spreadsheet conveniences (Priority: P4)

**Goal**: Keyboard navigation, copy/paste (incl. from Excel/Sheets), fill-down, frozen panes, and undo/redo.

**Independent Test**: Tab/Enter/arrows navigate; paste a block from Sheets; fill-down a selection; header + key columns stay frozen on scroll; undo/redo a sequence.

### Tests for User Story 4

- [ ] T041 [P] [US4] Write failing unit tests for the undo/redo command stack (setCell, addRow, paste, fillDown invert correctly) in `tests/grid/history.test.ts`

### Implementation for User Story 4

- [ ] T042 [US4] Implement the command-history stack (`apply`/`invert`, undo/redo) in `src/grid/history.ts` — make T041 pass
- [ ] T043 [US4] Route all grid mutations through commands and wire undo/redo in `src/grid/DataGrid.tsx` + `src/state/workbook.ts`
- [ ] T044 [P] [US4] Configure keyboard navigation (Tab/Enter/arrows) in `src/grid/DataGrid.tsx`
- [ ] T045 [US4] Implement copy/paste incl. Excel/Sheets clipboard (Tauri clipboard plugin + Glide paste), with predictable handling when the pasted block does not fit the selection (place from the active cell, clip/extend consistently), in `src/grid/DataGrid.tsx`
- [ ] T046 [P] [US4] Implement fill-down across a selection in `src/grid/DataGrid.tsx`
- [ ] T047 [P] [US4] Implement frozen panes (header row + leading key columns) in `src/grid/DataGrid.tsx`
- [ ] T048 [US4] Write integration test exercising paste + fill-down + undo/redo in `tests/integration/conveniences.test.ts`

**Checkpoint**: US1–US4 work independently; sustained data entry is practical.

---

## Phase 7: User Story 5 - Edit on a phone via card view (Priority: P5)

**Goal**: On narrow widths, show one record as a vertical form with the same typed inputs and validation, paging between records.

**Independent Test**: At phone width, a single record shows as a vertical form using the same validation; paging moves between records.

### Tests for User Story 5

- [ ] T049 [P] [US5] Write failing integration test that the card view edits one record with validation parity to the grid in `tests/integration/cardview.test.ts`

### Implementation for User Story 5

- [ ] T050 [US5] Implement the single-record card view (vertical typed inputs over the shared workbook) in `src/cards/CardView.tsx`
- [ ] T051 [US5] Reuse `toColumns`/`toValidators` outputs so card inputs and validation match the grid (FR-029) in `src/cards/CardView.tsx`
- [ ] T052 [US5] Implement record paging navigation in `src/cards/CardView.tsx`
- [ ] T053 [US5] Wire the responsive breakpoint to switch grid↔card at phone width in `src/App.tsx` — make T049 pass

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting requirements, performance, and packaging.

- [ ] T054 [P] Display `foreign_key` constraints as informational (not enforced) in the grid/header (FR-013) in `src/grid/DataGrid.tsx`
- [ ] T055 Verify responsiveness at ~10,000 rows (scroll, edit, debounced validation) against SC-006; record results
- [ ] T056 [P] WKWebView smoke test under `npm run tauri dev`: Glide grid rendering + Excel/Sheets clipboard paste (research R12)
- [ ] T057 macOS packaging: code signing + notarization config and `.parquet` "Open With" association in `src-tauri/tauri.conf.json`
- [ ] T058 [P] Add `README.md` (build/run for browser + Tauri) and ensure `specs/001-data-entry-tool/quickstart.md` steps pass
- [ ] T059 Run the full quickstart acceptance smoke checklist (US1–US5 table in quickstart.md)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories.** The round-trip test (T011/T013) is the critical risk-retirement gate.
- **User Stories (Phase 3–7)**: All depend on Foundational. After that they are independently testable; US1 is the MVP.
- **Polish (Phase 8)**: Depends on the targeted user stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories (assumes a matching pair).
- **US2 (P2)**: After Foundational. Adds the reconciliation gate ahead of US1's happy-path load; independently testable via `reconcile`.
- **US3 (P3)**: After Foundational. Independent; integrates with the grid for display but `toValidators` is testable alone.
- **US4 (P4)**: After Foundational. Enhances the grid; undo/redo testable alone.
- **US5 (P5)**: After Foundational. Reuses the shared model; independently testable at phone width.

### Within Each User Story

- Tests written first and failing → models/pure functions → grid/UI → integration.
- `toColumns`/`toValidators`/`reconcile` (pure) before the UI that consumes them.

### Parallel Opportunities

- Setup: T003, T004 in parallel.
- Foundational: T005, T006, T007, T009, T011, T015 in parallel (distinct files); impl T008/T010/T012/T013 follow their tests.
- Once Foundational is done, US1–US5 can be staffed in parallel by different developers.
- Within a story, all `[P]` test tasks run together; same-file UI tasks (most of `DataGrid.tsx`) are sequential.

---

## Parallel Example: User Story 1

```bash
# Write the failing tests for US1 together:
Task: "toColumns unit tests in tests/schema/toColumns.test.ts"        # T017
Task: "edit→save integration test in tests/integration/edit-save.test.ts"  # T018
```

## Parallel Example: Foundational

```bash
# Kick off independent foundational scaffolding together:
Task: "Define shared types in src/schema/types.ts"                     # T005
Task: "Create examples/foodbank.yaml + .parquet fixture"              # T006
Task: "Failing parse tests in tests/schema/parse.test.ts"            # T007
Task: "Failing toArrow tests in tests/schema/toArrow.test.ts"        # T009
Task: "Failing round-trip test in tests/integration/roundtrip.test.ts" # T011
Task: "Workbook model in src/state/workbook.ts"                       # T015
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (the round-trip test MUST be green) → 3. Phase 3 US1 → **STOP & VALIDATE** (open/edit/save lossless) → demo.

### Incremental Delivery

Foundation → US1 (MVP) → US2 (safe loading) → US3 (live validation) → US4 (conveniences) → US5 (mobile). Each story adds value without breaking earlier ones.

### Parallel Team Strategy

After Foundational: Dev A → US1, Dev B → US2, Dev C → US3, then US4/US5. The pure `src/schema/` functions and the `src/platform/files.ts` seam keep stories from colliding.

---

## Notes

- `[P]` = different files, no incomplete dependencies.
- The biggest serialization point is `src/grid/DataGrid.tsx`, touched by US1/US3/US4 — sequence those edits or split the component early.
- Tests-first is required for `src/schema/` and `src/io/` (Constitution IV); verify each fails before implementing.
- Commit after each task or logical group. Stop at any checkpoint to validate a story independently.
