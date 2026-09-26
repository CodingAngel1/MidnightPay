/**
 * MidnightPay — Test Suite
 *
 * Two layers, so `npm test` is meaningful on a fresh clone AND exhaustive once
 * the contract is compiled:
 *
 *   1. Offline layer (always runs — no toolchain, no docker, no proof server):
 *      • Contract source assertions — `contracts/counter.compact` really declares
 *        the public ledger state, the private witnesses, the deliberate
 *        `disclose()` call and the public/private comment block the privacy
 *        model depends on.
 *
 *   2. Compiled layer (auto-skips until `npm run compile` has produced
 *      `managed/counter/contract/index.js`): executes the *real* generated
 *      circuits in the Compact runtime simulator, in-process — Midnight
 *      contract tests do not need a network or a proof server.
 *
 * Run everything:
 *   npm run compile && npm test
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
  emptyZswapLocalState,
} from '@midnight-ntwrk/compact-runtime';

// ─── Paths ──────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_SOURCE_PATH = path.resolve(HERE, '..', 'contracts', 'counter.compact');
const MANAGED_DIR = path.resolve(HERE, '..', 'managed', 'counter');
const COMPILED_CONTRACT_PATH = path.join(MANAGED_DIR, 'contract', 'index.js');

const contractSource = fs.readFileSync(CONTRACT_SOURCE_PATH, 'utf8');

/** A valid encoded CoinPublicKey, used by both the compiled tests and the runtime. */
const COIN_PUBLIC_KEY = '01'.repeat(32);

// ═════════════════════════════════════════════════════════════
// Layer 1 — offline
// ═════════════════════════════════════════════════════════════

describe('MidnightPay — contract source', () => {
  it('declares public ledger state for the payment counter', () => {
    assert.match(contractSource, /export\s+ledger\s+payment_count\s*:\s*Counter/);
    assert.match(contractSource, /export\s+ledger\s+disclosed_total\s*:\s*Uint<64>/);
  });

  it('declares private witnesses used as circuit inputs', () => {
    assert.match(contractSource, /witness\s+pay_amount\(\)\s*:\s*Uint<64>/);
    assert.match(contractSource, /witness\s+pay_secret\(\)\s*:\s*Uint<64>/);
    assert.match(contractSource, /const\s+amount\s*=\s*pay_amount\(\)/);
    assert.match(contractSource, /const\s+secret\s*=\s*pay_secret\(\)/);
  });

  it('uses disclose() deliberately and never discloses the secret', () => {
    assert.match(contractSource, /disclose\(\s*amount\s*\)/);
    const codeOnly = contractSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const discloseCalls = codeOnly.match(/disclose\(/g) ?? [];
    assert.equal(discloseCalls.length, 1, 'exactly one deliberate disclosure is expected');
    assert.ok(
      !/disclose\(\s*secret\s*\)/.test(contractSource),
      'the authorisation secret must never be passed to disclose()',
    );
  });

  it('documents the public vs private privacy model in a comment block', () => {
    assert.match(contractSource, /PUBLIC/);
    assert.match(contractSource, /PRIVATE/);
    const header = contractSource.slice(0, contractSource.indexOf('pragma'));
    assert.ok(header.includes('PUBLIC') && header.includes('PRIVATE'), 'comment block must precede the pragma');
  });
});

// ═════════════════════════════════════════════════════════════
// Layer 2 — the real generated circuits (skipped until compiled)
// ═════════════════════════════════════════════════════════════

const compiledAvailable = fs.existsSync(COMPILED_CONTRACT_PATH);
const compiled: any = compiledAvailable
  ? await import(pathToFileURL(COMPILED_CONTRACT_PATH).href)
  : undefined;

describe(
  'MidnightPay — compiled circuits',
  { skip: compiledAvailable ? false : 'run `npm run compile` to generate managed/counter' },
  () => {
    /** Witness implementations; each scenario supplies its own private inputs. */
    const witnessesFor = (amount: bigint, secret: bigint) => {
      const calls = { amount: 0, secret: 0 };
      return {
        calls,
        witnesses: {
          pay_amount: (context: any) => {
            calls.amount += 1;
            return [context.privateState, amount];
          },
          pay_secret: (context: any) => {
            calls.secret += 1;
            return [context.privateState, secret];
          },
        },
      };
    };

    /** Initialise the contract and build a fresh circuit context. */
    const simulate = (amount: bigint, secret: bigint) => {
      const { calls, witnesses } = witnessesFor(amount, secret);
      const contract = new compiled.Contract(witnesses);
      const init = contract.initialState(createConstructorContext({}, COIN_PUBLIC_KEY));
      const context = createCircuitContext(
        dummyContractAddress(),
        emptyZswapLocalState(COIN_PUBLIC_KEY),
        init.currentContractState,
        init.currentPrivateState,
      );
      return { contract, context, calls };
    };

    /** Decode the public ledger out of a circuit context. */
    const ledgerOf = (context: any) => compiled.ledger(context.currentQueryContext.state);

    it('initialises an empty ledger: no payments, zero disclosed total', () => {
      const { context } = simulate(100n, 7n);
      const publicLedger = ledgerOf(context);

      assert.equal(publicLedger.payment_count, 0n);
      assert.equal(publicLedger.disclosed_total, 0n);
    });

    it('state transition: pay() increments the counter and accumulates the disclosed total', () => {
      const { contract, context } = simulate(250n, 42n);
      const paid = contract.circuits.pay(context);
      const publicLedger = ledgerOf(paid.context);

      assert.equal(publicLedger.payment_count, 1n, 'one settled payment');
      assert.equal(publicLedger.disclosed_total, 250n, 'the disclosed amount is added on-chain');

      const again = contract.circuits.pay(paid.context);
      const after = ledgerOf(again.context);
      assert.equal(after.payment_count, 2n, 'a second payment increments again');
      assert.equal(after.disclosed_total, 500n, 'the running total accumulates');
    });

    it('circuit logic: a zero amount is rejected before any state changes', () => {
      const { contract, context } = simulate(0n, 9n);

      assert.throws(
        () => contract.circuits.pay(context),
        /Payment amount must be positive/,
        'the circuit must reject a non-positive payment',
      );
      assert.equal(ledgerOf(context).payment_count, 0n, 'failed circuit leaves the ledger untouched');
    });

    it('privacy: a zero authorisation secret is rejected without disclosing it', () => {
      const { contract, context } = simulate(100n, 0n);

      assert.throws(
        () => contract.circuits.pay(context),
        /Authorisation secret must be non-zero/,
        'the circuit must prove knowledge of a non-zero secret',
      );
      assert.equal(ledgerOf(context).disclosed_total, 0n, 'nothing reaches the ledger on failure');
    });

    it('privacy: private inputs never appear in the public ledger', () => {
      const secret = 0xdeadbeefn;
      const { contract, context, calls } = simulate(600n, secret);
      const paid = contract.circuits.pay(context);
      const publicLedger = ledgerOf(paid.context);

      assert.equal(calls.amount > 0 && calls.secret > 0, true, 'both witnesses ran locally');

      const publicKeys = Object.keys(publicLedger);
      assert.ok(!publicKeys.includes('pay_secret'), 'the secret witness must not be a ledger field');
      assert.ok(!publicKeys.includes('pay_amount'), 'the amount witness must not be a ledger field');

      const serializedLedger = JSON.stringify(publicLedger, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      );
      assert.ok(
        !serializedLedger.includes(secret.toString()),
        'the private authorisation secret must never be serialised into public state',
      );
      assert.ok(!serializedLedger.includes('deadbeef'), 'raw private entropy must stay off-chain');
    });
  },
);
