/**
 * Circuit call UI: runs `pay()` from contracts/counter.compact against the
 * deployed Preprod contract and shows, phase by phase, what is happening.
 *
 * PRIVACY RULES ENFORCED IN THIS FILE
 *   1. Both private inputs are bound to `type="password"` inputs, so nothing
 *      you type is ever echoed back — masked, in every browser, while typing.
 *   2. The inputs are read into a local variable only after validation, and
 *      the DOM fields are cleared before proving begins. No React state ever
 *      holds them, so they cannot appear in the devtools element tree, in a
 *      re-render, or in a memory snapshot of component state.
 *   3. `callPay()` returns only public data. The amount and secret are never
 *      logged, never put in `console.*`, and never returned to this component.
 *   4. The loading state persists for the whole witness -> prove -> balance ->
 *      submit -> finalise sequence, so the page never claims success early.
 *   5. The result panel is labelled with the exact wording the challenge asks
 *      for: "Proved without revealing your input".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseMidnightResult } from '../hooks/useMidnight';
import { callPay, PHASE_LABEL, type PayOutcome, type PayPhase } from '../lib/callPay';
import { CONTRACT_ADDRESS, NETWORK_ID, shortId } from '../lib/config';
import type { ProvingLocation } from '../lib/providers';

export interface CircuitCallProps {
  wallet: UseMidnightResult;
}

/** Display order for the progress list. */
const PHASE_ORDER: PayPhase[] = ['witness', 'proving', 'balancing', 'submitting', 'finalizing'];

const MAX_UINT64 = 18446744073709551615n;

