import { describe, expect, it } from "vitest";
import { dirOf, resolveSourcePath } from "../../src/platform/paths.ts";

describe("resolveSourcePath", () => {
  it("resolves a source relative to the dictionary's directory", () => {
    expect(resolveSourcePath("/home/u/proj/data-dict.yaml", "raw-data/account.parquet")).toBe(
      "/home/u/proj/raw-data/account.parquet",
    );
  });

  it("passes absolute sources through unchanged", () => {
    expect(resolveSourcePath("/home/u/proj/data-dict.yaml", "/abs/account.parquet")).toBe(
      "/abs/account.parquet",
    );
  });

  it("handles a dict path with no directory", () => {
    expect(resolveSourcePath("data-dict.yaml", "raw/x.parquet")).toBe("raw/x.parquet");
  });

  it("dirOf returns the directory with trailing separator", () => {
    expect(dirOf("/a/b/c.yaml")).toBe("/a/b/");
    expect(dirOf("c.yaml")).toBe("");
  });
});
