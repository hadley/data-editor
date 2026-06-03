// paths.ts — pure path helpers. A table's `source` is relative to the directory that
// contains the data-dict.yaml, not the current working directory.

/** Directory portion of a path, including the trailing separator ("" if none). */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(0, i + 1) : "";
}

function isAbsolute(path: string): boolean {
  return /^([a-zA-Z]:[\\/]|[\\/])/.test(path);
}

/** Resolve a table `source` against the dictionary's path. Absolute sources pass through. */
export function resolveSourcePath(dictPath: string, source: string): string {
  if (isAbsolute(source)) return source;
  return dirOf(dictPath) + source;
}
