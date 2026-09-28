/**
 * Deployment + network configuration for the MidnightPay browser dApp.
 *
 * Everything the frontend needs to reach the Preprod deployment lives here so
 * the contract address is declared exactly once (it is also mirrored in
 * README.md, where the challenge requires it).
 */

/** Network the deployed contract lives on. Lace is asked for the same id. */
export const NETWORK_ID = 'preprod';

/** Preprod contract address produced by `npm run deploy -- --network preprod`. */
export const CONTRACT_ADDRESS =
  '1116f337c369f190a8f3838d617e15fd1df9123e8ed268c84e236a367bfbab10';

/** Public endpoints used when the wallet does not hand us its own config. */
export const FALLBACK_INDEXER_URI = 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const FALLBACK_INDEXER_WS_URI =
  'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

/** Where a user who has no Midnight wallet can get Lace. */
export const LACE_INSTALL_URL = 'https://docs.midnight.network/relnotes/lace';

/** Preprod tNIGHT faucet (browser + Turnstile, so it is a link, not a call). */
export const FAUCET_URL = 'https://faucet.preprod.midnight.network';

/**
 * Identifier under which this contract's private state is stored in the
 * browser's encrypted LevelDB. counter.compact reads pay_amount()/pay_secret()
 * out of it through the two local witnesses.
 */
export const PRIVATE_STATE_ID = 'midnightPayPrivateState';

/**
 * Base URL the ZK artifacts (prover key, verifier key, zkIR) are served from.
 * `scripts/sync-zk-assets.mjs` copies managed/counter/{keys,zkir} into
 * public/zk/ so they are fetched with plain HTTP GETs by FetchZkConfigProvider.
 */
export const ZK_ARTIFACTS_BASE = `${window.location.origin}/zk`;

/**
 * Optional escape hatch: a reachable proof server for browsers whose wallet
 * cannot prove for itself. Empty by default — the wallet's own prover is used
 * first, because it keeps witness material on the user's machine.
 */
export const PROOF_SERVER_URL: string =
  (import.meta.env.VITE_PROOF_SERVER_URL as string | undefined)?.trim() ?? '';

/** Short, user-facing rendering of a long hex/bech32 identifier. */
export function shortId(value: string, lead = 10, tail = 8): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
