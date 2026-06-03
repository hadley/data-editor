// Integration test against a real multi-table dictionary + Parquet files, if present.
// Verifies the loan-application dataset parses, reconciles, and coerces for every table.
// Skipped automatically when the local dataset isn't available.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTables } from "../../src/schema/parse.ts";
import { reconcile } from "../../src/schema/reconcile.ts";
import { coerceRows } from "../../src/schema/coerce.ts";
import { readParquet } from "../../src/io/readParquet.ts";
import { resolveSourcePath } from "../../src/platform/paths.ts";
import { toValidators } from "../../src/schema/toValidators.ts";

const dictPath = join(homedir(), "Documents/data-dictionary/loan-application/data-dict.yaml");
const present = existsSync(dictPath);
const maybe = present ? describe : describe.skip;

maybe("loan-application dataset", () => {
  const dictText = present ? readFileSync(dictPath, "utf8") : "";
  const tables = present ? parseTables(dictText) : [];

  it("parses into the expected 8 tables", () => {
    expect(tables.map((t) => t.name)).toEqual([
      "account",
      "client",
      "disp",
      "order",
      "trans",
      "loan",
      "card",
      "district",
    ]);
  });

  it("reconciles every table's real Parquet file (INT32 ids, DATE, etc.)", async () => {
    for (const t of tables) {
      const file = resolveSourcePath(dictPath, t.source[0]);
      const { schemaElements } = await readParquet(new Uint8Array(readFileSync(file)));
      const result = reconcile(schemaElements, t);
      expect(result, `${t.name}: ${JSON.stringify(result)}`).toMatchObject({ ok: true });
    }
  });

  it("coerces values to canonical carriers and they validate", async () => {
    const account = tables.find((t) => t.name === "account")!;
    const file = resolveSourcePath(dictPath, account.source[0]);
    const { rows } = await readParquet(new Uint8Array(readFileSync(file)));
    const coerced = coerceRows(account.columns, rows);
    const r0 = coerced[0];
    expect(typeof r0.account_id).toBe("string"); // INT32 id → text
    expect(typeof r0.date).toBe("string"); // DATE → ISO string
    expect(r0.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Coerced values pass per-cell validation.
    const v = toValidators(account.columns);
    for (const c of account.columns) {
      expect(v.validateCell(c.name, r0[c.name] ?? null), `${c.name}=${String(r0[c.name])}`).toBeNull();
    }
  });
});
