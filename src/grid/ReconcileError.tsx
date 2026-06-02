// ReconcileError.tsx — shown instead of the grid when the data file and dictionary
// disagree (US2, FR-004/FR-005). Names the specific differences so the user can fix
// either file.

import type { ReconcileResult } from "../schema/types.ts";

interface Props {
  result: ReconcileResult;
  onDismiss: () => void;
}

export function ReconcileError({ result, onDismiss }: Props) {
  return (
    <div style={{ padding: 24, maxWidth: 640, fontFamily: "system-ui" }}>
      <h2 style={{ color: "#c00" }}>The file and dictionary don't match</h2>
      <p style={{ color: "#444" }}>
        The grid won't open until the Parquet file and its <code>data-dict.yaml</code> agree.
        Fix either file and try again.
      </p>

      {result.missingColumns.length > 0 && (
        <section>
          <h3>Columns in the dictionary but missing from the file</h3>
          <ul>
            {result.missingColumns.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.extraColumns.length > 0 && (
        <section>
          <h3>Columns in the file but not in the dictionary</h3>
          <ul>
            {result.extraColumns.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.typeMismatch && (
        <section>
          <h3>Incompatible column type</h3>
          <p>
            Column <code>{result.typeMismatch.column}</code>: expected{" "}
            <strong>{result.typeMismatch.expected}</strong>, but the file has{" "}
            <strong>{result.typeMismatch.found}</strong>.
          </p>
        </section>
      )}

      <button onClick={onDismiss}>Close</button>
    </div>
  );
}
