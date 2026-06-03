import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { coerceRows } from "../../src/schema/coerce.ts";

const dict = parse(
  [
    "columns:",
    "  - {name: id, type: number(id)}",
    "  - {name: ord, type: number(ordinal)}",
    "  - {name: qty, type: number(quantity)}",
    "  - {name: d, type: date}",
    "  - {name: dt, type: datetime}",
    "  - {name: e, type: enum, values: [A, B]}",
  ].join("\n"),
);

describe("coerceRows", () => {
  it("coerces file carriers to the dictionary's canonical carriers", () => {
    const [r] = coerceRows(dict.columns, [
      { id: 1, ord: 24, qty: 1000, d: new Date("1995-03-24T00:00:00Z"), dt: new Date("2024-01-02T03:04:00Z"), e: "A" },
    ]);
    expect(r.id).toBe("1"); // INT32 id → string
    expect(r.ord).toBe(24n); // INT32 ordinal → bigint
    expect(r.qty).toBe(1000); // number
    expect(r.d).toBe("1995-03-24"); // Date → ISO date string
    expect(r.dt).toBeInstanceOf(Date);
    expect(r.e).toBe("A");
  });

  it("maps null/empty to null and a days-since-epoch date number to ISO", () => {
    const [r] = coerceRows(dict.columns, [{ id: null, ord: null, qty: null, d: 9213 /* days → 1995-03-24 */, dt: null, e: "" }]);
    expect(r.id).toBeNull();
    expect(r.qty).toBeNull();
    expect(r.e).toBeNull();
    expect(r.d).toBe("1995-03-24");
  });

  it("is idempotent on already-canonical values", () => {
    const input = [{ id: "1", ord: 24n, qty: 1.5, d: "2024-01-01", dt: new Date("2024-01-01T00:00:00Z"), e: "B" }];
    const [r] = coerceRows(dict.columns, input);
    expect(r).toEqual({ id: "1", ord: 24n, qty: 1.5, d: "2024-01-01", dt: input[0].dt, e: "B" });
  });
});
