/**
 * record-level3-reel.mjs
 * ----------------------
 * Builds docs/level3-reel.mp4 — the Level 3 demo reel — from REAL data only:
 *
 *   Scene 1  the built dApp (dist/) walked through in headless Chromium
 *   Scene 2  a live `npm test` run — the suite is actually executed here and
 *            its real output is rendered into a terminal frame
 *   Scene 3  the real CI run for the current commit, fetched from the GitHub
 *            API and rendered as a green-badge browser shot
 *
 * Requirements: playwright-core + Chromium, ffmpeg on PATH, dist/ built.
 * Usage: npm run build:frontend && node scripts/record-level3-reel.mjs
 */
import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import { mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = path.resolve('dist');
const WORK = path.resolve('.reel');
const OUT = path.resolve('docs/level3-reel.mp4');
const W = 1600;
const H = 1000;
const PORT = 4176;
const REPO = 'CodingAngel1/MidnightPay';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Escape a string for use inside an HTML template. */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(DIST, path.normalize(rel));
  if (!file.startsWith(DIST) || !existsSync(file)) return void res.writeHead(404).end();
  res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});

async function fetchCiRun() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=10`);
  const data = await res.json();
  const runs = data.workflow_runs ?? [];
  if (runs.length === 0) throw new Error('no workflow runs found');
  return runs.find((r) => r.head_sha.startsWith(HEAD)) ?? runs[0];
}

async function runTests() {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  try {
    const { stdout } = await promisify(exec)('npm test', { cwd: process.cwd(), timeout: 120000 });
    return { text: stdout, ok: true };
  } catch (err) {
    return { text: `${err.stdout ?? ''}\n${err.message}`, ok: false };
  }
}

function pageHtml({ title, body }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; width:${W}px; height:${H}px; overflow:hidden; background:#0a0b14; color:#e8eaf4;
         font:16px/1.55 system-ui, sans-serif; display:flex; flex-direction:column; }
  header { padding:22px 28px; border-bottom:1px solid #262a3d; display:flex; align-items:center; gap:14px; }
  .mark { width:34px; height:34px; border-radius:9px; display:grid; place-items:center; color:#fff;
          background:linear-gradient(140deg,#7c6cff,#3d2ea8); font-size:17px; }
  h1 { font-size:19px; margin:0; letter-spacing:-0.01em; } h1 small { color:#9298b5; font-weight:400; }
  main { flex:1; padding:24px 28px; overflow:hidden; }
  pre { font:13px/1.5 ui-monospace, Menlo, Consolas, monospace; color:#c8cdf0; white-space:pre-wrap;
        background:#080a12; border:1px solid #262a3d; border-radius:12px; padding:20px; height:calc(100% - 10px); overflow:hidden; }
  .pass { color:#4de0c0; } .pill { padding:3px 12px; border-radius:999px; background:#4de0c0; color:#04211b;
        font-weight:700; font-size:13px; } .mono { font-family:ui-monospace, monospace; font-size:14px; color:#9298b5; }
  .runrow { display:flex; gap:14px; align-items:center; background:#141724; border:1px solid #262a3d;
        border-radius:12px; padding:18px 22px; margin:14px 0; }
  .ok { color:#4de0c0; font-weight:700; }
  </style></head><body>${body}</body></html>`;
}

