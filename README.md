# Herringbone

> ⚠️ **EXPERIMENTAL HACKATHON PROJECT** ⚠️
>
> This is a **super experimental** project built during a hackathon. It is **not production-ready**,
> may eat your data, break without warning, or change drastically at any time. Do **not** rely on it
> for anything important, and always keep backups of your files. Use at your own risk!

A spreadsheet-style editor for tabular data, driven by a `data-dict.yaml` dictionary. You open a **Parquet**
file together with its **`data-dict.yaml`** dictionary; the dictionary is the single
source of truth that drives the grid columns, per-cell validation, and the on-disk
Parquet schema, so the three can never drift apart.

Built as a [Tauri](https://tauri.app) desktop app (macOS) with a React + Vite + TypeScript
frontend that also runs in a plain browser for development.

## Features (v1)

- Open a matching Parquet + dictionary pair; **load-time reconciliation** rejects mismatches with specifics.
  Auto-loads the data file named in the dictionary's `source` (desktop) or hints it (browser).
- Edit typed cells and add rows in a virtualized grid ([Glide Data Grid](https://grid.glideapps.com/)).
  Column headers show the dictionary type; enums use a dropdown; integers stay digit-exact.
- **Live validation** from the dictionary — invalid cells flagged (not blocked), with a clickable
  problems count that jumps to the first issue and red markers on problem rows.
- Spreadsheet conveniences: keyboard nav, Tab-to-append a row, copy/paste, fill-down, frozen header,
  resizable columns, and a **full undo/redo** stack.
- **Phone card view**: one record at a time on narrow screens, same validation.
- **Lossless** Parquet round-trip — column names, types, enum keys, Int64 (BigInt), and datetimes survive.
- Save **in place** (Tauri) or re-export (browser), with optional **autosave**; warns before discarding
  unsaved edits or manually saving with violations.

## Prerequisites

- Node.js 20+
- For the desktop build: Rust (`rustup`) + Xcode command-line tools, and the
  `@tauri-apps/*` plugin packages (`npm i @tauri-apps/api @tauri-apps/plugin-fs @tauri-apps/plugin-dialog @tauri-apps/plugin-clipboard-manager`).

## Develop

```bash
npm install
npm run dev          # browser dev build (re-export save fallback)
npm run tauri dev    # native desktop app (in-place save) — note: `run`, not `npm tauri`
npm test             # run the Vitest suite
npm run typecheck  # tsc --noEmit
npm run build      # production frontend build
```

Open [examples/foodbank.yaml](examples/foodbank.yaml) with `examples/foodbank.parquet`
to try it out.

## Architecture

The keystone is one parsed `Column[]` model fed into three **pure** functions, so the
storage schema, validation, and UI are derived from a single source:

```
data-dict.yaml ──parse──▶ Column[] ──┬─ toArrow      → Parquet/Arrow schema
                                     ├─ toValidators → per-cell + table-level rules
                                     └─ toColumns    → grid column defs + cell kinds
```

| Area | Location |
|---|---|
| Consistency core (pure, framework-free) | [src/schema/](src/schema/) |
| Parquet read/write | [src/io/](src/io/) |
| Shared editing model + undo/redo | [src/state/](src/state/), [src/grid/history.ts](src/grid/history.ts) |
| Grid + card view | [src/grid/](src/grid/), [src/cards/](src/cards/) |
| Save/open seam (Tauri vs browser) | [src/platform/files.ts](src/platform/files.ts) |
| Tauri shell | [src-tauri/](src-tauri/) |

Design docs live under [specs/001-data-entry-tool/](specs/001-data-entry-tool/)
(spec, plan, research, data-model, contracts, tasks).

## v1 simplifications (revisitable)

- `date` is stored as an ISO `YYYY-MM-DD` string and `enum` as its key string (lossless,
  avoids writer encoding gymnastics) rather than Parquet Date32 / Dictionary.
- Date pickers and enum dropdowns in the **grid** render as text/number cells; the
  **card view** uses native date/select inputs. Full grid editors need the
  `glide-data-grid-cells` addon.
- App icons are generated (`src-tauri/icons/`); distribution still needs Apple signing/notarization certs.

## Testing

67+ tests cover the schema core, Parquet round-trip (incl. BigInt/datetime/enum fidelity),
reconciliation, validation, undo/redo, the card view, and ~10k-row performance. The
Milestone-0 round-trip test is the data-integrity gate.
