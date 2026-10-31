import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countNight, readNight } from '../src/digest/read.js';
import type { DigestRow, Night } from '../src/digest/types.js';

function rowsOf(night: Night): { rows: DigestRow[]; badLines: number } {
  if (!night.found) throw new Error('expected the night to be found');
  return night;
}

function row(rows: DigestRow[], job: string): DigestRow {
  const r = rows.find((x) => x.job === job);
  if (!r) throw new Error(`no row for ${job}`);
  return r;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const { rows, badLines } = rowsOf(readNight('runs', '2026-10-28'));

  it('finds 5 jobs and 1 bad line', () => {
    expect(rows).toHaveLength(5);
    expect(badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps the last error after a retry that then succeeded', () => {
    expect(row(rows, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('reports a failed job with its error', () => {
    const r = row(rows, 'notes/backup');
    expect(r.lastStatus).toBe('fail');
    expect(r.lastError).toBe('quota exceeded');
  });

  it('keeps a null owner', () => {
    const r = row(rows, 'digest/render');
    expect(r.owner).toBeNull();
    expect(r.lastError).toBeNull();
  });

  it('keeps times as the log wrote them, offset included', () => {
    const r = row(rows, 'lane/sync');
    expect(r.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(r.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns found false for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({ found: false });
  });

  it('returns found with no rows for an empty night', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({ found: true, rows: [], badLines: 0 });
  });

  it('rejects a night name that is not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'secret.jsonl'), '{"at":"2026-01-01T00:00:00Z","job":"x","status":"ok","owner":null}\n');
    for (const night of ['secret', '../runs/2026-10-28', '2026-1-1', '2026-01-01.jsonl', '']) {
      expect(readNight(dir, night)).toEqual({ found: false });
    }
  });

  it('counts lines without a valid at, job or status as bad, and skips blank lines', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '{"job":"a","status":"ok","owner":"x"}',
      '{"at":"yesterday","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T02:00:00+01:00","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"done","owner":"x"}',
      '[]',
      '',
      '   ',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n') + '\n');
    const { rows, badLines } = rowsOf(readNight(dir, '2026-01-03'));
    expect(badLines).toBe(5);
    expect(rows).toHaveLength(1);
  });

  it('orders a job by time, not by file order', () => {
    const lines = [
      '{"at":"2026-01-04T02:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-04T01:00:00+01:00","job":"a","status":"retry","owner":"x","error":"boom"}',
    ];
    writeFileSync(join(dir, '2026-01-04.jsonl'), lines.join('\n'));
    const r = row(rowsOf(readNight(dir, '2026-01-04')).rows, 'a');
    expect(r.firstAt).toBe('2026-01-04T01:00:00+01:00');
    expect(r.lastAt).toBe('2026-01-04T02:00:00+01:00');
    expect(r.lastStatus).toBe('ok');
    expect(r.lastError).toBe('boom');
  });
});

describe('countNight', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('counts parsed lines by status on runs/2026-10-28.jsonl', () => {
    expect(countNight('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('returns null for a night with no file or a bad name', () => {
    expect(countNight(dir, '2026-01-01')).toBeNull();
    expect(countNight(dir, '../x')).toBeNull();
  });

  it('does not count lines that do not parse', () => {
    writeFileSync(
      join(dir, '2026-01-05.jsonl'),
      ['{"at":"2026-01-05T01:00:00Z","job":"a","status":"ok"}', 'garbage', '{"at":"2026-01-05T02:00:00Z","job":"a","status":"fail"}'].join('\n'),
    );
    expect(countNight(dir, '2026-01-05')).toEqual({ ok: 1, retry: 0, fail: 1 });
  });

  it('returns zeros for an empty night', () => {
    writeFileSync(join(dir, '2026-01-06.jsonl'), '');
    expect(countNight(dir, '2026-01-06')).toEqual({ ok: 0, retry: 0, fail: 0 });
  });
});
