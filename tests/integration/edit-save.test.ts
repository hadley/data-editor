// US1 integration: load → edit cells across types → add row → save → reopen, lossless.
// Exercises the real Workbook + writeParquet/readParquet path (no canvas).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { readParquet } from "../../src/io/readParquet.ts";
import { writeParquet } from "../../src/io/writeParquet.ts";
import { Workbook } from "../../src/state/workbook.ts";

const dir = fileURLToPath(new URL("../../examples/", import.meta.url));
const dict = parse(readFileSync(dir + "foodbank.yaml", "utf8"));
const fixture = new Uint8Array(readFileSync(dir + "foodbank.parquet"));

describe("US1 edit → save → reopen", () => {
  it("loads the fixture into a workbook with the right shape", async () => {
    const { rows } = await readParquet(fixture);
    const wb = new Workbook(dict, rows);
    expect(wb.rows.length).toBeGreaterThan(0);
    expect(wb.dirty).toBe(false);
    expect(wb.schema.map((s) => s.name)).toEqual(dict.columns.map((c) => c.name));
  });

  it("edits across types and adds a row, persisting losslessly", async () => {
    const { rows } = await readParquet(fixture);
    const wb = new Workbook(dict, rows);
    const n = wb.rows.length; // size-agnostic (demo fixture may grow)

    wb.setCell(0, "name", "Jane R. Doe"); // text
    wb.setCell(0, "visits", 100n); // Int64 (bigint)
    wb.setCell(1, "meals", 9.75); // double
    wb.setCell(1, "active", true); // boolean
    wb.setCell(2, "status", "I"); // enum key
    expect(wb.dirty).toBe(true);

    wb.addRow();
    wb.setCell(n, "client_id", "C-9999");
    wb.setCell(n, "visits", 9007199254740993n); // precision beyond 2^53
    expect(wb.rows.length).toBe(n + 1);

    const bytes = writeParquet(wb.rows, wb.schema);
    const { rows: reread } = await readParquet(bytes);

    expect(reread).toHaveLength(n + 1);
    expect(reread[0].name).toBe("Jane R. Doe");
    expect(reread[0].visits).toBe(100n);
    expect(reread[1].meals).toBe(9.75);
    expect(reread[1].active).toBe(true);
    expect(reread[2].status).toBe("I");
    expect(reread[n].client_id).toBe("C-9999");
    expect(reread[n].visits).toBe(9007199254740993n); // still exact
  });

  it("markSaved clears the dirty flag", async () => {
    const { rows } = await readParquet(fixture);
    const wb = new Workbook(dict, rows);
    wb.setCell(0, "name", "X");
    expect(wb.dirty).toBe(true);
    wb.markSaved();
    expect(wb.dirty).toBe(false);
  });
});
