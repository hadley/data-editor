# Feature Specification: Data Entry Tool (v1)

**Feature Branch**: `001-data-entry-tool`

**Created**: 2026-06-02

**Status**: Draft

**Input**: User description: "Web-based, spreadsheet-style data entry tool for editing tabular data that conforms to a `data-dict.yaml` dictionary, with Parquet as the on-disk format.

## User Scenarios & Testing *(mandatory)*

The tool serves a person who maintains a single table of structured data. They open a data file alongside a dictionary that describes the data's shape, correct or extend the data in a familiar spreadsheet, and save it back so the same file can be reopened and edited again later. The dictionary is the single source of truth: it decides which columns exist, how each cell behaves, what counts as valid, and how the saved file is structured — so the data, the validation, and the on-disk file can never drift apart.

### User Story 1 - Edit a dataset and save it back (Priority: P1)

A user opens a matching pair of files — a data file and its dictionary — and is presented with their data in a spreadsheet-style grid where each column behaves according to its dictionary-defined type. They click into cells, change values, add rows, and then save the result back to a data file that can be reopened later.

**Why this priority**: This is the core editing loop and the reason the tool exists. Without open → edit → save, nothing else has value. It is the minimum viable product on its own.

**Independent Test**: Provide a valid data file plus a matching dictionary, open them, change several cell values across different column types, add a row, save, then reopen the saved file and confirm the edits are present and every column's name, type, and values survived unchanged.

**Acceptance Scenarios**:

1. **Given** a data file and a matching dictionary, **When** the user opens them, **Then** the data appears in a grid with columns presented in dictionary order and each cell rendered with the input style appropriate to its dictionary type.
2. **Given** an open dataset, **When** the user edits cells and adds rows, **Then** the changes are reflected immediately in the grid.
3. **Given** edited data with no outstanding problems, **When** the user saves, **Then** a data file is written using the structure derived from the dictionary.
4. **Given** a file previously saved by the tool, **When** the user reopens it with the same dictionary, **Then** all column names, types, category values, large integer values, and date/time values are identical to what was saved (lossless round-trip).

---

### User Story 2 - Reject mismatched file pairs at load time (Priority: P2)

When the user opens a data file and a dictionary that do not agree, the tool refuses to open the grid and instead explains exactly how they disagree, so the user can fix either file before editing.

**Why this priority**: This is the data-integrity gate. Opening a mismatched pair would let the user edit against the wrong rules and silently corrupt the file. Guarding the entry point protects every later action.

**Independent Test**: Provide a data file whose columns or types deliberately differ from the dictionary; attempt to open; confirm the grid does not open and the message names the specific missing columns, extra columns, and/or the first incompatible column with both the expected and the found type.

**Acceptance Scenarios**:

1. **Given** a dictionary and data file with different column sets, **When** the user opens them, **Then** the tool reports the missing and extra columns by name and does not open the grid.
2. **Given** a column whose stored type is incompatible with its dictionary type, **When** the user opens the pair, **Then** the tool reports that column with both the expected and the found type and does not open the grid.
3. **Given** a data file whose columns are in a different order than the dictionary, **When** the user opens the pair, **Then** the tool opens successfully and presents columns in dictionary order (order alone is not a mismatch).

---

### User Story 3 - See validation problems live without being blocked (Priority: P3)

As the user types, the tool checks each value against the dictionary's rules and visibly flags anything invalid, while still allowing the value to be entered. The user can see what is wrong, how many problems remain, and fix them at their own pace.

**Why this priority**: Live validation is the main quality benefit over a generic spreadsheet, but it depends on data being open and editable first. It enhances the core loop rather than enabling it.

**Independent Test**: Enter a value that violates a rule (e.g., a category not in the allowed set, a blank in a required cell, a duplicate in a unique column); confirm the cell is flagged, a message is available for that cell, and a running count of outstanding problems updates — and that the edit was still accepted.

**Acceptance Scenarios**:

1. **Given** a cell with a value that breaks its rule, **When** the value is entered, **Then** the cell is visibly flagged and the entry is still accepted (flagged, not blocked).
2. **Given** a flagged cell, **When** the user focuses or hovers it, **Then** a message explains what is wrong.
3. **Given** any number of flagged cells, **When** problems exist, **Then** a summary count of outstanding violations is visible.
4. **Given** outstanding violations, **When** the user tries to save, **Then** the tool warns and requires explicit confirmation before writing.

---

### User Story 4 - Work efficiently with spreadsheet conveniences (Priority: P4)

