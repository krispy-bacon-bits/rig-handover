import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Plan § 2d: route tests for the digest page (2a) and the digest JSON (2b).
// Fixtures live in a temp dir. runs/ is read-only and is never touched here.

const GOOD = '2026-10-30';
const EMPTY = '2026-10-29';
const BAD = '2026-10-28';
const MISSING = '2026-10-01';

const GOOD_LINES = [
  '{"at":"2026-10-30T01:00:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-30T01:05:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-30T01:10:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-30T01:15:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  '{"at":"2026-10-30T02:00:00+01:00","job":"notes/backup","status":"fail","owner":null,"error":"quota exceeded"}',
];

const BAD_LINES = [
  '{"at":"2026-10-28T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  'this line does not parse',
];

const JOBS = ['fixtures/refresh', 'notes/backup'];

let dir: string;
let previousMarker: string | undefined;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-'));
  writeFileSync(join(dir, `${GOOD}.jsonl`), GOOD_LINES.join('\n') + '\n');
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(dir, `${BAD}.jsonl`), BAD_LINES.join('\n') + '\n');
  previousMarker = process.env.LANE_MARKER;
  process.env.LANE_MARKER = 'DIGEST-ROUTE-MARKER';
});

afterAll(() => {
  if (previousMarker === undefined) delete process.env.LANE_MARKER;
  else process.env.LANE_MARKER = previousMarker;
  rmSync(dir, { recursive: true, force: true });
});

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
}

// Job names in the order they first appear in the page HTML.
function jobOrderInPage(html: string, jobs: string[]): string[] {
  return jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);
}

describe('GET /digest/:night', () => {
  it('200 on a good night, with the jobs and the lane banner', async () => {
    const res = await app().request(`/digest/${GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS) expect(html).toContain(job);
    expect(html).toContain('lane-07');
    expect(html).toContain('DIGEST-ROUTE-MARKER');
  });

  it('404 on a night with no file', async () => {
    const res = await app().request(`/digest/${MISSING}`);
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain(`no run log for ${MISSING}`);
  });

  it('200 on an empty night and says nothing ran', async () => {
    const res = await app().request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('did not parse');
  });

  it('200 on a night with a bad line and says 1 line did not parse', async () => {
    const res = await app().request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('1 line did not parse');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 on a good night, with rows in the same job order as the page', async () => {
    const res = await app().request(`/api/digest/${GOOD}`);
    const body = (await res.json()) as { night: string; badLines: number; rows: { job: string }[] };
    expect(res.status).toBe(200);
    expect(body.night).toBe(GOOD);
    expect(body.badLines).toBe(0);
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(JOBS);

    const page = await app().request(`/digest/${GOOD}`);
    const html = await page.text();
    expect(jobOrderInPage(html, JOBS)).toEqual(jobs);
  });

  it('404 with an error on a night with no file', async () => {
    const res = await app().request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ night: MISSING, error: 'no run log' });
  });

  it('200 with rows: [] on the empty night', async () => {
    const res = await app().request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, badLines: 0, rows: [] });
  });

  it('200 with badLines: 1 on a night with a bad line', async () => {
    const res = await app().request(`/api/digest/${BAD}`);
    const body = (await res.json()) as { badLines: number; rows: { job: string }[] };
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync']);
  });
});
