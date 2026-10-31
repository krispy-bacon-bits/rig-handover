import type { DigestRow } from '../digest/types.js';

const dash = '—';

function Mark({ children }: { children: string }) {
  return <strong class="warn">{children}</strong>;
}

function Row({ row }: { row: DigestRow }) {
  return (
    <tr>
      <td>{row.job}</td>
      <td>{row.owner ?? dash}</td>
      <td>{row.runs}</td>
      <td>{row.retries >= 3 ? <Mark>{String(row.retries)}</Mark> : row.retries}</td>
      <td>{row.lastStatus === 'fail' ? <Mark>fail</Mark> : row.lastStatus}</td>
      <td>{row.lastError ?? dash}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestPage({ night, rows, badLines }: { night: string; rows: DigestRow[]; badLines: number }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row row={row} />
            ))}
          </tbody>
        </table>
      )}
      {badLines > 0 && (
        <p class="mute">
          {badLines} {badLines === 1 ? 'line' : 'lines'} did not parse
        </p>
      )}
    </>
  );
}

export function NoRunLog({ night }: { night: string }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p>no run log for {night}</p>
    </>
  );
}
