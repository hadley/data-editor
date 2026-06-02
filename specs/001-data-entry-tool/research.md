# Phase 0 Research: Data Entry Tool (v1)

The feature's source specification arrived with a vetted stack and an explicit list of "known gotchas." Research therefore focused on (a) confirming each library maps to a concrete v1 requirement and (b) resolving the genuine technical unknowns the spec flagged. Each decision is recorded as Decision / Rationale / Alternatives.

## R1. Grid component

- **Decision**: Glide Data Grid.
- **Rationale**: Canvas-rendered and virtualized, so it stays responsive at the ~10k-row target (SC-006) and beyond. Provides the spreadsheet feature set v1 needs natively: keyboard navigation (Tab/Enter/arrows), fill-down, paste from Excel/Sheets, frozen panes, and per-column "cell kinds" that map cleanly onto our dictionary types (text, number, boolean checkbox, dropdown, custom date editors). Built for cell-by-cell data entry rather than read-only display.
- **Alternatives considered**: AG Grid (heavier, licensing tiers for advanced features), TanStack Table (headless/read-oriented, would require building editing/virtualization/paste ourselves), hand-rolled grid (violates Simplicity — re-implements virtualization and paste).

## R2. Parquet read/write

- **Decision**: hyparquet (read) + hyparquet-writer (write), pure JS.
- **Rationale**: Pure-JS keeps the app fully client-side (no WASM toolchain, no server) — aligns with file-in/file-out and Simplicity. Reads schema separately from data, which the reconciliation step needs (R4). Escape hatch: reach for `parquet-wasm` only if a required physical type cannot be expressed by the pure-JS writer — to be confirmed in the Phase-0 milestone, not assumed.
- **Alternatives considered**: parquet-wasm (heavier bundle + WASM init; keep as fallback), DuckDB-wasm (a database engine — far more than a single-table file editor needs, violates YAGNI).
- **Risk to validate in milestone**: writer fidelity for Int64/BigInt, `Dictionary` (enum) encoding, and `Timestamp` unit+tz. This is exactly what the first milestone's round-trip test exercises.
- **v1 placement**: Parquet IO stays in the JS webview (hyparquet), even under Tauri, so the type-table logic lives in one language. Moving IO to Rust (`arrow-rs`/`parquet` crates) — which would retire the fidelity risk entirely — is a deliberate **future** option, revisited only if the Milestone-0 round-trip exposes a writer gap (R12).

## R3. Dictionary parsing & the type table

- **Decision**: js-yaml to parse `data-dict.yaml` into a typed `DataDict` (`Column[]`); a single closed type vocabulary drives three pure functions (`toArrow`, `toValidators`, `toColumns`).
- **Rationale**: One parsed model feeding three derivations is the core guarantee that schema, validation, and UI cannot drift (Constitution I & III). Pure functions are trivially unit-testable (Constitution IV).
- **Type mapping** (the heart of the tool — see [contracts/dictionary-schema.md](./contracts/dictionary-schema.md)):

  | Dictionary type | Arrow/Parquet | Grid cell | Notes |
  |---|---|---|---|
  | `number(id)` | Utf8 (default) or Int64 | Text/Number | Opaque; no sum/avg; default Utf8 to avoid int64 precision loss |
  | `number(ordinal)` | Int64 or Float64 | Number | `range` → inclusive min/max |
  | `number(quantity)` | Float64 | Number | `range` → inclusive min/max |
  | `string` | Utf8 | Text | `examples` → placeholder hint |
  | `boolean` | Bool | Checkbox | true/false/null |
  | `date` | Date32 | Date picker | `range` → date bounds |
  | `datetime` | Timestamp(µs, tz) | Date-time picker | timezone-aware (R6) |
  | `enum` | Dictionary(Int32, Utf8) | Dropdown | value must be in `values`; show label, store key |
- **Alternatives considered**: Hand-written YAML walk (error-prone, reinvents js-yaml), JSON Schema as the dictionary format (the spec mandates `data-dict.yaml`; not our choice to make).

## R4. Reconciliation (load-time gate)

- **Decision**: A pure `reconcile(parquetSchema, dataDict) → ReconcileResult` that compares column **set** (report missing/extra by name) and column **types** (report first incompatible with expected+found), and is **order-insensitive** — the grid presents columns in dictionary order regardless of Parquet order. A non-empty error list blocks opening the grid (FR-003–FR-007).
- **Rationale**: The user supplies both files independently, so they can disagree; failing loudly with specifics protects data integrity (Constitution III) and lets the user fix either file. Type compatibility is decided by the same type table as `toArrow`, so reconciliation and writing agree by construction.
- **Alternatives considered**: Silent auto-coercion/reconciliation (rejected by the spec — masks real mismatches and risks corruption), requiring exact column order (worse UX; order alone is not a correctness problem).

## R5. Save mechanism (clarified)

- **Decision**: Saving **overwrites the original file in place** using the Tauri filesystem API in the desktop build (the primary v1 target — see R12). The browser dev build falls back to the File System Access API where available, otherwise re-exports the same file. Save is hidden behind `src/platform/files.ts` so the core never knows which runtime it is in.
- **Rationale**: Matches the editing cycle ("reopen the file you saved") and the clarification answer. Tauri gives the dependable in-place overwrite the browser cannot guarantee, satisfying FR-019 for real in v1 rather than deferring it.
- **Alternatives considered**: Browser-only with re-export (weakens the editing cycle; Chromium-only in-place), Download-only (clutters; user tracks versions), Save/Save-As prompt each time (extra friction; can add later).
- **Future**: per-row persistence to disk via the Rust side, reducing reliance on the unsaved-edit warning (FR-019a).