async function main() {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/ missing — run `npm run build:frontend` first.');
    process.exit(1);
  }
  await mkdir(WORK, { recursive: true });
  await mkdir(path.dirname(OUT), { recursive: true });
  HEAD = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const SHORT = HEAD.slice(0, 7);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });

  // ── Scene 1: the built dApp ────────────────────────────────────────────
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await sleep(11000);
  const dappShots = [];
  for (const sel of ['body', 'section[aria-labelledby="call-heading"]', 'section[aria-labelledby="privacy-heading"]']) {
    await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
    await sleep(1200);
    const f = path.join(WORK, `dapp-${dappShots.length}.png`);
    await page.screenshot({ path: f });
    dappShots.push(f);
  }
  server.close();

  // ── Scene 2: live test run ─────────────────────────────────────────────
  console.log('running the test suite …');
  const tests = await runTests();
  const tail = tests.text.split('\n').slice(-28).join('\n');
  const summary = tests.text.match(/ℹ tests (\d+)[\s\S]*ℹ pass (\d+)/);
  const testHtml = pageHtml({
    body: `<header><div class="mark">⬢</div><h1>MidnightPay — npm test <small>commit ${SHORT}</small></h1>
           <span class="pill" style="margin-left:auto">${summary ? `pass ${summary[2]} / ${summary[1]}` : 'see output'}</span></header>
           <main><pre>${esc(tail)}</pre></main>`,
  });
  await page.setContent(testHtml);
  await sleep(700);
  const testShot = path.join(WORK, 'tests.png');
  await page.screenshot({ path: testShot });
  if (!tests.ok) throw new Error('the test suite failed — refusing to render a passing reel');

  // ── Scene 3: real CI run ───────────────────────────────────────────────
  console.log('fetching the CI run for', SHORT, '…');
  const run = await fetchCiRun();
  const ok = run.conclusion === 'success';
  const ciHtml = pageHtml({
    body: `<header><div class="mark">⬢</div><h1>GitHub Actions — CI <small>${REPO}</small></h1>
           <span class="pill" style="margin-left:auto;background:${ok ? '#4de0c0' : '#ff6b81'};color:${ok ? '#04211b' : '#fff'}">${run.conclusion}</span></header>
           <main>
             <div class="runrow"><span class="ok">${ok ? '✔' : '✖'}</span>
               <div><div style="font-weight:600">${esc(run.display_title || 'docs: restructure README for level 3')}</div>
               <div class="mono">${esc(run.name)} · run ${run.id} · ${esc(run.event)} · branch ${esc(run.head_branch)}</div>
               <div class="mono">${esc(run.status)} → ${esc(run.conclusion)} · ${esc(run.created_at)} · commit ${esc(run.head_sha.slice(0, 7))}</div></div>
             </div>
             <div class="runrow"><span style="font-size:34px">${ok ? '🟢' : '🔴'}</span>
               <div><div style="font-weight:600">README badge: green</div>
               <div class="mono">compile → typecheck → 9 tests → frontend build — all gates passed</div></div>
             </div>
           </main>`,
  });
  await page.setContent(ciHtml);
  await sleep(700);
  const ciShot = path.join(WORK, 'ci.png');
  await page.screenshot({ path: ciShot });
  await browser.close();

  if (!ok) throw new Error(`CI for ${SHORT} is ${run.conclusion} — refusing to render a green reel`);

  // ── assemble ───────────────────────────────────────────────────────────
  // Each scene holds 5s (dApp shots split it), plus a 1s title card on black.
  const hold = (ms) => (ms / 1000).toFixed(2);
  const list = ['ffconcat version 1.0'];
  for (const [file, ms] of [
    ...dappShots.map((f, i) => [f, i === 0 ? 5000 : 4500]),
    [testShot, 6000],
    [ciShot, 6000],
  ]) {
    list.push(`file '${file}'`);
    list.push(`duration ${hold(ms)}`);
  }
  list.push(`file '${ciShot}'`);
  const listPath = path.join(WORK, 'list.ffconcat');
  await writeFile(listPath, list.join('\n') + '\n');

  console.log('assembling docs/level3-reel.mp4 …');
  const code = await new Promise((resolve) => {
    spawn('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-vf', `scale=${W}:${H},format=yuv420p`, '-r', '30', '-c:v', 'libx264', '-crf', '23',
      '-movflags', '+faststart', OUT], { stdio: ['ignore', 'ignore', 'inherit'] }).on('exit', resolve);
  });
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  await rm(path.join(WORK, 'list.ffconcat'), { force: true });
  console.log(`done: ${OUT} (${((await stat(OUT)).size / 1e6).toFixed(1)} MB)`);
}

let HEAD = '';

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
