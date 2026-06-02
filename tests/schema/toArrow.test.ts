import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { toArrow } from "../../src/schema/toArrow.ts";
import type { BasicType } from "../../src/schema/types.ts";

function specFor(yamlText: string) {
  return toArrow(parse(yamlText).columns);
}

describe("toArrow", () => {
  it("maps each dictionary type to its v1 physical type", () => {
    const schema = specFor(
      [
        "columns:",
        "  - {name: id, type: number, subtype: id}",
        "  - {name: ord, type: number, subtype: ordinal}",
        "  - {name: qty, type: number, subtype: quantity}",
        "  - {name: s, type: string}",
        "  - {name: b, type: boolean}",
        "  - {name: d, type: date}",
        "  - {name: dt, type: datetime}",
        "  - {name: e, type: enum, values: [a, b]}",
      ].join("\n"),
    );
    const got = Object.fromEntries(schema.map((s) => [s.name, s.basicType]));
    const expected: Record<string, BasicType> = {
      id: "STRING",
      ord: "INT64",
      qty: "DOUBLE",
      s: "STRING",
      b: "BOOLEAN",
      d: "STRING",
      dt: "TIMESTAMP",
      e: "STRING",
    };
    expect(got).toEqual(expected);
  });

  it("keeps storage nullable even for required columns (required is a validation rule)", () => {
    // The tool can save flagged-invalid data, incl. a freshly added row whose required
    // cells are still null, so physical storage must tolerate nulls everywhere.
    const schema = specFor(
      `columns:\n  - {name: req, type: string, required: true}\n  - {name: opt, type: string}`,
    );
    expect(schema.find((s) => s.name === "req")!.nullable).toBe(true);
    expect(schema.find((s) => s.name === "opt")!.nullable).toBe(true);
  });

  it("preserves dictionary column order", () => {
    const schema = specFor(`columns:\n  - {name: z, type: string}\n  - {name: a, type: string}`);
    expect(schema.map((s) => s.name)).toEqual(["z", "a"]);
  });
});
