/**
 * App walkthrough recorder — headless Chromium tour of the BUILT app (dist/).
 *
 * Honest scope: records the real UI in its disconnected states only. No Lace
 * extension, seed phrase or preprod funds exist in a sandbox, so the wallet
 * shots stay in the author's own demo recording (see README "Demo Video").
 *
 * Requires: playwright-core + Chromium (npx playwright-core install chromium),
 * ffmpeg on PATH, and a prior `npm run build:frontend`.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = path.resolve('dist');
const FRAMES = path.resolve('.walkthrough');
const OUT = path.resolve('docs/app-walkthrough.mp4');
const W = 1280;
const H = 800;
const PORT = 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(DIST, path.normalize(rel));
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

const shots = [
  ['body', 4000],
  ['section[aria-labelledby="call-heading"]', 3500],
  ['section[aria-labelledby="privacy-heading"]', 3500],
  ['section[aria-labelledby="deploy-heading"]', 3500],
];

async function main() {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/index.html missing — run `npm run build:frontend` first.');
    process.exit(1);
  }
  await mkdir(FRAMES, { recursive: true });
  await mkdir(path.dirname(OUT), { recursive: true });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  console.log(`serving dist/ on :${PORT}`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  // wait out the wallet-discovery polling so cards show their final state
  await sleep(11000);

  const files = [];
  let n = 0;
  for (const [selector, holdMs] of shots) {
    await page.evaluate((sel) => {
      document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, selector);
    await sleep(1400 + holdMs);
    const file = path.join(FRAMES, `f${String(++n).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    files.push([file, holdMs]);
    console.log(`shot ${n}/${shots.length}: ${selector}`);
  }
  await browser.close();
  server.close();

  const list = ['ffconcat version 1.0'];
  for (const [file, ms] of files) {
    list.push(`file '${file}'`);
    list.push(`duration ${(ms / 1000).toFixed(2)}`);
  }
  list.push(`file '${files[files.length - 1][0]}'`);
  const listPath = path.join(FRAMES, 'list.ffconcat');
  await writeFile(listPath, list.join('\n') + '\n');

  console.log('assembling mp4 …');
  const code = await new Promise((resolve) => {
    spawn('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-vf', `scale=${W}:${H},format=yuv420p`, '-r', '30',
      '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', OUT,
    ], { stdio: ['ignore', 'ignore', 'inherit'] }).on('exit', resolve);
  });
  if (code !== 0) {
    console.error(`ffmpeg exited ${code}`);
    process.exit(1);
  }
  const mb = (statSync(OUT).size / 1e6).toFixed(1);
  console.log(`done: ${OUT} (${mb} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
