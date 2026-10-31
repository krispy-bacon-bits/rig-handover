// Plan morning-digest § 1. The shape every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in runs/<night>.jsonl. Times are the log's own strings, offset kept.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null; // most recent error on any of the job's lines, kept after a later ok. null: no line had one
  firstAt: string;
  lastAt: string;
};

// found false: no file for that night (route returns 404). An empty night is found with no rows.
// badLines counts lines that did not parse. They are skipped, never thrown.
export type Night =
  | { found: false }
  | { found: true; rows: DigestRow[]; badLines: number };

// Implemented in src/digest/read.ts (issue #2), exported as readNight.
// Rows come back sorted by job, so the page and the JSON can never disagree.
export type ReadNight = (runsDir: string, night: string) => Night;
