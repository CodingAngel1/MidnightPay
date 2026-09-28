/**
 * Midnight.js + Lace wallet hook.
 *
 * Owns the whole connection lifecycle for the DApp Connector API:
 *   - discovering injected Midnight wallets (`window.midnight`)
 *   - connecting on the Preprod network
 *   - reading the wallet address for display
 *   - detecting the three failure modes the UI must handle distinctly:
 *       wallet not installed / user rejected / network mismatch
 *   - disconnecting by clearing every piece of wallet state we hold
 *   - lazily building (and caching) the Midnight.js provider set
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { CONTRACT_ADDRESS, LACE_INSTALL_URL, NETWORK_ID } from '../lib/config';
import { buildProviders, type MidnightBrowserProviders } from '../lib/providers';

export type WalletStatus =
  | 'discovering'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type WalletErrorKind =
  | 'not-installed'
  | 'rejected'
  | 'network-mismatch'
  | 'unknown';

export interface WalletError {
  kind: WalletErrorKind;
  message: string;
}

export interface DiscoveredWallet {
  name: string;
  icon: string;
  apiVersion: string;
  rdns: string;
}

export interface MidnightWalletState {
  status: WalletStatus;
  /** Wallets currently injected into `window.midnight`. */
  wallets: DiscoveredWallet[];
  walletName: string | null;
  /** Bech32m shielded address, shown once connected. */
  address: string | null;
  networkId: string | null;
  error: WalletError | null;
}

export interface UseMidnightResult extends MidnightWalletState {
  /** True once at least one Midnight wallet extension has injected itself. */
  hasWalletExtension: boolean;
  installUrl: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Cached provider set; only resolves while connected. */
  getProviders: () => Promise<{
    providers: MidnightBrowserProviders['providers'];
    provingLocation: MidnightBrowserProviders['provingLocation'];
  }>;
  /** The raw connector API, needed by CircuitCall for the actual call. */
  connectedApi: ConnectedAPI | null;
}

function readInjectedWallets(): InitialAPI[] {
  if (typeof window === 'undefined' || !window.midnight) return [];
  return Object.values(window.midnight).filter(
    (w): w is InitialAPI => !!w && typeof w === 'object' && typeof w.connect === 'function',
  );
}

function describeInjected(wallet: InitialAPI): DiscoveredWallet {
  return {
    name: wallet.name || 'Midnight wallet',
    icon: wallet.icon,
    apiVersion: wallet.apiVersion,
    rdns: wallet.rdns,
  };
}

/**
 * Prefer Lace when several wallets are injected — it is the wallet the
 * challenge asks for — otherwise fall back to whatever is available.
 */
function pickWallet(wallets: InitialAPI[]): InitialAPI | undefined {
  return (
    wallets.find((w) => /lace/i.test(`${w.name} ${w.rdns}`)) ?? wallets[0]
  );
}

/** Maps a connector failure onto the three cases the UI has to explain. */
function toWalletError(error: unknown, fallback: string): WalletError {
  if (error && typeof error === 'object' && 'type' in error && (error as { type?: string }).type === 'DAppConnectorAPIError') {
    const code = (error as { code?: string }).code;
    const reason = (error as { reason?: string }).reason;
    if (code === 'Rejected' || code === 'PermissionRejected') {
      return { kind: 'rejected', message: 'You rejected the connection request in your wallet.' };
    }
    if (code === 'Disconnected') {
      return { kind: 'unknown', message: 'The wallet closed the connection. Unlock it and try again.' };
    }
    return { kind: 'unknown', message: reason || fallback };
  }
  if (error instanceof Error && error.message) {
    return { kind: 'unknown', message: error.message };
  }
  return { kind: 'unknown', message: fallback };
}

const INITIAL_STATE: MidnightWalletState = {
  status: 'discovering',
  wallets: [],
  walletName: null,
  address: null,
  networkId: null,
  error: null,
};