The user works at the speed they expect from Excel or Google Sheets: navigating by keyboard, copying and pasting (including from a spreadsheet application), filling values down a column, freezing header and key columns in place, and undoing or redoing changes.

**Why this priority**: These conveniences make sustained data entry practical, but the tool is still usable for editing and saving without them. They raise productivity rather than enable the core task.

**Independent Test**: With a dataset open, navigate cells with Tab/Enter/arrows, paste a block copied from a spreadsheet application, fill a value down a selection, scroll while the header and leading key columns stay frozen, and undo/redo a sequence of edits — confirming each behaves as in a familiar spreadsheet.

**Acceptance Scenarios**:

1. **Given** an open grid, **When** the user presses Tab, Enter, or arrow keys, **Then** the active cell moves as in a standard spreadsheet.
2. **Given** content copied from a spreadsheet application, **When** the user pastes into the grid, **Then** the block is placed across the corresponding cells.
3. **Given** a selected value, **When** the user fills down, **Then** the value is applied to the cells below in the selection.
4. **Given** scrolling through many rows and columns, **When** the user scrolls, **Then** the header row and any frozen leading columns remain visible.
5. **Given** a series of edits, **When** the user undoes and redoes, **Then** changes are reverted and reapplied in order.

---

### User Story 5 - Edit on a phone via card view (Priority: P5)

On a small phone-sized screen where a grid is unusable, the user instead sees one record at a time as a vertical form with the same typed inputs and the same validation, and pages between records.

**Why this priority**: Mobile access broadens where the tool can be used, but desktop is the primary target and the grid covers the main scenarios. This is the last slice to add.

**Independent Test**: Open the tool at a phone-sized width; confirm a single record is shown as a vertical form using the same typed inputs and validation as the grid, and that paging moves between records (rather than horizontal scrolling).

**Acceptance Scenarios**:

1. **Given** a phone-sized screen, **When** the user opens a dataset, **Then** one record is shown as a vertical form rather than a grid.
2. **Given** the card view, **When** the user edits a field, **Then** the same typed input and validation rules apply as in the grid.
3. **Given** multiple records, **When** the user moves between them, **Then** navigation is by paging one record at a time.

---

### Edge Cases

- **Category not in allowed set**: entering a value outside an `enum` column's allowed values is flagged as invalid.
- **Category labels vs stored keys**: a dictionary may list allowed categories as a plain list or as key→label pairs; the user always sees the label, while the underlying key is what is stored and saved.
- **Required cell left blank**: a null or empty value in a required column is flagged.
- **Duplicate in a unique column**: a repeated value in a column marked unique is flagged; for a multi-column primary key, a repeated combination of values is flagged.
- **Primary key**: a primary-key column is treated as both required and unique.
- **Foreign key present**: a foreign-key constraint is shown as informational only and is not enforced in v1 (only one table is loaded).
- **Large integer precision**: integer values too large to represent exactly as ordinary numbers must round-trip without losing or altering digits.
- **Identifier columns**: identifier values are treated as opaque text by default — never summed, averaged, or coerced into approximate numbers.
- **Date/time zones**: date-time values carry their timezone and must round-trip without silent shifting.
- **Empty dataset**: opening a valid but empty data file shows an empty, editable grid with the correct columns.
- **Large datasets**: the grid remains responsive when the file has a large number of rows.
- **Paste shape mismatch**: pasting a block that does not fit the target selection is handled predictably (e.g., placed from the active cell, clipped or extended consistently).
- **Unsaved edits at exit**: attempting to close, reload, or open a different file with unsaved changes prompts a warning so the edits are not lost silently.
- **In-place overwrite unavailable**: when the environment cannot overwrite the original file in place, saving re-exports the same file rather than failing silently.

## Clarifications

### Session 2026-06-02

- Q: How should saving work when writing data back (file-in / file-out)? → A: Overwrite the original file in place. In a plain browser, where reliable in-place overwrite is not guaranteed, the tool re-exports the same file; the design assumes a later desktop wrapper (e.g., Electron) provides dependable true in-place overwrite.
- Q: When should cross-row constraints (unique / primary key) be validated? → A: Live, debounced (recomputed shortly after the user pauses typing), while per-cell rules stay immediate.
- Q: Should the tool protect against losing unsaved edits? → A: Yes — warn before any action that would discard unsaved edits. (Future direction: run in a context that persists each row to disk as it is entered, reducing reliance on the warning.)
- Q: What dataset size must the grid stay responsive at? → A: ~10,000 rows.

### Session 2026-06-03

