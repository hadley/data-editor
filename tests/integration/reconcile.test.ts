// US2 integration: a matching pair opens; mismatched pairs are blocked with specifics.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "../../src/schema/parse.ts";
import { readParquet } from "../../src/io/readParquet.ts";
import { reconcile } from "../../src/schema/reconcile.ts";

const dir = fileURLToPath(new URL("../../examples/", import.meta.url));
const fixture = new Uint8Array(readFileSync(dir + "foodbank.parquet"));
const dictYaml = readFileSync(dir + "foodbank.yaml", "utf8");

describe("US2 reconciliation against the foodbank fixture", () => {
  it("opens when the dictionary matches the file", async () => {
    const { schemaElements } = await readParquet(fixture);
    const result = reconcile(schemaElements, parse(dictYaml));
    expect(result.ok).toBe(true);
  });

  it("blocks and names a renamed column", async () => {
    const { schemaElements } = await readParquet(fixture);
    const renamed = parse(dictYaml.replace("name: name", "name: full_name"));
    const result = reconcile(schemaElements, renamed);
    expect(result.ok).toBe(false);
    expect(result.missingColumns).toContain("full_name");
    expect(result.extraColumns).toContain("name");
  });

  it("blocks on an incompatible type with expected/found detail", async () => {
    const { schemaElements } = await readParquet(fixture);
    // Claim `meals` (stored DOUBLE) is a boolean.
    const wrong = parse(
      dictYaml.replace("    type: number\n    subtype: quantity", "    type: boolean"),
    );
    const result = reconcile(schemaElements, wrong);
    expect(result.ok).toBe(false);
    expect(result.typeMismatch?.column).toBe("meals");
    expect(result.typeMismatch?.found).toContain("DOUBLE");
    expect(result.typeMismatch?.expected).toContain("boolean");
  });
});
