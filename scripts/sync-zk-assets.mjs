#!/usr/bin/env node
/**
 * Copies the compiled ZK artifacts from managed/counter/{keys,zkir} into
 * public/zk/ so Vite serves them from this origin.
 *
 * The browser's FetchZkConfigProvider fetches absolute URLs of the form
 *   {origin}/zk/keys/pay.prover
 *   {origin}/zk/keys/pay.verifier
 *   {origin}/zk/zkir/pay.bzkir
 * which is why the artifacts have to be part of the static build.
 *
 * Run automatically before `npm run build:frontend` and `npm run dev`.
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(repoRoot, 'managed', 'counter');
const targetRoot = join(repoRoot, 'public', 'zk');

/** Top-level folders inside managed/counter that the browser needs. */
const ASSET_DIRS = ['keys', 'zkir'];

async function main() {
  if (!existsSync(sourceRoot)) {
    throw new Error(
      `managed/counter not found at ${sourceRoot}. Run \`npm run compile\` first.`,
    );
  }

  // Rebuild public/zk from scratch so stale keys never shadow fresh ones.
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });

  let copied = 0;
  for (const dir of ASSET_DIRS) {
    const from = join(sourceRoot, dir);
    if (!existsSync(from)) continue;
    const to = join(targetRoot, dir);
    await cp(from, to, { recursive: true });
    const entries = await readdir(to, { withFileTypes: true });
    copied += entries.filter((entry) => entry.isFile()).length;
  }

  if (copied === 0) {
    throw new Error(`No ZK artifacts copied from ${sourceRoot}. Did \`npm run compile\` finish?`);
  }

  const size = (await stat(targetRoot)).size;
  console.log(`zk:sync  ->  public/zk  (${copied} artifacts, dir size hint ${size})`);
}

main().catch((error) => {
  console.error(`zk:sync failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
