/**
 * Browser replacement for `isomorphic-ws`.
 *
 * The npm package's `browser.js` only has a default export, but
 * `@midnight-ntwrk/midnight-js-indexer-public-data-provider` imports it as
 * `import * as ws from 'isomorphic-ws'` and then reads `ws.WebSocket` — which
 * is `undefined` in the browser build, so the GraphQL subscription link would
 * silently have no socket implementation.
 *
 * Aliased in vite.config.ts so both the default and the named export are the
 * native browser WebSocket.
 */
const implementation =
  typeof globalThis !== 'undefined' && typeof globalThis.WebSocket !== 'undefined'
    ? globalThis.WebSocket
    : undefined;

export default implementation;
export { implementation as WebSocket };
