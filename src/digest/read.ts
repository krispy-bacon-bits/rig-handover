import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CountNight, DigestRow, Night, NightCounts, ReadNight, RunStatus } from './types.js';

// Plan morning-digest § 1. One row per job from runs/<night>.jsonl.

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

type Line = {
  at: string;
  ms: number; // for ordering only; `at` is what gets shown
  seq: number; // file order breaks ties
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

// The edge: raw text in, a typed Line or null out.
function parseLine(text: string, seq: number): Line | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const { at, job, status, owner, error } = raw;
  if (typeof at !== 'string' || !AT.test(at)) return null;
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  return {
    at,
    ms,
    seq,
    job,
    status,
    owner: typeof owner === 'string' ? owner : null,
    error: typeof error === 'string' && error !== '' ? error : null,
  };
}

function toRow(job: string, lines: Line[]): DigestRow {
  const sorted = [...lines].sort((a, b) => a.ms - b.ms || a.seq - b.seq);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const lastError = sorted.findLast((l) => l.error !== null)?.error ?? null;
  return {
    job,
    owner: last.owner,
    runs: sorted.length,
    retries: sorted.filter((l) => l.status === 'retry').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

// Shared by readNight and countNight, so there is one reader and one parser.
function readLines(runsDir: string, night: string): { lines: Line[]; badLines: number } | null {
  if (!NIGHT.test(night)) return null;

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (isRecord(err) && err.code === 'ENOENT') return null;
    throw err;
  }

  const lines: Line[] = [];
  let badLines = 0;
  text.split(/\r?\n/).forEach((t, seq) => {
    if (t.trim() === '') return;
    const line = parseLine(t, seq);
    if (line) lines.push(line);
    else badLines++;
  });
  return { lines, badLines };
}

export const readNight: ReadNight = (runsDir, night): Night => {
  const read = readLines(runsDir, night);
  if (!read) return { found: false };

  const byJob = new Map<string, Line[]>();
  for (const line of read.lines) {
    const list = byJob.get(line.job);
    if (list) list.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.entries()]
    .map(([job, lines]) => toRow(job, lines))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { found: true, rows, badLines: read.badLines };
};

// Parsed lines by status. Lines that do not parse are not counted here.
export const countNight: CountNight = (runsDir, night): NightCounts | null => {
  const read = readLines(runsDir, night);
  if (!read) return null;
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of read.lines) counts[line.status]++;
  return counts;
};
