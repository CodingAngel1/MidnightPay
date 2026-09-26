#!/usr/bin/env node
/**
 * Cross-platform `compact compile` wrapper.
 *
 * Midnight's Compact compiler publishes no native Windows binary, so on
 * Windows this falls back to running the official compiler inside the
 * `midnight-compact` container (a local image built from
 * `scripts/Dockerfile.compact` that installs the stock compact-installer.sh).
 *
 * On Linux/macOS the native `compact` on PATH is used directly, so CI and
 * other contributors get the plain toolchain with no container in the way.
 *
 * Usage: node scripts/compile.mjs <source.compact> <target-dir>
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('usage: node scripts/compile.mjs <source.compact> <target-dir>');
  process.exit(2);
}

const [source, target] = args;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: false, ...opts });
  return r.status ?? 1;
}

// 1. Native compiler (Linux/macOS, or Windows + WSL-provided binary).
//
// Windows ships its own `compact.exe` (NTFS file-compression) that exits 0 for
// almost any argument, so a bare exit-code check would pick the wrong binary.
// Require the Midnight toolchain's own version banner instead.
const nativeCheck = spawnSync('compact', ['--version'], { encoding: 'utf8' });
const nativeOutput = `${nativeCheck.stdout ?? ''}${nativeCheck.stderr ?? ''}`;
if (nativeCheck.error === undefined && /^compact\s+v?\d+\.\d+\.\d+/im.test(nativeOutput)) {
  process.exit(run('compact', ['compile', source, target]));
}

// 2. Container fallback. Requires Docker Desktop to be running.
console.log('  compact not found on PATH — compiling inside the midnight-compact container...\n');

const image = process.env.COMPACT_IMAGE || 'midnight-compact';
const artifactsVolume = process.env.COMPACT_VOLUME || 'compact-artifacts';
const pinned = process.env.COMPACT_VERSION || '0.31.1';

// Git-Bash / MSYS rewrite absolute-looking args into Windows paths; disable that.
const env = { ...process.env, MSYS_NO_PATHCONV: '1' };

// Make sure the toolchain version is installed, then compile. The volume keeps
// downloaded compiler versions across runs.
const setup = run(
  'docker',
  [
    'run', '--rm',
    '-v', `${artifactsVolume}:/root/.compact`,
    image,
    'bash', '-lc', `compact update ${pinned}`,
  ],
  { env },
);
if (setup !== 0) {
  console.error(
    `\n✖ Could not prepare the compiler. Build the image first:\n` +
      `    docker build -t ${image} -f scripts/Dockerfile.compact .\n`,
  );
  process.exit(setup);
}

process.exit(
  run(
    'docker',
    [
      'run', '--rm',
      '-v', `${artifactsVolume}:/root/.compact`,
      '-v', `${root}:/work`,
      '-w', '/work',
      image,
      'bash', '-lc', `compact compile ${source} ${target}`,
    ],
    { env },
  ),
);
