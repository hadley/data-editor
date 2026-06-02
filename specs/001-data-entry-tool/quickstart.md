# Quickstart: Data Entry Tool (v1)

How to set up the project, run it, and verify the riskiest path first.

## Prerequisites

- Node.js 20+ and a package manager (npm/pnpm).
- Rust toolchain (`rustup`) + Xcode command-line tools — required for the Tauri desktop build on macOS.
- An evergreen browser for the dev fallback (Chromium-based for File System Access save).

## Setup

```bash
npm create vite@latest data-editor -- --template react-ts   # if scaffolding fresh
npm install
npm install \
  @glideapps/glide-data-grid \
  hyparquet hyparquet-writer \
  js-yaml zod \
  @tauri-apps/api @tauri-apps/plugin-fs @tauri-apps/plugin-dialog @tauri-apps/plugin-clipboard-manager
npm install -D vitest @testing-library/react @testing-library/user-event @tauri-apps/cli
npx tauri init     # scaffold src-tauri/ (Rust shell, tauri.conf.json)
```

## Run

```bash
npm run dev        # browser dev build (Vite) — fast iteration, re-export save fallback
npm run tauri dev  # native desktop app (Tauri + WKWebView) — real in-place save
npm test           # run Vitest unit + integration suites
```

## Milestone 0 — prove the data path before any UI (do this first)

Per the spec's first milestone and Constitution IV (test-first on data-mutating logic), implement and green these before building the grid:

1. `schema/parse.ts` — parse `examples/foodbank.yaml` into `Column[]`.
2. `schema/toArrow.ts` — derive the Arrow/Parquet schema from `Column[]`.
3. `schema/reconcile.ts` — compare schema vs dictionary.
4. `io/readParquet.ts` + `io/writeParquet.ts` — read and write.

Then run the round-trip integration test (`tests/integration/roundtrip.test.ts`):

```text
parse(foodbank.yaml) → Column[]
readParquet(foodbank.parquet) → { schema, rows }
reconcile(schema, dict)            ⇒ ok === true
reconcile(schema, MISMATCHED dict) ⇒ ok === false with named columns / type mismatch
writeParquet(rows, toArrow(cols)) → bytes
readParquet(bytes) → rows'         ⇒ rows' deep-equals rows
```

Round-trip must preserve: **column names, types, enum dictionaries, BigInt (Int64) values, and datetime+timezone** (FR-021, SC-001). If the pure-JS writer can't express a needed type, switch that path to `parquet-wasm` (research R2) — do not weaken the fidelity assertion.

## Verifying the user stories (acceptance smoke tests)

| Story | Manual check |
|---|---|
| US1 (P1) edit & save | Open `foodbank.*`, edit cells across types, add a row, save, reopen → edits present, round-trip intact |
| US2 (P2) reconciliation | Open data with a renamed/extra column or wrong type → grid stays closed, message names specifics |
| US3 (P3) live validation | Enter a bad enum / blank required / duplicate unique → cell flagged (not blocked), message on focus, count updates |
| US4 (P4) conveniences | Tab/Enter/arrows; paste a block from Sheets; fill-down; scroll with header/key cols frozen; undo/redo |
| US5 (P5) card view | Shrink to phone width → single-record vertical form, same validation, paging between records |

## Project layout

See [plan.md](./plan.md) → Project Structure. Core consistency lives in `src/schema/` (pure, framework-free, fully unit-testable without a browser).

## Definition of done (v1)

- Milestone-0 round-trip test green (merge gate).
- All five user stories pass their acceptance smoke tests.
- Save never writes with outstanding violations without explicit confirmation (FR-020); unsaved edits warn before discard (FR-019a).
- Responsive at ~10k rows (SC-006).
