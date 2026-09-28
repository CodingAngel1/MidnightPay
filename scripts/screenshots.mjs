// Screenshot docs/*.png from REAL command output.
//
// Runs the three commands the README documents, captures their true combined
// stdout+stderr, and renders that captured text as a terminal-styled page
// which headless Chrome/Edge photographs. Nothing is hardcoded: if the
// commands change their output (or fail), the images change with them —
// and if any command exits non-zero the script refuses to write that image.
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

/** The three commands whose real output the README screenshots must show. */
const SHOTS = [
  { name: 'compile', title: 'npm run compile', cmd: 'npm', args: ['run', 'compile'] },
  { name: 'tests', title: 'npm test', cmd: 'npm', args: ['test'] },
  { name: 'verify', title: 'npm run verify', cmd: 'npm', args: ['run', 'verify'] },
];

const COLORS = {
  '': '#e6edf3',
  dim: '#8b949e',
  head: '#d2a8ff',
  pass: '#3fb950',
  ok: '#3fb950',
  bad: '#f85149',
  info: '#58a6ff',
};

/**
 * Colour a real output line by its actual content (ANSI already stripped).
 * Heuristics only — worst case a line renders in the default colour.
 */
function classify(line) {
  const t = line.trim();
  if (/^(✔|✓|ok\b)/.test(t) || /RESULT: contract is live/.test(t)) return 'pass';
  if (/^(✖|✗|not ok\b|Error\b|error\b)/.test(t)) return 'bad';
  if (/^▶/.test(t)) return 'head';
  if (/^(ℹ|# (tests|pass|fail))/.test(t)) return 'info';
  if (/^(warning|npm warn)/i.test(t)) return 'dim';
  return '';
}

/** Strip ANSI escapes, normalise \r\n, collapse spinner \r overwrites. */
function normalize(raw) {
  return raw
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '') // CSI sequences
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '') // OSC titles
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => (l.includes('\r') ? l.split('\r').pop() : l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

/** Run one command for real; return its combined, normalized output. */
function run(cmd, args) {
  // Single command string + empty args: required for `shell: true` on
  // Windows (npm is npm.cmd) without triggering Node's args+shell warning.
  const res = spawnSync(`${cmd} ${args.join(' ')}`, [], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  if (res.error) throw res.error;
  const output = normalize(`${res.stdout ?? ''}${res.stderr ?? ''}`);
  return { code: res.status ?? 1, output };
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function html(title, lines) {
  const body = lines
    .map(
      ([cls, text]) =>
        `<div class="l${cls ? ' ' + cls : ''}">${escapeHtml(text) || '&nbsp;'}</div>`,
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
  .l { color: #e6edf3; white-space: pre-wrap; word-break: break-word; }
  .dim { color: #8b949e; }
  .head { color: #d2a8ff; }
  .pass, .ok { color: #3fb950; }
  .bad { color: #f85149; }
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

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ── 1. Run every command for real, BEFORE writing any image ──────────────
const results = [];
for (const shot of SHOTS) {
  process.stderr.write(`  running: ${shot.title} ...\n`);
  const { code, output } = run(shot.cmd, shot.args);
  if (code !== 0) {
    process.stderr.write(`\n✖ ${shot.title} exited ${code}. Captured output:\n\n${output}\n`);
    process.exit(1);
  }
  results.push({ ...shot, output });
}

// ── 2. Render the captured output ────────────────────────────────────────
const chrome = findChrome();
if (!chrome) {
  process.stderr.write('No Chrome/Edge found — cannot capture screenshots.\n');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

for (const shot of results) {
  const lines = shot.output.split('\n').map((l) => [classify(l), l]);
  const file = join(TMP, `${shot.name}.html`);
  writeFileSync(file, html(shot.title, lines));
  const png = join(OUT, `${shot.name}.png`);
  const height = Math.max(320, Math.ceil(lines.length * 22) + 120);
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
    { stdio: 'inherit' },
  );
  if (res.status !== 0) {
    process.stderr.write(`chrome failed for ${shot.name}\n`);
    process.exit(1);
  }
  console.log(`wrote docs/${shot.name}.png (${lines.length} real output lines)`);
}

rmSync(TMP, { recursive: true, force: true });
console.log('done — all images captured from real command output');
