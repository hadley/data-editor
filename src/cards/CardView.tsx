// CardView.tsx — single-record vertical form for narrow screens (US5, FR-028).
// Binds to the same workbook + validators as the grid (FR-029), so validation is identical.

import type { GridColumnDef } from "../schema/toColumns.ts";
import type { CellValue, Row, Violation } from "../schema/types.ts";

interface Props {
  columns: GridColumnDef[];
  rows: Row[];
  index: number;
  onIndexChange: (index: number) => void;
  onEdit: (row: number, col: string, value: CellValue) => void;
  cellIssue?: (row: number, col: string) => Violation | null;
}

export function CardView({ columns, rows, index, onIndexChange, onEdit, cellIssue }: Props) {
  const safeIndex = Math.min(Math.max(index, 0), Math.max(rows.length - 1, 0));
  const row = rows[safeIndex];

  if (!row) {
    return <p style={{ padding: 16, color: "#666" }}>No records.</p>;
  }

  return (
    <div style={{ padding: 16, maxWidth: 520, margin: "0 auto", fontFamily: "system-ui" }}>
      <nav style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={() => onIndexChange(safeIndex - 1)} disabled={safeIndex <= 0}>
          ‹ Prev
        </button>
        <span style={{ color: "#666" }}>
          Record {safeIndex + 1} of {rows.length}
        </span>
        <button onClick={() => onIndexChange(safeIndex + 1)} disabled={safeIndex >= rows.length - 1}>
          Next ›
        </button>
      </nav>

      {columns.map((def) => {
        const issue = cellIssue?.(safeIndex, def.name) ?? null;
        return (
          <div key={def.name} style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
              {def.title} <span style={{ fontWeight: 400, color: "#999", fontSize: 12 }}>· {def.typeLabel}</span>
            </label>
            <Field def={def} value={row[def.name] ?? null} invalid={!!issue} onChange={(v) => onEdit(safeIndex, def.name, v)} />
            {issue && <div style={{ color: "#c00", fontSize: 12, marginTop: 2 }}>{issue.message}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Field({
  def,
  value,
  invalid,
  onChange,
}: {
  def: GridColumnDef;
  value: CellValue;
  invalid: boolean;
  onChange: (value: CellValue) => void;
}) {
  const missing = value === null || value === undefined || value === "";
  const border = invalid ? "1px solid #c00" : "1px solid #ccc";
  const style = {
    width: "100%",
    padding: "6px 8px",
    border,
    background: !invalid && missing ? "#fff1de" : undefined, // subtle orange for missing
    borderRadius: 4,
    boxSizing: "border-box" as const,
  };

  if (def.kind === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18 }}
      />
    );
  }

  if (def.kind === "enum") {
    return (
      <select style={style} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {def.enumValues?.map((e) => (
          <option key={e.value} value={e.value}>
            {e.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={inputType(def)}
      style={style}
      placeholder={def.placeholder ?? ""}
      value={displayValue(value)}
      onChange={(e) => onChange(parseInput(def, e.target.value))}
    />
  );
}

function inputType(def: GridColumnDef): string {
  if (def.kind === "number") return "number";
  if (def.kind === "date") return "date";
  if (def.kind === "datetime") return "datetime-local";
  return "text";
}

function displayValue(value: CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 16); // for datetime-local
  return String(value);
}

/** Parse a form input string back to a stored CellValue (mirrors cellMapping.fromGridCell). */
export function parseInput(def: GridColumnDef, raw: string): CellValue {
  const s = raw.trim();
  if (s === "") return null;
  if (def.bigintStorage) {
    try {
      return BigInt(s); // exact integer (FR-031)
    } catch {
      return s; // keep invalid text so validation flags it
    }
  }
  if (def.kind === "number") {
    const n = Number(s);
    return Number.isNaN(n) ? s : n;
  }
  if (def.kind === "datetime") return new Date(s);
  return s; // text, id, date (ISO), enum key
}
