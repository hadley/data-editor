<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
specs/001-data-entry-tool/plan.md

Active feature: Herringbone — browser-based, spreadsheet-style editor
for single-table Parquet data driven by a `data-dict.yaml` dictionary.
Shell: Tauri 2 (Rust) desktop app for macOS — reliable in-place save; browser-runnable for dev.
Stack: React + Vite + TypeScript, Glide Data Grid, hyparquet(+writer), js-yaml, Zod.
Core invariant: one parsed `Column[]` feeds three pure functions
(toArrow / toValidators / toColumns) so schema, validation, and UI cannot drift.
See also: specs/001-data-entry-tool/{research.md,data-model.md,contracts/,quickstart.md}
<!-- SPECKIT END -->