## R6. Datetime timezone convention

- **Decision**: Store datetimes as a UTC instant plus the column's zone, mapped to Parquet `Timestamp(µs, tz)`; the same convention is used for read, edit, and write so values never silently drift.
- **Rationale**: The spec is explicit that `datetime` is timezone-aware; pinning one convention end-to-end is the only way to guarantee the lossless round-trip in FR-021/SC-001.
- **Alternatives considered**: Naive local-time storage (drifts across machines/zones — rejected), storing zone-less UTC and discarding the zone (loses information the dictionary declares).

## R7. Int64 / BigInt precision

- **Decision**: Integer columns stored as true Int64 round-trip through `BigInt`, never JS `number`. `number(id)` defaults to Utf8 storage unless IDs are known to fit safely under 2^53.
- **Rationale**: JS `number` loses integer precision past 2^53; silently corrupting identifiers or large counts violates Constitution III. BigInt is the only safe carrier.
- **Alternatives considered**: Always use `number` (data loss — rejected), always stringify all integers (loses numeric ordinal/quantity semantics and range checks — only appropriate for `id`).

## R8. Validation engine & timing

- **Decision**: Compile Zod refinements per column from the type table for per-cell rules (type, range, required, enum membership). Table-level rules (`unique`, `primary_key` tuple uniqueness) run as a separate pass. Per-cell validation is immediate on edit; cross-row uniqueness is **debounced** (recomputed shortly after typing pauses). Invalid cells are flagged, never blocked; a running violation count is shown (FR-015–FR-018).
- **Rationale**: Zod gives declarative, composable, testable validators generated from the single type table (consistency + Constitution IV). Debouncing the O(rows) uniqueness scan keeps editing responsive at 10k rows (SC-006) without sacrificing live feedback (clarification answer).
- **Alternatives considered**: Validate everything on save only (worse UX, late feedback), recompute uniqueness on every keystroke (janky at scale), bespoke validators (more code, less testable than Zod).

## R9. Undo/redo

- **Decision**: A command-history stack (`grid/history.ts`) recording reversible edit commands (cell set, row add, paste block, fill-down), supporting undo and redo of a sequence.
- **Rationale**: Reversibility of every data mutation is a Constitution III requirement; a command stack is the simplest model that covers single-cell and bulk operations uniformly.
- **Alternatives considered**: Full immutable snapshots per edit (memory-heavy at 10k rows), no redo (fails FR-026).

## R10. Shared model for grid + card view

- **Decision**: One `state/workbook.ts` holding rows + violation state; both `DataGrid.tsx` and `CardView.tsx` bind to it. A responsive breakpoint (~phone width) chooses the presentation.
- **Rationale**: FR-029 requires two presentations of one model, not two apps; a single source of edit/validation state prevents divergence (Constitution II).
- **Alternatives considered**: Separate state per view (guaranteed drift — rejected).

## R11. Testing strategy

- **Decision**: Vitest for unit/integration; the Phase-0 milestone round-trip (parse → reconcile → read → write → reread on `examples/foodbank.*`) is the first automated integration test and a merge gate. React Testing Library for grid/card behavior.
- **Rationale**: Front-loads the riskiest data path before any UI (Constitution IV); pure `schema/` functions need no browser.
- **Alternatives considered**: Manual round-trip verification (not repeatable — rejected), E2E-only (too slow/coarse to pin BigInt/tz fidelity).

## R12. Desktop shell (Tauri)

- **Decision**: Ship v1 as a **Tauri 2** desktop app (Rust shell + system WebView) targeting macOS, while keeping the web frontend browser-runnable for development. Rust stays thin in v1: file open/overwrite commands only.
- **Rationale**: Tauri wraps our existing React + Vite frontend with near-zero frontend change, gives reliable in-place save (R5), native menus/dialogs/`.parquet` associations and a native feel, and ships a small (~MBs) low-memory binary. It is lighter than Electron with no loss of capability for this app.
- **Alternatives considered**:
  - *Electron*: bundles Chromium → predictable rendering and huge ecosystem, but heavier binary/memory and no benefit our feature needs. Rejected.
  - *Wails (Go)* / *Neutralino*: smaller ecosystems, no advantage here. Rejected.
  - *Browser-only v1*: cannot guarantee in-place overwrite (R5). Rejected per the user's decision to commit to a wrapper now.
- **Caveats to validate early (WKWebView ≠ Chromium)**:
  1. **Glide Data Grid** (canvas) rendering/perf in WKWebView — smoke-test in Milestone-0.
  2. **Paste from Excel/Sheets** (FR-023) — route through Tauri's clipboard plugin and confirm rich-clipboard paste in the webview.
  3. **Packaging** — macOS code signing + notarization for distribution.
- **Constitution note**: adds a Rust toolchain (logged in plan.md Complexity Tracking); justified by Constitution III (real in-place save / data safety). Parquet IO kept in JS to avoid splitting the consistency core across languages (Simplicity).

## Resolved unknowns

All Technical Context items are resolved; **no `NEEDS CLARIFICATION` markers remain**. The one residual real-world uncertainty — pure-JS Parquet writer fidelity for Int64/enum/timestamp — is intentionally retired by the first milestone's round-trip test rather than by speculation, and has a defined fallback (parquet-wasm, R2).
