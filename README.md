# MidnightPay

> A privacy-preserving payment counter for the Midnight Network — settle payments where the amount travels only when the payer chooses to disclose it.

## Contract Address

| Network  | Address                          |
|----------|----------------------------------|
| Preview  | `522079c2760b58d0e098c5a2d8f04a1d6e6340f8baf7a190376204378307415d` |
| Preprod  | [PASTE ADDRESS AFTER DEPLOY]     |

## What This Does

MidnightPay is a Compact smart contract that counts settled payments on a public
ledger while keeping the payment details private by default.

Every `pay()` call does three things:

1. Reads the payment amount and the payer's authorisation secret from **local
   witnesses** — they never leave the payer's machine.
2. Proves (inside a zero-knowledge circuit) that the amount is positive and that
   the payer knows a non-zero authorisation secret.
3. Publishes only what the contract deliberately discloses: the amount the payer
   chose to make public, and the increment of the payment counter.

An outside observer sees *how many* payments settled and *which* amounts were
disclosed — never the authorisation secret, and never an amount the payer did not
explicitly publish.

## Privacy Model

- **What is PUBLIC (on-chain, visible to anyone):**
  - `payment_count: Counter` — how many payments have been settled.
  - `disclosed_total: Uint<64>` — the running sum of amounts the payer explicitly
    published through `disclose()`.

- **What is PRIVATE (private witness, never on-chain):**
  - `pay_amount()` — the private payment amount.
  - `pay_secret()` — the payer's authorisation secret.
  - Neither value is ever passed to `disclose()`; the compiler rejects any
    accidental leak of witness-derived data as a compile-time error.

- **What the user PROVES without revealing:**
  - That they know a non-zero authorisation secret (asserted, never disclosed).
  - That the private payment amount is strictly positive.
  - That the resulting public ledger update follows the contract rules.

## Tech Stack

- **Midnight network** — privacy-first L1 for zero-knowledge smart contracts
- **Compact language** — the contract language (`contracts/counter.compact`)
- **Node.js v22+** — runtime for compile/deploy/test scripts
- **Docker** — proof server + local devnet (`midnightntwrk/proof-server:8.1.0`)
- **Compact compiler** — `compact compile` generates `managed/counter/`
- **midnight.js SDK** — `@midnight-ntwrk/compact-runtime`, `@midnight-ntwrk/midnight-js-*`

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js 22+ | `node --version` |
| Docker Desktop | Running daemon, `docker ps` succeeds |
| Compact compiler | `compact --version` prints a version number (Linux/macOS). On Windows there is no native binary — `npm run compile` falls back to compiling inside Docker automatically. |
| Git | For cloning and committing |
| Midnight faucet funds | Preview faucet: https://midnight-tmnight-preview.nethermind.dev/ |

## Setup

```bash
git clone https://github.com/CodingAngel1/MidnightPay.git
cd MidnightPay
npm install
# npm install also runs scripts/patch-node-client.mjs, which fixes a
# socket race in the wallet SDK that otherwise aborts every submission.

# Compact compiler — Linux/macOS native install
#   curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
#   compact update 0.31.1
# Windows: skip the above. `npm run compile` detects the missing compiler and
# builds/runs the container defined in scripts/Dockerfile.compact instead.

# Proof server (pinned to 8.1.0 to match the Midnight.js 4.1.1 SDK)
docker pull midnightntwrk/proof-server:8.1.0
docker run -d --name midnight-proof-server -p 6300:6300 midnightntwrk/proof-server:8.1.0

# Compile the contract -> managed/counter/
npm run compile

# Deploy to the preview testnet (prints the wallet address, then waits for the faucet)
NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preview

# Select the active network for later commands
npm run network preview
```

> **Compiler version is pinned to `0.31.1`.** It is the release whose
> `runtime-version` is `0.16.0`, which is exactly what `@midnight-ntwrk/compact-runtime`
> 0.16.0 in `package.json` expects. Compiling with a newer compiler (0.34.0 emits
> runtime 0.19.0) makes the test suite fail with a version-mismatch error.

## Run Tests

```bash
npm run compile && npm test
```

The suite has two layers:

- **Offline layer** — always runs; asserts the contract source really declares the
  public ledger state, the private witnesses, a deliberate `disclose()` and the
  public/private comment block.
- **Compiled layer** — runs the real generated circuits in the Compact runtime
  simulator: initial state, state transitions, rejected inputs, and that private
  inputs never reach the public ledger.

## Verify the Deployment

Read the public ledger back from the indexer to prove the contract is live:

```bash
npm run verify
```

Expected output for a freshly deployed contract:

```
network : preview
address : 522079c2760b58d0e098c5a2d8f04a1d6e6340f8baf7a190376204378307415d
ledger  : { payment_count: '0', disclosed_total: '0' }
RESULT: contract is live and readable
```

`payment_count` and `disclosed_total` are the two public ledger fields — both
start at zero and only change when `pay()` settles a payment. Nothing else about
a payment ever reaches the chain.

## Initial Idea

Most payment systems treat "who paid how much" as a single blob of data that
everyone gets to see. MidnightPay started from a simpler question: **what if the
fact of a payment could be public while the details stayed with the payer?**

The first iteration was just a counter. The interesting part turned out to be
the split — a public ledger that only ever learns *how many* payments settled
and *which* amounts the payer deliberately published, while the amount itself
and the payer's authorisation secret live exclusively inside private witnesses.
The zero-knowledge circuit proves the rules were followed (positive amount,
non-zero secret) without ever revealing either value.

That split is the whole product: privacy by default, disclosure by choice —
payment settlement where the payer, not the chain, decides what the world gets to know.

## Screenshots

**Compile** — `npm run compile` (compiler pinned to 0.31.1, Docker fallback on Windows):

![npm run compile](docs/compile.png)

**Tests** — `npm test` (9/9 passing, source + compiled-circuit layers):

![npm test](docs/tests.png)

**On-chain verification** — `npm run verify` (public ledger read back from the preview indexer):

![npm run verify](docs/verify.png)

> Regenerate with `node scripts/screenshots.mjs` (uses headless Chrome) so the
> images always match the current output.
