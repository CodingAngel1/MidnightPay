/**
 * Binding to the compiled `contracts/counter.compact` artifact.
 *
 * The contract module and its ZK keys live in managed/counter/ (committed to
 * the repo) so the browser can bundle the module and fetch the keys over HTTP.
 */
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Contract as CounterContract, ledger } from '../../managed/counter/contract/index.js';
import { PRIVATE_STATE_ID, ZK_ARTIFACTS_BASE } from './config';

export { ledger };
export { PRIVATE_STATE_ID };

/**
 * The private state read by the two witnesses.
 *
 * PRIVACY: these two fields are the only private inputs of the circuit. They
 * are written straight into the browser's encrypted local store and handed to
 * the witness callbacks — they are never rendered, logged, or transmitted.
 */
export interface CounterPrivateState {
  pay_amount: bigint;
  pay_secret: bigint;
}

/**
 * Witness implementations. Each returns [privateState, value]: the state is
 * passed through unchanged and the value is the private circuit input.
 */
const counterWitnesses = {
  pay_amount: (context: { privateState: CounterPrivateState }): [CounterPrivateState, bigint] => [
    context.privateState,
    context.privateState.pay_amount,
  ],
  pay_secret: (context: { privateState: CounterPrivateState }): [CounterPrivateState, bigint] => [
    context.privateState,
    context.privateState.pay_secret,
  ],
};

/**
 * The compiled contract, wired to its witnesses and to the URL the ZK keys
 * are served from.
 */
export const compiledContract = CompiledContract.make('counter', CounterContract)
  .pipe(
    // The witness type can't be inferred through the compiled artifact, so the
    // cast is what links these implementations to pay_amount()/pay_secret().
    CompiledContract.withWitnesses(counterWitnesses as never),
    CompiledContract.withCompiledFileAssets(ZK_ARTIFACTS_BASE),
  );
