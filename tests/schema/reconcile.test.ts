import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { toArrow } from "../../src/schema/toArrow.ts";
import { writeParquet } from "../../src/io/writeParquet.ts";
import { readParquet, type SchemaElementInfo } from "../../src/io/readParquet.ts";
import { reconcile } from "../../src/schema/reconcile.ts";
import type { Row } from "../../src/schema/types.ts";

const DICT_YAML = [
  "columns:",
  "  - {name: id, type: number, subtype: id}",
  "  - {name: n, type: number, subtype: ordinal}",
  "  - {name: q, type: number, subtype: quantity}",
  "  - {name: s, type: string}",
  "  - {name: b, type: boolean}",
  "  - {name: dt, type: datetime}",
  "  - {name: e, type: enum, values: [x, y]}",
].join("\n");

const dict = parse(DICT_YAML);
const sampleRow: Row = {
  id: "A1",
  n: 5n,
  q: 1.5,
  s: "hi",
  b: true,
  dt: new Date("2024-01-01T00:00:00Z"),
  e: "x",
};

async function schemaOf(rows: Row[], schema = toArrow(dict.columns)): Promise<SchemaElementInfo[]> {
  const bytes = writeParquet(rows, schema);
  return (await readParquet(bytes)).schemaElements;
}

describe("reconcile", () => {
  it("accepts a matching pair", async () => {
    const result = reconcile(await schemaOf([sampleRow]), dict);
    expect(result.ok).toBe(true);
    expect(result.missingColumns).toEqual([]);
    expect(result.extraColumns).toEqual([]);
    expect(result.typeMismatch).toBeNull();
  });

  it("is order-insensitive (reordered columns still match)", async () => {
    const reordered = parse(
      [
        "columns:",
        "  - {name: e, type: enum, values: [x, y]}",
        "  - {name: b, type: boolean}",
        "  - {name: id, type: number, subtype: id}",
        "  - {name: n, type: number, subtype: ordinal}",
        "  - {name: q, type: number, subtype: quantity}",
        "  - {name: s, type: string}",
        "  - {name: dt, type: datetime}",
      ].join("\n"),
    );
    const result = reconcile(await schemaOf([sampleRow]), reordered);
    expect(result.ok).toBe(true);
  });

  it("reports missing and extra columns by name", async () => {
    const fileSchema = await schemaOf([sampleRow]); // file has id,n,q,s,b,dt,e
    const altered = parse(
      [
        "columns:",
        "  - {name: id, type: number, subtype: id}",
        "  - {name: n, type: number, subtype: ordinal}",
        "  - {name: q, type: number, subtype: quantity}",
        "  - {name: s, type: string}",
        "  - {name: b, type: boolean}",
        "  - {name: dt, type: datetime}",
        "  - {name: extra_in_dict, type: string}", // missing from file
      ].join("\n"),
    );
    const result = reconcile(fileSchema, altered);
    expect(result.ok).toBe(false);
    expect(result.missingColumns).toEqual(["extra_in_dict"]);
    expect(result.extraColumns).toEqual(["e"]); // e is in file but not this dict
  });

  it("reports the first type mismatch with expected and found", async () => {
    // File stores `n` as ordinal INT64, but the dict claims it is a string.
    const fileSchema = await schemaOf([sampleRow]);
    const wrongType = parse(
      [
        "columns:",
        "  - {name: id, type: number, subtype: id}",
        "  - {name: n, type: string}", // mismatch: INT64 found, string expected
        "  - {name: q, type: number, subtype: quantity}",
        "  - {name: s, type: string}",
        "  - {name: b, type: boolean}",
        "  - {name: dt, type: datetime}",
        "  - {name: e, type: enum, values: [x, y]}",
      ].join("\n"),
    );
    const result = reconcile(fileSchema, wrongType);
    expect(result.ok).toBe(false);
    expect(result.typeMismatch?.column).toBe("n");
    expect(result.typeMismatch?.found).toContain("INT64");
  });

  it("distinguishes datetime (TIMESTAMP) from a plain ordinal INT64", async () => {
    const fileSchema = await schemaOf([sampleRow]);
    // dict claims `dt` is an ordinal integer, but file stored it as TIMESTAMP
    const wrong = parse(
      [
        "columns:",
        "  - {name: id, type: number, subtype: id}",
        "  - {name: n, type: number, subtype: ordinal}",
        "  - {name: q, type: number, subtype: quantity}",
        "  - {name: s, type: string}",
        "  - {name: b, type: boolean}",
        "  - {name: dt, type: number, subtype: ordinal}",
        "  - {name: e, type: enum, values: [x, y]}",
      ].join("\n"),
    );
    const result = reconcile(fileSchema, wrong);
    expect(result.ok).toBe(false);
    expect(result.typeMismatch?.column).toBe("dt");
  });
});
