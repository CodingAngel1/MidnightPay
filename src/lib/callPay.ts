/**
 * Drives one `pay()` circuit call end-to-end from the browser, one phase at a
 * time so the UI can show a real progress state while the proof is generated.
 *
 * Privacy invariants enforced here:
 *   - the private inputs are written straight into the encrypted local store;
 *     they are never logged, never put into React state and never returned.
 *   - the value returned to the UI is public data only: transaction id, block
 *     height, and the two public ledger fields.
 */
import { createUnprovenCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { CONTRACT_ADDRESS, PRIVATE_STATE_ID } from './config';
import { compiledContract, ledger, type CounterPrivateState } from './contract';
import type { ProvingLocation } from './providers';

/** Progress states surfaced by CircuitCall.tsx while the call runs. */
export type PayPhase =
  | 'idle'
  | 'witness'
  | 'proving'
  | 'balancing'
  | 'submitting'
  | 'finalizing'
  | 'done'
  | 'error';

/** Human-readable copy for each phase (kept out of the component for clarity). */
export const PHASE_LABEL: Record<PayPhase, string> = {
  idle: 'Ready',
  witness: 'Reading private inputs from local witnesses…',
  proving: 'Generating zero-knowledge proof locally in the browser…',
  balancing: 'Asking the wallet to balance the transaction…',
  submitting: 'Submitting to the Midnight Preprod network…',
  finalizing: 'Waiting for the transaction to be finalised on-chain…',
  done: 'Settled on-chain',
  error: 'Failed',
};

/**
 * Everything the UI is allowed to know after a call. Deliberately contains no
 * private field: the amount and the authorisation secret never leave callPay.
 */
export interface PayOutcome {
  txId: string;
  blockHeight: number;
  blockHash: string;
  status: string;
  feesPaid: string;
  provingLocation: ProvingLocation;
  ledger: {
    payment_count: bigint;
    disclosed_total: bigint;
  };
}

type Providers = MidnightProviders<string, string, CounterPrivateState>;

export interface CallPayOptions {
  providers: Providers;
  /** Where proving happened, echoed back so the UI can state it honestly. */
  provingLocation: ProvingLocation;
  /** Called before each phase begins. */
  onPhase: (phase: PayPhase) => void;
  /** The private inputs. Read once, written to local storage, then dropped. */
  privateInputs: CounterPrivateState;
}

/**
 * Runs `pay()`: witness -> prove -> balance -> submit -> finalise, then reads
 * the two public ledger fields back from the indexer.
 */
export async function callPay({
  providers,
  provingLocation,
  onPhase,
  privateInputs,
}: CallPayOptions): Promise<PayOutcome> {
  onPhase('witness');
  providers.privateStateProvider.setContractAddress(CONTRACT_ADDRESS);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, privateInputs);

  // The circuit executes here: the two witnesses pull pay_amount()/pay_secret()
  // out of the encrypted local store and the assertions run in this page.
  const callTxData = await createUnprovenCallTx(providers, {
    compiledContract,
    circuitId: 'pay',
    contractAddress: CONTRACT_ADDRESS,
    privateStateId: PRIVATE_STATE_ID,
  });

  onPhase('proving');
  // From here the private inputs travel only inside the unproven transaction's
  // witness transcript, which the proof is computed over. The UnsubmittedCallTxData
  // wrapper is privacy-sensitive — only `private.unprovenTx` is handed forward.
  const provenTx = await providers.proofProvider.proveTx(callTxData.private.unprovenTx);

  onPhase('balancing');
  const balancedTx = await providers.walletProvider.balanceTx(provenTx);

  onPhase('submitting');
  const txId = await providers.midnightProvider.submitTx(balancedTx);

  onPhase('finalizing');
  const finalized = await providers.publicDataProvider.watchForTxData(txId);
  if (finalized.status !== SucceedEntirely) {
    throw new Error(
      `The transaction was recorded on-chain with status ${finalized.status}. The circuit call did not settle.`,
    );
  }

  const contractState = await providers.publicDataProvider.queryContractState(CONTRACT_ADDRESS);
  if (!contractState) {
    throw new Error('The contract state could not be read back from the indexer.');
  }
  const publicLedger = ledger(contractState.data);

  onPhase('done');
  return {
    txId: finalized.txId,
    blockHeight: finalized.blockHeight,
    blockHash: finalized.blockHash,
    status: finalized.status,
    feesPaid: finalized.fees.paidFees,
    provingLocation,
    ledger: {
      payment_count: publicLedger.payment_count,
      disclosed_total: publicLedger.disclosed_total,
    },
  };
}
