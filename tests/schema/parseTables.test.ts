import { describe, expect, it } from "vitest";
import { parse, parseTables } from "../../src/schema/parse.ts";

const MULTI = `
tables:
  account:
    description: Bank accounts.
    source:
      parquet: raw-data/account.parquet
    columns:
      - name: account_id
        type: number(id)
        constraints: [primary_key]
        description: Unique id.
        examples: [1, 1183]
      - name: district_id
        type: number(id)
        constraints: [required, foreign_key]
      - name: frequency
        type: enum
        values:
          POPLATEK MESICNE: Monthly
          POPLATEK TYDNE: Weekly
        constraints: [required]
      - name: amount
        type: number(quantity)
        constraints: [required]
        range: [1, 14882]
  district:
    source:
      parquet: raw-data/district.parquet
    columns:
      - name: district_id
        type: number(id)
        constraints: [primary_key]
relationships:
  - cardinality: many-to-one
    join: account.district_id = district.district_id
`;

describe("parseTables — multi-table format", () => {
  const tables = parseTables(MULTI);

  it("returns one DataDict per table, preserving order", () => {
    expect(tables.map((t) => t.name)).toEqual(["account", "district"]);
  });

  it("captures the table description and source path", () => {
    expect(tables[0].description).toBe("Bank accounts.");
    expect(tables[0].source).toEqual(["raw-data/account.parquet"]);
  });

  it("parses parenthesized number types into base + subtype", () => {
    const cols = Object.fromEntries(tables[0].columns.map((c) => [c.name, c]));
    expect(cols.account_id.type).toBe("number");
    expect(cols.account_id.subtype).toBe("id");
    expect(cols.amount.type).toBe("number");
    expect(cols.amount.subtype).toBe("quantity");
  });

  it("derives constraints from the list (pk ⇒ required + unique)", () => {
    const id = tables[0].columns[0];
    expect(id.primary_key).toBe(true);
    expect(id.required).toBe(true);
    expect(id.unique).toBe(true);
  });

  it("parses range given as a [min, max] list", () => {
    const amount = tables[0].columns.find((c) => c.name === "amount")!;
    expect(amount.range).toEqual({ min: 1, max: 14882 });
  });

  it("normalizes enum maps to value/label and keeps descriptions", () => {
    const freq = tables[0].columns.find((c) => c.name === "frequency")!;
    expect(freq.values).toEqual([
      { value: "POPLATEK MESICNE", label: "Monthly" },
      { value: "POPLATEK TYDNE", label: "Weekly" },
    ]);
    expect(tables[0].columns[0].description).toBe("Unique id.");
  });

  it("resolves foreign-key targets from relationships", () => {
    const fk = tables[0].columns.find((c) => c.name === "district_id")!;
    expect(fk.foreign_key).toEqual({ table: "district", column: "district_id" });
  });
});

describe("parse — single-table back-compat", () => {
  it("still parses the old flat-columns format", () => {
    const dict = parse("name: t\ncolumns:\n  - {name: n, type: number, subtype: ordinal, range: {min: 0, max: 5}}");
    expect(dict.name).toBe("t");
    expect(dict.columns[0].subtype).toBe("ordinal");
    expect(dict.columns[0].range).toEqual({ min: 0, max: 5 });
  });

  it("parseTables wraps a single-table dict in a one-element array", () => {
    const tables = parseTables("columns:\n  - {name: n, type: string}");
    expect(tables).toHaveLength(1);
    expect(tables[0].columns[0].name).toBe("n");
  });
});
