// e2e loads a small, self-contained 4-row Parquet generated here — decoupled from the
// demo fixture's size and impossible to mutate the committed example.

import { parquetWriteBuffer } from "hyparquet-writer";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DICT = fileURLToPath(new URL("../examples/foodbank.yaml", import.meta.url));

const columnData = [
  { name: "client_id", type: "STRING" as const, data: ["C-0001", "C-0002", "C-0003", "C-0004"] },
  { name: "name", type: "STRING" as const, nullable: false, data: ["Jane Doe", "John Smith", "Ana Ruiz", "Sam Lee"] },
  { name: "visits", type: "INT64" as const, nullable: true, data: [12n, 5n, 0n, 3n] },
  { name: "meals", type: "DOUBLE" as const, nullable: true, data: [24, 0, 8.5, 6] },
  { name: "active", type: "BOOLEAN" as const, nullable: true, data: [true, false, true, true] },
  { name: "signup_date", type: "STRING" as const, nullable: true, data: ["2023-01-15", "2022-11-30", "2024-02-02", "2023-07-21"] },
  {
    name: "last_seen",
    type: "TIMESTAMP" as const,
    nullable: true,
    data: [
      new Date("2024-03-01T12:00:00Z"),
      new Date("2024-06-15T08:30:00Z"),
      new Date("2024-09-09T17:45:00Z"),
      new Date("2024-10-02T09:15:00Z"),
    ],
  },
  { name: "status", type: "STRING" as const, nullable: true, data: ["A", "I", "A", "A"] },
  { name: "region", type: "STRING" as const, nullable: true, data: ["north", "south", "east", "west"] },
];

const dir = mkdtempSync(join(tmpdir(), "de-e2e-"));
export const PARQUET = join(dir, "foodbank.parquet");
writeFileSync(PARQUET, new Uint8Array(parquetWriteBuffer({ columnData })));

// A tall single-table dataset (raw text + bytes) for scroll tests, loaded via __loadForTest.
function tallParquet(n: number): number[] {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(`R-${String(i).padStart(4, "0")}`);
  const buf = parquetWriteBuffer({
    columnData: [
      { name: "id", type: "STRING" as const, data: ids },
      { name: "n", type: "INT64" as const, nullable: true, data: ids.map((_, i) => BigInt(i)) },
    ],
  });
  return Array.from(new Uint8Array(buf));
}
export const TALL_DICT = `name: tall\ncolumns:\n  - {name: id, type: number(id)}\n  - {name: n, type: number(ordinal)}\n`;
export const TALL_BYTES_A = tallParquet(80);
export const TALL_BYTES_B = tallParquet(80);
export const TWO_TABLE_DICTS = [
  { name: "alpha", text: `name: alpha\ncolumns:\n  - {name: id, type: number(id)}\n  - {name: n, type: number(ordinal)}\n` },
  { name: "beta", text: `name: beta\ncolumns:\n  - {name: id, type: number(id)}\n  - {name: n, type: number(ordinal)}\n` },
];

// A multi-table dictionary (new format) for exercising the multi-table open branch.
export const MULTI_DICT = join(dir, "multi-dict.yaml");
writeFileSync(
  MULTI_DICT,
  `tables:
  account:
    source: { parquet: raw-data/account.parquet }
    columns:
      - { name: account_id, type: number(id), constraints: [primary_key] }
  district:
    source: { parquet: raw-data/district.parquet }
    columns:
      - { name: district_id, type: number(id), constraints: [primary_key] }
`,
);
