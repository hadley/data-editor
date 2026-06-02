// US5: the card view edits one record with the same validation as the grid (FR-028/FR-029).

import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { toColumns } from "../../src/schema/toColumns.ts";
import { Workbook } from "../../src/state/workbook.ts";
import { CardView, parseInput } from "../../src/cards/CardView.tsx";
import type { Row } from "../../src/schema/types.ts";

const dict = parse(
  [
    "columns:",
    "  - {name: name, type: string, required: true}",
    "  - {name: amount, type: number, subtype: quantity}",
    "  - {name: status, type: enum, values: {A: Active, I: Inactive}}",
  ].join("\n"),
);
const columns = toColumns(dict.columns);
const seed = (): Row[] => [
  { name: "Jane", amount: 10, status: "A" },
  { name: "John", amount: 20, status: "I" },
];

function Harness() {
  const [wb] = useState(() => new Workbook(dict, seed()));
  const [index, setIndex] = useState(0);
  const [, force] = useState(0);
  return (
    <CardView
      columns={columns}
      rows={wb.rows}
      index={index}
      onIndexChange={setIndex}
      onEdit={(r, c, v) => {
        wb.setCell(r, c, v);
        force((n) => n + 1);
      }}
      cellIssue={(r, c) => wb.cellIssue(r, c)}
    />
  );
}

describe("CardView (US5)", () => {
  it("shows one record at a time with paging", () => {
    render(<Harness />);
    expect(screen.getByText("Record 1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByText("Next ›"));
    expect(screen.getByText("Record 2 of 2")).toBeTruthy();
  });

  it("flags a required field cleared in the card (validation parity)", () => {
    render(<Harness />);
    const nameInput = screen.getByDisplayValue("Jane");
    fireEvent.change(nameInput, { target: { value: "" } });
    expect(screen.getByText("name is required")).toBeTruthy();
  });
});

describe("parseInput", () => {
  const def = (n: string) => columns.find((c) => c.name === n)!;
  it("parses numbers and keeps invalid text for validation", () => {
    expect(parseInput(def("amount"), "3.5")).toBe(3.5);
    expect(parseInput(def("amount"), "")).toBeNull();
  });
  it("passes through enum keys and text", () => {
    expect(parseInput(def("status"), "A")).toBe("A");
    expect(parseInput(def("name"), "Sam")).toBe("Sam");
  });
});

// Silence act() noise irrelevant to these assertions.
vi.spyOn(console, "error").mockImplementation(() => {});
