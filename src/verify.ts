/** Read back the deployed MidnightPay contract's public ledger from the indexer. */
import { WebSocket } from 'ws';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as fs from 'node:fs';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { resolveNetwork, getDeployment } from './network';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const { network, config } = resolveNetwork();
const zkConfigPath = path.resolve('managed', 'counter');
const Counter = await import(pathToFileURL(path.join(zkConfigPath, 'contract', 'index.js')).href);

const counterWitnesses = {
  pay_amount: (ctx: any) => [ctx.privateState, ctx.privateState.pay_amount],
  pay_secret: (ctx: any) => [ctx.privateState, ctx.privateState.pay_secret],
};

const compiledContract = CompiledContract.make('counter', Counter.Contract).pipe(
  CompiledContract.withWitnesses(counterWitnesses as never),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

const deployment = getDeployment(network);
if (!deployment) {
  console.error('No deployment recorded for', network);
  process.exit(1);
}

console.log('network :', network);
console.log('address :', deployment.address);

const providers = {
  privateStateProvider: levelPrivateStateProvider({
    privateStateStoreName: 'midnightpay-verify',
    accountId: 'verify',
    privateStoragePasswordProvider: () => 'Local-Devnet-Development-Placeholder-1',
  }),
  publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
  zkConfigProvider: new NodeZkConfigProvider(zkConfigPath),
  proofProvider: httpClientProofProvider(config.proofServer, new NodeZkConfigProvider(zkConfigPath)),
  walletProvider: undefined as any,
  midnightProvider: undefined as any,
};

const state: any = await providers.publicDataProvider.queryContractState(deployment.address);
if (!state) {
  console.log('RESULT: contract state NOT FOUND on chain');
  process.exit(1);
}
const ledger = Counter.ledger(state.data);
console.log('ledger  :', {
  payment_count: ledger.payment_count.toString(),
  disclosed_total: ledger.disclosed_total.toString(),
});
console.log('RESULT: contract is live and readable');
process.exit(0);
