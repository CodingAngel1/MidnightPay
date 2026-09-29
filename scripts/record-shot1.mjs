#!/usr/bin/env node
/**
 * record-shot1.mjs — guided recorder for the wallet-flow shot.
 *
 * You: launch Chrome with --remote-debugging-port=9222, open the dApp,
 *      run `npm run record:shot1`, then click when told.
 * The script: captures the tab, watches the page DOM to detect each stage
 * (wallet card -> address connected -> amount entered -> result settled),
 * prompts you at every step, auto-stops when the result panel renders, and
 * assembles docs/shot1-wallet-flow.mp4.
 *
 * Pixels only — it never reads input values (they are password fields) and
 * never touches wallet key material.
 *
 * Options: --out PATH, --max-seconds N (default 300).
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const CDP_PORT = 9222;
const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT = path.resolve(outIdx >= 0 ? argv[outIdx + 1] : 'docs/shot1-wallet-flow.mp4');
const maxIdx = argv.indexOf('--max-seconds');
const MAX_SECONDS = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : 300;
const FRAME_DIR = path.resolve('.shot1-frames');
const W = 1600;
const H = 1000;

const RELAUNCH_HINTS = `
Could not reach Chrome on http://127.0.0.1:${CDP_PORT}.

  1. Quit Chrome COMPLETELY, then relaunch it with the debug port (same
     profile, so Lace is still installed):
       macOS:    open -na "Google Chrome" --args --remote-debugging-port=${CDP_PORT}
       Windows:  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=${CDP_PORT}
       Linux:    google-chrome --remote-debugging-port=${CDP_PORT}
  2. Open the MidnightPay tab in that window.
  3. Run this command again.`;

const say = (msg) => console.log(`\n\x1b[1;36m▶ ${msg}\x1b[0m\n`);

function findPageTab() {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: CDP_PORT, path: '/json' }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const pages = JSON.parse(body).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
          if (pages.length === 0) return reject(new Error('No open tabs.' + RELAUNCH_HINTS));
          const tab =
            pages.find((t) => /midnightpay|localhost:517|127\.0\.0\.1:4173/.test(t.url)) ?? pages[0];
          resolve(tab);
        } catch {
          reject(new Error('Unexpected /json response.' + RELAUNCH_HINTS));
        }
      });
    });
    req.on('error', () => reject(new Error(RELAUNCH_HINTS)));
  });
}

async function main() {
  await mkdir(FRAME_DIR, { recursive: true });
  await mkdir(path.dirname(OUT), { recursive: true });

  const tab = await findPageTab();
  console.log(`● recording: ${tab.url}`);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('WebSocket failed.' + RELAUNCH_HINTS));
  });

  // -- CDP plumbing ---------------------------------------------------------
  let evalId = 100;
  const pending = new Map();
  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Page.screencastFrame') {
      const file = path.join(FRAME_DIR, `f${String(frames.length + 1).padStart(5, '0')}.jpg`);
      await writeFile(file, Buffer.from(msg.params.data, 'base64'));
      frames.push({ file, ts: Date.now() / 1000 });
      ws.send(JSON.stringify({ id: 1, method: 'Page.screencastFrameAck', params: { sessionId: msg.params.sessionId } }));
    }
  };
  const evaluate = (expression) =>
    new Promise((resolve) => {
      const id = ++evalId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
  const inPage = (sel) => `!!document.querySelector(${JSON.stringify(sel)})`;

  // -- capture + stage machine ----------------------------------------------
  const frames = [];
  ws.send(JSON.stringify({
    id: 2,
    method: 'Page.startScreencast',
    params: { format: 'jpeg', quality: 80, maxWidth: W, maxHeight: H, everyNthFrame: 1 },
  }));

  const stages = [
    { until: inPage('.address-block'), prompt: 'STEP 1/3 — click "Connect Lace wallet", then approve inside the Lace extension. I detect the moment the address appears.' },
    { until: inPage('section[aria-labelledby="call-heading"] button.btn-primary:disabled'), prompt: 'STEP 2/3 — type a payment amount and a secret (both stay masked), then click "Generate proof & submit pay()". I watch for the proving state.' },
    { until: inPage('.result'), prompt: 'STEP 3/3 — nothing to click. The proof is generating and submitting; recording stops by itself when the result panel appears.' },
  ];

  const started = Date.now();
  let stopped = false;
  for (const stage of stages) {
    say(stage.prompt);
    while (!stopped) {
      if ((Date.now() - started) / 1000 > MAX_SECONDS) {
        stopped = true;
        say(`time limit of ${MAX_SECONDS}s reached — assembling what was captured.`);
        break;
      }
      const res = await evaluate(stage.until);
      if (res?.result?.result?.value === true) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (stopped) break;
    await new Promise((r) => setTimeout(r, 2500)); // hold the new state on screen
  }

  ws.close();
  if (frames.length < 10) {
    console.error(`only ${frames.length} frames captured — nothing to assemble.`);
    process.exit(1);
  }

  const list = ['ffconcat version 1.0'];
  for (let i = 0; i < frames.length; i++) {
    const next = frames[i + 1];
    const dur = next ? Math.min(0.5, Math.max(1 / 30, next.ts - frames[i].ts)) : 0.5;
    list.push(`file '${path.relative(path.dirname(OUT), frames[i].file)}'`);
    list.push(`duration ${dur.toFixed(3)}`);
  }
  list.push(`file '${path.relative(path.dirname(OUT), frames[frames.length - 1].file)}'`);
  const listPath = path.join(FRAME_DIR, 'list.ffconcat');
  await writeFile(listPath, list.join('\n') + '\n');

  console.log(`assembling ${frames.length} frames → ${OUT}`);
  const code = await new Promise((resolve) => {
    spawn('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-vf', `scale=${W}:${H},format=yuv420p`, '-r', '30',
      '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', OUT,
    ], { stdio: ['ignore', 'ignore', 'inherit'] }).on('exit', resolve);
  });
  if (code !== 0) {
    console.error(`ffmpeg exited ${code}.`);
    process.exit(1);
  }
  console.log(`done: ${OUT}`);
  console.log('this clip is shot 1 of the demo. pair it with docs/level3-reel.mp4 (tests + green CI).');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
