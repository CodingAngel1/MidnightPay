# Product Proposal

## What is the product, and who uses it?

MidnightPay is a privacy-preserving payment settlement layer: a payer settles a
payment that is **provably on-chain** while the amount and the payer's
authorisation stay **private by default** — disclosed only when the payer
deliberately chooses to publish them.

The core primitive is a Compact contract with a split personality. A public
ledger counts settled payments (`payment_count`) and accumulates a running
total (`disclosed_total`) that anyone can audit. The payment details live in
private witnesses that never leave the payer's browser: a zero-knowledge proof
attaches to each settlement, demonstrating the payment is valid (positive
amount, authorised payer) without opening the envelope.

**Who uses it, and why they need it:**

- **Freelancers and independent professionals.** A consultant's settlement
  history is currently a public record of who pays them and how much. On a
  transparent chain, every client invoice is readable by competitors,
  ex-employers and scrapers. MidnightPay gives them a provable track record
  ("11 payments settled") without a public price list.
- **Businesses paying suppliers.** Commercial terms are negotiated secrets.
  Finance teams want an auditable, tamper-proof settlement ledger for
  compliance — but not one their competitors can read to reverse-engineer
  supplier costs. The disclosed total is published deliberately, at the grain
  the business chooses.
- **DAOs and grant programs.** Treasuries need to show work happened
  (payments settled) while keeping individual grant sizes confidential until
  the program opts to publish them. Today that means trusting a private
  spreadsheet; MidnightPay replaces it with cryptographic accountability.
- **Individuals anywhere payment metadata is surveillance.** In many
  economies, a visible payment trail reveals income, habits and associations.
  Settlement without exposure is the baseline those users already expect from
  cash.

The product today is the settlement counter with its web dApp (connect Lace →
submit `pay()` → watch the proof generate locally → see only the public
footprint). The roadmap follows the same grain: per-counterparty selective
disclosure, recurring settlement schedules, and payroll-style streams — each
one the same split of "public fact, private detail".

## Why Midnight specifically?

Because the product is *precisely* the thing a transparent chain cannot
express: a public fact whose supporting details must stay private — enforced
by the compiler, not by convention.

On Ethereum, Solana or any transparent L1, every calldata argument and storage
slot is public forever. The workarounds all fail the product:

- **Keep amounts off-chain** — then the on-chain history proves nothing; the
  auditability that makes the product valuable disappears.
- **Commit to hashed amounts** — you can't sum, compare or regulate over
  hashes, and the metadata (timing, frequency, counterparties) still leaks the
  story.
- **MPC/TEE enclaves** — the privacy then rests on hardware vendors and
  operator honesty, not on cryptography the user controls.

Midnight is the first chain where the design we need is the *default*: values
not passed to `disclose()` never leave the local witness, and Compact refuses
to compile an accidental leak rather than shipping one. Our own test suite
asserts this — the privacy property is enforced at build time, which no
transparent chain can offer at any price.

Three Midnight capabilities do the specific heavy lifting:

1. **Dual state in one contract.** Public ledger state for the counter and
   disclosed total; private state for the amount and authorisation secret —
   one circuit, one atomic transaction, no bridge between two systems.
2. **Proof-bearing transactions with wallet-local proving.** Lace generates
   the proof inside the extension; the witness data never touches our
   infrastructure (there is none — the dApp is static). That is the privacy
   claim, not a marketing line.
3. **Data-protection by architecture.** There is no personal data on-chain to
   breach, subpoena or scrape — the GDPR question is answered by what the
   chain *cannot* store.

A transparent chain could imitate the UI. It could not make the promise.

## Data Model

| Data Point                       | Type                  | Disclosed To |
|----------------------------------|-----------------------|--------------|
| `payment_count` (settlements)    | Public ledger         | Everyone     |
| `disclosed_total` (running sum)  | Public ledger         | Everyone     |
| Deliberately published amounts (`disclose()`) | Public ledger | Everyone |
| Transaction id, block, fees      | Public ledger         | Everyone     |
| Validity proof per settlement    | Public (transaction)  | Everyone — proves the rules, not the inputs |
| `pay_amount()` — payment amount  | Private witness       | No one — stays on the payer's device |
| `pay_secret()` — authorisation secret | Private witness  | No one — asserted non-zero, never revealed |
| Undisclosed payment details      | Private state (browser encrypted store) | Payer only |
| Per-counterparty disclosures     | Private witness *(planned)* | Chosen counterparties, via scoped disclosure keys |

Every public row is readable through the indexer (`npm run verify` prints the
live ledger); every private row exists only inside the payer's browser and is
asserted — never transmitted — by the circuit.

## Mainnet Feasibility

**Realistic by Level 6 — the remaining work is operational, not architectural.**

The contract is small and version-pinned: two witnesses, two assertions, one
deliberate disclosure. It compiles in seconds and produces compact proofs, so
circuit cost is a non-issue. The port is deliberately boring, because the
harder problems were solved early:

- **Toolchain pins.** The repo pins the Compact compiler (`0.31.1`) to the
  runtime the SDK expects (`0.16.0`) — the same discipline mainnet will
  demand. Re-pointing the pins at the mainnet toolchain is a config change,
  and CI (green on every push) catches drift automatically.
- **One-flag deployment.** Deploy, verify, fund and network selection are
  already network-agnostic CLIs (`--network preview|preprod`); mainnet is the
  third value of an existing switch, not a rewrite.
- **Frontend port = two constants.** `NETWORK_ID` and `CONTRACT_ADDRESS` in
  `src/lib/config.ts` are the only environment-specific values; the Vercel
  build is live and network-blind today.
- **Wallet.** The Lace flow (connect → prove locally → submit) is the same
  surface on mainnet; the dApp already displays the proving location so users
  can see proofs never left their machine.

**What actually gates the date:**

1. **Toolchain churn.** Midnight's SDKs are pre-1.0; mainnet will move
   versions and the pins must follow release notes. Bounded, unglamorous work.
2. **First-sync cost.** A fresh wallet replays private-ledger history from the
   indexer (hours on preprod today). Acceptable at mainnet launch; worth
   monitoring as checkpointing matures.
3. **Fee budget.** Real settlement costs tNIGHT — a treasury line, not a
   blocker, and fees are already displayed per transaction.
4. **Trust maturity.** A payment product earns mainnet users only with an
   audited contract and a live disclosure policy. The audit is the critical
   path; the code is ready for it now.

**Bottom line:** the same code, the same pipeline and the same dApp run on
mainnet by changing a network id and a contract address — plus the audit and
the toolchain pin bump. That is exactly the position a Level 6 mainnet
submission needs to be in.
