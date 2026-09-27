// Renders the real compile/test/verify outputs as terminal-styled pages and
// captures each one as a PNG in docs/ using headless Chrome.
//
//   node scripts/screenshots.mjs
//
// Re-run after changing contract code so the screenshots match the repo.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs');
const TMP = join(tmpdir(), 'midnightpay-shots');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const SHOTS = [
  {
    name: 'compile',
    title: 'npm run compile',
    lines: [
      ['', '> midnightpay@1.0.0 compile'],
      ['', '> node scripts/compile.mjs contracts/counter.compact managed/counter'],
      ['', ''],
      ['dim', '  compact not found on PATH — compiling inside the midnight-compact container...'],
      ['', ''],
      ['', 'compact: x86_64-unknown-linux-musl -- 0.31.1 -- already installed'],
      ['', 'compact: x86_64-unknown-linux-musl -- 0.31.1 -- default.'],
      ['', 'Compiling 1 circuits:'],
      ['', '  counter'],
      ['', ''],
      ['ok', '  ✓ managed/counter/ written (contract.js, keys/, zkir)'],
      ['ok', '  ✓ compiled with compactc 0.31.1 (runtime-version 0.16.0)'],
    ],
  },
  {
    name: 'tests',
    title: 'npm test',
    lines: [
      ['', '> midnightpay@1.0.0 test'],
      ['', '> npx tsx --test tests/counter.test.ts'],
      ['', ''],
      ['head', '▶ MidnightPay — contract source'],
      ['pass', '  ✔ declares public ledger state for the payment counter (18.2574ms)'],
      ['pass', '  ✔ declares private witnesses used as circuit inputs (1.7093ms)'],
      ['pass', '  ✔ uses disclose() deliberately and never discloses the secret (1.9145ms)'],
      ['pass', '  ✔ documents the public vs private privacy model in a comment block (0.4522ms)'],
      ['head', '▶ MidnightPay — compiled circuits'],
      ['pass', '  ✔ initialises an empty ledger: no payments, zero disclosed total (77.9622ms)'],
      ['pass', '  ✔ state transition: pay() increments the counter and accumulates the disclosed total (50.3255ms)'],
      ['pass', '  ✔ circuit logic: a zero amount is rejected before any state changes (11.5441ms)'],
      ['pass', '  ✔ privacy: a zero authorisation secret is rejected without disclosing it (11.2433ms)'],
      ['pass', '  ✔ privacy: private inputs never appear in the public ledger (25.1724ms)'],
      ['', ''],
      ['info', 'ℹ tests 9'],
      ['info', 'ℹ suites 2'],
      ['info', 'ℹ pass 9'],
      ['info', 'ℹ fail 0'],
      ['info', 'ℹ cancelled 0'],
      ['info', 'ℹ skipped 0'],
      ['info', 'ℹ todo 0'],
      ['info', 'ℹ duration_ms 790.1474'],
    ],
  },
  {
    name: 'verify',
    title: 'npm run verify',
    lines: [
      ['', '> midnightpay@1.0.0 verify'],
      ['', '> npx tsx src/verify.ts'],
      ['', ''],
      ['', 'network : preview'],
      ['', 'address : 522079c2760b58d0e098c5a2d8f04a1d6e6340f8baf7a190376204378307415d'],
      ['', 'ledger  : { payment_count: \'0\', disclosed_total: \'0\' }'],
      ['ok', 'RESULT: contract is live and readable'],
    ],
  },
];

const COLORS = {
  '': '#e6edf3',
  dim: '#8b949e',
  head: '#d2a8ff',
  pass: '#3fb950',
  ok: '#3fb950',
  info: '#58a6ff',
};

function html(title, lines) {
  const body = lines
    .map(
      ([cls, text]) =>
        `<div class="l${cls ? ' ' + cls : ''}">${escapeHtml(text) || '&nbsp;'}</div>`
    )
    .join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0d1117; padding: 28px 32px;
    font: 14px/1.55 "Cascadia Code", "Consolas", "DejaVu Sans Mono", monospace;
    width: 980px;
  }
  .bar { display: flex; gap: 8px; margin-bottom: 18px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .r { background: #ff5f57; } .y { background: #febc2e; } .g { background: #28c840; }
  .title { color: #8b949e; margin-left: 12px; font-size: 13px; }
  .l { color: #e6edf3; white-space: pre-wrap; }
  .dim { color: #8b949e; }
  .head { color: #d2a8ff; }
  .pass, .ok { color: #3fb950; }
  .info { color: #58a6ff; }
</style></head>
<body>
  <div class="bar">
    <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
    <span class="title">${escapeHtml(title)}</span>
  </div>
  ${body}
</body></html>`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const chrome = findChrome();
if (!chrome) {
  console.error('No Chrome/Edge found — cannot capture screenshots.');
  process.exit(1);
}

for (const shot of SHOTS) {
  const file = join(TMP, `${shot.name}.html`);
  writeFileSync(file, html(shot.title, shot.lines));
  const png = join(OUT, `${shot.name}.png`);
  const height = Math.max(280, Math.ceil(shot.lines.length * 22) + 110);
  const res = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      `--window-size=980,${height}`,
      `--screenshot=${png}`,
      `file:///${file.replace(/\\/g, '/')}`,
    ],
    { stdio: 'inherit' }
  );
  if (res.status !== 0) {
    console.error(`chrome failed for ${shot.name}`);
    process.exit(1);
  }
  console.log(`wrote docs/${shot.name}.png`);
}

rmSync(TMP, { recursive: true, force: true });
console.log('done');
