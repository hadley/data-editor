import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { toValidators } from "../../src/schema/toValidators.ts";
import type { Row } from "../../src/schema/types.ts";

const v = toValidators(
  parse(
    [
      "columns:",
      "  - {name: id, type: number, subtype: id, primary_key: true}",
      "  - {name: n, type: number, subtype: ordinal, range: {min: 0, max: 10}}",
      "  - {name: q, type: number, subtype: quantity}",
      "  - {name: req, type: string, required: true}",
      "  - {name: d, type: date}",
      "  - {name: e, type: enum, values: {A: Active, I: Inactive}}",
      "  - {name: code, type: string, unique: true}",
    ].join("\n"),
  ).columns,
);

describe("per-cell validation", () => {
  it("flags required cells that are empty", () => {
    expect(v.validateCell("req", null)?.rule).toBe("required");
    expect(v.validateCell("req", "")?.rule).toBe("required");
    expect(v.validateCell("req", "ok")).toBeNull();
  });

  it("allows null in non-required cells", () => {
    expect(v.validateCell("q", null)).toBeNull();
  });

  it("flags type mismatches", () => {
    expect(v.validateCell("n", "not a number")?.rule).toBe("type");
    expect(v.validateCell("q", "x")?.rule).toBe("type");
    expect(v.validateCell("n", 5n)).toBeNull();
  });

  it("enforces inclusive range bounds", () => {
    expect(v.validateCell("n", 0n)).toBeNull();
    expect(v.validateCell("n", 10n)).toBeNull();
    expect(v.validateCell("n", -1n)?.rule).toBe("range");
    expect(v.validateCell("n", 11n)?.rule).toBe("range");
  });

  it("enforces enum membership and reports the rule", () => {
    expect(v.validateCell("e", "A")).toBeNull();
    expect(v.validateCell("e", "Z")?.rule).toBe("enum");
  });

  it("validates ISO date format", () => {
    expect(v.validateCell("d", "2024-01-01")).toBeNull();
    expect(v.validateCell("d", "01/01/2024")?.rule).toBe("type");
  });
});

describe("table-level validation", () => {
  const row = (id: string, code: string | null): Row => ({
    id,
    n: 1n,
    q: 1,
    req: "x",
    d: "2024-01-01",
    e: "A",
    code,
  });

  it("flags duplicate primary keys", () => {
    const issues = v.validateTable([row("A", "c1"), row("A", "c2"), row("B", "c3")]);
    const pk = issues.filter((i) => i.rule === "primary_key");
    expect(pk.length).toBe(2); // both rows with id "A"
  });

  it("flags duplicate values in a unique column", () => {
    const issues = v.validateTable([row("A", "dup"), row("B", "dup"), row("C", "ok")]);
    const uniq = issues.filter((i) => i.rule === "unique");
    expect(uniq.length).toBe(2);
  });

  it("does not flag unique violations across null values", () => {
    const issues = v.validateTable([row("A", null), row("B", null)]);
    expect(issues.filter((i) => i.rule === "unique")).toEqual([]);
  });

  it("passes a clean table", () => {
    expect(v.validateTable([row("A", "c1"), row("B", "c2")])).toEqual([]);
  });
});

describe("composite primary key", () => {
  const cv = toValidators(
    parse(
      [
        "columns:",
        "  - {name: a, type: string, primary_key: true}",
        "  - {name: b, type: string, primary_key: true}",
      ].join("\n"),
    ).columns,
  );
  it("flags only duplicate tuples, not duplicate single parts", () => {
    const rows: Row[] = [
      { a: "x", b: "1" },
      { a: "x", b: "2" }, // same a, different b → OK
      { a: "x", b: "1" }, // duplicate tuple → flagged
    ];
    const issues = cv.validateTable(rows);
    const pk = issues.filter((i) => i.rule === "primary_key");
    // rows 0 and 2 form the duplicate tuple → 2 cells per row flagged (a, b)
    expect(pk.length).toBe(4);
  });
});
