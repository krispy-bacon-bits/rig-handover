import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

// Plan morning-digest § 3. Saves one rig page as one HTML file. The page is self-contained
// (ADR 0001), so the file is the whole preview. The banner shows LANE_MARKER from the env.
// Usage: pnpm save-page /digest/2026-10-28 var/preview/index.html
const [path, out] = process.argv.slice(2);
if (!path || !out) {
  console.error('usage: pnpm save-page <path> <out.html>');
  process.exit(2);
}

const res = await createApp(loadConfig()).request(path);
if (res.status !== 200) {
  console.error(`${path} answered ${res.status}, nothing saved`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await res.text());
console.log(`saved ${path} to ${out}`);
