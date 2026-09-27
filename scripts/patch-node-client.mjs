#!/usr/bin/env node
/**
 * Patch a race in @midnight-ntwrk/wallet-sdk-node-client that breaks every
 * transaction submission on this SDK version.
 *
 * `PolkadotNodeClient.make()` disconnects the freshly created ApiPromise
 * straight after loading metadata ("to avoid keeping the WebSocket open").
 * On first use, `ensureConnection()` reconnects and immediately submits — but
 * the close frame from the first disconnect is still in flight, and it lands on
 * the NEW socket ~250ms later. The in-flight `submitAndWatchExtrinsic` dies
 * with:
 *
 *     disconnected from wss://.../: 1000:: Normal Closure
 *
 * Observed 4/4 times before the patch, 0/2 after.
 *
 * The second hunk removes the `Stream.ensuring()` finalizer that tears down the
 * shared ApiPromise as soon as the submission stream ends, which can abort a
 * still-pending watch.
 *
 * Idempotent: re-running on an already-patched file is a no-op.
 * Runs automatically via the `postinstall` script.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

let target;
try {
  // The package's `exports` map only declares an `import` condition (no
  // `require`), so resolve it with import.meta.resolve and walk up to the
  // package root to reach the deep path that `exports` does not expose.
  const entry = import.meta.resolve('@midnight-ntwrk/wallet-sdk-node-client');
  let dir = path.dirname(fileURLToPath(entry));
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name === '@midnight-ntwrk/wallet-sdk-node-client') {
        target = path.join(dir, 'dist', 'effect', 'PolkadotNodeClient.js');
        break;
      }
    }
    dir = path.dirname(dir);
  }
  if (target && !fs.existsSync(target)) target = undefined;
} catch {
  target = undefined;
}

if (!target) {
  console.log('  [patch] wallet-sdk-node-client not installed — skipped');
  process.exit(0);
}

const original = fs.readFileSync(target, 'utf8');
let source = original;

const POST_CREATE = `            // Disconnect immediately after loading metadata to avoid keeping the WebSocket open.
            // The health-check timer (10s interval) and timeout handler (5s interval) are cleared on disconnect.
            // Metadata and type registry remain cached in memory for subsequent on-demand connections.
            await api.disconnect();
            return api;`;

const POST_CREATE_REPLACEMENT = `            // PATCHED by scripts/patch-node-client.mjs — the post-metadata disconnect
            // raced with the reconnect ensureConnection() performs on first use, and its
            // stale close frame tore down the live submission socket ~250ms later.
            return api;`;

const ENSURING = ', Stream.ensuring(Effect.promise(() => this.api.disconnect()))';
const ENSURING_REPLACEMENT = ', Stream.ensuring(Effect.sync(() => undefined))';

if (source.includes(POST_CREATE)) {
  source = source.replace(POST_CREATE, POST_CREATE_REPLACEMENT);
}
if (source.includes(ENSURING)) {
  source = source.replace(ENSURING, ENSURING_REPLACEMENT);
}

if (source === original) {
  console.log(
    source.includes('PATCHED by scripts/patch-node-client.mjs')
      ? '  [patch] PolkadotNodeClient.js already patched'
      : '  [patch] PolkadotNodeClient.js changed upstream — patch skipped (review manually)',
  );
  process.exit(0);
}

fs.writeFileSync(target, source);
console.log('  [patch] PolkadotNodeClient.js patched (submission socket race)');
