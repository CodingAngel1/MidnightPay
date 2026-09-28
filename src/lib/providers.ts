/**
 * Assembles the Midnight.js provider set the browser needs to prove, balance
 * and submit a circuit call against the deployed Preprod contract.
 *
 * Every provider here runs in the page:
 *   privateStateProvider — encrypted LevelDB in the browser (IndexedDB)
 *   publicDataProvider   — GraphQL/WS against the public Preprod indexer
 *   zkConfigProvider     — plain HTTP GETs against /zk on this origin
 *   proofProvider        — the wallet's in-extension WASM prover (no server)
 *   walletProvider       — balances/signs through the DApp Connector API
 *   midnightProvider     — relays the sealed transaction through the wallet
 */
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { parseCoinPublicKeyToHex, parseEncPublicKeyToHex, toHex } from '@midnight-ntwrk/midnight-js-utils';
import {
  CostModel,
  Transaction,
  type Binding,
  type FinalizedTransaction,
  type Proof,
  type SignatureEnabled,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { fromHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { MidnightProviders, UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import {
  FALLBACK_INDEXER_URI,
  FALLBACK_INDEXER_WS_URI,
  NETWORK_ID,
  PROOF_SERVER_URL,
  ZK_ARTIFACTS_BASE,
} from './config';
import type { CounterPrivateState } from './contract';

/** Where the zero-knowledge proof actually gets produced. */
export type ProvingLocation = 'wallet' | 'remote';

export interface MidnightBrowserProviders {
  providers: MidnightProviders<string, string, CounterPrivateState>;
  /** 'wallet' means the proof never left this browser. */
  provingLocation: ProvingLocation;
  /** Network id reported by the wallet, after the mismatch check. */
  networkId: string;
}

export interface BuildProvidersOptions {
  /** Connected DApp Connector API (Lace). */
  api: ConnectedAPI;
  /** Wallet address, used to namespace the local private-state store. */
  accountId: string;
}

/** Bech32m-or-hex public key -> the hex form the ledger expects. */
function toPublicKey(value: string, parse: (v: string, id: string) => string): string {
  try {
    return parse(value, NETWORK_ID);
  } catch {
    // Already hex, or a network id the helper does not know — use it verbatim.
    return value;
  }
}

/**
 * Builds every provider and returns them alongside where proving happens.
 *
 * Proving preference order:
 *   1. the wallet's own WASM prover (local, witness data never leaves the page)
 *   2. the proof server the wallet points at, or VITE_PROOF_SERVER_URL
 */
export async function buildProviders({ api, accountId }: BuildProvidersOptions): Promise<MidnightBrowserProviders> {
  const status = await api.getConnectionStatus();
  if (status.status !== 'connected') {
    throw new Error('The wallet reported the connection as closed. Reconnect and try again.');
  }
  const networkId = status.networkId;
  // Must be set before any ledger module runs: network id is baked into the
  // bech32 encodings and into Transaction.fromParts.
  setNetworkId(networkId);

  const config = await api.getConfiguration();
  const shielded = await api.getShieldedAddresses();

  const coinPublicKey = toPublicKey(shielded.shieldedCoinPublicKey, parseCoinPublicKeyToHex);
  const encryptionPublicKey = toPublicKey(
    shielded.shieldedEncryptionPublicKey,
    parseEncPublicKeyToHex,
  );

  const zkConfigProvider = new FetchZkConfigProvider<string>(ZK_ARTIFACTS_BASE);

  const { proofProvider, provingLocation } = await buildProofProvider(
    api,
    zkConfigProvider,
    config.proverServerUri ?? PROOF_SERVER_URL,
  );

  const walletProvider = {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
    balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
      // Hex in, hex out: the connector only speaks serialized strings.
      const { tx: balanced } = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
      return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
        'signature',
        'proof',
        'binding',
        fromHex(balanced),
      );
    },
  };

  const midnightProvider = {
    submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
      await api.submitTransaction(toHex(tx.serialize()));
      return tx.identifiers()[0];
    },
  };

  return {
    provingLocation,
    networkId,
    providers: {
      privateStateProvider: levelPrivateStateProvider<string, CounterPrivateState>({
        privateStateStoreName: 'midnightpay-state',
        accountId,
        // Encrypts the local private state at rest. Browser-only storage, never
        // sent anywhere; 16+ chars with mixed character classes is the policy.
        privateStoragePasswordProvider: () => 'MidnightPay-Local-Browser-State-2026!',
      }),
      publicDataProvider: indexerPublicDataProvider(
        config.indexerUri || FALLBACK_INDEXER_URI,
        config.indexerWsUri || FALLBACK_INDEXER_WS_URI,
      ),
      zkConfigProvider,
      proofProvider,
      walletProvider,
      midnightProvider,
    },
  };
}

async function buildProofProvider(
  api: ConnectedAPI,
  zkConfigProvider: FetchZkConfigProvider<string>,
  remoteProofServer: string | undefined,
): Promise<{ proofProvider: MidnightProviders['proofProvider']; provingLocation: ProvingLocation }> {
  try {
    const proofProvider = await dappConnectorProofProvider(
      api,
      zkConfigProvider,
      CostModel.initialCostModel(),
    );
    return { proofProvider, provingLocation: 'wallet' };
  } catch (walletProvingError) {
    if (remoteProofServer) {
      return {
        proofProvider: httpClientProofProvider(remoteProofServer, zkConfigProvider),
        provingLocation: 'remote',
      };
    }
    throw new Error(
      `This wallet cannot generate proofs locally and no proof server is configured: ${
        walletProvingError instanceof Error ? walletProvingError.message : String(walletProvingError)
      }`,
    );
  }
}
