/**
 * Wallet connect / disconnect UI for Lace (and any other Midnight wallet that
 * injects itself under `window.midnight`).
 *
 * Handles the three failure cases the challenge calls out:
 *   - wallet not installed  -> install link + reload hint
 *   - user rejected         -> shown as a recoverable warning, not a crash
 *   - network mismatch      -> tells the user which network to switch to
 */
import type { UseMidnightResult } from '../hooks/useMidnight';
import { NETWORK_ID, shortId } from '../lib/config';

export interface WalletConnectProps {
  wallet: UseMidnightResult;
}

function statusCopy(wallet: UseMidnightResult): string {
  switch (wallet.status) {
    case 'discovering':
      return 'Looking for a Midnight wallet…';
    case 'disconnected':
      return wallet.hasWalletExtension
        ? 'No wallet connected yet'
        : 'No Midnight wallet detected';
    case 'connecting':
      return 'Waiting for approval in your wallet…';
    case 'connected':
      return 'Wallet connected';
    case 'error':
      return 'Connection failed';
  }
}

function errorTitle(kind: NonNullable<UseMidnightResult['error']>['kind']): string {
  switch (kind) {
    case 'not-installed':
      return 'Lace wallet not installed';
    case 'rejected':
      return 'Connection rejected';
    case 'network-mismatch':
      return 'Wrong network';
    default:
      return 'Wallet error';
  }
}

export default function WalletConnect({ wallet }: WalletConnectProps) {
  const connected = wallet.status === 'connected' && wallet.address !== null;

  return (
    <section className="card" aria-labelledby="wallet-heading">
      <div className="card-head">
        <div>
          <h2 id="wallet-heading">Wallet</h2>
          <p className="muted">{statusCopy(wallet)}</p>
        </div>
        <span
          className={`badge ${connected ? 'badge-on' : wallet.status === 'connecting' ? 'badge-busy' : 'badge-off'}`}
        >
          {connected ? 'connected' : wallet.status === 'connecting' ? 'connecting' : 'disconnected'}
        </span>
      </div>

      {wallet.status === 'connecting' && (
        <p className="hint">
          Approve the connection request in Lace. Nothing happens in this tab until you do.
        </p>
      )}

      {wallet.status === 'error' && wallet.error && (
        <div className="alert" role="alert">
          <strong>{errorTitle(wallet.error.kind)}</strong>
          <p>{wallet.error.message}</p>
          {wallet.error.kind === 'not-installed' && (
            <p>
              <a href={wallet.installUrl} target="_blank" rel="noreferrer">
                Get Lace for Midnight →
              </a>
            </p>
          )}
          {wallet.error.kind === 'network-mismatch' && (
            <p className="muted">Expected network: {NETWORK_ID}</p>
          )}
        </div>
      )}

      {connected && wallet.address && (
        <div className="address-block">
          <span className="label">Shielded address</span>
          <code title={wallet.address}>{wallet.address}</code>
          <span className="muted mono">{shortId(wallet.address, 16, 12)}</span>
          <div className="meta-row">
            <span className="label">Network</span>
            <span className="pill">{wallet.networkId}</span>
            <span className="label">Wallet</span>
            <span className="pill">{wallet.walletName}</span>
          </div>
        </div>
      )}

      {!connected && wallet.hasWalletExtension && wallet.status === 'disconnected' && (
        <p className="hint">
          Detected:{' '}
          {wallet.wallets.map((w) => w.name).join(', ')} (API v{wallet.wallets[0]?.apiVersion}).
        </p>
      )}

      {!connected && !wallet.hasWalletExtension && wallet.status === 'disconnected' && (
        <div className="alert" role="status">
          <strong>No Midnight wallet detected</strong>
          <p>
            Install Lace for Midnight, then reload this page.{' '}
            <a href={wallet.installUrl} target="_blank" rel="noreferrer">
              Get Lace →
            </a>
          </p>
        </div>
      )}

      <div className="actions">
        {connected ? (
          <button type="button" className="btn btn-ghost" onClick={wallet.disconnect}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void wallet.connect()}
            disabled={wallet.status === 'connecting' || wallet.status === 'discovering'}
          >
            {wallet.status === 'connecting' ? 'Connecting…' : 'Connect Lace wallet'}
          </button>
        )}
      </div>
    </section>
  );
}
