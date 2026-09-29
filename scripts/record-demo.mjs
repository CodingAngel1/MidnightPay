#!/usr/bin/env node
/**
 * record-demo.mjs — record the Level 2 demo from YOUR Chrome (the one with Lace).
 *
 * Usage:
 *   1. Quit Chrome completely, then relaunch it with the debug port (same
 *      profile, so Lace is still there):
 *        macOS:    open -na "Google Chrome" --args --remote-debugging-port=9222
 *        Windows:  "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
 *        Linux:    google-chrome --remote-debugging-port=9222
 *   2. Open the MidnightPay tab, log into Lace, switch to Preprod.
 *   3. npm run record:demo
 *      Record the 4 checklist shots, press Enter to stop.
 *      -> writes docs/demo-recording.mp4
 *
 * Options: --seconds N (auto-stop after N seconds), --out PATH.
 *
 * This script records pixels only. It never touches, stores or transmits any
 * wallet key material: the seed stays in the extension, the connection
 * approval and the pay() confirmation are clicked by you.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';

const CDP_PORT = 9222;
const argv = process.argv.slice(2);
const secondsIdx = argv.indexOf('--seconds');
const AUTO_SECONDS = secondsIdx >= 0 ? Number(argv[secondsIdx + 1]) : null;
const outIdx = argv.indexOf('--out');
const OUT = path.resolve(outIdx >= 0 ? argv[outIdx + 1] : 'docs/demo-recording.mp4');
const FRAME_DIR = path.resolve('.demo-frames');
const W = 1600;
const H = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Relaunch hints printed when the debug port is not reachable. */
const RELAUNCH_HINTS = `
Could not reach Chrome on http://127.0.0.1:${CDP_PORT}.

  1. Quit Chrome COMPLETELY (all windows), then relaunch it with the debug
     port — same profile, so Lace stays installed:
       macOS:    open -na "Google Chrome" --args --remote-debugging-port=${CDP_PORT}
       Windows:  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=${CDP_PORT}
       Linux:    google-chrome --remote-debugging-port=${CDP_PORT}
  2. Open the MidnightPay tab in that window.
  3. Run this command again.`;

function findPageTab() {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: CDP_PORT, path: '/json' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const pages = JSON.parse(body).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
          if (pages.length === 0) return reject(new Error('No open tabs found.' + RELAUNCH_HINTS));
          const preferred =
            pages.find((t) => /midnightpay|localhost:517|127\.0\.0\.1:4173/.test(t.url)) ?? pages[0];
          resolve(preferred);
        } catch (err) {
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
  console.log(`● recording tab: ${tab.url}`);

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('WebSocket to Chrome failed.' + RELAUNCH_HINTS));
  });

  const frames = [];
  let n = 0;
  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Page.screencastFrame') {
      const file = path.join(FRAME_DIR, `f${String(++n).padStart(5, '0')}.jpg`);
      await writeFile(file, Buffer.from(msg.params.data, 'base64'));
      frames.push({ file, ts: Date.now() / 1000 });
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Page.screencastFrameAck',
          params: { sessionId: msg.params.sessionId },
        }),
      );
    }
  };
  ws.send(
    JSON.stringify({
      id: 2,
      method: 'Page.startScreencast',
      params: { format: 'jpeg', quality: 80, maxWidth: W, maxHeight: H, everyNthFrame: 1 },
    }),
  );

  if (AUTO_SECONDS) {
    console.log(`  auto-stopping in ${AUTO_SECONDS}s …`);
    await sleep(AUTO_SECONDS * 1000);
  } else {
    await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log('  perform the 4 checklist shots now, then press ENTER to stop.');
      rl.question('', () => {
        rl.close();
        resolve();
      });
    });
  }

  ws.close();

  if (frames.length < 5) {
    console.error(`only ${frames.length} frames captured — nothing to assemble.`);
    process.exit(1);
  }

  // ffconcat: each frame held for as long as it was actually on screen.
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
    spawn(
      'ffmpeg',
      [
        '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
        '-vf', `scale=${W}:${H},format=yuv420p`, '-r', '30',
        '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', OUT,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    ).on('exit', resolve);
  });
  if (code !== 0) {
    console.error(`ffmpeg exited ${code}. Install ffmpeg: brew install ffmpeg | apt install ffmpeg | winget install ffmpeg`);
    process.exit(1);
  }
  console.log(`done: ${OUT}`);
  console.log('next: upload to YouTube (unlisted) or Loom, then paste the link into README "Demo Video".');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