export function useMidnight(): UseMidnightResult {
  const [state, setState] = useState<MidnightWalletState>(INITIAL_STATE);
  const [connectedApi, setConnectedApi] = useState<ConnectedAPI | null>(null);

  const apiRef = useRef<ConnectedAPI | null>(null);
  const addressRef = useRef<string | null>(null);
  const cacheRef = useRef<{ api: ConnectedAPI; bundle: MidnightBrowserProviders } | null>(null);

  // Wallet extensions inject themselves after page load, so poll briefly
  // instead of reading `window.midnight` exactly once.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const scan = () => {
      const injected = readInjectedWallets();
      if (cancelled) return;
      if (injected.length > 0) {
        setState((prev) =>
          prev.status === 'discovering'
            ? { ...prev, status: 'disconnected', wallets: injected.map(describeInjected) }
            : { ...prev, wallets: injected.map(describeInjected) },
        );
        return;
      }
      attempts += 1;
      if (attempts >= 40) {
        setState((prev) =>
          prev.status === 'discovering' ? { ...prev, status: 'disconnected' } : prev,
        );
        return;
      }
      window.setTimeout(scan, 250);
    };

    scan();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    const injected = readInjectedWallets();
    if (injected.length === 0) {
      setState({
        ...INITIAL_STATE,
        status: 'error',
        error: {
          kind: 'not-installed',
          message: 'No Midnight wallet was detected. Install Lace for Midnight, then reload this page.',
        },
      });
      return;
    }

    const wallet = pickWallet(injected);
    if (!wallet) return;

    setState((prev) => ({ ...prev, status: 'connecting', error: null }));

    try {
      const api = await wallet.connect(NETWORK_ID);
      const status = await api.getConnectionStatus();

      if (status.status !== 'connected') {
        throw Object.assign(new Error('The wallet reported the connection as closed.'), {
          type: 'DAppConnectorAPIError',
          code: 'Disconnected',
        });
      }

      if (status.networkId !== NETWORK_ID) {
        setState({
          ...INITIAL_STATE,
          status: 'error',
          wallets: injected.map(describeInjected),
          error: {
            kind: 'network-mismatch',
            message: `Your wallet is on "${status.networkId}" but MidnightPay runs on "${NETWORK_ID}". Switch the network inside Lace and reconnect.`,
          },
        });
        return;
      }

      const { shieldedAddress } = await api.getShieldedAddresses();

      apiRef.current = api;
      addressRef.current = shieldedAddress;
      cacheRef.current = null;
      setConnectedApi(api);

      setState({
        status: 'connected',
        wallets: injected.map(describeInjected),
        walletName: wallet.name || 'Midnight wallet',
        address: shieldedAddress,
        networkId: status.networkId,
        error: null,
      });
    } catch (error) {
      apiRef.current = null;
      addressRef.current = null;
      setConnectedApi(null);
      setState({
        ...INITIAL_STATE,
        status: 'error',
        wallets: injected.map(describeInjected),
        error: toWalletError(error, 'The wallet could not be reached.'),
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    // The DApp Connector API has no server-side session to end — disconnecting
    // means dropping every piece of wallet state this page is holding.
    apiRef.current = null;
    addressRef.current = null;
    cacheRef.current = null;
    setConnectedApi(null);
    setState((prev) => ({
      ...prev,
      status: 'disconnected',
      walletName: null,
      address: null,
      networkId: null,
      error: null,
    }));
  }, []);

  const getProviders = useCallback(async () => {
    const api = apiRef.current;
    if (!api) {
      throw new Error('Connect your Lace wallet before calling the circuit.');
    }
    const cached = cacheRef.current;
    if (cached && cached.api === api) {
      return {
        providers: cached.bundle.providers,
        provingLocation: cached.bundle.provingLocation,
      };
    }
    const bundle = await buildProviders({
      api,
      accountId: addressRef.current ?? CONTRACT_ADDRESS,
    });
    cacheRef.current = { api, bundle };
    return { providers: bundle.providers, provingLocation: bundle.provingLocation };
  }, []);

  return useMemo(
    () => ({
      ...state,
      hasWalletExtension: state.wallets.length > 0,
      installUrl: LACE_INSTALL_URL,
      connect,
      disconnect,
      getProviders,
      connectedApi,
    }),
    [state, connect, disconnect, getProviders, connectedApi],
  );
}