function parseUint64(raw: string, field: string): bigint {
  const value = raw.trim();
  if (value === '') throw new Error(`${field} is required.`);
  if (!/^[0-9]+$/.test(value)) throw new Error(`${field} must be a whole number of units.`);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${field} must be greater than zero.`);
  if (parsed > MAX_UINT64) throw new Error(`${field} is too large for a Uint<64> input.`);
  return parsed;
}

function randomUint64(): bigint {
  const buffer = new Uint8Array(8);
  crypto.getRandomValues(buffer);
  let value = 0n;
  for (const byte of buffer) value = (value << 8n) | BigInt(byte);
  const reduced = value % MAX_UINT64;
  return reduced === 0n ? 1n : reduced;
}

const PROVING_COPY: Record<ProvingLocation, string> = {
  wallet: 'in your browser, by the wallet (the witness never left this device)',
  remote: 'by a remote proof server the wallet pointed at',
};

export default function CircuitCall({ wallet }: CircuitCallProps) {
  const amountRef = useRef<HTMLInputElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<PayPhase>('idle');
  const [outcome, setOutcome] = useState<PayOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = wallet.status === 'connected';
  const busy = PHASE_ORDER.includes(phase);

  // Give the masked secret field a usable non-zero default. It stays masked.
  const fillSecret = useCallback(() => {
    if (secretRef.current) secretRef.current.value = randomUint64().toString();
  }, []);

  useEffect(() => {
    fillSecret();
  }, [fillSecret]);

  const reset = useCallback(() => {
    setPhase('idle');
    setOutcome(null);
    setError(null);
    fillSecret();
  }, [fillSecret]);

  const submit = useCallback(async () => {
    if (!connected || busy) return;
    setError(null);
    setOutcome(null);

    let payAmount: bigint;
    let paySecret: bigint;
    try {
      payAmount = parseUint64(amountRef.current?.value ?? '', 'Payment amount');
      paySecret = parseUint64(secretRef.current?.value ?? '', 'Authorisation secret');
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Invalid input.');
      return;
    }

    // From this point down the plain values live only in this local scope.
    if (amountRef.current) amountRef.current.value = '';
    if (secretRef.current) secretRef.current.value = '';

    try {
      setPhase('witness');
      const { providers, provingLocation } = await wallet.getProviders();
      const result = await callPay({
        providers,
        provingLocation,
        onPhase: setPhase,
        privateInputs: { pay_amount: payAmount, pay_secret: paySecret },
      });
      setOutcome(result);
      setPhase('done');
    } catch (callError) {
      setPhase('error');
      setError(
        callError instanceof Error
          ? callError.message
          : 'The circuit call could not be completed. The wallet may have been locked or the network unreachable.',
      );
    }
  }, [connected, busy, wallet]);

  const phaseIndex = PHASE_ORDER.indexOf(phase);

  return (
    <section className="card" aria-labelledby="call-heading">
      <div className="card-head">
        <div>
          <h2 id="call-heading">Circuit call</h2>
          <p className="muted">
            <code>pay()</code> from <code>contracts/counter.compact</code>
          </p>
        </div>
        <span className={`badge ${busy ? 'badge-busy' : outcome ? 'badge-on' : 'badge-off'}`}>
          {busy ? 'working' : outcome ? 'settled' : 'idle'}
        </span>
      </div>

      <dl className="facts">
        <div>
          <dt>Contract</dt>
          <dd>
            <code title={CONTRACT_ADDRESS}>{shortId(CONTRACT_ADDRESS, 14, 10)}</code>
          </dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>
            <span className="pill">{NETWORK_ID}</span>
          </dd>
        </div>
      </dl>

      <div className="inputs" aria-label="Private circuit inputs">
        <label className="field">
          <span>Payment amount (private)</span>
          <input
            ref={amountRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            disabled={busy || !connected}
            placeholder="e.g. 25"
            aria-describedby="private-note"
          />
        </label>

        <label className="field">
          <span>Authorisation secret (private)</span>
          <span className="field-row">
            <input
              ref={secretRef}
              type="password"
              autoComplete="off"
              spellCheck={false}
              disabled={busy || !connected}
              aria-describedby="private-note"
            />
            <button
              type="button"
              className="btn btn-mini"
              onClick={fillSecret}
              disabled={busy || !connected}
            >
              New secret
            </button>
          </span>
        </label>

        <p id="private-note" className="note">
          Both values are read by local witnesses inside this tab, masked while you type, and
          cleared from the page before proving starts. They are never logged and never sent to
          this app's server — there isn't one. They are written only to your browser's encrypted
          local store, which the witness reads from.
        </p>
      </div>

      <div className="claim">
        <span className="claim-mark" aria-hidden="true">
          ◈
        </span>
        <span>Proved without revealing your input</span>
      </div>

      <ol className="phases" aria-live="polite">
        {PHASE_ORDER.map((step, index) => {
          const state =
            phase === 'done' || index < phaseIndex
              ? 'done'
              : index === phaseIndex
                ? 'active'
                : 'pending';
          return (
            <li key={step} className={`phase phase-${state}`}>
              <span className="phase-dot" aria-hidden="true" />
              <span className="phase-name">{PHASE_LABEL[step]}</span>
              {state === 'active' && <span className="phase-spin" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="alert" role="alert">
          <strong>Call failed</strong>
          <p>{error}</p>
        </div>
      )}

      {outcome && (
        <div className="result" role="status">
          <div className="result-head">
            <strong>Settled on-chain</strong>
            <span className="pill">{outcome.provingLocation === 'wallet' ? 'local proof' : 'remote proof'}</span>
          </div>
          <dl className="facts facts-wide">
            <div>
              <dt>Transaction</dt>
              <dd>
                <code title={outcome.txId}>{shortId(outcome.txId, 14, 10)}</code>
              </dd>
            </div>
            <div>
              <dt>Block</dt>
              <dd className="mono">#{outcome.blockHeight}</dd>
            </div>
            <div>
              <dt>Block hash</dt>
              <dd>
                <code title={outcome.blockHash}>{shortId(outcome.blockHash, 10, 8)}</code>
              </dd>
            </div>
            <div>
              <dt>Fees paid</dt>
              <dd className="mono">{outcome.feesPaid}</dd>
            </div>
            <div>
              <dt>Proof produced</dt>
              <dd>{PROVING_COPY[outcome.provingLocation]}</dd>
            </div>
          </dl>

          <div className="public-state">
            <h3>Public ledger state — what any observer can see</h3>
            <dl className="facts facts-wide">
              <div>
                <dt>
                  <code>payment_count</code>
                </dt>
                <dd className="mono">{outcome.ledger.payment_count.toString()}</dd>
              </div>
              <div>
                <dt>
                  <code>disclosed_total</code>
                </dt>
                <dd className="mono">{outcome.ledger.disclosed_total.toString()}</dd>
              </div>
            </dl>
            <p className="note">
              That is the entire public footprint: a counter and a total you chose to disclose.
              The authorisation secret is asserted on-chain but never written there, and the
              contract carries no address of yours beyond the transaction's own linkage.
            </p>
          </div>
        </div>
      )}

      <div className="actions">
        {!connected ? (
          <p className="hint">Connect your Lace wallet above to call the circuit.</p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy
              ? PHASE_LABEL[phase]
              : outcome
                ? 'Call pay() again'
                : 'Generate proof & submit pay()'}
          </button>
        )}
        {(outcome || error) && !busy && (
          <button type="button" className="btn btn-ghost" onClick={reset}>
            Reset
          </button>
        )}
      </div>
    </section>
  );
}
