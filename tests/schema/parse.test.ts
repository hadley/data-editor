import { describe, expect, it } from "vitest";
import { parse, DictParseError } from "../../src/schema/parse.ts";

describe("parse", () => {
  it("normalizes an enum given as a list to {value,label}", () => {
    const dict = parse(`columns:\n  - name: region\n    type: enum\n    values: [north, south]`);
    expect(dict.columns[0].values).toEqual([
      { value: "north", label: "north" },
      { value: "south", label: "south" },
    ]);
  });

  it("normalizes an enum given as a map to {value,label}", () => {
    const dict = parse(`columns:\n  - name: status\n    type: enum\n    values: {A: Active, I: Inactive}`);
    expect(dict.columns[0].values).toEqual([
      { value: "A", label: "Active" },
      { value: "I", label: "Inactive" },
    ]);
  });

  it("primary_key implies required and unique", () => {
    const dict = parse(`columns:\n  - name: id\n    type: number\n    subtype: id\n    primary_key: true`);
    const col = dict.columns[0];
    expect(col.primary_key).toBe(true);
    expect(col.required).toBe(true);
    expect(col.unique).toBe(true);
  });

  it("captures range, examples, and table name", () => {
    const dict = parse(
      `name: t\ncolumns:\n  - name: n\n    type: number\n    subtype: quantity\n    range: {min: 0, max: 10}\n  - name: s\n    type: string\n    examples: [a, b]`,
    );
    expect(dict.name).toBe("t");
    expect(dict.columns[0].range).toEqual({ min: 0, max: 10 });
    expect(dict.columns[1].examples).toEqual(["a", "b"]);
  });

  it("throws on unknown type, naming the column", () => {
    expect(() => parse(`columns:\n  - name: x\n    type: bogus`)).toThrow(DictParseError);
    expect(() => parse(`columns:\n  - name: x\n    type: bogus`)).toThrow(/x/);
  });

  it("throws when a number column lacks a subtype", () => {
    expect(() => parse(`columns:\n  - name: n\n    type: number`)).toThrow(/subtype/);
  });

  it("throws when an enum lacks values", () => {
    expect(() => parse(`columns:\n  - name: e\n    type: enum`)).toThrow(/values/);
  });

  it("throws when columns is missing", () => {
    expect(() => parse(`name: t`)).toThrow(/columns/);
  });

  it("normalizes `source` to a string array (FR-038)", () => {
    expect(parse(`source: a.parquet\ncolumns:\n  - {name: x, type: string}`).source).toEqual(["a.parquet"]);
    expect(parse(`source: [a.parquet, b.parquet]\ncolumns:\n  - {name: x, type: string}`).source).toEqual([
      "a.parquet",
      "b.parquet",
    ]);
    expect(parse(`columns:\n  - {name: x, type: string}`).source).toEqual([]);
  });
});
