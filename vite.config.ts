import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);

// The Midnight ledger and Compact runtime ship bundler-target WASM modules
// (`import * as wasm from './x.wasm'`), so the build needs the wasm plugin.
// Top-level await is left to rolldown itself: `build.target: 'esnext'` keeps
// the emitted ESM valid without a separate transform pass (Vite 8 builds with
// rolldown, not rollup, so rollup-only TLA plugins cannot load here).
//
// Node built-ins are externalised to `{}` in production builds, which would
// silently break `abstract-level` (`EventEmitter`) and `@subsquid/scale-codec`
// (`assert`), so both are aliased to the browser polyfills published on npm.
// `isomorphic-ws` is aliased to a shim because the package's browser build
// does not expose the named `WebSocket` export the indexer reads.
export default defineConfig({
  plugins: [react(), wasm()],
  resolve: {
    alias: {
      events: require_.resolve('events'),
      assert: require_.resolve('assert'),
      'isomorphic-ws': resolve(here, 'src/lib/shims/isomorphic-ws.js'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
  },
  server: {
    port: 5173,
  },
});
