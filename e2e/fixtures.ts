// Load e2e from a temp COPY of the Parquet fixture so nothing the app does (saves,
// downloads, accidental writes) can ever mutate the committed example file.

import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DICT = fileURLToPath(new URL("../examples/foodbank.yaml", import.meta.url));

const src = fileURLToPath(new URL("../examples/foodbank.parquet", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "de-e2e-"));
export const PARQUET = join(dir, "foodbank.parquet");
copyFileSync(src, PARQUET);
