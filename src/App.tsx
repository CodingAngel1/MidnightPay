/**
 * MidnightPay — Level 2 dApp shell.
 *
 * Layout: wallet card + circuit card side by side, then the privacy model and
 * the deployment facts the challenge asks to be visible on the page.
 */
import WalletConnect from './components/WalletConnect';
import CircuitCall from './components/CircuitCall';
import { useMidnight } from './hooks/useMidnight';
import { CONTRACT_ADDRESS, FAUCET_URL, LACE_INSTALL_URL, NETWORK_ID } from './lib/config';

const PRIVACY_ROWS: Array<{ title: string; body: string }> = [
  {
    title: 'What stays private',
    body: 'The payment amount and the authorisation secret. They are supplied by local witnesses, held only in this browser\u2019s encrypted store, and asserted \u2014 never disclosed \u2014 by the circuit.',
  },
  {
    title: 'What is published',
    body: 'A settlement counter and a running total the caller deliberately discloses, plus the proof that both transitions were valid.',
  },
  {
    title: 'What the compiler guarantees',
    body: 'Compact treats every value not passed to disclose() as private. An accidental leak fails to compile rather than shipping.',
  },
];

export default function App() {
  const wallet = useMidnight();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⬢
          </span>
          <div>
            <h1>MidnightPay</h1>
            <p className="muted">Privacy-preserving payment counter on Midnight Preprod</p>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="pill">{NETWORK_ID}</span>
          <a href="https://github.com/CodingAngel1/MidnightPay" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </header>

      <main className="grid">
        <WalletConnect wallet={wallet} />
        <CircuitCall wallet={wallet} />
      </main>

      <section className="card" aria-labelledby="privacy-heading">
        <div className="card-head">
          <div>
            <h2 id="privacy-heading">Privacy model</h2>
            <p className="muted">What the ledger learns, and what it does not</p>
          </div>
        </div>
        <div className="privacy-grid">
          {PRIVACY_ROWS.map((row) => (
            <div className="privacy-item" key={row.title}>
              <h3>{row.title}</h3>
              <p>{row.body}</p>
            </div>
          ))}
        </div>
        <div className="claim">
          <span className="claim-mark" aria-hidden="true">
            ◈
          </span>
          <span>Claim: no private input is stored, logged or transmitted by this application.</span>
        </div>
      </section>

      <section className="card" aria-labelledby="deploy-heading">
        <div className="card-head">
          <div>
            <h2 id="deploy-heading">Deployment</h2>
            <p className="muted">Where this build talks to</p>
          </div>
        </div>
        <dl className="facts facts-wide">
          <div>
            <dt>Network</dt>
            <dd>
              <span className="pill">{NETWORK_ID}</span>
            </dd>
          </div>
          <div>
            <dt>Contract address</dt>
            <dd>
              <code title={CONTRACT_ADDRESS}>{CONTRACT_ADDRESS}</code>
            </dd>
          </div>
          <div>
            <dt>Test funds</dt>
            <dd>
              <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                Preprod faucet →
              </a>
            </dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd>
              <a href={LACE_INSTALL_URL} target="_blank" rel="noreferrer">
                Lace for Midnight →
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <footer className="footer">
        <p className="muted">
          MidnightPay — built for the Midnight Builder Challenge. React + Vite front end over
          Midnight.js, proving locally inside your wallet.
        </p>
      </footer>
    </div>
  );
}