- Q: How should autosave interact with the save-with-violations confirmation (FR-020)? → A: Autosave persists the current state (including flagged-invalid values) silently, without a confirmation prompt, since the file legitimately holds in-progress data. It is enabled only where the tool can overwrite in place (so it never repeatedly downloads files); the warn+confirm of FR-020 still applies to explicit manual saves. Autosave is debounced after edits settle.
- Q: How should integer columns avoid the display precision loss seen for large values? → A: Integer (ordinal) values are displayed and entered as exact text rather than through a floating-point numeric control, so digits past 2^53 are never altered on screen.
- Q: How can the tool reduce the two-step open friction? → A: The dictionary may declare a `source` field naming the data file(s) it describes. After the dictionary is chosen, the tool uses `source` to auto-load the data file where it can resolve the path (desktop), or to show the expected file name as a hint (browser).

## Requirements *(mandatory)*

### Functional Requirements

#### Loading and reconciliation

- **FR-001**: The tool MUST require the user to supply both a data file and its dictionary; it MUST NOT open a dataset from only one of them.
- **FR-002**: The tool MUST interpret the dictionary as the single source of truth for which columns exist, each column's type and constraints, how each cell is presented and validated, and how the saved file is structured.
- **FR-003**: Before opening the grid, the tool MUST reconcile the data file against the dictionary by comparing the column set and each column's type.
- **FR-004**: If the column sets differ, the tool MUST report the missing and extra columns by name and MUST NOT open the grid.
- **FR-005**: If a column's stored type is incompatible with its dictionary type, the tool MUST report that column with both the expected and the found type and MUST NOT open the grid.
- **FR-006**: The tool MUST present columns in the dictionary's defined order regardless of the order they appear in the data file, and MUST NOT treat differing order alone as a mismatch.
- **FR-007**: On a successful reconciliation, the tool MUST load the data into the grid typed and validated according to the dictionary.

#### Types, presentation, and constraints

- **FR-008**: The tool MUST support the dictionary's closed type vocabulary — identifier, ordinal number, quantity number, free-text string, boolean, date, date-time, and categorical (enum) — and MUST present each with an input appropriate to its type (e.g., text/number entry, checkbox, date picker, date-time picker, dropdown).
- **FR-009**: The tool MUST treat identifier values as opaque: not offering numeric aggregation (sum/average) and not converting them in a way that risks precision loss.
- **FR-010**: For numeric columns that define a range, the tool MUST treat the range as inclusive minimum/maximum bounds; for date columns with a range, the bounds apply as date limits.
- **FR-011**: For categorical columns, the tool MUST accept the allowed values whether the dictionary expresses them as a plain list or as key→label pairs, MUST display the human-readable label to the user, and MUST store/save the underlying key.
- **FR-012**: The tool MUST enforce per-cell and per-column constraints from the dictionary: required (no null/empty), unique (values distinct within the column), and primary key (treated as required and unique, with uniqueness of the full value combination for multi-column keys).
- **FR-013**: The tool MUST surface any foreign-key constraint as informational only and MUST NOT enforce it in v1.

#### Editing and validation

- **FR-014**: Users MUST be able to edit existing cell values and add new rows in the grid.
- **FR-015**: The tool MUST validate values live against the dictionary as the user edits. Per-cell rules (type, range, required, allowed categorical values) MUST be evaluated immediately on edit; cross-row rules (unique, primary-key uniqueness) MUST be evaluated live but debounced — recomputed shortly after the user pauses typing rather than on every keystroke.
- **FR-016**: The tool MUST flag invalid cells visibly while still accepting the entered value (validation flags, it does not block entry).
- **FR-017**: The tool MUST make a per-cell explanation of the problem available on focus or hover for any flagged cell.
- **FR-018**: The tool MUST display a running summary count of outstanding validation violations.

#### Saving

- **FR-019**: Users MUST be able to save the edited data back to a data file whose structure is derived from the dictionary. The intended behavior is to overwrite the original file in place; where the running environment cannot reliably overwrite in place, the tool MUST re-export the same file as the save result.
- **FR-019a**: The tool MUST warn the user and require confirmation before any action that would discard unsaved edits (closing, reloading, or opening a different file).
- **FR-020**: When the user saves while validation violations remain, the tool MUST warn the user and require explicit confirmation before writing.
- **FR-021**: A file saved by the tool MUST be losslessly reopenable by the tool with the same dictionary, preserving column names, types, categorical values, large-integer values, and date/time values (including timezone).

#### Spreadsheet conveniences

