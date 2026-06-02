// Milestone-0: prove the riskiest data path before any UI.
// parse → toArrow → writeParquet → readParquet → deep-equal,
// asserting BigInt (Int64), datetime instant, enum keys, and nulls survive (FR-021, SC-001).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { toArrow } from "../../src/schema/toArrow.ts";
import { writeParquet } from "../../src/io/writeParquet.ts";
import { readParquet } from "../../src/io/readParquet.ts";
import type { Row } from "../../src/schema/types.ts";

const yamlPath = fileURLToPath(new URL("../../examples/foodbank.yaml", import.meta.url));
const dict = parse(readFileSync(yamlPath, "utf8"));
const schema = toArrow(dict.columns);

const bigId = 9007199254740993n; // 2^53 + 1 — unrepresentable as a JS number

const rows: Row[] = [
  {
    client_id: "C-0001",
    name: "Jane Doe",
    visits: bigId,
    meals: 12.5,
    active: true,
    signup_date: "2023-01-15",
    last_seen: new Date("2024-03-01T12:00:00.000Z"),
    status: "A",
    region: "north",
  },
  {
    client_id: "C-0002",
    name: "John Smith",
    visits: 3n,
    meals: 0,
    active: false,
    signup_date: "2022-11-30",
    last_seen: new Date("2024-06-15T08:30:00.000Z"),
    status: "I",
    region: "south",
  },
  {
    client_id: "C-0003",
    name: "Sam Null",
    visits: null,
    meals: null,
    active: null,
    signup_date: null,
    last_seen: null,
    status: null,
    region: null,
  },
];

function normalize(r: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "bigint") out[k] = v.toString() + "n";
    else if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}

describe("Milestone-0 round-trip", () => {
  it("round-trips all dictionary types losslessly", async () => {
    const bytes = writeParquet(rows, schema);
    const { rows: read } = await readParquet(bytes);

    expect(read).toHaveLength(rows.length);
    expect(read.map(normalize)).toEqual(rows.map(normalize));
  });

  it("preserves Int64 precision past 2^53 (no float coercion)", async () => {
    const bytes = writeParquet(rows, schema);
    const { rows: read } = await readParquet(bytes);
    expect(read[0].visits).toBe(bigId);
    expect(typeof read[0].visits).toBe("bigint");
  });

  it("preserves the datetime instant as a Date", async () => {
    const bytes = writeParquet(rows, schema);
    const { rows: read } = await readParquet(bytes);
    expect(read[0].last_seen).toBeInstanceOf(Date);
    expect((read[0].last_seen as Date).toISOString()).toBe("2024-03-01T12:00:00.000Z");
  });

  it("preserves enum keys (not labels)", async () => {
    const bytes = writeParquet(rows, schema);
    const { rows: read } = await readParquet(bytes);
    expect(read[0].status).toBe("A");
    expect(read[1].status).toBe("I");
  });

  it("opens an empty dataset (zero rows) without error", async () => {
    const bytes = writeParquet([], schema);
    const { rows: read } = await readParquet(bytes);
    expect(read).toEqual([]);
  });
});
