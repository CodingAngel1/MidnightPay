// One-shot: derive the (bech32) address for the active network's wallet
// WITHOUT starting a full wallet sync — used to pre-fund from the faucet
// before `npm run deploy`.
//
// Mirrors the derivation in wallet.ts: HDWallet.fromSeed → selectAccount(0)
// → selectRoles → deriveKeysAt(0) → createKeystore(NightExternal key).
import { Buffer } from 'buffer';
import {
  HDWallet,
  Roles,
  createKeystore,
} from '@midnight-ntwrk/wallet-sdk';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice } from './network';

const { network, config } = resolveNetwork();
const wallet = getOrCreateWallet(network);
const notice = formatWalletBackupNotice(wallet, network);
if (notice) process.stdout.write(notice);

setNetworkId(config.networkId);

const hdWallet = HDWallet.fromSeed(Buffer.from(wallet.seed, 'hex'));
if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
const selected = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);
if (selected.type !== 'keysDerived') throw new Error('Key derivation failed');
hdWallet.hdWallet.clear();

const keystore = createKeystore(selected.keys[Roles.NightExternal], config.networkId);
const address = keystore.getBech32Address();

process.stdout.write(`\nnetwork: ${network}\naddress: ${String(address)}\nfaucet:  ${config.faucet}\n\n`);