- **FR-022**: The tool MUST support keyboard navigation using Tab, Enter, and arrow keys.
- **FR-023**: The tool MUST support copy and paste, including pasting a block copied from a spreadsheet application.
- **FR-024**: The tool MUST support filling a value down a selected range of cells.
- **FR-025**: The tool MUST support frozen panes, keeping the header row (and optionally leading key columns) visible while scrolling.
- **FR-026**: The tool MUST support undo and redo across a sequence of edits.

#### Presentation across devices

- **FR-027**: The tool MUST present the full grid on desktop (primary target) and on tablet with touch-friendly targets.
- **FR-028**: On phone-sized screens the tool MUST present a single-record card view — fields laid out vertically with the same typed inputs and validation as the grid — with navigation by paging between records rather than horizontal scrolling.
- **FR-029**: The grid and the card view MUST operate over one shared data and validation model (two presentations of the same data, not two separate behaviors).

#### v1.1 enhancements

- **FR-030**: Each column MUST show its dictionary type to the user (e.g., in the column header and in the card-view field labels), so the expected kind of value is discoverable without consulting the dictionary.
- **FR-031**: Integer (ordinal) values MUST be displayed and entered as exact text, never coerced through a floating-point control, so digit-exactness is preserved on screen as well as on disk.
- **FR-032**: Enum columns MUST offer a selection control (dropdown) listing the allowed labels, in addition to free typing; the stored value remains the key.
- **FR-033**: Pressing Tab on the last cell of the last row MUST append a new empty row and move into it, enabling continuous keyboard entry. Adding a row MUST remain allowed even while validation problems exist.
- **FR-034**: The tool MUST provide a full undo/redo stack covering all data mutations (cell edits, row additions, paste, fill-down), reachable by keyboard (⌘/Ctrl+Z, ⇧⌘/Ctrl+Z or Ctrl+Y) and toolbar controls.
- **FR-035**: The tool MUST support autosave: where it can overwrite in place, it persists the current state automatically (debounced) after edits, without a confirmation prompt; the FR-020 warn+confirm applies only to explicit manual saves.
- **FR-036**: The outstanding-violations indicator MUST be actionable: activating it MUST move the selection to (and scroll to) the first violating cell.
- **FR-037**: Rows containing a validation problem MUST be visually marked at the row indicator (e.g., a red row-number background), so problem rows are scannable.
- **FR-038**: The dictionary MAY declare a `source` naming the data file(s) it describes. After the dictionary is chosen, the tool MUST use `source` to auto-load the data file when it can resolve the path (desktop), or to show the expected file name as a hint (browser).
- **FR-039**: The tool MUST show a status bar that displays the exact validation error for the currently selected cell; when no cell error applies it MAY show the hovered column's type details or be empty.
- **FR-040**: Keyboard cell navigation MUST zigzag row to row: Tab off the far-right cell moves to the first cell of the next row (appending a row past the last row, FR-033), and Shift+Tab off the far-left cell moves to the last cell of the previous row.
- **FR-041**: After rows are removed (e.g., undoing an added row), the selection MUST move to a still-existing row rather than pointing at a row that no longer exists.
- **FR-042**: When a cell editor (such as an enum dropdown) is open, Tab MUST first commit the editor before moving the selection.
- **FR-043**: Each column header MUST show the column name with its dictionary type beneath it (a second line in smaller text), and hovering the header MUST reveal fuller type details (constraints, range, allowed values).
- **FR-044**: The grid MUST apply subtle zebra striping to alternating rows for readability, without obscuring invalid-cell or invalid-row indicators.
- **FR-045**: Users MUST be able to insert a row above or below any row, and delete a row, via a row context menu (right-click); these MUST be undoable. Keyboard navigation MUST NOT move into a non-existent row beyond the data.
- **FR-046**: Inserting or deleting a row MUST keep validation correct by re-evaluating after the row indices shift.
- **FR-047**: Closing a dataset with unsaved changes or outstanding validation problems MUST prompt for confirmation before discarding.
- **FR-048**: Numeric columns MUST be right-aligned and decimal-aligned — values in a numeric (quantity) column are shown with a consistent number of decimal places so the decimal points line up; integers are right-aligned.
- **FR-049**: Pressing Delete or Backspace on the selected cell(s) MUST set them to a missing (null) value, as one undoable action. Missing values MUST have a subtle distinct style (e.g., an orange tint) in both the grid and the card view.

#### Multi-table dictionaries

- **FR-050**: A `data-dict.yaml` MAY describe multiple tables under a `tables:` map. The tool MUST open one tab per table, each with its own grid, validation, undo history, and save target, switchable without losing edits in the others.
- **FR-051**: Each table's `source` MUST be resolved relative to the directory containing the `data-dict.yaml`, not the current working directory. On desktop the tool reads every table's source automatically; in the browser it resolves them within a user-chosen folder (single-table dictionaries keep the single-file flow).
- **FR-052**: The parser MUST accept the multi-table column syntax — type in parenthesized form (`number(id)`), constraints as a list (`constraints: [primary_key, required, unique, foreign_key]`), ranges as `[min, max]`, `source: { parquet: path }`, and per-column/table `description` — in addition to the original single-table forms. Foreign-key targets MAY be resolved from a top-level `relationships:` list.
- **FR-053**: Reconciliation MUST accept the physical encodings real Parquet files use for each dictionary type (e.g. INT32/INT64 identifiers, `INT32(DATE)` dates, integer or floating-point quantities, text or integer-keyed categories), and the tool MUST coerce loaded values to the dictionary's canonical carrier so editing, validation, and saving stay consistent.
- **FR-054**: Each table MUST keep its own scroll position: switching to another table shows it from its last position (a freshly viewed table starts at the top), and returning restores the previous position.
- **FR-055**: Appending a row MUST scroll the new (last) row into view.

### Key Entities *(include if feature involves data)*

- **Dictionary**: The authoritative description of the table. Contains an ordered list of column definitions and is the source of truth for columns, types, constraints, presentation, and saved-file structure.
- **Column Definition**: One column's name, type (from the closed vocabulary), optional range, allowed categorical values (list or key→label pairs), and constraints (required, unique, primary key, foreign key).
- **Dataset**: The collection of records being edited, conforming to the dictionary; loaded from and saved to a data file.
- **Record (Row)**: A single entry in the dataset, one value per column.
- **Cell**: One value at the intersection of a record and a column, presented and validated according to its column definition.
- **Validation Violation**: A specific failure of a cell or column against a dictionary rule, with a location and an explanatory message; contributes to the outstanding-violations count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A matched data-file-and-dictionary pair opens into an editable grid, and 100% of column names, types, categorical values, large-integer values, and date/time-with-timezone values are identical after an open → save → reopen round-trip with no edits.
- **SC-002**: Every mismatched pair is rejected before the grid opens, with a message that names the specific differing columns and/or the first incompatible column's expected and found types — 0% of mismatched pairs open into the grid.
- **SC-003**: Invalid values entered during editing are flagged while remaining editable — per-cell rules (type, range, required, allowed values) immediately, and cross-row rules (unique, primary key) within a short debounce after typing pauses — and the outstanding-violations count reflects the current number of flagged cells once validation settles.
- **SC-004**: The tool never writes a file with outstanding violations without an explicit user confirmation — 0% of violation-bearing saves occur silently.
- **SC-005**: A user familiar with spreadsheets can complete a representative editing task (open, change several cells across types, add a row, fix flagged cells, save) without instructions on first attempt.
- **SC-006**: The grid remains responsive (scrolling and editing feel immediate, and live validation keeps up) on datasets of approximately 10,000 rows.
- **SC-007**: On a phone-sized screen the same dataset is fully editable via the card view with identical validation outcomes to the grid.

## Assumptions

- **Single table**: v1 handles exactly one table; multiple tables and inter-table relationships are out of scope.
- **File-in, file-out**: v1 is a local editing cycle — the user supplies files and saves files; there is no server persistence, sharing, multi-user, or authentication.
- **Save target**: saving aims to overwrite the original file in place; in a plain browser this may not be reliable, so the tool re-exports the same file. A later desktop wrapper (e.g., Electron) is expected to provide dependable in-place overwrite, and eventually per-row persistence to disk as data is entered.
- **Scale**: the tool targets single tables of roughly 10,000 rows for responsive editing and validation.
- **Editing existing data**: the opened file was previously produced by this tool (or an equivalent producer) and the saved file is intended to be reopened later by this tool. Creating a table from a dictionary alone (no source data file) is out of scope for v1.
- **Both files supplied together**: the user always provides the dictionary alongside the data file; the tool does not infer or fetch a dictionary.
- **No formulas or computed values**: formulas, computed columns, and multi-cell aggregate math are out of scope; identifier and other columns offer no aggregation affordances.
- **No right-click context menus** in v1.
- **Foreign keys deferred**: foreign-key constraints are displayed but not enforced because only one table is loaded.
- **Glossary/term surfacing** is deferred to a later version.
- **Modern browser**: the tool runs in a current desktop, tablet, or phone web browser; the desktop browser is the primary target.
- **Date/time storage convention**: a single consistent timezone-aware convention is used for date-time values so that values do not drift across a save/reopen cycle.
